import { mat4, vec4 } from 'wgpu-matrix';

import {
	STAGE_POSED_OVERLAY_LIMIT,
	type Overlay,
	type OverlayPose,
	type StageCamera
} from '$lib/platform/engine-schema';
import { clampNumber } from '$lib/utils/math';
import {
	STAGE_BACKDROP_DEPTH,
	STAGE_CAM_Z,
	createStageCameraRig,
	stagePlaneHalfExtents
} from './depth-stage-camera';

// Plane geometry of the depth stage (ADR-0057 phase 1). Every captured Layer
// rides a quad described by one basis — centre, half-width vector, half-height
// vector, unit normal — in stage world space. The shipped frontal planes are
// the axis-aligned special case; posed Overlay planes (the next leaf) build
// their basis from a placement and a pose. The scene pass, the received rake,
// the cast-shadow march, and the projector all read the same basis, so a
// tilted plane is lit, shadowed, and hit-tested exactly like a frontal one.

export type StagePlaneVector = [number, number, number];

/** A quad in stage world space: the quad's corners are origin ± u ± v. */
export interface StagePlaneBasis {
	origin: StagePlaneVector;
	/** Half-width vector (world units), the quad's local +x. */
	u: StagePlaneVector;
	/** Half-height vector (world units), the quad's local +y (up). */
	v: StagePlaneVector;
	/** Unit normal on the camera-facing side (+z for the frontal planes). */
	normal: StagePlaneVector;
}

export type StagePlaneRole = 'backdrop' | 'surface' | 'overlay';

/**
 * Explicit ceilings on what one staged frame may allocate or draw, enforced
 * before GPU work so an over-budget composition fails correctively instead of
 * exhausting the device. Planes: backdrop + Surface + the shared Overlay plane
 * + the four posed Overlay planes the Brief allows, with one spare. Casters:
 * the shadow march samples at most this many occluders per receiving plane.
 * Mipped planes: only receding planes need a mip chain (the Surface page and a
 * textured backdrop); at native 4K one rgba16float chain is ~88 MB.
 */
export const STAGE_PLANE_CEILINGS = {
	maxPlanes: 8,
	maxPosedOverlayPlanes: STAGE_POSED_OVERLAY_LIMIT,
	maxCasters: 4,
	maxMippedPlanes: 4,
	maxPlaneTextureBytes: 512 * 1024 * 1024,
	maxMipPassesPerFrame: 64
} as const;

/** A corrective error naming the ceiling a composition asked the stage to exceed. */
export class StagePlaneCeilingError extends Error {
	readonly ceiling: keyof typeof STAGE_PLANE_CEILINGS;
	constructor(ceiling: keyof typeof STAGE_PLANE_CEILINGS, requested: number) {
		super(
			`The depth stage cannot render this composition: it needs ${requested} against the ${ceiling} ceiling of ${STAGE_PLANE_CEILINGS[ceiling]}. Reduce the posed Overlay planes or their textures.`
		);
		this.name = 'StagePlaneCeilingError';
		this.ceiling = ceiling;
	}
}

export interface StagePlaneBudget {
	planeCount: number;
	posedOverlayPlaneCount: number;
	mippedPlaneCount: number;
	textureBytes: number;
	mipPasses: number;
}

/** Throw the first ceiling a frame's plane budget exceeds. */
export function assertStagePlaneCeilings(budget: StagePlaneBudget): void {
	if (budget.planeCount > STAGE_PLANE_CEILINGS.maxPlanes) {
		throw new StagePlaneCeilingError('maxPlanes', budget.planeCount);
	}
	if (budget.posedOverlayPlaneCount > STAGE_PLANE_CEILINGS.maxPosedOverlayPlanes) {
		throw new StagePlaneCeilingError('maxPosedOverlayPlanes', budget.posedOverlayPlaneCount);
	}
	if (budget.mippedPlaneCount > STAGE_PLANE_CEILINGS.maxMippedPlanes) {
		throw new StagePlaneCeilingError('maxMippedPlanes', budget.mippedPlaneCount);
	}
	if (budget.textureBytes > STAGE_PLANE_CEILINGS.maxPlaneTextureBytes) {
		throw new StagePlaneCeilingError('maxPlaneTextureBytes', budget.textureBytes);
	}
	if (budget.mipPasses > STAGE_PLANE_CEILINGS.maxMipPassesPerFrame) {
		throw new StagePlaneCeilingError('maxMipPassesPerFrame', budget.mipPasses);
	}
}

/** Bytes one frame-sized texture occupies, including a full mip chain when `mipped`. */
export function stagePlaneTextureBytes(
	width: number,
	height: number,
	bytesPerTexel: number,
	mipped: boolean
): number {
	const base = width * height * bytesPerTexel;
	return mipped ? Math.ceil(base * (4 / 3)) : base;
}

