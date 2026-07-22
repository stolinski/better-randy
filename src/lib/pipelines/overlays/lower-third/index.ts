import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';
import { VARIANT_IDS } from './variants';

/**
 * Lower-third Overlay family — per ADR-0020 (variants-as-data). After the
 * Phase 2.1 migration the family hosts two variants: `standard` (flat dark
 * plate) and `cinematic` (broadcast scrim-gradient plate). The family's
 * anamorphic-flare shaderPass was removed 2026-07-13 (Scott: "it looks
 * cheap" — flare ≠ cinematic; it was already dead code, gated on an
 * `'anamorphic-flare'` light claim no Pack makes). The `lower-third.light`
 * Role stays declared — a future light treatment must clear that bar.
 * Adding a third variant is one file in `variants/` + one entry in
 * `variants/index.ts`; the Zod schema picks it up automatically from
 * `VARIANT_IDS`.
 */

const LowerThirdContentSchema = z.object({
	variant: z.enum(VARIANT_IDS).default('standard'),
	kicker: z.string().optional(),
	title: z.string(),
	subtitle: z.string().optional()
});

export type LowerThirdContent = z.infer<typeof LowerThirdContentSchema>;

function defaults(): OverlayDefaults<LowerThirdContent> {
	return {
		content: {
			variant: 'standard',
			kicker: 'CHAPTER 01',
			title: 'Origins',
			subtitle: 'How it began'
		},
		position: { anchor: 'bottom-left', offset: { x: 0.0625, y: 0.0625 } },
		enter: { start: 0.1, duration: 0.18, ease: 'settled' },
		exit: { start: 0.82, duration: 0.16, ease: 'smooth' }
	};
}

export const lowerThirdOverlayRenderer: OverlayRenderer<LowerThirdContent> = {
	type: 'lower-third',
	label: 'Lower-third',
	schema: LowerThirdContentSchema,
	defaults,
	CanvasSource,
	Editor
};
