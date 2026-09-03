import { mat4 } from 'wgpu-matrix';

import { clampNumber } from '$lib/utils/math';
import type { StageCamera } from '$lib/platform/engine-schema';
import { STAGE_MESH_VERTEX_FLOATS, type StageMeshData, type StageMeshVector } from '../stage-mesh-format';
import type { StageModelDefinition, StageModelScreen } from '../stage-models';
import {
	STAGE_BACKDROP_DEPTH,
	STAGE_CAM_Z,
	createStageCameraRig,
	stagePlaneHalfExtents
} from './depth-stage-camera';
import type { StagePlaneBasis, StagePlaneVector } from './depth-stage-planes';

// Pipeline-defined geometry for the depth stage (ADR-0051 phase 2, viewed
// through the ADR-0057 camera). A BODY is a registered mesh the stage renders
// depth-tested against every captured plane, lit by the Pack key, casting and
// receiving shadow. The first body is a SCREEN: a compiled model whose glass
// is the Surface plane — the composition renders on the tube, the housing
// stands around it. Everything here is pure and frame-deterministic: a
// placement from the frame and the model's own screen contract, a shadow
// projection from the casters, focus from the present bodies.

/**
 * Explicit ceilings on the geometry one staged frame may draw, enforced before
 * GPU work so an over-budget composition fails correctively. Resident bytes:
 * the multisampled scene set plus the shadow map the bodies switch on (at
 * native 4K about 480 MB).
 */
export const STAGE_BODY_CEILINGS = {
	maxBodies: 4,
	maxVertices: 131_072,
	maxIndices: 393_216,
	maxMeshBytes: 16 * 1024 * 1024,
	maxResidentBytes: 1024 * 1024 * 1024
} as const;

/** Material regions one body may carry (the vertex stream's region index). */
export const STAGE_BODY_MAX_REGIONS = 4;

/** A corrective error naming the geometry ceiling a composition asked the stage to exceed. */
export class StageBodyCeilingError extends Error {
	readonly ceiling: keyof typeof STAGE_BODY_CEILINGS;
	constructor(ceiling: keyof typeof STAGE_BODY_CEILINGS, requested: number) {
		super(
			`The depth stage cannot render this composition's geometry: it needs ${requested} against the ${ceiling} ceiling of ${STAGE_BODY_CEILINGS[ceiling]}. Reduce the bodies or their detail.`
		);
		this.name = 'StageBodyCeilingError';
		this.ceiling = ceiling;
	}
}

export interface StageBodyBudget {
	bodyCount: number;
	vertexCount: number;
	indexCount: number;
	meshBytes: number;
	residentBytes: number;
}

/** Throw the first geometry ceiling a frame's budget exceeds. */
export function assertStageBodyCeilings(budget: StageBodyBudget): void {
	if (budget.bodyCount > STAGE_BODY_CEILINGS.maxBodies) {
		throw new StageBodyCeilingError('maxBodies', budget.bodyCount);
	}
	if (budget.vertexCount > STAGE_BODY_CEILINGS.maxVertices) {
		throw new StageBodyCeilingError('maxVertices', budget.vertexCount);
	}
	if (budget.indexCount > STAGE_BODY_CEILINGS.maxIndices) {
		throw new StageBodyCeilingError('maxIndices', budget.indexCount);
	}
	if (budget.meshBytes > STAGE_BODY_CEILINGS.maxMeshBytes) {
		throw new StageBodyCeilingError('maxMeshBytes', budget.meshBytes);
	}
	if (budget.residentBytes > STAGE_BODY_CEILINGS.maxResidentBytes) {
		throw new StageBodyCeilingError('maxResidentBytes', budget.residentBytes);
	}
}

// ---------------- The screen body ----------------

/** The glass of a screen model as the stage's Surface plane sees it. */
export interface StageScreenGlass {
	/** The opening's quad in stage world space, at the Surface plane depth. */
	basis: StagePlaneBasis;
	/** The composition rect the glass shows: x, y, width, height in capture
	 *  fractions (`cover` fit — the composition covers the opening and the
	 *  opening crops what falls outside its aspect). */
	uvWindow: [number, number, number, number];
	/** World units per model unit. */
	scale: number;
}

