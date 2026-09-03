import { STAGE_CAMERA_POSE_LIMITS, type StageCameraPose, type StageCameraTravel } from './engine-schema';

// The stage camera's editing vocabulary shared by the Camera inspector and the
// canvas gestures (ADR-0060): the rest pose a new pose starts from, a travel
// that starts as a copy of a pose, and the clamped writers every pose field
// goes through, so the inspector, an orbit on the canvas, and a travel target
// all obey `STAGE_CAMERA_POSE_LIMITS` the same way.

/** The shipped frontal camera as an authored pose: turning a pose on changes nothing until a field moves. */
export function restStageCameraPose(): StageCameraPose {
	return { yaw: 0, pitch: 0, roll: 0, distance: 1, aim: { x: 0.5, y: 0.5 } };
}

/** A travel that starts as a copy of `pose`, so turning the travel on changes nothing until its target moves. */
export function stageCameraTravelFrom(pose: StageCameraPose): StageCameraTravel {
	return {
		to: { ...pose, aim: { ...pose.aim } },
		start: 0,
		duration: 0.85,
		ease: 'smooth'
	};
}

/** A pose or a travel target: the two objects the pose writers address. */
export type StageCameraPoseTarget = StageCameraPose | StageCameraTravel['to'];

export function setStageCameraPoseAngle(
	target: StageCameraPoseTarget,
	key: 'yaw' | 'pitch' | 'roll',
	value: number,
	limit: number
): void {
	if (!Number.isFinite(value)) return;
	target[key] = Math.max(-limit, Math.min(limit, value));
}

export function setStageCameraPoseDistance(target: StageCameraPoseTarget, value: number): void {
	if (!Number.isFinite(value)) return;
	target.distance = Math.max(
		STAGE_CAMERA_POSE_LIMITS.minDistance,
		Math.min(STAGE_CAMERA_POSE_LIMITS.maxDistance, value)
	);
}

export function setStageCameraPoseAim(
	target: StageCameraPoseTarget,
	axis: 'x' | 'y',
	value: number
): void {
	if (!Number.isFinite(value)) return;
	const aim = target.aim ?? { x: 0.5, y: 0.5 };
	target.aim = { x: aim.x ?? 0.5, y: aim.y ?? 0.5, [axis]: Math.max(0, Math.min(1, value)) };
}

/** A field's text as a 0..1 fraction, or null when it is not a number. */
export function parseUnitIntervalInput(value: string): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}
