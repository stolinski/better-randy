import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

// Ported to WGSL from @paper-design/shaders `image-dithering`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// The source shader's image-fit/sizing system (origin / worldWidth / fit /
// scale / rotation) is dropped: the effect-chain input is the already-composited
// frame, so image UV mapping collapses to identity.

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const DitheringParamsSchema = z.object({
	/** Threshold pattern: per-cell hash noise or an ordered Bayer matrix. */
	mode: z.enum(['random', '2x2', '4x4', '8x8']).default('4x4'),
	/** Dither cell size in composition pixels (1 = per-pixel, no pixelation). */
	pxSize: z.number().min(1).max(64).default(8),
	/** Number of quantization levels for luminance (and alpha). */
	colorSteps: z.number().int().min(1).max(7).default(4),
	/** Keep the frame's own colors (posterized) instead of the palette below. */
	originalColors: z.boolean().default(true),
	/** Invert luminance before quantization. */
	inverted: z.boolean().default(false),
	colorFront: z.string().regex(HEX_COLOR_PATTERN).default('#ffffff'),
	colorBack: z.string().regex(HEX_COLOR_PATTERN).default('#000000'),
	colorHighlight: z.string().regex(HEX_COLOR_PATTERN).default('#ffffff')
});

export type DitheringParams = z.infer<typeof DitheringParamsSchema>;

const DitheringEffectSchema = z.object({
	type: z.literal('dithering'),
	id: z.string(),
	params: DitheringParamsSchema
});

export const ditheringEffectDefinition = {
	type: 'dithering',
	label: 'Dithering',
	schema: DitheringEffectSchema,
	defaults: () => ({
		params: {
			mode: '4x4',
			pxSize: 8,
			colorSteps: 4,
			originalColors: true,
			inverted: false,
			colorFront: '#ffffff',
			colorBack: '#000000',
			colorHighlight: '#ffffff'
		}
	})
} satisfies EffectPipelineDefinition<DitheringParams>;
