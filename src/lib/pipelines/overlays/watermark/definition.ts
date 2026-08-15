import { z } from 'zod';
import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

const WatermarkContentSchema = z.object({
	handle: z.string(),
	label: z.string().optional()
});

export type WatermarkContent = z.infer<typeof WatermarkContentSchema>;

function defaults(): OverlayDefaults<WatermarkContent> {
	return {
		content: { handle: '@supers', label: 'Watch next' },
		position: { anchor: 'top-right', offset: { x: 0.0625, y: 0.0625 } },
		enter: { start: 0.06, duration: 0.14, ease: 'settled' },
		exit: { start: 0.86, duration: 0.14, ease: 'smooth' }
	};
}

export const watermarkOverlayDefinition = {
	type: 'watermark',
	label: 'Watermark',
	schema: WatermarkContentSchema,
	defaults
} satisfies OverlayPipelineDefinition<WatermarkContent>;
