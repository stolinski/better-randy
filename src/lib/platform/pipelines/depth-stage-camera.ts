import { mat4, vec4 } from 'wgpu-matrix';

// The depth stage's camera model (ADR-0028), single-sourced so the renderer
// (depth-stage.ts) and canvas hit-testing (CanvasEditingOverlay, epic 0pkzts2c)
// share one set of matrices: everything here is a pure, frame-deterministic
// function of DepthStageInput fields, so a projector built from the same state
// the renderer receives reproduces the exact pixel mapping of the staged frame.

export const STAGE_FOV = (42 * Math.PI) / 180;
/** Camera rest distance; the Surface plane sits at the framing distance. */
export const STAGE_CAM_Z = 3.4;
/** World units the backdrop sits behind the Surface plane. */
export const STAGE_BACKDROP_DEPTH = 2.2;

export type StageCameraMove = 'static' | 'push' | 'drift';

export interface StageCameraPose {
	eyeX: number;
	eyeZ: number;
}

const smootherstep = (t: number): number => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * x * (x * (x * 6 - 15) + 10);
};

/** The camera eye for a stage move at clip progress `time` (0..1). */
export function stageCameraPose(
	move: StageCameraMove,
	amount: number,
	time: number
): StageCameraPose {
	const e = smootherstep(time);
	if (move === 'push') {
		// start pulled back, dolly in
		return { eyeX: 0, eyeZ: STAGE_CAM_Z + 0.55 * amount * (1 - e) };
	}
	if (move === 'drift') {
		// lateral parallax sweep
		return { eyeX: (-0.18 + (0.14 - -0.18) * e) * amount, eyeZ: STAGE_CAM_Z };
	}
	return { eyeX: 0, eyeZ: STAGE_CAM_Z };
}

/** Half-extents of a plane that exactly fills the frame at camera distance
 *  `dist` — the stage's framing rule for every plane. */
export function stagePlaneHalfExtents(
	dist: number,
	aspect: number
): { halfW: number; halfH: number } {
	const halfH = Math.tan(STAGE_FOV / 2) * dist;
	return { halfW: halfH * aspect, halfH };
}

export interface StageProjectorInput {
	/** Frame aspect (width / height). */
	aspect: number;
	cameraMove: StageCameraMove;
	/** Camera move strength, 0..1. */
	cameraAmount: number;
	/** Overlay plane depth (ADR-0021 scalar): 0 ⇒ the Surface plane, 1 ⇒ backdrop. */
	overlayZ: number;
	/** Clip progress 0..1 — the same frame-deterministic time the renderer gets. */
	time: number;
}

export type StagePlane = 'surface' | 'overlay';

export interface StageProjector {
	/** Composition fraction (u right, v down — capture UV space) → frame
	 *  fraction under the staged camera. */
	projectPoint(plane: StagePlane, u: number, v: number): { x: number; y: number };
	/** Frame fraction → composition fraction: ray-cast the click through the
	 *  camera onto the plane. Null only if the ray runs parallel to the plane
	 *  (can't happen with the stage's frontal camera, but typed honestly). */
	raycastPoint(plane: StagePlane, fx: number, fy: number): { x: number; y: number } | null;
}

/** Build the forward + inverse mapping between composition space and the
 *  rendered frame for the depth stage's plane geometry at one instant. */
export function createStageProjector(input: StageProjectorInput): StageProjector {
	const { eyeX, eyeZ } = stageCameraPose(input.cameraMove, input.cameraAmount, input.time);
	const projection = mat4.perspective(STAGE_FOV, input.aspect, 0.1, 100);
	const view = mat4.lookAt([eyeX, 0, eyeZ], [0, 0, 0], [0, 1, 0]);
	const viewProjection = mat4.multiply(projection, view);
	const inverseViewProjection = mat4.invert(viewProjection);

	const overlayDepth = Math.min(1, Math.max(0, input.overlayZ)) * STAGE_BACKDROP_DEPTH;
	const planes: Record<StagePlane, { halfW: number; halfH: number; z: number }> = {
		surface: { ...stagePlaneHalfExtents(STAGE_CAM_Z, input.aspect), z: 0 },
		overlay: {
			...stagePlaneHalfExtents(STAGE_CAM_Z + overlayDepth, input.aspect),
			z: -overlayDepth
		}
	};

	return {
		projectPoint(plane, u, v) {
			const { halfW, halfH, z } = planes[plane];
			// Capture UV → the plane's world point (the plane quad maps uv 0..1
			// across its ±half-extents, v downward).
			const world = vec4.transformMat4(
				[(2 * u - 1) * halfW, (1 - 2 * v) * halfH, z, 1],
				viewProjection
			);
			return { x: (world[0] / world[3] + 1) / 2, y: (1 - world[1] / world[3]) / 2 };
		},
		raycastPoint(plane, fx, fy) {
			const { halfW, halfH, z } = planes[plane];
			const ndcX = 2 * fx - 1;
			const ndcY = 1 - 2 * fy;
			// Unproject the frame point at both WebGPU clip depths → a world ray,
			// then intersect it with the plane's constant-z slice.
			const near = vec4.transformMat4([ndcX, ndcY, 0, 1], inverseViewProjection);
			const far = vec4.transformMat4([ndcX, ndcY, 1, 1], inverseViewProjection);
			const n = { x: near[0] / near[3], y: near[1] / near[3], z: near[2] / near[3] };
			const f = { x: far[0] / far[3], y: far[1] / far[3], z: far[2] / far[3] };
			const dz = f.z - n.z;
			if (Math.abs(dz) < 1e-8) {
				return null;
			}
			const t = (z - n.z) / dz;
			const x = n.x + (f.x - n.x) * t;
			const y = n.y + (f.y - n.y) * t;
			return { x: (x / halfW + 1) / 2, y: (1 - y / halfH) / 2 };
		}
	};
}
