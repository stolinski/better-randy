import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';

// Ported to WGSL from @paper-design/shaders `fluted-glass`
// (https://github.com/paper-design/shaders, Apache-2.0, © Lost Coast Labs, Inc.).
// Deliberate departures from the source:
//   - The image-fit/sizing system collapses to identity (the effect-chain input
//     is the already-composited frame).
//   - The source's grainMixer / grainOverlay features are omitted — grain is a
//     separate composable link in the Supers effect chain (`paper-grain`).
//   - The source's `u_colorBack` fill is dropped — background fills are the
//     composition's `backgroundFill`, never an effect param — and the final
//     output is masked by the frame's own silhouette (rubric E4).
//   - The gaussian blur accumulates the chain's premultiplied samples directly
//     (the source unpremultiplies/repremultiplies around a straight-alpha
//     image texture).

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

const FlutedGlassParamsSchema = z.object({
	/** Flute lattice: parallel lines, irregular lines, wave, zigzag, or a 2D pattern. */
	shape: z.enum(['lines', 'linesIrregular', 'wave', 'zigzag', 'pattern']).default('lines'),
	/** Per-flute refraction profile. */
	distortionShape: z.enum(['prism', 'lens', 'contour', 'cascade', 'flat']).default('prism'),
	/** Flute width: 0 = ~200 flutes across, 1 = ~5. */
	size: z.number().min(0).max(1).default(0.3),
	/** Grid direction in degrees relative to the frame. */
	angle: z.number().min(0).max(180).default(0),
	/** Refraction strength within each flute (~0.35 keeps text legible through
	 *  the ribs; higher dissolves content into streaks). */
	distortion: z.number().min(0).max(1).default(0.35),
	/** Texture shift perpendicular to the flutes. */
	shift: z.number().min(-1).max(1).default(0),
	/** Extra stretch along the flute direction. */
	stretch: z.number().min(0).max(1).default(0),
	/** One-directional gaussian blur through the glass. */
	blur: z.number().min(0).max(1).default(0),
	/** Glass distortion and softness at the frame edges. */
	edges: z.number().min(0).max(1).default(0.3),
	/** Shadow gradient following the flute profile. */
	shadows: z.number().min(0).max(1).default(0.3),
	/** Thin bright strokes along the flute boundaries. */
	highlights: z.number().min(0).max(1).default(0.3),
	/** Margins scoping the glass region; content outside is untouched. */
	marginLeft: z.number().min(0).max(1).default(0),
	marginRight: z.number().min(0).max(1).default(0),
	marginTop: z.number().min(0).max(1).default(0),
	marginBottom: z.number().min(0).max(1).default(0),
	colorShadow: z.string().regex(HEX_COLOR_PATTERN).default('#1a1a1a'),
	colorHighlight: z.string().regex(HEX_COLOR_PATTERN).default('#ffffff')
});

export type FlutedGlassParams = z.infer<typeof FlutedGlassParamsSchema>;

const FlutedGlassEffectSchema = z.object({
	type: z.literal('fluted-glass'),
	id: z.string(),
	params: FlutedGlassParamsSchema
});

const FlutedGlassUniforms = d.struct({
	colorShadow: d.vec4f,
	colorHighlight: d.vec4f,
	resolution: d.vec2f,
	shape: d.f32,
	distortionShape: d.f32,
	size: d.f32,
	angle: d.f32,
	distortion: d.f32,
	shift: d.f32,
	stretch: d.f32,
	blur: d.f32,
	edges: d.f32,
	shadows: d.f32,
	highlights: d.f32,
	marginLeft: d.f32,
	marginRight: d.f32,
	marginTop: d.f32,
	marginBottom: d.f32
});

const SHAPE_TO_INDEX: Record<FlutedGlassParams['shape'], number> = {
	lines: 1,
	linesIrregular: 2,
	wave: 3,
	zigzag: 4,
	pattern: 5
};

