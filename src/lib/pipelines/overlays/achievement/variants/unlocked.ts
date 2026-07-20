import type { AchievementMotionState, AchievementVariant } from './types';

const MEDAL_MS = 360;
const CHIP_DELAY_MS = 230;
const CHIP_MS = 220;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function overshootScale(progress: number, from: number, peak: number): number {
	if (progress <= 0) return from;
	if (progress >= 1) return 1;
	if (progress < 0.62) {
		return from + (peak - from) * (1 - (1 - progress / 0.62) ** 3);
	}
	return peak + (1 - peak) * ((progress - 0.62) / 0.38);
}

export function unlockedMotion(sinceBeatMs: number): AchievementMotionState {
	const medalProgress = clamp01(sinceBeatMs / MEDAL_MS);
	const chipProgress = clamp01((sinceBeatMs - CHIP_DELAY_MS) / CHIP_MS);

	return {
		checkDraw: 0,
		completion: medalProgress,
		medalOpacity: 1 - (1 - medalProgress) ** 3,
		medalScale: overshootScale(medalProgress, 0.82, 1.055),
		chipOpacity: 1 - (1 - chipProgress) ** 2,
		chipScale: overshootScale(chipProgress, 0.88, 1.035)
	};
}

export const unlockedVariant: AchievementVariant = {
	id: 'unlocked',
	label: 'Unlocked',
	focalDurationMs: CHIP_DELAY_MS + CHIP_MS,
	motionState: unlockedMotion,
	soundEvents: [{ event: 'pop', offsetMs: 180 }]
};
