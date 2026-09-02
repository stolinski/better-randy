import { clampNumber } from '$lib/utils/math';
import { STAGE_BACKDROP_DEPTH, STAGE_CAM_Z, stagePlaneHalfExtents } from './depth-stage-camera';

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
	mippedPlaneCount: number;
	textureBytes: number;
	mipPasses: number;
}

/** Throw the first ceiling a frame's plane budget exceeds. */
export function assertStagePlaneCeilings(budget: StagePlaneBudget): void {
	if (budget.planeCount > STAGE_PLANE_CEILINGS.maxPlanes) {
		throw new StagePlaneCeilingError('maxPlanes', budget.planeCount);
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

/** Composition fraction (u right, v down) of the Overlay plane's ADR-0021 depth, world units behind the Surface. */
export function stageOverlayPlaneDepth(overlayZ: number): number {
	return clampNumber(overlayZ, 0, 1) * STAGE_BACKDROP_DEPTH;
}

function dot(a: StagePlaneVector, b: StagePlaneVector): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vectorLength(v: StagePlaneVector): number {
	return Math.hypot(v[0], v[1], v[2]);
}
