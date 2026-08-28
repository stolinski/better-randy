import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

// Ported to WGSL from @paper-design/shaders `halftone-dots`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// Deliberate departures from the source:
//   - The image-fit/sizing system collapses to identity (the effect-chain input
//     is the already-composited frame).
//   - The source's grainMixer / grainOverlay / grainSize features are omitted —
//     grain is a separate composable link in the GFX effect chain
//     (`paper-grain`), not a per-effect bolt-on.
//   - `fwidth()` edge AA is replaced with an analytic per-cell half-width
//     (derivative ops are illegal in the shader's non-uniform loop under WGSL
//     uniformity analysis; the analytic width is also frame-deterministic).

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const HalftoneDotsParamsSchema = z.object({
	/** Dot rendering style. */
	dotType: z.enum(['classic', 'gooey', 'holes', 'soft']).default('classic'),
	/** Cell lattice: straight square grid or offset hex rows. */
	grid: z.enum(['square', 'hex']).default('square'),
	/** Screen coarseness: 0 = fine (~300 cells/side), 1 = coarse (~7 cells/side). */
	size: z.number().min(0).max(1).default(0.5),
	/** Maximum dot size relative to its cell. */
	radius: z.number().min(0).max(2).default(1),
	/** Sigmoid contrast applied to sampled luminance before dot sizing. */
	contrast: z.number().min(0).max(1).default(0.5),
	/** Tint dots with the frame's own colors instead of the front color. */
	originalColors: z.boolean().default(false),
	/** Invert luminance before dot sizing. */
	inverted: z.boolean().default(false),
	colorFront: z.string().regex(HEX_COLOR_PATTERN).default('#111111'),
	colorBack: z.string().regex(HEX_COLOR_PATTERN).default('#fdf6ec')
});

export type HalftoneDotsParams = z.infer<typeof HalftoneDotsParamsSchema>;

const HalftoneDotsEffectSchema = z.object({
	type: z.literal('halftone-dots'),
	id: z.string(),
	params: HalftoneDotsParamsSchema
});

export const halftoneDotsEffectDefinition = {
	type: 'halftone-dots',
	label: 'Halftone dots',
	schema: HalftoneDotsEffectSchema,
	defaults: () => ({
		params: {
			dotType: 'classic',
			grid: 'square',
			size: 0.5,
			radius: 1,
			contrast: 0.5,
			originalColors: false,
			inverted: false,
			colorFront: '#111111',
			colorBack: '#fdf6ec'
		}
	})
} satisfies EffectPipelineDefinition<HalftoneDotsParams>;
