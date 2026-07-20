import type { SoundEvent } from '$lib/platform/engine-schema';

export interface AchievementMotionState {
	checkDraw: number;
	completion: number;
	medalOpacity: number;
	medalScale: number;
	chipOpacity: number;
	chipScale: number;
}

export interface AchievementSoundEvent {
	event: SoundEvent;
	offsetMs: number;
}

export interface AchievementVariant {
	id: string;
	label: string;
	focalDurationMs: number;
	motionState: (sinceBeatMs: number) => AchievementMotionState;
	soundEvents: readonly AchievementSoundEvent[];
}
