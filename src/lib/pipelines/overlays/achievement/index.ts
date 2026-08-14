import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import { AchievementContentSchema, type AchievementContent } from './achievement-content';
import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

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
