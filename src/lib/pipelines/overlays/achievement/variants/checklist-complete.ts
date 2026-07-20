import type { AchievementMotionState, AchievementVariant } from './types';

const DRAW_MS = 320;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

export function checklistCompleteMotion(sinceBeatMs: number): AchievementMotionState {
	const linear = clamp01(sinceBeatMs / DRAW_MS);
	const completion = 1 - (1 - linear) ** 3;

	return {
		checkDraw: completion,
		completion,
		medalOpacity: 1,
		medalScale: 1,
		chipOpacity: 1,
		chipScale: 1
	};
}

export const checklistCompleteVariant: AchievementVariant = {
	id: 'checklist-complete',
	label: 'Checklist complete',
	focalDurationMs: DRAW_MS,
	motionState: checklistCompleteMotion,
	soundEvents: [
		{ event: 'draw', offsetMs: 0 },
		{ event: 'click', offsetMs: DRAW_MS }
	]
};
