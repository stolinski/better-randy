import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';

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

const WaterUniforms = d.struct({
	colorHighlight: d.vec4f,
	resolution: d.vec2f,
	time: d.f32,
	size: d.f32,
	highlights: d.f32,
	layering: d.f32,
	edges: d.f32,
	caustic: d.f32,
	waves: d.f32
});

// Water-surface refraction: a 6-octave rotated sin/cos caustic field (two
// layers at different scales/speeds) plus an Ashima 2D simplex wave field
// displace the sampling UV, and the squared caustic drives additive glints.
// Both noise helpers are inlined — a fragment body cannot declare functions.
//
// Alpha (rubric E4): output color/alpha come from the displaced sample scaled
// by the frame window, and the glints are masked by that same coverage —
// where the frame is transparent nothing is painted, so overlays keep their
// (now watery) silhouette.
const fragmentBody = /* wgsl */ `
	let res = layout.$.uniforms.resolution;
	let aspect = res.x / res.y;
	let t = layout.$.uniforms.time;
	let waves = layout.$.uniforms.waves;
	let layering = layout.$.uniforms.layering;

	var imageUV = in.uv;
	var patternUV = (in.uv - vec2f(0.5)) * vec2f(aspect, 1.0);
	patternUV = patternUV / (0.01 + 0.09 * layout.$.uniforms.size);

	// --- Ashima 2D simplex noise (inlined) over the drifting wave domain ---
	let sv = (0.3 + 0.1 * sin(t)) * 0.1 * patternUV + vec2f(0.0, 0.4 * t);
	let C = vec4f(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
	var si = floor(sv + vec2f(dot(sv, C.yy)));
	let sx0 = sv - si + vec2f(dot(si, C.xx));
	let si1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), sx0.x > sx0.y);
	var sx12 = vec4f(sx0.x, sx0.y, sx0.x, sx0.y) + vec4f(C.x, C.x, C.z, C.z);
	sx12 = vec4f(sx12.xy - si1, sx12.zw);
	si = si - floor(si / 289.0) * 289.0;
	var sp = vec3f(si.y) + vec3f(0.0, si1.y, 1.0);
	sp = ((sp * 34.0) + 1.0) * sp;
	sp = sp - floor(sp / 289.0) * 289.0;
	sp = sp + vec3f(si.x) + vec3f(0.0, si1.x, 1.0);
	sp = ((sp * 34.0) + 1.0) * sp;
	sp = sp - floor(sp / 289.0) * 289.0;
	var sm = max(
		vec3f(0.5) - vec3f(dot(sx0, sx0), dot(sx12.xy, sx12.xy), dot(sx12.zw, sx12.zw)),
		vec3f(0.0)
	);
	sm = sm * sm;
	sm = sm * sm;
	let sx = 2.0 * fract(sp * C.www) - vec3f(1.0);
	let sh = abs(sx) - vec3f(0.5);
	let sa0 = sx - floor(sx + vec3f(0.5));
	sm = sm * (vec3f(1.79284291400159) - 0.85373472095314 * (sa0 * sa0 + sh * sh));
	let sg = vec3f(
		sa0.x * sx0.x + sh.x * sx0.y,
		sa0.y * sx12.x + sh.y * sx12.y,
		sa0.z * sx12.z + sh.z * sx12.w
	);
	let wavesNoise = 130.0 * dot(sm, sg);

	// --- caustic layer 1: 6 rotated sin/cos octaves (inlined) ---
	let rot = mat2x2f(vec2f(cos(0.5), sin(0.5)), vec2f(-sin(0.5), cos(0.5)));
	var cuv = patternUV + waves * vec2f(1.0, -1.0) * wavesNoise;
	var cn = vec2f(0.1);
	var cN = vec2f(0.1);
	var cScale = 1.5;
	let ct = 2.0 * t;
	for (var j = 0; j < 6; j = j + 1) {
		cuv = cuv * rot;
		cn = cn * rot;
		let q = cuv * cScale + vec2f(f32(j)) + cn
			+ vec2f((0.5 + 0.5 * f32(j)) * (f32(j % 2) - 1.0) * ct);
		cn = cn + sin(q);
		cN = cN + cos(q) / cScale;
		cScale = cScale * 1.1;
	}
	var causticNoise = cN.x + cN.y + 1.0;

	// --- caustic layer 2: same field, finer scale, slower drift ---
	var cuv2 = patternUV + 2.0 * waves * vec2f(1.0, -1.0) * wavesNoise;
	var cn2 = vec2f(0.1);
	var cN2 = vec2f(0.1);
	var cScale2 = 2.0;
	let ct2 = 1.5 * t;
	for (var j = 0; j < 6; j = j + 1) {
		cuv2 = cuv2 * rot;
		cn2 = cn2 * rot;
		let q = cuv2 * cScale2 + vec2f(f32(j)) + cn2
			+ vec2f((0.5 + 0.5 * f32(j)) * (f32(j % 2) - 1.0) * ct2);
		cn2 = cn2 + sin(q);
		cN2 = cN2 + cos(q) / cScale2;
		cScale2 = cScale2 * 1.1;
	}
	causticNoise = causticNoise + layering * (cN2.x + cN2.y + 1.0);
	causticNoise = causticNoise * causticNoise;

	// Soft knee (K·tanh(x/K)) bounding the squared field's local spikes before
	// it drives UV displacement: typical values pass near-linear, but the rare
	// hotspots (which reach 15–30× and would fold whole words into whorls) are
	// capped, so default params keep glyphs coherent at every hold frame. The
	// glint highlights below keep the unkneed field — sparkle wants the spikes.
	let causticKneed = 6.0 * tanh(causticNoise / 6.0);

	// Suppress distortion approaching the frame edges (unless the edges param
	// opens it up) so the displaced UV doesn't drag in clamped border pixels.
	var edgesDistortion = smoothstep(0.0, 0.1, imageUV.x);
	edgesDistortion = edgesDistortion * smoothstep(0.0, 0.1, imageUV.y);
	edgesDistortion = edgesDistortion
		* (smoothstep(1.0, 1.1, imageUV.x) + (1.0 - smoothstep(0.8, 0.95, imageUV.x)));
	edgesDistortion = edgesDistortion * (1.0 - smoothstep(0.9, 1.0, imageUV.y));
	edgesDistortion = mix(edgesDistortion, 1.0, layout.$.uniforms.edges);

	let causticDistortion = 0.02 * causticKneed * edgesDistortion;
	let wavesDistortion = 0.1 * waves * wavesNoise;
	imageUV = imageUV + vec2f(wavesDistortion, -wavesDistortion);
	imageUV = imageUV + vec2f(layout.$.uniforms.caustic * causticDistortion);

	// Clamp-to-edge boundary (sampler-provided): displaced UVs beyond the frame
	// smear the border pixel, matching AE displacement behavior — transparent
	// borders smear transparency, opaque pieces stay opaque to their edges.
	let displaced = textureSample(layout.$.inputTexture, layout.$.samp, imageUV);
	var outRgb = displaced.rgb;
	var outA = displaced.a;

	// Caustic glints, masked by local coverage (E4).
	let hlColor = layout.$.uniforms.colorHighlight;
	let cnClamped = max(-0.2, causticNoise);
	var highlight = 0.025 * layout.$.uniforms.highlights * cnClamped * hlColor.a;
	highlight = highlight * outA;
	let hlMix = clamp(0.05 * layout.$.uniforms.highlights * cnClamped, 0.0, 1.0);
	outRgb = mix(outRgb, hlColor.rgb * outA, hlMix);
	outA = outA + highlight;

	let sparkle = highlight * (0.5 + 0.5 * wavesNoise);
	outRgb = outRgb + vec3f(sparkle);
	outA = clamp(outA + sparkle, 0.0, 1.0);

	return vec4f(outRgb, outA);
`;

export const waterEffectRenderer: EffectRenderer<WaterParams> = {
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
	}),
	pass: {
		paramsStruct: WaterUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => ({
			colorHighlight: d.vec4f(...hexToRgbaFloat(params.colorHighlight ?? '#fff6e0')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			time: ctx.timestamp * (params.speed ?? 1),
			size: params.size ?? 2,
			highlights: params.highlights ?? 0.15,
			layering: params.layering ?? 0.4,
			edges: params.edges ?? 0.3,
			caustic: params.caustic ?? 0.1,
			waves: params.waves ?? 0.12
		})
	},
	Editor
};
