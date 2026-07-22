import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';

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

const DitheringUniforms = d.struct({
	colorFront: d.vec4f,
	colorBack: d.vec4f,
	colorHighlight: d.vec4f,
	resolution: d.vec2f,
	mode: d.f32,
	pxSize: d.f32,
	colorSteps: d.f32,
	originalColors: d.f32,
	inverted: d.f32
});

const MODE_TO_INDEX: Record<DitheringParams['mode'], number> = {
	random: 1,
	'2x2': 2,
	'4x4': 3,
	'8x8': 4
};

// Pixelize the frame into pxSize-square cells, quantize each cell's luminance
// to `colorSteps` levels, and break the quantization bands with a dither
// threshold (hash noise or ordered Bayer). Two color modes: the frame's own
// colors (posterized), or a front/back/highlight palette masked to the content
// silhouette.
//
// Alpha (rubric E4): a cell that samples alpha 0 outputs alpha 0 — fully
// transparent regions stay transparent and the chain never paints a fill the
// composition didn't declare. Within content, alpha quantizes along with
// luminance (the filter's posterized look applies to soft edges too); the
// output stays premultiplied.
//
// The Bayer value at cell (x, y) is built bitwise from LSB to MSB — digit
// 2*(xi^yi) + yi per bit level — which reproduces the classic 2x2/4x4/8x8
// matrices without dynamically-indexed constant arrays.
const fragmentBody = /* wgsl */ `
	let res = layout.$.uniforms.resolution;
	let pxSize = max(layout.$.uniforms.pxSize, 1.0);

	// Cell grid centred on the frame centre (the source shader's
	// gl_FragCoord - 0.5 * resolution convention), sampled once per cell.
	let centeredPx = in.uv * res - 0.5 * res;
	let cellCoord = centeredPx / pxSize;
	let cellCentrePx = (floor(cellCoord) + 0.5) * pxSize;
	let cellUv = clamp((cellCentrePx + 0.5 * res) / res, vec2f(0.0), vec2f(1.0));
	let cellSample = textureSample(layout.$.inputTexture, layout.$.samp, cellUv);

	// Chain textures are premultiplied; luminance runs on the straight color.
	let cellAlpha = cellSample.a;
	let straightRgb = cellSample.rgb / max(cellAlpha, 0.0001);
	var lum = dot(vec3f(0.2126, 0.7152, 0.0722), straightRgb);
	lum = select(lum, 1.0 - lum, layout.$.uniforms.inverted > 0.5);

	let mode = i32(layout.$.uniforms.mode + 0.5);
	var dither = 0.0;
	if (mode == 1) {
		dither = fract(sin(dot(cellCentrePx, vec2f(12.9898, 78.233))) * 43758.5453);
	} else {
		let bits = u32(mode - 1); // 2x2 -> 1 bit, 4x4 -> 2, 8x8 -> 3
		let size = f32(1u << bits);
		let wrapped = vec2u(floor(fract(cellCoord / size) * size));
		var acc = 0u;
		for (var i = 0u; i < bits; i = i + 1u) {
			let xi = (wrapped.x >> i) & 1u;
			let yi = (wrapped.y >> i) & 1u;
			acc = (acc << 2u) | (2u * (xi ^ yi) + yi);
		}
		dither = f32(acc) / (size * size);
	}

	let steps = max(floor(layout.$.uniforms.colorSteps), 1.0);
	let brightness = clamp(lum + (dither - 0.5) / steps, 0.0, 1.0) * cellAlpha;
	let quantLum = floor(brightness * steps + 0.5) / steps;

	var result = vec4f(0.0);
	if (layout.$.uniforms.originalColors > 0.5) {
		// Posterize the frame's own colors: hue preserved, luminance quantized.
		let normColor = straightRgb / max(lum, 0.001);
		let quantAlpha = floor(cellAlpha * steps + 0.5) / steps;
		result = vec4f(normColor * quantLum, mix(quantLum, 1.0, quantAlpha));
	} else {
		// Palette mode: front color scaled by quantized luminance over the back
		// color, with the highlight color taking the top quantization band.
		let front = layout.$.uniforms.colorFront;
		let back = layout.$.uniforms.colorBack;
		let highlight = layout.$.uniforms.colorHighlight;
		let useHighlight = step(1.02 - 0.02 * steps, brightness);
		let fgRgb = mix(front.rgb * front.a, highlight.rgb * highlight.a, useHighlight);
		let fgA = mix(front.a, highlight.a, useHighlight);
		var paletteRgb = fgRgb * quantLum;
		var paletteA = fgA * quantLum;
		paletteRgb = paletteRgb + back.rgb * back.a * (1.0 - paletteA);
		paletteA = paletteA + back.a * (1.0 - paletteA);
		// Mask the palette (back color included) to the content silhouette so the
		// effect never paints a background the composition didn't declare.
		result = vec4f(paletteRgb, paletteA) * cellAlpha;
	}

	return result;
`;

export const ditheringEffectRenderer: EffectRenderer<DitheringParams> = {
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
	}),
	pass: {
		paramsStruct: DitheringUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => ({
			colorFront: d.vec4f(...hexToRgbaFloat(params.colorFront ?? '#ffffff')),
			colorBack: d.vec4f(...hexToRgbaFloat(params.colorBack ?? '#000000')),
			colorHighlight: d.vec4f(...hexToRgbaFloat(params.colorHighlight ?? '#ffffff')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			mode: MODE_TO_INDEX[params.mode ?? '4x4'],
			pxSize: params.pxSize ?? 8,
			colorSteps: params.colorSteps ?? 4,
			originalColors: (params.originalColors ?? true) ? 1 : 0,
			inverted: (params.inverted ?? false) ? 1 : 0
		})
	},
	Editor
};