/**
 * The shipped frontal plane: square to the rest camera, centred, `depth` world
 * units behind the Surface plane, sized to fill the frame at its own distance
 * (times `cover` for the oversized backdrop).
 */
export function createFrontalStagePlaneBasis(
	aspect: number,
	depth: number,
	cover = 1
): StagePlaneBasis {
	const { halfW, halfH } = stagePlaneHalfExtents(STAGE_CAM_Z + depth, aspect);
	return {
		origin: [0, 0, -depth],
		u: [halfW * cover, 0, 0],
		v: [0, halfH * cover, 0],
		normal: [0, 0, 1]
	};
}

/** The shipped backdrop plane: the far plane behind the Surface, oversized by `cover`. */
export function createBackdropStagePlaneBasis(aspect: number, cover: number): StagePlaneBasis {
	return createFrontalStagePlaneBasis(aspect, STAGE_BACKDROP_DEPTH, cover);
}

/** Half-width and half-height of a basis in world units. */
export function stagePlaneHalfLengths(basis: StagePlaneBasis): { halfW: number; halfH: number } {
	return { halfW: vectorLength(basis.u), halfH: vectorLength(basis.v) };
}

/** Column-major model matrix mapping the unit quad (x, y in ±1, z 0) onto the basis. */
export function stagePlaneModelMatrix(basis: StagePlaneBasis): Float32Array {
	const { origin, u, v, normal } = basis;
	// prettier-ignore
	return new Float32Array([
		u[0], u[1], u[2], 0,
		v[0], v[1], v[2], 0,
		normal[0], normal[1], normal[2], 0,
		origin[0], origin[1], origin[2], 1
	]);
}

/** Distance from the eye to the plane centre along the camera axis. */
export function stagePlaneAxialDistance(
	basis: StagePlaneBasis,
	eye: StagePlaneVector,
	forward: StagePlaneVector
): number {
	return (
		(basis.origin[0] - eye[0]) * forward[0] +
		(basis.origin[1] - eye[1]) * forward[1] +
		(basis.origin[2] - eye[2]) * forward[2]
	);
}

/**
 * Painter's order for the scene passes: farthest plane first. Stable, so two
 * planes at the same distance keep their Layer order (Overlay after Surface).
 * The depth test resolves intersections per pixel; this order only decides how
 * partial-coverage texels blend.
 */
export function sortStagePlanesBackToFront<T extends { basis: StagePlaneBasis }>(
	planes: readonly T[],
	eye: StagePlaneVector,
	forward: StagePlaneVector
): T[] {
	return planes
		.map((plane, index) => ({
			plane,
			index,
			distance: stagePlaneAxialDistance(plane.basis, eye, forward)
		}))
		.sort((a, b) => b.distance - a.distance || a.index - b.index)
		.map((entry) => entry.plane);
}

/**
 * The planes that can throw shadow onto `receiver` under a light travelling
 * along `lightDirection`: every candidate whose plane lies upstream of the
 * receiver's centre along the light, nearest first, at most the caster ceiling.
 * `distance` is the march length from the receiver centre back to the caster.
 */
export function selectStagePlaneCasters<T extends { basis: StagePlaneBasis }>(
	receiver: StagePlaneBasis,
	candidates: readonly T[],
	lightDirection: StagePlaneVector
): T[] {
	const upstream: { candidate: T; distance: number }[] = [];
	for (const candidate of candidates) {
		if (candidate.basis === receiver) continue;
		const { origin, normal } = candidate.basis;
		const denominator = dot(lightDirection, normal);
		if (Math.abs(denominator) < 1e-4) continue;
		const distance =
			dot(
				[
					receiver.origin[0] - origin[0],
					receiver.origin[1] - origin[1],
					receiver.origin[2] - origin[2]
				],
				normal
			) / denominator;
		if (distance > 0.001) upstream.push({ candidate, distance });
	}
	return upstream
		.sort((a, b) => a.distance - b.distance)
		.slice(0, STAGE_PLANE_CEILINGS.maxCasters)
		.map((entry) => entry.candidate);
}

/** World units an Overlay lifts toward the camera at z = −1 (ADR-0057). */
export const STAGE_LIFT_DEPTH = 1;

/**
 * An Overlay's signed ADR-0021 depth as world units behind the Surface plane:
 * 0..1 spans the gap to the backdrop, a negative z lifts toward the camera by
 * up to `STAGE_LIFT_DEPTH`.
 */
export function stageOverlayPlaneDepth(overlayZ: number): number {
	const z = clampNumber(overlayZ, -1, 1);
	return z >= 0 ? z * STAGE_BACKDROP_DEPTH : z * STAGE_LIFT_DEPTH;
}

