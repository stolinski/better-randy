import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';

// `crt-tube` — the display half of a two-stage CRT pipeline (pair with
// `ntsc-signal` ahead of it in the chain for the full consumer-TV path; run
// this one alone for the "shadow-mask monitor over analog RGB" look — clean
// signal, physical tube).
//
// Physical-ish tube model, one register-spanning param surface:
//   - gaussian beam scanlines resampled to a virtual raster: `focus` is the
//     spot size (0 tight late-era beam with deep gaps → 1 fat '80s beam that
//     nearly fills the raster), and bright lines swell — beam current
//     defocuses the spot, so scanline structure breathes with luminance
//   - phosphor `mask`: 'slot' (consumer slot-mask TV), 'shadow' (staggered
//     triad dots — Japanese RGB monitors), 'grille' (aperture-grille
//     Trinitron stripes — the sharp late-era read)
//   - barrel `curvature` + rounded-glass `bezel` trim with an inner shadow
//   - `halation` — content-tinted glass scatter around bright areas
//
// This is a different register from the deliberately restrained `crt-screen`
// (mission console: flat, no mask, no curvature) — that effect stays as-is.
//
// Determinism: the only temporal term (interlace field parity) derives from a
// frame counter computed from ctx.timestamp (ADR-0012) — scrub and export
// produce identical pixels. Alpha (rubric E4): output alpha is the
// beam-resampled content silhouette (warped with the glass) trimmed by the
// tube bounds; the mask darkens RGB only, and halation is masked by local
// coverage so glow never escapes a transparent overlay's silhouette.
//
// On a full-frame piece the area outside the glass carves to alpha 0 and the
// present pass backstops it with the declared `backgroundFill` — author a
// near-black fill for a dark bezel surround.

const CrtTubeParamsSchema = z.object({
	/** Phosphor structure: consumer slot mask, triad shadow mask, or aperture grille. */
	mask: z.enum(['slot', 'shadow', 'grille']).default('slot'),
	/** Triad pitch in 4K-reference px. */
	maskPitchPx: z.number().min(3).max(24).default(8),
	/** How hard the phosphor structure reads (luminance-compensated — pure texture, no average dimming). */
	maskStrength: z.number().min(0).max(1).default(0.5),
	/** Scanline count of the drawn raster (match `ntsc-signal.lines`). */
	lines: z.number().min(160).max(1080).default(480),
	/** Beam spot size: 0 tight late-era beam (deep gaps) → 1 fat '80s beam. */
	focus: z.number().min(0).max(1).default(0.55),
	/** Barrel bulge of the tube face. */
	curvature: z.number().min(0).max(1).default(0.18),
	/** Rounded glass edge + inner shadow; 0 disables the trim entirely. */
	bezel: z.number().min(0).max(1).default(0.3),
	/** Content-tinted glass scatter around bright areas. */
	halation: z.number().min(0).max(1).default(0.3),
	/** Corner falloff of the lit phosphor field. */
	vignette: z.number().min(0).max(1).default(0.28),
	/** Draw the raster at field resolution with per-frame half-line bob. */
	interlace: z.boolean().default(false)
});

export type CrtTubeParams = z.infer<typeof CrtTubeParamsSchema>;

const CrtTubeEffectSchema = z.object({
	type: z.literal('crt-tube'),
	id: z.string(),
	params: CrtTubeParamsSchema
});

const CrtTubeUniforms = d.struct({
	resolution: d.vec2f,
	lines: d.f32,
	focus: d.f32,
	maskMode: d.f32,
	maskPitchPx: d.f32,
	maskStrength: d.f32,
	curvature: d.f32,
	bezel: d.f32,
	halation: d.f32,
	vignette: d.f32,
	interlace: d.f32,
	frame: d.f32,
	// Depth-stage Surface-plane magnification (1 = rest pose / no stage). The
	// beam raster and phosphor mask pitches scale by it so raster-to-stroke
	// phase holds while a stage camera pushes: sub-pitch strokes sliding across
	// fixed screen-space rasters decay their sampled average (G5 scanline
	// scale-compensation, dex h02eht8j). Glass geometry — bezel, curvature,
	// vignette, halation radius — is the physical monitor and stays fixed.
	contentScale: d.f32
});

