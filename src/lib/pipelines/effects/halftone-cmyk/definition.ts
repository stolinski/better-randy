import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

// Ported to WGSL from @paper-design/shaders `halftone-cmyk`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// Deliberate departures from the source:
//   - The image-fit/sizing system collapses to identity (the effect-chain input
//     is the already-composited frame).
//   - The source's grainSize / grainMixer / grainOverlay features are omitted —
//     grain is a separate composable link in the GFX effect chain
//     (`paper-grain`).
//   - The source's `u_noiseTexture` cell randomizer is replaced with a
//     procedural hash (the effect bind layout is single-texture); statistically
//     equivalent jitter, fully deterministic.
//   - The declared-but-unused `u_minDot` uniform is dropped.
//   - Dot radius is floored at an epsilon before `smoothstep` — the source
//     legitimately reaches radius 0, which GLSL tolerates but WGSL's
//     smoothstep turns into a 0/0 NaN.

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const HalftoneCmykParamsSchema = z.object({
	/** Dot rendering: separate dots, joined ink blobs, or per-pixel sharp separation. */
	cmykType: z.enum(['dots', 'ink', 'sharp']).default('dots'),
	/** Screen coarseness: 0 = fine (~400 cells/side), 1 = coarse (~7 cells/side). */
	size: z.number().min(0).max(1).default(0.5),
	/** Linear contrast applied to the sampled color before separation. */
	contrast: z.number().min(0).max(2).default(1),
	/** Edge softness of the dots. */
	softness: z.number().min(0).max(1).default(0.25),
	/** Random jitter applied to dot positions and color sampling. */
	gridNoise: z.number().min(0).max(1).default(0),
	colorBack: z.string().regex(HEX_COLOR_PATTERN).default('#fdf6ec'),
	colorC: z.string().regex(HEX_COLOR_PATTERN).default('#00a1e4'),
	colorM: z.string().regex(HEX_COLOR_PATTERN).default('#e6007e'),
	colorY: z.string().regex(HEX_COLOR_PATTERN).default('#ffed00'),
	colorK: z.string().regex(HEX_COLOR_PATTERN).default('#1a1a1a'),
	/** Flat per-channel dot-size adjustment (ink flood). */
	floodC: z.number().min(-1).max(1).default(0),
	floodM: z.number().min(-1).max(1).default(0),
	floodY: z.number().min(-1).max(1).default(0),
	floodK: z.number().min(-1).max(1).default(0),
	/** Proportional per-channel dot-size gain (enhances existing dots). */
	gainC: z.number().min(-1).max(1).default(0),
	gainM: z.number().min(-1).max(1).default(0),
	gainY: z.number().min(-1).max(1).default(0),
	gainK: z.number().min(-1).max(1).default(0)
});

export type HalftoneCmykParams = z.infer<typeof HalftoneCmykParamsSchema>;

const HalftoneCmykEffectSchema = z.object({
	type: z.literal('halftone-cmyk'),
	id: z.string(),
	params: HalftoneCmykParamsSchema
});

export const halftoneCmykEffectDefinition = {
	type: 'halftone-cmyk',
	label: 'Halftone CMYK',
	schema: HalftoneCmykEffectSchema,
	defaults: () => ({
		params: {
			cmykType: 'dots',
			size: 0.5,
			contrast: 1,
			softness: 0.25,
			gridNoise: 0,
			colorBack: '#fdf6ec',
			colorC: '#00a1e4',
			colorM: '#e6007e',
			colorY: '#ffed00',
			colorK: '#1a1a1a',
			floodC: 0,
			floodM: 0,
			floodY: 0,
			floodK: 0,
			gainC: 0,
			gainM: 0,
			gainY: 0,
			gainK: 0
		}
	})
} satisfies EffectPipelineDefinition<HalftoneCmykParams>;