const DISTORTION_SHAPE_TO_INDEX: Record<FlutedGlassParams['distortionShape'], number> = {
	prism: 1,
	lens: 2,
	contour: 3,
	cascade: 4,
	flat: 5
};

// Fluted architectural glass: the frame is divided into rotated flutes, each
// applying a refraction profile (prism/lens/contour/cascade/flat) across its
// width, with shadow gradients and thin boundary highlights selling the glass
// material, an optional directional blur, and margins scoping the pane.
// All derivative ops (fwidth for smoothFract / AA / frame softness) run in
// uniform control flow before any branch; texture taps inside the non-uniform
// blur branch use textureSampleLevel.
//
// Alpha (rubric E4): the final output — glass chrome included — is multiplied
// by the frame's own per-pixel silhouette, so transparent regions stay
// transparent; declared-backgroundFill pieces are opaque and unaffected.
const fragmentBody = /* wgsl */ `
	let PI = 3.14159265358979;
	let TWO_PI = 6.28318530718;
	let res = layout.$.uniforms.resolution;
	let aspect = res.x / res.y;
	let shape = layout.$.uniforms.shape;
	let distortionShape = layout.$.uniforms.distortionShape;
	let sizeParam = layout.$.uniforms.size;

	let patternRotation = -layout.$.uniforms.angle * PI / 180.0;
	let patternSize = mix(200.0, 5.0, sizeParam);

	// Margin masks (glass region + its stroke bands), in frame UV.
	let uvMask = in.uv;
	let sw = vec2f(0.005);
	let mL = layout.$.uniforms.marginLeft;
	let mT = layout.$.uniforms.marginTop;
	let mR = layout.$.uniforms.marginRight;
	let mB = layout.$.uniforms.marginBottom;
	let mask = smoothstep(mL, mL + sw.x, uvMask.x + sw.x)
		* smoothstep(mR, mR + sw.x, 1.0 - uvMask.x + sw.x)
		* smoothstep(mT, mT + sw.y, uvMask.y + sw.y)
		* smoothstep(mB, mB + sw.y, 1.0 - uvMask.y + sw.y);
	let maskOuter = smoothstep(mL - sw.x, mL, uvMask.x + sw.x)
		* smoothstep(mR - sw.x, mR, 1.0 - uvMask.x + sw.x)
		* smoothstep(mT - sw.y, mT, uvMask.y + sw.y)
		* smoothstep(mB - sw.y, mB, 1.0 - uvMask.y + sw.y);
	let maskStroke = maskOuter - mask;
	let maskInner = smoothstep(mL - 2.0 * sw.x, mL, uvMask.x)
		* smoothstep(mR - 2.0 * sw.x, mR, 1.0 - uvMask.x)
		* smoothstep(mT - 2.0 * sw.y, mT, uvMask.y)
		* smoothstep(mB - 2.0 * sw.y, mB, 1.0 - uvMask.y);
	let maskStrokeInner = maskInner - mask;

	// Flute-space UV: centred, scaled to the flute grid, aspect-aware rotation.
	var guv = (in.uv - vec2f(0.5)) * patternSize;
	guv = vec2f(guv.x * aspect, guv.y);
	guv = mat2x2f(vec2f(cos(patternRotation), sin(patternRotation)), vec2f(-sin(patternRotation), cos(patternRotation))) * guv;
	guv = vec2f(guv.x / aspect, guv.y);

	var curve = 0.0;
	let patternY = guv.y / aspect;
	if (shape > 4.5) {
		curve = 0.5 + 0.5 * sin(0.5 * PI * guv.x) * cos(0.5 * PI * patternY);
	} else if (shape > 3.5) {
		curve = 10.0 * abs(fract(0.1 * patternY) - 0.5);
	} else if (shape > 2.5) {
		curve = 4.0 * sin(0.23 * patternY);
	} else if (shape > 1.5) {
		curve = 0.5 + 0.5 * sin(0.5 * guv.x) * sin(1.7 * guv.x);
	}

	let uvToFract = guv + vec2f(curve);
	var fractOrigUV = fract(guv);
	var floorOrigUV = floor(guv);

	// smoothFract: mirror the sawtooth near its seam to kill the aliasing line.
	let sfF = fract(uvToFract.x);
	let sfW = fwidth(uvToFract.x);
	let sfBand = smoothstep(-sfW, sfW, abs(sfF - 0.5) - 0.5);
	var fx = mix(sfF, 1.0 - sfF, sfBand);
	let xNonSmooth = fract(uvToFract.x) + 0.0001;

	var highlightsWidth = 2.0 * max(0.001, fwidth(uvToFract.x));
	highlightsWidth = highlightsWidth + 2.0 * maskStrokeInner;
	var highlightsV = smoothstep(0.0, highlightsWidth, xNonSmooth);
	highlightsV = highlightsV * smoothstep(1.0, 1.0 - highlightsWidth, xNonSmooth);
	highlightsV = 1.0 - highlightsV;
	highlightsV = highlightsV * layout.$.uniforms.highlights;
	highlightsV = clamp(highlightsV, 0.0, 1.0);
	highlightsV = highlightsV * mask;

	var shadowsV = pow(fx, 1.3);
	var distortionV = 0.0;
	var fadeX = 1.0;
	var frameFade = 0.0;

	var aa = fwidth(xNonSmooth);
	aa = max(aa, fwidth(guv.x));
	aa = max(aa, fwidth(uvToFract.x));
	aa = max(aa, 0.0001);

	let shiftParam = layout.$.uniforms.shift;
	if (distortionShape == 1.0) {
		// prism
		distortionV = -pow(1.5 * fx, 3.0);
		distortionV = distortionV + (0.5 - shiftParam);
		frameFade = pow(1.5 * fx, 3.0);
		aa = max(0.2, aa);
		aa = aa + mix(0.2, 0.0, sizeParam);
		fadeX = smoothstep(0.0, aa, xNonSmooth) * smoothstep(1.0, 1.0 - aa, xNonSmooth);
		distortionV = mix(0.5, distortionV, fadeX);
	} else if (distortionShape == 2.0) {
		// lens
		distortionV = 2.0 * pow(fx, 2.0);
		distortionV = distortionV - (0.5 + shiftParam);
		frameFade = pow(abs(fx - 0.5), 4.0);
		aa = max(0.2, aa);
		aa = aa + mix(0.2, 0.0, sizeParam);
		fadeX = smoothstep(0.0, aa, xNonSmooth) * smoothstep(1.0, 1.0 - aa, xNonSmooth);
		distortionV = mix(0.5, distortionV, fadeX);
		frameFade = mix(1.0, frameFade, 0.5 * fadeX);
	} else if (distortionShape == 3.0) {
		// contour
		distortionV = pow(2.0 * (xNonSmooth - 0.5), 6.0);
		distortionV = distortionV - 0.25;
		distortionV = distortionV - shiftParam;
		frameFade = 1.0 - 2.0 * pow(abs(fx - 0.4), 2.0);
		aa = 0.15 + mix(0.1, 0.0, sizeParam);
		fadeX = smoothstep(0.0, aa, xNonSmooth) * smoothstep(1.0, 1.0 - aa, xNonSmooth);
		frameFade = mix(1.0, frameFade, fadeX);
	} else if (distortionShape == 4.0) {
		// cascade
		fx = xNonSmooth;
		distortionV = sin((fx + 0.25) * TWO_PI);
		shadowsV = 0.5 + 0.5 * asin(clamp(distortionV, -1.0, 1.0)) / (0.5 * PI);
		distortionV = distortionV * 0.5;
		distortionV = distortionV - shiftParam;
		frameFade = 0.5 + 0.5 * sin(fx * TWO_PI);
	} else {
		// flat
		distortionV = distortionV - pow(abs(fx), 0.2) * fx;
		distortionV = distortionV + 0.33;
		distortionV = distortionV - 3.0 * shiftParam;
		distortionV = distortionV * 0.33;
		frameFade = 0.3 * smoothstep(0.0, 1.0, fx);
		shadowsV = pow(fx, 2.5);
		aa = max(0.1, aa);
		aa = aa + mix(0.1, 0.0, sizeParam);
		fadeX = smoothstep(0.0, aa, xNonSmooth) * smoothstep(1.0, 1.0 - aa, xNonSmooth);
		distortionV = distortionV * fadeX;
	}

	shadowsV = min(shadowsV, 1.0);
	shadowsV = shadowsV + maskStrokeInner;
	shadowsV = shadowsV * mask;
	shadowsV = min(shadowsV, 1.0);
	shadowsV = shadowsV * pow(layout.$.uniforms.shadows, 2.0);
	shadowsV = clamp(shadowsV, 0.0, 1.0);

	distortionV = distortionV * 3.0 * layout.$.uniforms.distortion;
	frameFade = frameFade * layout.$.uniforms.distortion;

	fractOrigUV.x = fractOrigUV.x + distortionV;
	let rotBack = mat2x2f(vec2f(cos(-patternRotation), sin(-patternRotation)), vec2f(-sin(-patternRotation), cos(-patternRotation)));
	floorOrigUV = vec2f(floorOrigUV.x * aspect, floorOrigUV.y);
	floorOrigUV = rotBack * floorOrigUV;
	floorOrigUV = vec2f(floorOrigUV.x / aspect, floorOrigUV.y);
	fractOrigUV = vec2f(fractOrigUV.x * aspect, fractOrigUV.y);
	fractOrigUV = rotBack * fractOrigUV;
	fractOrigUV = vec2f(fractOrigUV.x / aspect, fractOrigUV.y);

	var suv = (floorOrigUV + fractOrigUV) / patternSize;
	suv = suv + vec2f(pow(maskStroke, 4.0));
	suv = suv + vec2f(0.5);

	suv = mix(in.uv, suv, smoothstep(0.0, 0.7, mask));
	var blurSigma = mix(0.0, 50.0, layout.$.uniforms.blur);
	blurSigma = mix(0.0, blurSigma, smoothstep(0.5, 1.0, mask));

	var edgeDistortion = mix(0.0, 0.04, layout.$.uniforms.edges);
	edgeDistortion = edgeDistortion + 0.06 * frameFade * layout.$.uniforms.edges;
	edgeDistortion = edgeDistortion * mask;

	// Frame windows (fwidth in uniform control flow, before the blur branch).
	let frameAaX = 2.0 * fwidth(suv.x);
	let frameAaY = 2.0 * fwidth(suv.y);
	let frame = smoothstep(0.0, frameAaX + edgeDistortion, suv.x)
		* (1.0 - smoothstep(1.0 - edgeDistortion - frameAaX, 1.0, suv.x))
		* smoothstep(0.0, frameAaY + edgeDistortion, suv.y)
		* (1.0 - smoothstep(1.0 - edgeDistortion - frameAaY, 1.0, suv.y));

	var stretchV = 1.0 - smoothstep(0.0, 0.5, xNonSmooth) * smoothstep(1.0, 0.5, xNonSmooth);
	stretchV = pow(stretchV, 2.0);
	stretchV = stretchV * mask;
	let stretchSoft = 0.1 + 0.05 * mask * frameFade;
	let stretchFrame = smoothstep(0.0, frameAaX + stretchSoft, suv.x)
		* (1.0 - smoothstep(1.0 - stretchSoft - frameAaX, 1.0, suv.x))
		* smoothstep(0.0, frameAaY + stretchSoft, suv.y)
		* (1.0 - smoothstep(1.0 - stretchSoft - frameAaY, 1.0, suv.y));
	stretchV = stretchV * stretchFrame;
	suv.y = mix(suv.y, 0.5, layout.$.uniforms.stretch * stretchV);

	// Directional gaussian blur through the glass (premultiplied accumulation;
	// SampleLevel taps — no derivatives inside this non-uniform branch).
	var image = vec4f(0.0);
	if (blurSigma <= 0.5) {
		image = textureSampleLevel(layout.$.inputTexture, layout.$.samp, suv, 0.0);
	} else {
		let radius = min(50.0, ceil(3.0 * blurSigma));
		let twoSigma2 = 2.0 * blurSigma * blurSigma;
		let norm = 1.0 / sqrt(TWO_PI * blurSigma * blurSigma);
		var sum = textureSampleLevel(layout.$.inputTexture, layout.$.samp, suv, 0.0) * norm;
		var weightSum = norm;
		let texel = vec2f(0.0, 1.0) / res;
		for (var i = 1; i <= 50; i = i + 1) {
			if (f32(i) > radius) {
				break;
			}
			let xw = f32(i);
			let w = exp(-(xw * xw) / twoSigma2) * norm;
			let offset = texel * xw;
			sum = sum
				+ (textureSampleLevel(layout.$.inputTexture, layout.$.samp, suv + offset, 0.0)
					+ textureSampleLevel(layout.$.inputTexture, layout.$.samp, suv - offset, 0.0)) * w;
			weightSum = weightSum + 2.0 * w;
		}
		image = sum / weightSum;
	}

	let highlightColor = layout.$.uniforms.colorHighlight;
	let shadowColor = layout.$.uniforms.colorShadow;

	var color = highlightColor.rgb * highlightColor.a * highlightsV;
	var opacity = highlightColor.a * highlightsV;

	shadowsV = mix(shadowsV * shadowColor.a, 0.0, highlightsV);
	color = mix(color, shadowColor.rgb * shadowColor.a, 0.5 * shadowsV);
	color = color + 0.5 * pow(shadowsV, 0.5) * shadowColor.rgb;
	opacity = opacity + shadowsV;
	color = clamp(color, vec3f(0.0), vec3f(1.0));
	opacity = clamp(opacity, 0.0, 1.0);

	color = color + image.rgb * (1.0 - opacity) * frame;
	opacity = opacity + image.a * (1.0 - opacity) * frame;
	opacity = clamp(opacity, 0.0, 1.0);

	// E4: glass chrome and refracted content exist only inside the frame's own
	// silhouette; transparent regions stay transparent.
	return vec4f(color, opacity) * inputSample.a;
`;

