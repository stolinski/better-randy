import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { VARIANT_IDS } from './variants';

const AchievementContentSchema = z.strictObject({
	variant: z.enum(VARIANT_IDS).default('checklist-complete'),
	kicker: z.string().min(1),
	title: z.string().min(1),
	beat: z.number().min(0).max(1).default(0.3375)
});

export type AchievementContent = z.infer<typeof AchievementContentSchema>;

export interface AchievementFrameLayout {
	width: number;
	rightInset: number;
	topInset: number;
}

export function achievementFrameLayout(
	orientation: 'horizontal' | 'vertical',
	frameWidth: number,
	frameHeight: number
): AchievementFrameLayout {
	return {
		width: Math.round(frameWidth * (orientation === 'vertical' ? 0.82 : 0.32)),
		rightInset: Math.round(frameWidth * 0.1),
		topInset: Math.round(frameHeight * 0.08)
	};
}

function defaults(): OverlayDefaults<AchievementContent> {
	return {
		content: {
			variant: 'checklist-complete',
			kicker: 'TASK COMPLETE',
			title: 'Env vars set',
			beat: 0.3375
		},
		position: { anchor: 'top-right', offset: { x: 0.1, y: 0.08 } },
		enter: {
			start: 0,
			duration: 0.105,
			ease: 'settled',
			sound: { sample: 'foley-glide' }
		},
		exit: {
			start: 0.85,
			duration: 0.0875,
			ease: 'sharp',
			sound: { sample: 'foley-glide' }
		}
	};
}

export const achievementOverlayRenderer: OverlayRenderer<AchievementContent> = {
	type: 'achievement',
	label: 'Achievement',
	schema: AchievementContentSchema,
	defaults,
	CanvasSource,
	Editor,
	edgeTransition: 'right'
};