const fragmentBody = /* wgsl */ `
	let res = layout.$.uniforms.resolution;
	let aspect = res.x / res.y;
	let refScale = min(res.x, res.y) / 2160.0;

	// ----- Tube curvature: barrel-warp the sampling coordinate -----
	let cN = (in.uv - vec2f(0.5)) * vec2f(aspect, 1.0);
	let r2 = dot(cN, cN);
	let rc2 = 0.25 * (aspect * aspect + 1.0);
	let kCurv = layout.$.uniforms.curvature * 0.42;
	let warp = (1.0 + kCurv * r2) / (1.0 + kCurv * rc2);
	let cW = cN * warp;
	let uvW = cW / vec2f(aspect, 1.0) + vec2f(0.5);

	// ----- Glass bounds: rounded-rect SDF in warped space + inner shadow -----
	let bez = layout.$.uniforms.bezel;
	let he = vec2f(aspect, 1.0) * (0.5 - 0.012 * bez);
	let cr = mix(0.008, 0.075, bez);
	let q = abs(cW) - (he - vec2f(cr));
	let dTube = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - cr;
	let tubeA = select(1.0 - smoothstep(-0.0015, 0.0015, dTube), 1.0, bez < 0.001);
	let innerShade = 1.0 - 0.45 * bez * smoothstep(-0.06, -0.005, dTube);

	// ----- Scanlines: gaussian beam over the two nearest raster lines -----
	// Raster lattices evaluate in STAGED-CONTENT space: a stage camera push
	// scales content about the projection centre, so the lattices scale about
	// the same anchor — pitch AND phase hold to the strokes through the move
	// (origin-anchored pitch scaling alone redistributes the lattice per frame
	// and the stroke phase sweeps instead). At the rest pose the select()
	// short-circuits to screen space bit-exactly.
	let cs = clamp(layout.$.uniforms.contentScale, 0.25, 4.0);
	let atRest = layout.$.uniforms.contentScale == 1.0;
	let contentUv = select((uvW - vec2f(0.5)) / cs + vec2f(0.5), uvW, atRest);
	let linesN = max(layout.$.uniforms.lines, 8.0);
	let interlaced = layout.$.uniforms.interlace > 0.5;
	let parity = select(0.0, layout.$.uniforms.frame % 2.0, interlaced);
	let rasterLines = select(linesN, linesN * 0.5, interlaced);
	let lfp = contentUv.y * rasterLines - 0.5 * parity;
	let kA = floor(lfp - 0.5) + 0.5;
	let kB = kA + 1.0;
	// Line centres are lattice (content-space) positions; map back to screen
	// uv to sample the staged frame where those lines actually landed.
	let vAc = (kA + 0.5 * parity) / rasterLines;
	let vBc = (kB + 0.5 * parity) / rasterLines;
	let vA = select((vAc - 0.5) * cs + 0.5, vAc, atRest);
	let vB = select((vBc - 0.5) * cs + 0.5, vBc, atRest);
	let cA = textureSampleLevel(layout.$.inputTexture, layout.$.samp, vec2f(uvW.x, vA), 0.0);
	let cB = textureSampleLevel(layout.$.inputTexture, layout.$.samp, vec2f(uvW.x, vB), 0.0);

	let lumaW3 = vec3f(0.2126, 0.7152, 0.0722);
	let sigma0 = mix(0.24, 0.85, layout.$.uniforms.focus);
	// Beam current defocuses the spot: bright lines swell.
	let sigA = sigma0 * (1.0 + 0.65 * dot(cA.rgb, lumaW3));
	let sigB = sigma0 * (1.0 + 0.65 * dot(cB.rgb, lumaW3));
	let dA = (lfp - kA) / sigA;
	let dB = (lfp - kB) / sigB;
	let wA = exp(-0.5 * dA * dA);
	let wB = exp(-0.5 * dB * dB);
	// Peak-normalize so line centers hold brightness; overlapping fat beams
	// flatten instead of over-brightening, tight beams leave dark gaps.
	let nrm = 1.0 + exp(-0.5 / (sigma0 * sigma0));
	let beamDenom = max(wA + wB, nrm);
	var col = (cA.rgb * wA + cB.rgb * wB) / beamDenom;
	var aBeam = (cA.a * wA + cB.a * wB) / beamDenom;

	// ----- Phosphor mask in warped tube pixels -----
	// Same compensation as the beam raster: the triad lattice is evaluated in
	// content space, so it keeps pitch AND phase to the staged strokes.
	let pitch = max(layout.$.uniforms.maskPitchPx * refScale, 3.0);
	let pxW = contentUv * res;
	let mode = layout.$.uniforms.maskMode;
	var maskRGB = vec3f(1.0);
	// Analytic mean transmission of each mask pattern — the mask is
	// normalized to it below so maskStrength is pure structure with no
	// average-luminance cost (real tubes compensate mask loss with beam
	// current; an uncompensated mask silently regresses G5 on dim text).
	var maskMean = 1.0;
	if (mode > 1.5) {
		// Aperture grille: continuous vertical RGB stripes.
		let t = fract(pxW.x / pitch) * 3.0;
		maskRGB = vec3f(
			1.0 - smoothstep(0.42, 0.62, abs(((t - 0.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 1.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 2.5 + 4.5) % 3.0) - 1.5)));
		maskMean = 0.347;
	} else if (mode > 0.5) {
		// Shadow mask: brick-staggered triad dots.
		let rowH = pitch * 0.866;
		let rowIdx = floor(pxW.y / rowH);
		let xOff = (rowIdx % 2.0) * 0.5 * pitch;
		let t = fract((pxW.x + xOff) / pitch) * 3.0;
		let dotW = 1.0 - smoothstep(0.30, 0.50, abs(fract(pxW.y / rowH) - 0.5));
		maskRGB = vec3f(
			1.0 - smoothstep(0.42, 0.62, abs(((t - 0.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 1.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 2.5 + 4.5) % 3.0) - 1.5))) * dotW;
		maskMean = 0.277;
	} else {
		// Slot mask: RGB stripe columns broken by staggered horizontal gaps.
		let t = fract(pxW.x / pitch) * 3.0;
		let colIdx = floor(pxW.x / pitch);
		let slotH = pitch * 2.0;
		let g = fract((pxW.y + (colIdx % 2.0) * 0.5 * slotH) / slotH);
		let slotW = smoothstep(0.0, 0.09, g) * (1.0 - smoothstep(0.91, 1.0, g));
		maskRGB = vec3f(
			1.0 - smoothstep(0.42, 0.62, abs(((t - 0.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 1.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 2.5 + 4.5) % 3.0) - 1.5))) * slotW;
		maskMean = 0.316;
	}
	let maskStrength = layout.$.uniforms.maskStrength;
	col = col * mix(vec3f(1.0), maskRGB / maskMean, maskStrength);

	// ----- Halation: bright-pass glass scatter (three overlapping rings) -----
	// Small radii + a luminance knee: only driven phosphor scatters. Three
	// staggered rings with distance falloff fuse into a smooth halo — sparse
	// wide rings on high-contrast content read as discrete displaced copies,
	// not glow.
	var hal = vec3f(0.0);
	var halNorm = 0.0;
	let rHal = vec2f(14.0 * refScale) / res;
	for (var i = 0; i < 24; i = i + 1) {
		let ring = f32(i / 8);
		let ang = ((f32(i) + 0.5 * ring) / 8.0) * 6.2831853;
		let off = vec2f(cos(ang), sin(ang)) * rHal * (1.0 + 0.7 * ring);
		let wRing = 1.0 - 0.3 * ring;
		let s = textureSampleLevel(layout.$.inputTexture, layout.$.samp, uvW + off, 0.0);
		hal = hal + s.rgb * max(dot(s.rgb, lumaW3) - 0.18, 0.0) * wRing;
		halNorm = halNorm + wRing;
	}
	col = col + layout.$.uniforms.halation * 0.9 * (hal / max(halNorm, 1.0)) * aBeam;

	// ----- Vignette, bezel shade, glass trim -----
	// Frame-normalized (uv-space) falloff — the glass matches the frame, so
	// the vignette weights corners, not edge-midpoints; an aspect-scaled
	// radius eats the side columns of wide compositions (measured ~0.71× on a
	// left-column kicker vs crt-screen's ~0.90× at the same strength).
	let cent = uvW - vec2f(0.5);
	let vig = 1.0 - layout.$.uniforms.vignette * smoothstep(0.35, 0.85, length(cent) * 1.4142);
	col = col * vig * innerShade * tubeA;
	let aOut = clamp(aBeam * tubeA, 0.0, 1.0);
	return vec4f(clamp(col, vec3f(0.0), vec3f(2.0)), aOut);
`;