/** An Overlay with a pose or an explicit depth rides its own plane on the depth stage. */
export function isPosedStageOverlay(overlay: Overlay): boolean {
	return overlay.pose !== undefined || overlay.z !== undefined;
}

export interface StageOverlayPartition {
	/** Overlays that share the merged Overlay plane at the Layer default depth. */
	shared: Overlay[];
	/** Overlays that ride their own posed plane, in Layer order. */
	posed: Overlay[];
}

/** Split a composition's Overlays into the shared plane and the posed planes. */
export function partitionStageOverlays(overlays: readonly Overlay[]): StageOverlayPartition {
	const shared: Overlay[] = [];
	const posed: Overlay[] = [];
	for (const overlay of overlays) (isPosedStageOverlay(overlay) ? posed : shared).push(overlay);
	return { shared, posed };
}

/** A point on a plane in composition fractions (u right, v down — capture UV space). */
export interface StagePlanePivot {
	x: number;
	y: number;
}

function rotateAboutY(v: StagePlaneVector, radians: number): StagePlaneVector {
	const c = Math.cos(radians);
	const s = Math.sin(radians);
	return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function rotateAboutX(v: StagePlaneVector, radians: number): StagePlaneVector {
	const c = Math.cos(radians);
	const s = Math.sin(radians);
	return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

function rotateAboutZ(v: StagePlaneVector, radians: number): StagePlaneVector {
	const c = Math.cos(radians);
	const s = Math.sin(radians);
	return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/**
 * A posed Overlay plane: the frame-sized quad at the Overlay's signed depth,
 * rotated about the Overlay's own rendered centre (`pivot`) so the card turns
 * in place. Positive yaw turns the right edge away from the camera, positive
 * pitch leans the top edge away, positive roll turns the card clockwise on
 * screen. A zero pose is exactly the frontal plane.
 */
export function createPosedOverlayPlaneBasis(
	aspect: number,
	overlayZ: number,
	pose: OverlayPose | undefined,
	pivot: StagePlanePivot
): StagePlaneBasis {
	const frontal = createFrontalStagePlaneBasis(aspect, stageOverlayPlaneDepth(overlayZ));
	if (!pose || (pose.yaw === 0 && pose.pitch === 0 && pose.roll === 0)) return frontal;
	const yaw = (pose.yaw * Math.PI) / 180;
	const pitch = (pose.pitch * Math.PI) / 180;
	const roll = (pose.roll * Math.PI) / 180;
	const rotate = (v: StagePlaneVector): StagePlaneVector =>
		rotateAboutY(rotateAboutX(rotateAboutZ(v, -roll), -pitch), yaw);
	const { halfW, halfH } = stagePlaneHalfLengths(frontal);
	const pivotWorld: StagePlaneVector = [
		(2 * pivot.x - 1) * halfW,
		(1 - 2 * pivot.y) * halfH,
		frontal.origin[2]
	];
	const centreOffset = rotate([
		frontal.origin[0] - pivotWorld[0],
		frontal.origin[1] - pivotWorld[1],
		frontal.origin[2] - pivotWorld[2]
	]);
	return {
		origin: [
			pivotWorld[0] + centreOffset[0],
			pivotWorld[1] + centreOffset[1],
			pivotWorld[2] + centreOffset[2]
		],
		u: rotate(frontal.u),
		v: rotate(frontal.v),
		normal: rotate(frontal.normal)
	};
}

function dot(a: StagePlaneVector, b: StagePlaneVector): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vectorLength(v: StagePlaneVector): number {
	return Math.hypot(v[0], v[1], v[2]);
}

function subtractVectors(a: StagePlaneVector, b: StagePlaneVector): StagePlaneVector {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function addVectors(a: StagePlaneVector, b: StagePlaneVector): StagePlaneVector {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scaleVector(v: StagePlaneVector, s: number): StagePlaneVector {
	return [v[0] * s, v[1] * s, v[2] * s];
}

// ---------------- Projection between composition planes and the frame ----------------

/** A posed Overlay plane the projector must reproduce (the renderer builds the same basis). */
export interface StageProjectorPosedOverlay {
	overlayId: string;
	z: number;
	pose?: OverlayPose;
	pivot: StagePlanePivot;
}

export interface StageProjectorInput {
	/** Frame aspect (width / height). */
	aspect: number;
	camera: StageCamera;
	/** The shared Overlay plane's depth (ADR-0021 scalar): 0 ⇒ the Surface plane, 1 ⇒ backdrop. */
	overlayZ: number;
	/** Overlays riding their own posed plane, keyed `overlay:<id>` in `StagePlane`. */
	posedOverlayPlanes?: readonly StageProjectorPosedOverlay[];
	/** Clip progress 0..1 — the same frame-deterministic time the renderer gets. */
	time: number;
}

/** Which captured plane a composition point lives on: the Surface, the shared
 *  Overlay plane, or one posed Overlay's own plane. */
export type StagePlane = 'surface' | 'overlay' | `overlay:${string}`;

/** The plane key of one Overlay's own posed plane. */
export function posedOverlayStagePlane(overlayId: string): StagePlane {
	return `overlay:${overlayId}`;
}

export interface StageProjector {
	/** Composition fraction (u right, v down — capture UV space) → frame
	 *  fraction under the staged camera. */
	projectPoint(plane: StagePlane, u: number, v: number): { x: number; y: number };
	/** Frame fraction → composition fraction: ray-cast the click through the
	 *  camera onto the plane. Null only if the ray runs parallel to the plane. */
	raycastPoint(plane: StagePlane, fx: number, fy: number): { x: number; y: number } | null;
}

/** Build the forward + inverse mapping between composition space and the
 *  rendered frame for the depth stage's plane geometry at one instant. A
 *  posed plane the input does not describe falls back to the shared Overlay
 *  plane, so an editor asking about a just-removed pose still gets an answer. */
export function createStageProjector(input: StageProjectorInput): StageProjector {
	const rig = createStageCameraRig({
		aspect: input.aspect,
		camera: input.camera,
		time: input.time
	});
	const { viewProjection } = rig;
	const inverseViewProjection = mat4.invert(viewProjection) as Float32Array;

	const bases = new Map<StagePlane, StagePlaneBasis>();
	bases.set('surface', createFrontalStagePlaneBasis(input.aspect, 0));
	bases.set(
		'overlay',
		createFrontalStagePlaneBasis(
			input.aspect,
			stageOverlayPlaneDepth(Math.min(1, Math.max(0, input.overlayZ)))
		)
	);
	for (const posed of input.posedOverlayPlanes ?? []) {
		bases.set(
			posedOverlayStagePlane(posed.overlayId),
			createPosedOverlayPlaneBasis(input.aspect, posed.z, posed.pose, posed.pivot)
		);
	}
	const basisFor = (plane: StagePlane): StagePlaneBasis =>
		bases.get(plane) ?? bases.get('overlay')!;

	return {
		projectPoint(plane, u, v) {
			const { origin, u: axisU, v: axisV } = basisFor(plane);
			// Capture UV → the plane's world point (the plane quad maps uv 0..1
			// across its ±half-extents, v downward).
			const su = 2 * u - 1;
			const sv = 1 - 2 * v;
			const world = vec4.transformMat4(
				[
					origin[0] + su * axisU[0] + sv * axisV[0],
					origin[1] + su * axisU[1] + sv * axisV[1],
					origin[2] + su * axisU[2] + sv * axisV[2],
					1
				],
				viewProjection
			);
			return { x: (world[0] / world[3] + 1) / 2, y: (1 - world[1] / world[3]) / 2 };
		},
		raycastPoint(plane, fx, fy) {
			const basis = basisFor(plane);
			const hit = intersectFrameRayWithPlane(inverseViewProjection, fx, fy, basis);
			if (!hit) {
				return null;
			}
			return { x: (hit.u + 1) / 2, y: (1 - hit.v) / 2 };
		}
	};
}

// Unproject a frame point at both WebGPU clip depths into a world ray and
// intersect it with a plane basis, returning the hit in the plane's local
// ±1 coordinates. Null only when the ray runs parallel to the plane.
function intersectFrameRayWithPlane(
	inverseViewProjection: Float32Array,
	fx: number,
	fy: number,
	basis: StagePlaneBasis
): { u: number; v: number } | null {
	const ndcX = 2 * fx - 1;
	const ndcY = 1 - 2 * fy;
	const near = vec4.transformMat4([ndcX, ndcY, 0, 1], inverseViewProjection);
	const far = vec4.transformMat4([ndcX, ndcY, 1, 1], inverseViewProjection);
	const n: StagePlaneVector = [near[0] / near[3], near[1] / near[3], near[2] / near[3]];
	const f: StagePlaneVector = [far[0] / far[3], far[1] / far[3], far[2] / far[3]];
	const direction = subtractVectors(f, n);
	const denominator = dot(direction, basis.normal);
	if (Math.abs(denominator) < 1e-8) {
		return null;
	}
	const t = dot(subtractVectors(basis.origin, n), basis.normal) / denominator;
	const hit = addVectors(n, scaleVector(direction, t));
	const local = subtractVectors(hit, basis.origin);
	const { halfW, halfH } = stagePlaneHalfLengths(basis);
	// Unit axes keep the frontal case bit-identical to a plain divide by the half-extent.
	const unitU = scaleVector(basis.u, 1 / halfW);
	const unitV = scaleVector(basis.v, 1 / halfH);
	return { u: dot(local, unitU) / halfW, v: dot(local, unitV) / halfH };
}
