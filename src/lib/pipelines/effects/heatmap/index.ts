import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';

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
	colors: z.array(z.string().regex(HEX_COLOR_PATTERN)).min(2).max(MAX_COLOR_COUNT).default(DEFAULT_COLORS),
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

const HeatmapUniforms = d.struct({
	colors: d.arrayOf(d.vec4f, MAX_COLOR_COUNT),
	resolution: d.vec2f,
	colorsCount: d.f32,
	time: d.f32,
	contour: d.f32,
	wave: d.f32,
	angle: d.f32,
	noise: d.f32
});

// Thermal read of the frame: straight-color luminance is the base heat, a
// band of extra heat travels across the frame along `angle` (the source's
// animated outer-glow mask), content edges add contour heat, and the summed
// field indexes the gradient cascade exactly as the source does — each stop
// takes over one unit of `heat * colorsCount`.
//
// Alpha (rubric E4): the grade is confined to the frame's own silhouette
// (output × inputSample.a); it recolors coverage, never creates it.
const fragmentBody = /* wgsl */ `
	let PI = 3.14159265358979;
	let res = layout.$.uniforms.resolution;
	let colorsCount = clamp(layout.$.uniforms.colorsCount, 2.0, 10.0);

	// Base heat: luminance of the straight (unpremultiplied) color.
	let straight = inputSample.rgb / max(inputSample.a, 0.0001);
	var heat = dot(vec3f(0.2126, 0.7152, 0.0722), straight);

	// Contour heat: 4-tap luminance gradient at the content's edges.
	let texel = 1.0 / res;
	let lumL = dot(vec3f(0.2126, 0.7152, 0.0722), textureSample(layout.$.inputTexture, layout.$.samp, in.uv - vec2f(texel.x, 0.0)).rgb);
	let lumR = dot(vec3f(0.2126, 0.7152, 0.0722), textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(texel.x, 0.0)).rgb);
	let lumU = dot(vec3f(0.2126, 0.7152, 0.0722), textureSample(layout.$.inputTexture, layout.$.samp, in.uv - vec2f(0.0, texel.y)).rgb);
	let lumD = dot(vec3f(0.2126, 0.7152, 0.0722), textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(0.0, texel.y)).rgb);
	let edgeMag = length(vec2f(lumR - lumL, lumD - lumU));
	heat = heat + layout.$.uniforms.contour * clamp(4.0 * edgeMag, 0.0, 1.0);

	// Traveling heat band along the angle (the source's animated outer mask:
	// a smoothstep band scrolling through a fract-wrapped axis).
	let angleRad = -layout.$.uniforms.angle * PI / 180.0;
	let centered = in.uv - vec2f(0.5);
	let axisY = centered.x * sin(angleRad) + centered.y * cos(angleRad) + 0.5;
	let tw = fract(0.1 * layout.$.uniforms.time - 0.3);
	let bandY = fract(axisY - tw);
	let band = smoothstep(0.3, 0.65, bandY) * (1.0 - smoothstep(0.65, 1.0, bandY));
	heat = heat + layout.$.uniforms.wave * 0.4 * (band - 0.2);

	// Grain over the heat field (the source's exact hash).
	heat = heat + (0.005 + 0.35 * layout.$.uniforms.noise)
		* (fract(sin(dot(in.uv, vec2f(12.9898, 78.233))) * 43758.5453123) - 0.5);
	heat = clamp(heat, 0.0, 1.0);

	// Gradient cascade — each stop takes over one unit of heat * colorsCount.
	let mixer = heat * colorsCount;
	var gradient = layout.$.uniforms.colors[0];
	gradient = vec4f(gradient.rgb * gradient.a, gradient.a);
	for (var i = 1; i <= 10; i = i + 1) {
		if (f32(i) > colorsCount) {
			break;
		}
		let m = clamp(mixer - f32(i - 1), 0.0, 1.0);
		var c = layout.$.uniforms.colors[i - 1];
		c = vec4f(c.rgb * c.a, c.a);
		gradient = mix(gradient, c, m);
	}

	var outRgb = gradient.rgb;
	// Output grain (the source's second hash, offset domain).
	outRgb = outRgb + vec3f(0.02
		* (fract(sin(dot(in.uv + vec2f(1.0), vec2f(12.9898, 78.233))) * 43758.5453123) - 0.5));

	// E4: the grade recolors the frame's own coverage — transparent stays
	// transparent, opaque full-frame pieces get the full thermal read.
	return vec4f(outRgb, 1.0) * inputSample.a;
`;

export const heatmap: EffectRenderer<HeatmapParams> = {
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
	}),
	pass: {
		paramsStruct: HeatmapUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => {
			const colors = (params.colors ?? DEFAULT_COLORS).slice(0, MAX_COLOR_COUNT);
			const padded = Array.from({ length: MAX_COLOR_COUNT }, (_, index) =>
				d.vec4f(...hexToRgbaFloat(colors[Math.min(index, colors.length - 1)] ?? '#ffffff'))
			);
			return {
				colors: padded,
				resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
				colorsCount: Math.max(2, colors.length),
				time: ctx.timestamp * (params.speed ?? 1),
				contour: params.contour ?? 0.3,
				wave: params.wave ?? 0.35,
				angle: params.angle ?? 90,
				noise: params.noise ?? 0.15
			};
		}
	},
	Editor
};