export const crtTube: EffectRenderer<CrtTubeParams> = {
	type: 'crt-tube',
	label: 'CRT Tube',
	schema: CrtTubeEffectSchema,
	defaults: () => ({
		params: {
			mask: 'slot',
			maskPitchPx: 8,
			maskStrength: 0.5,
			lines: 480,
			focus: 0.55,
			curvature: 0.18,
			bezel: 0.3,
			halation: 0.3,
			vignette: 0.28,
			interlace: false
		}
	}),
	pass: {
		paramsStruct: CrtTubeUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => ({
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			lines: params.lines ?? 480,
			focus: params.focus ?? 0.55,
			maskMode: (params.mask ?? 'slot') === 'grille' ? 2 : (params.mask ?? 'slot') === 'shadow' ? 1 : 0,
			maskPitchPx: params.maskPitchPx ?? 8,
			maskStrength: params.maskStrength ?? 0.5,
			curvature: params.curvature ?? 0.18,
			bezel: params.bezel ?? 0.3,
			halation: params.halation ?? 0.3,
			vignette: params.vignette ?? 0.28,
			interlace: (params.interlace ?? false) ? 1 : 0,
			// Same deterministic ~30 Hz NTSC frame clock as `ntsc-signal`.
			frame: Math.floor(ctx.timestamp * 30 + 0.5),
			contentScale: ctx.stageContentScale ?? 1
		})
	},
	Editor
};