/**
 * Fit the model's opening inside the Surface plane the frame expects: the
 * opening's width or height matches the frame plane's, whichever fits, and
 * the composition COVERS it — what falls outside the opening's aspect is
 * cropped. Under a horizontal frame a widescreen tube shows nearly the whole
 * composition; under a vertical frame it shows the frame's middle band, the
 * way a landscape monitor would.
 */
export function resolveStageScreenGlass(aspect: number, screen: StageModelScreen): StageScreenGlass {
	const { halfW, halfH } = stagePlaneHalfExtents(STAGE_CAM_Z, aspect);
	const scale = Math.min((2 * halfW) / screen.width, (2 * halfH) / screen.height);
	const openingHalfW = (screen.width * scale) / 2;
	const openingHalfH = (screen.height * scale) / 2;
	const widthFraction = Math.min(1, openingHalfW / halfW);
	const heightFraction = Math.min(1, openingHalfH / halfH);
	return {
		basis: {
			origin: [0, 0, 0],
			u: [openingHalfW, 0, 0],
			v: [0, openingHalfH, 0],
			normal: [0, 0, 1]
		},
		uvWindow: [(1 - widthFraction) / 2, (1 - heightFraction) / 2, widthFraction, heightFraction],
		scale
	};
}

export interface StageScreenBodyPlacement {
	glass: StageScreenGlass;
	/** Column-major model matrix: model units → stage world. */
	model: Float32Array;
	/** World-space bounding sphere of the placed body. */
	center: StagePlaneVector;
	radius: number;
	/** The model's underside in world units, when it declares a floor. */
	floorY: number | null;
}

/**
 * Place a screen model so its glass IS the Surface plane: one uniform scale
 * from the opening fit, and a shift that lands the model's screen centre on
 * the stage origin — so the housing stands proud of the glass by exactly the
 * pocket depth the part authored.
 */
export function resolveStageScreenBodyPlacement(
	aspect: number,
	model: StageModelDefinition,
	mesh: Pick<StageMeshData, 'min' | 'max'>
): StageScreenBodyPlacement {
	const glass = resolveStageScreenGlass(aspect, model.screen);
	const s = glass.scale;
	const shift: StagePlaneVector = [
		-model.screen.center[0] * s,
		-model.screen.center[1] * s,
		-model.screen.center[2] * s
	];
	// prettier-ignore
	const modelMatrix = new Float32Array([
		s, 0, 0, 0,
		0, s, 0, 0,
		0, 0, s, 0,
		shift[0], shift[1], shift[2], 1
	]);
	const center: StagePlaneVector = [
		((mesh.min[0] + mesh.max[0]) / 2) * s + shift[0],
		((mesh.min[1] + mesh.max[1]) / 2) * s + shift[1],
		((mesh.min[2] + mesh.max[2]) / 2) * s + shift[2]
	];
	const radius =
		(Math.hypot(mesh.max[0] - mesh.min[0], mesh.max[1] - mesh.min[1], mesh.max[2] - mesh.min[2]) /
			2) *
		s;
	const floorY = model.floor ? model.floor.y * s + shift[1] : null;
	return { glass, model: modelMatrix, center, radius, floorY };
}

/** How far the floor runs toward the camera and back to the backdrop, in world units. */
export const STAGE_FLOOR_REACH = { front: 2, back: STAGE_BACKDROP_DEPTH } as const;

/**
 * The plane a screen model stands on: a horizontal quad at the model's
 * underside (in world units after the screen fit), wide enough to hold the
 * backdrop's cover, running from in front of the model back to the backdrop.
 * Its local +y points away from the camera. It carries the Pack field colour
 * and takes the key, the shadow map, and the glass's spill like any plane.
 */
