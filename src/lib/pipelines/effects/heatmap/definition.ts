import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

// Adapted to WGSL from @paper-design/shaders `heatmap`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// The source is a standalone logo treatment: it consumes a CPU-preprocessed
// multi-channel image (contour / 150px outer blur / inner blur baked into RGB)
// and drives a hardcoded demo choreography (`shadowShape`). Neither survives
// as a composited-frame effect — the chain is one fragment pass per effect and
// the input is the live frame. What this port keeps from the source verbatim:
// the N-color gradient cascade (up to 10 stops), the traveling heat band, the
// noise/grain hashes, and time driven per ADR-0012 (`ctx.timestamp * speed`).
// What replaces the preprocessed pipeline: frame luminance is the heat source,
// with an in-pass 4-tap edge gradient supplying the contour term.

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const MAX_COLOR_COUNT = 10;

// Classic thermal ramp: cold floor → blue → cyan-green → yellow → orange → white-hot.
const DEFAULT_COLORS = [
	'#050533',
	'#2c0da0',
	'#0066ff',
	'#00d09a',
	'#ffe83d',
	'#ff7a00',
	'#ffffff'
];

const HeatmapParamsSchema = z.object({
	/** Heat gradient stops, cold to hot. */
	colors: z
		.array(z.string().regex(HEX_COLOR_PATTERN))
		.min(2)
		.max(MAX_COLOR_COUNT)
		.default(DEFAULT_COLORS),
	/** Extra heat at content edges (in-pass luminance gradient). */
	contour: z.number().min(0).max(1).default(0.3),
	/** Amplitude of the traveling heat band. */
	wave: z.number().min(0).max(1).default(0.35),
	/** Direction of the traveling band in degrees. */
	angle: z.number().min(0).max(360).default(90),
	/** Grain applied across the heat field. */
	noise: z.number().min(0).max(1).default(0.15),
	/** Playback rate multiplier over the clip timestamp (0 freezes the wave). */
	speed: z.number().min(0).max(3).default(1)
});

export type HeatmapParams = z.infer<typeof HeatmapParamsSchema>;

const HeatmapEffectSchema = z.object({
	type: z.literal('heatmap'),
	id: z.string(),
	params: HeatmapParamsSchema
});

export const heatmapEffectDefinition = {
	type: 'heatmap',
	label: 'Heatmap',
	schema: HeatmapEffectSchema,
	defaults: () => ({
		params: {
			colors: [...DEFAULT_COLORS],
			contour: 0.3,
			wave: 0.35,
			angle: 90,
			noise: 0.15,
			speed: 1
		}
	})
} satisfies EffectPipelineDefinition<HeatmapParams>;
