import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { VARIANT_IDS } from './variants';

const InstanceStackContentSchema = z.object({
	variant: z.enum(VARIANT_IDS).default('vertical-stack'),
	text: z.string().min(1),
	count: z.number().int().min(2).max(40).default(9),
	spacing: z.number().positive().default(1.05),
	opacityFloor: z.number().min(0).max(1).default(0.15),
	lagWindow: z.number().min(0).max(1).default(0.4),
	// When the staggered assembly begins, as a fraction of the clip. A draggable
	// timeline clip (start = this, width = lagWindow), so the entrance timing
	// lives in the composition rather than being keyed to the raw clip start.
	staggerStart: z.number().min(0).max(1).default(0)
});

export type InstanceStackContent = z.infer<typeof InstanceStackContentSchema>;

function defaults(): OverlayDefaults<InstanceStackContent> {
	return {
		content: {
			variant: 'vertical-stack',
			text: 'EVERY LINE',
			count: 9,
			spacing: 1.05,
			opacityFloor: 0.15,
			lagWindow: 0.4,
			staggerStart: 0
		},
		position: { anchor: 'top-left', offset: { x: 0.08, y: 0.12 } },
		enter: { start: 0, duration: 0.18, ease: 'smooth' },
		exit: { start: 0.86, duration: 0.1, ease: 'smooth' }
	};
}

export const instanceStackOverlayRenderer: OverlayRenderer<InstanceStackContent> = {
	type: 'instance-stack',
	label: 'Instance stack',
	schema: InstanceStackContentSchema,
	defaults,
	CanvasSource,
	Editor,
	fieldInkOnBackground: true,
	disableEntryOffset: true
};