export function resolveStageFloorBasis(
	aspect: number,
	floorY: number,
	backdropCover: number
): StagePlaneBasis {
	const { halfW } = stagePlaneHalfExtents(STAGE_CAM_Z + STAGE_BACKDROP_DEPTH, aspect);
	const depth = STAGE_FLOOR_REACH.front + STAGE_FLOOR_REACH.back;
	return {
		origin: [0, floorY, (STAGE_FLOOR_REACH.front - STAGE_FLOOR_REACH.back) / 2],
		u: [halfW * backdropCover, 0, 0],
		v: [0, 0, -depth / 2],
		normal: [0, 1, 0]
	};
}

/** Half extents of a mesh in its own units. */
export function stageMeshHalfExtents(mesh: Pick<StageMeshData, 'min' | 'max'>): StageMeshVector {
	return [
		(mesh.max[0] - mesh.min[0]) / 2,
		(mesh.max[1] - mesh.min[1]) / 2,
		(mesh.max[2] - mesh.min[2]) / 2
	];
}

/** A rectangle in frame fractions (u right, v down), the space the canvas overlay draws in. */
export interface StageBodyFrameBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

export interface StageBodyFrameBoundsInput {
	aspect: number;
	/** The camera the frame films through — already resolved for its orientation. */
	camera: StageCamera;
	/** Clip progress 0..1. */
	time: number;
	model: StageModelDefinition;
	/** The resident mesh: its bounds place the body, its vertices give the silhouette. */
	mesh: Pick<StageMeshData, 'min' | 'max' | 'vertices' | 'vertexCount'>;
}

function transformColumnMajorPoint(
	matrix: Float32Array,
	point: readonly [number, number, number]
): [number, number, number, number] {
	const [x, y, z] = point;
	return [
		matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
		matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
		matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
		matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
	];
}

/**
 * The screen body's silhouette as the frame sees it (ADR-0060 §3): every
 * vertex of the resident mesh, placed as the renderer places the body and
 * projected through the renderer's own camera, as one frame-fraction
 * rectangle the canvas overlay turns into the body's selection region. The
 * vertices, not the bounding box: a deep object's box projects far wider
 * than the object under an oblique camera. Null when the whole body lies
 * behind the eye; a vertex behind the eye is left out so the rectangle never
 * folds through the camera.
 */
export function projectStageBodyFrameBounds(
	input: StageBodyFrameBoundsInput
): StageBodyFrameBounds | null {
	const placement = resolveStageScreenBodyPlacement(input.aspect, input.model, input.mesh);
	const rig = createStageCameraRig({ aspect: input.aspect, camera: input.camera, time: input.time });
	// One matrix from model units to clip space, so each vertex costs one transform.
	const modelToClip = mat4.multiply(rig.viewProjection, placement.model) as Float32Array;
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	const { vertices } = input.mesh;
	for (let index = 0; index < input.mesh.vertexCount; index += 1) {
		const offset = index * STAGE_MESH_VERTEX_FLOATS;
		const clip = transformColumnMajorPoint(modelToClip, [
			vertices[offset],
			vertices[offset + 1],
			vertices[offset + 2]
		]);
		if (clip[3] <= 1e-6) continue;
		const u = (clip[0] / clip[3] + 1) / 2;
		const v = (1 - clip[1] / clip[3]) / 2;
		if (u < left) left = u;
		if (u > right) right = u;
		if (v < top) top = v;
		if (v > bottom) bottom = v;
	}
	if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
	return { left, top, width: right - left, height: bottom - top };
}

// ---------------- Focus ----------------

export interface StageBodyFocusSubject {
	/** World-space centre of the body. */
	center: StagePlaneVector;
	presence: number;
}

export interface StageBodyFocusPull {
	/** Camera-space (axial) distance of the nearest present body. */
	distance: number;
	/** How far the lens racks from the aim to that body, 0..1. */
	pull: number;
}

