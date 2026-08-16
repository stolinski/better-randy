import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

// Ported to WGSL from @paper-design/shaders `water`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// Deliberate departures from the source:
//   - The image-fit/sizing system collapses to identity (the effect-chain input
//     is the already-composited frame).
//   - The source's `u_colorBack` standalone-texture fill is dropped —
//     background fills are the composition's `backgroundFill`, never an effect
//     param — and the caustic highlights are masked by the local content
//     coverage so transparent regions stay transparent (rubric E4).
//   - The source's frame window (getUvFrame) is dropped in favor of the
//     sampler's clamp-to-edge — the AE-displacement convention. The window
//     assumed an image floating over a colorBack fill; on a composited frame
//     it would punch transparent pinholes into full-frame pieces wherever the
//     displaced UV exits the frame.
//   - `u_time` maps to `ctx.timestamp * speed` (ADR-0012), so the water
//     animates frame-deterministically: preview and export agree at every
//     frame, and a held frame re-renders byte-identical.
//   - The squared caustic field is soft-knee bounded (K·tanh(x/K), K = 6)
//     before driving UV displacement — the source's unbounded hotspots reach
//     15–30× and fold whole words into whorls at otherwise-sane params. The
//     glint highlights keep the unbounded field.

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const WaterParamsSchema = z.object({
	/** Pattern scale of the caustic field. */
	size: z.number().min(0.01).max(7).default(2),
	/** Caustic-shaped glint coloring layered over the content. */
	highlights: z.number().min(0).max(1).default(0.15),
	/** Strength of the second caustic layer. */
	layering: z.number().min(0).max(1).default(0.4),
	/** How much the caustic distortion reaches the frame edges. */
	edges: z.number().min(0).max(1).default(0.3),
	/** Power of the caustic UV distortion. The displacement field is soft-knee
	 *  bounded so hotspots can't fold glyphs at the default; ~0.1 is the
	 *  content-safe band, past ~0.4 reads as abstract liquid texture. */
	caustic: z.number().min(0).max(1).default(0.1),
	/** Additional simplex-noise wave distortion, independent of the caustic. */
	waves: z.number().min(0).max(1).default(0.12),
	/** Playback rate multiplier over the clip timestamp (0 freezes the water). */
	speed: z.number().min(0).max(3).default(1),
	colorHighlight: z.string().regex(HEX_COLOR_PATTERN).default('#fff6e0')
});

export type WaterParams = z.infer<typeof WaterParamsSchema>;

const WaterEffectSchema = z.object({
	type: z.literal('water'),
	id: z.string(),
	params: WaterParamsSchema
});

export const waterEffectDefinition = {
	type: 'water',
	label: 'Water',
	schema: WaterEffectSchema,
	defaults: () => ({
		params: {
			size: 2,
			highlights: 0.15,
			layering: 0.4,
			edges: 0.3,
			caustic: 0.1,
			waves: 0.12,
			speed: 1,
			colorHighlight: '#fff6e0'
		}
	})
} satisfies EffectPipelineDefinition<WaterParams>;
