import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';

// Ported to WGSL from @paper-design/shaders `halftone-dots`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// Deliberate departures from the source:
//   - The image-fit/sizing system collapses to identity (the effect-chain input
//     is the already-composited frame).
//   - The source's grainMixer / grainOverlay / grainSize features are omitted —
//     grain is a separate composable link in the Supers effect chain
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

const HalftoneDotsUniforms = d.struct({
	colorFront: d.vec4f,
	colorBack: d.vec4f,
	resolution: d.vec2f,
	dotType: d.f32,
	grid: d.f32,
	size: d.f32,
	radius: d.f32,
	contrast: d.f32,
	originalColors: d.f32,
	inverted: d.f32
});

const DOT_TYPE_TO_INDEX: Record<HalftoneDotsParams['dotType'], number> = {
	classic: 0,
	gooey: 1,
	holes: 2,
	soft: 3
};

// Halftone dot screen: the frame is divided into a cell lattice; each cell
// samples the composite once at its centre and draws a dot whose radius tracks
// the sampled luminance (dark → big ink dot, bright → paper shows through —
// the print convention). `classic` is a hard-edged circle, `gooey` metaball-
// merges neighbours, `holes` flips to punched paper past half radius, `soft`
// is an airbrushed falloff. Overlapping dot fields are accumulated over a
// stepMultiplier² sub-lattice exactly as in the source shader.
//
// Alpha (rubric E4): a fully transparent cell samples lum = 1 → zero-radius
// dot, and the whole output — the back "paper" color included — is multiplied
// by the frame's own per-pixel alpha, so the screen exists only inside the
// content silhouette and transparent regions stay transparent.
const fragmentBody = /* wgsl */ `
	let res = layout.$.uniforms.resolution;
	let dotType = layout.$.uniforms.dotType;
	let grid = layout.$.uniforms.grid;
	let isOriginalColors = layout.$.uniforms.originalColors > 0.5;
	let isInverted = layout.$.uniforms.inverted > 0.5;

	var stepMult = 1;
	if (dotType == 0.0) {
		stepMult = 2;
	}
	if (dotType == 1.0 || dotType == 3.0) {
		stepMult = 6;
	}
	let stepSize = 1.0 / f32(stepMult);

	let cellsPerSide = mix(300.0, 7.0, pow(layout.$.uniforms.size, 0.7)) * stepSize;
	let cellSizeY = 1.0 / cellsPerSide;
	let aspect = res.x / res.y;
	var pad = cellSizeY * vec2f(1.0 / aspect, 1.0);
	if (dotType == 1.0 && grid == 1.0) {
		pad = pad * 0.7;
	}

	let uvCell = (in.uv - vec2f(0.5)) / pad;

	// One output pixel in cell-local units — the analytic AA half-width.
	let aaCell = 1.0 / max(pad.y * res.y, 1.0);

	var contrastK = mix(0.0, 15.0, pow(layout.$.uniforms.contrast, 1.5));
	var baseRadius = layout.$.uniforms.radius;
	if (isOriginalColors) {
		contrastK = mix(0.1, 4.0, pow(layout.$.uniforms.contrast, 2.0));
		baseRadius = 2.0 * pow(0.5 * layout.$.uniforms.radius, 0.3);
	}

	var totalShape = 0.0;
	var totalColor = vec3f(0.0);
	var totalOpacity = 0.0;

	for (var iy = 0; iy < stepMult; iy = iy + 1) {
		for (var ix = 0; ix < stepMult; ix = ix + 1) {
			let x = -0.5 + f32(ix) * stepSize;
			let y = -0.5 + f32(iy) * stepSize;
			var cellOffset = vec2f(x, y);

			if (grid == 1.0) {
				var rowIndex = f32(iy);
				var colIndex = f32(ix);
				if (stepMult == 1) {
					rowIndex = floor(uvCell.y + y + 1.0);
					if (dotType == 1.0) {
						colIndex = floor(uvCell.x + x + 1.0);
					}
				}
				if (dotType == 1.0) {
					// Gooey hex: drop every other diagonal so merged blobs tile.
					if ((i32(rowIndex + colIndex) & 1) == 1) {
						continue;
					}
				} else if ((i32(rowIndex) & 1) == 1) {
					cellOffset.x = cellOffset.x + 0.5 * stepSize;
				}
			}

			let p = uvCell + cellOffset;
			let pF = fract(p);
			let samplingUV = (floor(p) + vec2f(0.5) - cellOffset) * pad + vec2f(0.5);
			let framePad = pad * stepSize;
			let inFrame = step(-framePad.x, samplingUV.x)
				* (1.0 - step(1.0 + framePad.x, samplingUV.x))
				* step(-framePad.y, samplingUV.y)
				* (1.0 - step(1.0 + framePad.y, samplingUV.y));

			let cellSample = textureSampleLevel(layout.$.inputTexture, layout.$.samp, samplingUV, 0.0);
			// Chain textures are premultiplied; contrast + luminance run on the
			// straight color, mirroring the source's straight-alpha sampling.
			let straight = cellSample.rgb / max(cellSample.a, 0.0001);
			let contrasted = vec3f(
				1.0 / (1.0 + exp(-contrastK * (straight.r - 0.5))),
				1.0 / (1.0 + exp(-contrastK * (straight.g - 0.5))),
				1.0 / (1.0 + exp(-contrastK * (straight.b - 0.5)))
			);
			var lum = dot(vec3f(0.2126, 0.7152, 0.0722), contrasted);
			lum = mix(1.0, lum, cellSample.a);
			lum = select(lum, 1.0 - lum, isInverted);

			let dCell = length(pF - vec2f(0.5));
			var ball = 0.0;
			if (dotType == 0.0) {
				let r = mix(0.25 * baseRadius, 0.0, lum);
				ball = 1.0 - smoothstep(r - aaCell, r + aaCell, dCell);
			} else if (dotType == 1.0) {
				var sizeRadius = select(0.3, 0.42, grid == 1.0);
				sizeRadius = mix(sizeRadius * baseRadius, 0.0, lum);
				let falloff = 1.0 - smoothstep(0.0, max(sizeRadius, 0.00001), dCell);
				ball = pow(falloff, 2.0 + baseRadius);
			} else if (dotType == 2.0) {
				let r = mix(0.75 * baseRadius, 0.0, lum);
				let rMod = r - 0.5 * floor(r / 0.5);
				let circle = 1.0 - smoothstep(rMod - aaCell, rMod + aaCell, dCell);
				ball = select(1.0 - circle, circle, r < 0.5);
			} else {
				var sizeRadius = clamp(baseRadius, 0.0, 1.0);
				sizeRadius = mix(0.5 * sizeRadius, 0.0, lum);
				let falloff = 1.0 - clamp(dCell / max(sizeRadius, 0.00001), 0.0, 1.0);
				let powRadius = 1.0 - clamp(0.5 * baseRadius, 0.0, 1.0);
				ball = pow(falloff, 4.0 + 3.0 * powRadius);
			}

			ball = ball * inFrame;
			totalColor = totalColor + cellSample.rgb * ball;
			totalShape = totalShape + ball;
			totalOpacity = totalOpacity + cellSample.a * ball;
		}
	}

	let avgColor = totalColor / max(totalShape, 0.0001);
	let avgOpacity = totalOpacity / max(totalShape, 0.0001);

	var finalShape = min(1.0, totalShape);
	if (dotType == 1.0) {
		// Gooey threshold — fixed band replaces the source's fwidth-based AA.
		finalShape = smoothstep(0.45, 0.55, totalShape);
	} else if (dotType == 3.0) {
		finalShape = totalShape;
	}

	let front = layout.$.uniforms.colorFront;
	let back = layout.$.uniforms.colorBack;
	var outColor = vec3f(0.0);
	var outAlpha = 0.0;
	if (isOriginalColors) {
		outColor = avgColor * finalShape;
		outAlpha = avgOpacity * finalShape;
	} else {
		outColor = front.rgb * front.a * finalShape;
		outAlpha = front.a * finalShape;
	}
	outColor = outColor + back.rgb * back.a * (1.0 - outAlpha);
	outAlpha = clamp(outAlpha + back.a * (1.0 - outAlpha), 0.0, 1.0);

	// E4: the screen — back paper included — exists only inside the content
	// silhouette; transparent regions stay transparent.
	return vec4f(outColor, outAlpha) * inputSample.a;
`;

export const halftoneDots: EffectRenderer<HalftoneDotsParams> = {
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
	}),
	pass: {
		paramsStruct: HalftoneDotsUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => ({
			colorFront: d.vec4f(...hexToRgbaFloat(params.colorFront ?? '#111111')),
			colorBack: d.vec4f(...hexToRgbaFloat(params.colorBack ?? '#fdf6ec')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			dotType: DOT_TYPE_TO_INDEX[params.dotType ?? 'classic'],
			grid: (params.grid ?? 'square') === 'hex' ? 1 : 0,
			size: params.size ?? 0.5,
			radius: params.radius ?? 1,
			contrast: params.contrast ?? 0.5,
			originalColors: (params.originalColors ?? false) ? 1 : 0,
			inverted: (params.inverted ?? false) ? 1 : 0
		})
	},
	Editor
};
