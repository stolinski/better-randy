import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';

// `crt-screen` — restrained full-frame terminal glass: scanline raster +
// phosphor bloom + vignette. The whole frame IS the terminal, so this is a
// frame Effect (post effect chain), consumed two ways:
//
//   1. As any registered Effect, authored in a Preset's `effects[]`.
//   2. As a Pack `chrome` Role recipe (kind:'chrome'): the Workspace appends
//      it AFTER the preset's own effects when the composition declares a
//      `backgroundFill` (opaque segment/bumper). Transparent overlays never
//      receive frame chrome — per-element screen material is the crt-scanline
//      ShaderPass's job (docs/packs/crt-terminal/aesthetic.md § Screen scope).
//
// Register: mission console, not arcade — no curvature, no chromatic glitch,
// low-contrast raster (visible at pause, invisible in motion).

const CrtScreenParamsSchema = z.object({
	/** Raster line pitch in 4K-reference px. */
	scanlinePitchPx: z.number().min(2).max(24).default(6),
	/** Line-gap darkening 0..1 — keep low; the raster is texture, not stripes. */
	scanlineStrength: z.number().min(0).max(1).default(0.22),
	/** Luminance above which a pixel counts as driven phosphor and blooms. */
	bloomThreshold: z.number().min(0).max(1).default(0.55),
	/** Additive scale on the gathered bright-pass glow. */
	bloomStrength: z.number().min(0).max(1).default(0.3),
	/** Corner falloff 0..1 — the glass edge, not a spotlight. */
	vignette: z.number().min(0).max(1).default(0.32)
});

export type CrtScreenParams = z.infer<typeof CrtScreenParamsSchema>;

const CrtScreenEffectSchema = z.object({
	type: z.literal('crt-screen'),
	id: z.string(),
	params: CrtScreenParamsSchema
});

const CrtScreenUniforms = d.struct({
	resolution: d.vec2f,
	scanlinePitchPx: d.f32,
	scanlineStrength: d.f32,
	bloomThreshold: d.f32,
	bloomStrength: d.f32,
	vignette: d.f32
});

// Raster: raised-cosine line profile, a pure function of pixel y (static over
// time — the raster is the glass's, it does not crawl). Bloom: one 8-tap ring
// bright-pass gather, additive, masked by the pixel's own alpha so a
// transparent frame never gains fill (rubric E4 — alpha is preserved
// untouched). Vignette: radial multiplicative falloff toward the corners.
const fragmentBody = /* wgsl */ `
	let res = layout.$.uniforms.resolution;
	let refScale = min(res.x, res.y) / 2160.0;

	// ----- Scanline raster -----
	let pitch = max(layout.$.uniforms.scanlinePitchPx * refScale, 2.0);
	let phase = fract(in.uv.y * res.y / pitch);
	let raster = 1.0 - layout.$.uniforms.scanlineStrength * (0.5 - 0.5 * cos(6.2831853 * phase));

	// ----- Phosphor bloom (bright-pass gather) -----
	let lumaW = vec3f(0.2126, 0.7152, 0.0722);
	let radius = 12.0 * refScale;
	let thr = layout.$.uniforms.bloomThreshold;
	var bright = vec3f(0.0);
	for (var i = 0; i < 8; i = i + 1) {
		let a = (f32(i) / 8.0) * 6.2831853;
		let o = vec2f(cos(a), sin(a)) * radius / res;
		let s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + o);
		bright += s.rgb * max(dot(s.rgb, lumaW) - thr, 0.0) * s.a;
	}
	let bloom = (bright / 8.0) * layout.$.uniforms.bloomStrength;

	// ----- Vignette (glass corners) -----
	let cent = in.uv - vec2f(0.5);
	let vig = 1.0 - layout.$.uniforms.vignette * smoothstep(0.35, 0.85, length(cent) * 1.4142);

	let rgb = (inputSample.rgb * raster + bloom * inputSample.a) * vig;
	return vec4f(rgb, inputSample.a);
`;

export const crtScreenEffectRenderer: EffectRenderer<CrtScreenParams> = {
	type: 'crt-screen',
	label: 'CRT Screen',
	schema: CrtScreenEffectSchema,
	defaults: () => ({
		params: {
			scanlinePitchPx: 6,
			scanlineStrength: 0.22,
			bloomThreshold: 0.55,
			bloomStrength: 0.3,
			vignette: 0.32
		}
	}),
	pass: {
		paramsStruct: CrtScreenUniforms,
		fragmentBody,
		// Params flow raw from preset JSON / Pack chrome recipes (schema defaults
		// are not applied at runtime), so every read falls back to the declared
		// default.
		pack: (params, ctx) => ({
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			scanlinePitchPx: params.scanlinePitchPx ?? 6,
			scanlineStrength: params.scanlineStrength ?? 0.22,
			bloomThreshold: params.bloomThreshold ?? 0.55,
			bloomStrength: params.bloomStrength ?? 0.3,
			vignette: params.vignette ?? 0.32
		})
	},
	Editor
};
