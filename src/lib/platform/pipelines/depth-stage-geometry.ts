import { mat4 } from 'wgpu-matrix';

import { clampNumber } from '$lib/utils/math';
import type { StageMeshData, StageMeshVector } from '../stage-mesh-format';
import type { StageModelDefinition, StageModelScreen } from '../stage-models';
import { STAGE_CAM_Z, stagePlaneHalfExtents } from './depth-stage-camera';
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
	return { glass, model: modelMatrix, center, radius };
}

/** Half extents of a mesh in its own units. */
export function stageMeshHalfExtents(mesh: Pick<StageMeshData, 'min' | 'max'>): StageMeshVector {
	return [
		(mesh.max[0] - mesh.min[0]) / 2,
		(mesh.max[1] - mesh.min[1]) / 2,
		(mesh.max[2] - mesh.min[2]) / 2
	];
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
