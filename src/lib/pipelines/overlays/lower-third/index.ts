import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';
import { cinematicLowerThirdFlare } from '$lib/pipelines/shader-passes/cinematic-lower-third-flare';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { VARIANT_IDS, type LowerThirdVariantId } from './variants';

/**
 * Lower-third Overlay family — per ADR-0020 (variants-as-data). After the
 * Phase 2.1 migration the family hosts two variants: `standard` (flat dark
 * plate) and `cinematic` (broadcast plate with anamorphic flare via the
 * family\'s shaderPass). Adding a third variant is one file in `variants/`
 * + one entry in `variants/index.ts`; the Zod schema picks it up
 * automatically from `VARIANT_IDS`.
 */

const LowerThirdContentSchema = z.object({
	variant: z.enum(VARIANT_IDS).default('standard'),
	kicker: z.string().optional(),
	title: z.string(),
	subtitle: z.string().optional()
});

export type LowerThirdContent = z.infer<typeof LowerThirdContentSchema>;
export type { LowerThirdVariantId };

function defaults(): OverlayDefaults<LowerThirdContent> {
	return {
		content: { variant: 'standard', kicker: 'CHAPTER 01', title: 'Origins', subtitle: 'How it began' },
		position: { anchor: 'bottom-left', offset: { x: 0.0625, y: 0.0625 } },
		enter: { start: 0.1, duration: 0.18, ease: 'settled' },
		exit: { start: 0.82, duration: 0.16, ease: 'smooth' }
	};
}

export const lowerThird: OverlayRenderer<LowerThirdContent> = {
	type: 'lower-third',
	label: 'Lower-third',
	schema: LowerThirdContentSchema,
	defaults,
	CanvasSource,
	Editor,
	shaderPass: cinematicLowerThirdFlare
};