/**
 * A present body pulls focus (ADR-0051 phase 2): the way a documentary camera
 * racks to a subject that enters the shot, the lens leaves the aimed page
 * point for the nearest body as it arrives and returns as it leaves. The pull
 * is the strongest body presence, so an arriving body is sharp through its
 * whole settle. Null when no body is present, leaving the aim's focus alone.
 * A screen body never pulls: its glass IS the aimed plane.
 */
export function resolveStageBodyFocusPull(
	subjects: readonly StageBodyFocusSubject[],
	eye: StagePlaneVector,
	forward: StagePlaneVector
): StageBodyFocusPull | null {
	let distance = Number.POSITIVE_INFINITY;
	let pull = 0;
	for (const subject of subjects) {
		if (subject.presence <= 0) continue;
		const axial =
			(subject.center[0] - eye[0]) * forward[0] +
			(subject.center[1] - eye[1]) * forward[1] +
			(subject.center[2] - eye[2]) * forward[2];
		distance = Math.min(distance, axial);
		pull = Math.max(pull, clampNumber(subject.presence, 0, 1));
	}
	return pull > 0 ? { distance, pull } : null;
}

// ---------------- The shadow projection ----------------

export interface StageShadowCaster {
	center: StagePlaneVector;
	radius: number;
}

/** A directional shadow camera fitted around the casters. */
export interface StageShadowProjection {
	/** World → light clip space (orthographic). */
	viewProjection: Float32Array;
	eye: StagePlaneVector;
	/** Unit direction the light travels. */
	direction: StagePlaneVector;
	near: number;
	far: number;
	/** World units one full shadow-map span covers. */
	extent: number;
}

/** Margin around the casters' footprint so a penumbra never clips at the map edge. */
const SHADOW_FOOTPRINT_MARGIN = 1.2;
const SHADOW_FOOTPRINT_PAD = 0.08;

function normalizeVector(v: StagePlaneVector): StagePlaneVector {
	const magnitude = Math.hypot(v[0], v[1], v[2]);
	return magnitude > 1e-9 ? [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude] : [0, 0, 1];
}

function scaleVector(v: StagePlaneVector, s: number): StagePlaneVector {
	return [v[0] * s, v[1] * s, v[2] * s];
}

function addVectors(a: StagePlaneVector, b: StagePlaneVector): StagePlaneVector {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Fit an orthographic light camera around the casters: it looks along the
 * Pack key's travel direction from behind the nearest caster, its footprint
 * covers every caster (with a penumbra margin), and its far plane reaches
 * `receiverReach` world units past the casters so the planes behind them —
 * down to the backdrop — can read their shadow. Null with no casters.
 */
export function createStageShadowProjection(
	lightDirection: StagePlaneVector,
	casters: readonly StageShadowCaster[],
	receiverReach: number
): StageShadowProjection | null {
	if (casters.length === 0) return null;
	const direction = normalizeVector(lightDirection);
	let focus: StagePlaneVector = [0, 0, 0];
	for (const caster of casters) focus = addVectors(focus, caster.center);
	focus = scaleVector(focus, 1 / casters.length);
	let reach = 0;
	for (const caster of casters) {
		const offset: StagePlaneVector = [
			caster.center[0] - focus[0],
			caster.center[1] - focus[1],
			caster.center[2] - focus[2]
		];
		reach = Math.max(reach, Math.hypot(offset[0], offset[1], offset[2]) + caster.radius);
	}
	const half = reach * SHADOW_FOOTPRINT_MARGIN + SHADOW_FOOTPRINT_PAD;
	const standoff = reach + 1;
	const eye = addVectors(focus, scaleVector(direction, -standoff));
	const up: StagePlaneVector = Math.abs(direction[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0];
	const near = 0.05;
	const far = standoff + reach + Math.max(0, receiverReach);
	const view = mat4.lookAt(eye, focus, up);
	const projection = mat4.ortho(-half, half, -half, half, near, far);
	return {
		viewProjection: mat4.multiply(projection, view) as Float32Array,
		eye,
		direction,
		near,
		far,
		extent: 2 * half
	};
}