export const flutedGlass: EffectRenderer<FlutedGlassParams> = {
	type: 'fluted-glass',
	label: 'Fluted glass',
	schema: FlutedGlassEffectSchema,
	defaults: () => ({
		params: {
			shape: 'lines',
			distortionShape: 'prism',
			size: 0.3,
			angle: 0,
			distortion: 0.35,
			shift: 0,
			stretch: 0,
			blur: 0,
			edges: 0.3,
			shadows: 0.3,
			highlights: 0.3,
			marginLeft: 0,
			marginRight: 0,
			marginTop: 0,
			marginBottom: 0,
			colorShadow: '#1a1a1a',
			colorHighlight: '#ffffff'
		}
	}),
	pass: {
		paramsStruct: FlutedGlassUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => ({
			colorShadow: d.vec4f(...hexToRgbaFloat(params.colorShadow ?? '#1a1a1a')),
			colorHighlight: d.vec4f(...hexToRgbaFloat(params.colorHighlight ?? '#ffffff')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			shape: SHAPE_TO_INDEX[params.shape ?? 'lines'],
			distortionShape: DISTORTION_SHAPE_TO_INDEX[params.distortionShape ?? 'prism'],
			size: params.size ?? 0.3,
			angle: params.angle ?? 0,
			distortion: params.distortion ?? 0.35,
			shift: params.shift ?? 0,
			stretch: params.stretch ?? 0,
			blur: params.blur ?? 0,
			edges: params.edges ?? 0.3,
			shadows: params.shadows ?? 0.3,
			highlights: params.highlights ?? 0.3,
			marginLeft: params.marginLeft ?? 0,
			marginRight: params.marginRight ?? 0,
			marginTop: params.marginTop ?? 0,
			marginBottom: params.marginBottom ?? 0
		})
	},
	Editor
};
