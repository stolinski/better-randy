import { d } from 'typegpu';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';
import {
	heatmapEffectDefinition,
	type HeatmapParams as HeatmapParamsDefinition
} from './definition';

export type HeatmapParams = HeatmapParamsDefinition;
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

export const heatmapEffectRenderer: EffectRenderer<HeatmapParams> = {
	...heatmapEffectDefinition,
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
