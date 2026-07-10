import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';

// `ntsc-signal` — the cable/decoder half of a two-stage CRT pipeline (pair
// with `crt-tube` for the display half; run this one FIRST in the chain).
//
// Modeled from the NTSC standard itself, not ported from reference shader
// code: each pixel re-encodes a window of the frame into a composite scanline
// signal — RGB → YIQ, chroma quadrature-modulated onto the 3.579545 MHz
// subcarrier (188.5 cycles across the active line, 180° phase flip per line
// and per frame) — then decodes it back through deliberately imperfect FIR
// filters. Color bleed, cross-color rainbowing, dot crawl, and snow are
// EMERGENT from that encode/decode, not painted on:
//   - asymmetric luma/chroma bandwidth   → horizontal softness + chroma smear
//   - imperfect luma/chroma separation   → dot crawl + rainbow on fine detail
//     (`separation` is the notch/comb quality: 0 raw composite, 1 near-comb —
//     near-1 approximates an S-video-clean path)
//   - decoder phase error per line/frame → hue jitter
//   - chroma FIR window centered late    → chroma lags luma (smears right)
//   - delayed signal echo (ghost)        → cable-reflection ghosting
//   - noise injected into the composite  → decoder-shaped snow, not RGB grain
//
// Determinism: every temporal term (line phase, jitter, snow, interlace
// parity) derives from a frame counter computed from ctx.timestamp — scrub
// and export produce identical pixels (ADR-0012). The 480i mode is the
// standard STATELESS approximation (per-frame field parity bobs a half-line,
// halving vertical resolution per field); a true previous-field weave needs
// frame history the effect chain doesn't hold, and that departure is
// deliberate.
//
// Alpha (rubric E4): the decode runs on unpremultiplied taps; output alpha is
// the pixel's own input alpha untouched, and RGB is re-premultiplied by it,
// so snow/bleed never escape the content silhouette.

const NtscSignalParamsSchema = z.object({
	/** Virtual scanline count the signal is rastered to (match `crt-tube.lines`). */
	lines: z.number().min(160).max(1080).default(480),
	/** Luma low-pass bandwidth in MHz — broadcast spec 4.2; cheap composite ~2.5–3.2. */
	lumaBandwidthMhz: z.number().min(1).max(6).default(3),
	/** Chroma low-pass bandwidth in MHz — consumer decoders ~0.5–0.6, good combs ~1.2. */
	chromaBandwidthMhz: z.number().min(0.1).max(1.5).default(0.6),
	/** Luma/chroma separation quality: 0 raw composite (heavy dot crawl), 1 near-comb. */
	separation: z.number().min(0).max(1).default(0.35),
	/** Chroma delay vs luma in µs — color smears to the right of edges. */
	chromaDelayUs: z.number().min(0).max(0.8).default(0.25),
	/** Per-line/per-frame decoder phase error — hue wobble. */
	phaseJitter: z.number().min(0).max(1).default(0.15),
	/** Ghost echo amplitude (cable reflection). */
	ghost: z.number().min(0).max(1).default(0.12),
	/** Ghost echo delay in µs. */
	ghostDelayUs: z.number().min(0).max(3).default(0.9),
	/** Composite-domain noise amplitude — decodes into luma snow + chroma confetti. */
	noise: z.number().min(0).max(1).default(0.08),
	/** 480i field mode: per-frame half-line bob at field resolution (stateless). */
	interlace: z.boolean().default(false)
});

export type NtscSignalParams = z.infer<typeof NtscSignalParamsSchema>;

const NtscSignalEffectSchema = z.object({
	type: z.literal('ntsc-signal'),
	id: z.string(),
	params: NtscSignalParamsSchema
});

const NtscSignalUniforms = d.struct({
	resolution: d.vec2f,
	lines: d.f32,
	lumaCut: d.f32,
	chromaCut: d.f32,
	separation: d.f32,
	lumaScGain: d.f32,
	chromaDelaySamples: d.f32,
	jitterRad: d.f32,
	ghost: d.f32,
	ghostDelayUv: d.f32,
	noise: d.f32,
	interlace: d.f32,
	frame: d.f32
});

// Signal constants: 3.579545 MHz subcarrier × 52.6556 µs active line = 188.5
// subcarrier cycles across the frame width; sampled at 4× subcarrier → 754
// signal samples per line, one FIR tap per sample, 33-tap window (±16).
const fragmentBody = /* wgsl */ `
	let linesN = max(layout.$.uniforms.lines, 8.0);
	let interlaced = layout.$.uniforms.interlace > 0.5;
	let frame = layout.$.uniforms.frame;
	let parity = select(0.0, frame % 2.0, interlaced);
	let rasterLines = select(linesN, linesN * 0.5, interlaced);

	// Quantize vertical sampling to the virtual raster: the composite signal
	// has no detail between scanlines. Interlace bobs the raster a half-line
	// per field at field resolution.
	let lf = in.uv.y * rasterLines - 0.5 * parity;
	let lineIdx = floor(lf);
	let vLine = (lineIdx + 0.5 + 0.5 * parity) / rasterLines;
	let scanIdx = select(lineIdx, lineIdx * 2.0 + parity, interlaced);

	// NTSC line phase: 227.5 subcarrier cycles per total line means adjacent
	// lines (and adjacent frames) sit 180° apart — the geometry dot crawl
	// falls out of. Only the parity of (line + frame) matters.
	let linePhase = 3.14159265 * ((scanIdx + frame) % 2.0);

	// Decoder phase error for this line+frame (hue wobble). Hash inputs are
	// wrapped so the fract-chain hash stays in its precision sweet spot.
	let scanW = scanIdx % 525.0;
	let frameW = frame % 251.0;
	var j3 = fract(vec3f(scanW, frameW, scanW + frameW) * 0.1031);
	j3 = j3 + vec3f(dot(j3, j3.yzx + vec3f(33.33)));
	let jitterErr = (fract((j3.x + j3.y) * j3.z) - 0.5) * 2.0 * layout.$.uniforms.jitterRad;

	let lineKey = scanW + frameW * 525.0;
	let fcL = layout.$.uniforms.lumaCut;
	let fcC = layout.$.uniforms.chromaCut;
	let dly = layout.$.uniforms.chromaDelaySamples;
	let ghostAmp = layout.$.uniforms.ghost;
	let doGhost = ghostAmp > 0.001;
	let noiseAmp = layout.$.uniforms.noise * 0.9;

	var accY = 0.0;
	var accI = 0.0;
	var accQ = 0.0;
	var sumWL = 0.0;
	var sumWC = 0.0;

	for (var i = -16; i <= 16; i = i + 1) {
		let fi = f32(i);
		let xT = in.uv.x + fi * (1.0 / 754.0);

		// ----- encode this tap: RGB → YIQ → composite -----
		let sT = textureSampleLevel(layout.$.inputTexture, layout.$.samp, vec2f(xT, vLine), 0.0);
		let rgbT = select(vec3f(0.0), sT.rgb / max(sT.a, 1e-4), sT.a > 1e-3);
		let yT = dot(rgbT, vec3f(0.299, 0.587, 0.114));
		let iT = dot(rgbT, vec3f(0.5959, -0.2746, -0.3213));
		let qT = dot(rgbT, vec3f(0.2115, -0.5227, 0.3112));
		let phiT = 6.2831853 * xT * 188.5 + linePhase;
		var comp = yT + iT * cos(phiT) + qT * sin(phiT);

		// Ghost: the same encode evaluated a cable-echo earlier, mixed in.
		if (doGhost) {
			let xG = xT - layout.$.uniforms.ghostDelayUv;
			let sG = textureSampleLevel(layout.$.inputTexture, layout.$.samp, vec2f(xG, vLine), 0.0);
			let rgbG = select(vec3f(0.0), sG.rgb / max(sG.a, 1e-4), sG.a > 1e-3);
			let phiG = 6.2831853 * xG * 188.5 + linePhase;
			comp = comp + ghostAmp * (
				dot(rgbG, vec3f(0.299, 0.587, 0.114))
				+ dot(rgbG, vec3f(0.5959, -0.2746, -0.3213)) * cos(phiG)
				+ dot(rgbG, vec3f(0.2115, -0.5227, 0.3112)) * sin(phiG));
		}

		// Snow rides the composite at signal-sample resolution, so the decoder
		// filters shape it (luma snow + chroma confetti), not RGB grain.
		let sIdx = floor(xT * 754.0);
		var n3 = fract(vec3f(sIdx, lineKey, sIdx * 0.7 + lineKey) * 0.1031);
		n3 = n3 + vec3f(dot(n3, n3.yzx + vec3f(33.33)));
		comp = comp + noiseAmp * (fract((n3.x + n3.y) * n3.z) - 0.5);

		// ----- decode: windowed-sinc FIR taps -----
		// Luma window centered on the pixel; chroma window centered dly
		// samples EARLY (fi = -dly), so decoded chroma reflects earlier signal
		// and color lags luma to the right.
		let hannL = 0.5 + 0.5 * cos(3.14159265 * fi / 16.5);
		let tL = 6.2831853 * fcL * fi;
		let wL = select(2.0 * fcL * sin(tL) / tL, 2.0 * fcL, abs(tL) < 1e-4) * hannL;

		let xd = fi + dly;
		let hannC = select(0.0, 0.5 + 0.5 * cos(3.14159265 * xd / 16.5), abs(xd) < 16.5);
		let tC = 6.2831853 * fcC * xd;
		let wC = select(2.0 * fcC * sin(tC) / tC, 2.0 * fcC, abs(tC) < 1e-4) * hannC;

		let phiD = phiT + jitterErr;
		accY = accY + comp * wL;
		accI = accI + comp * cos(phiD) * wC;
		accQ = accQ + comp * sin(phiD) * wC;
		sumWL = sumWL + wL;
		sumWC = sumWC + wC;
	}

	let yRaw = accY / max(sumWL, 1e-4);
	let iDec = 2.0 * accI / max(sumWC, 1e-4);
	let qDec = 2.0 * accQ / max(sumWC, 1e-4);

	// Separation notch: subtract the re-modulated decoded chroma from luma,
	// scaled by the luma filter's actual gain at the subcarrier (computed CPU
	// side). separation 0 leaves the raw residual — full dot crawl.
	let phiC = 6.2831853 * in.uv.x * 188.5 + linePhase + jitterErr;
	let remod = iDec * cos(phiC) + qDec * sin(phiC);
	let yDec = yRaw - layout.$.uniforms.separation * layout.$.uniforms.lumaScGain * remod;

	var rgbOut = vec3f(
		yDec + 0.956 * iDec + 0.619 * qDec,
		yDec - 0.272 * iDec - 0.647 * qDec,
		yDec - 1.106 * iDec + 1.703 * qDec
	);
	rgbOut = clamp(rgbOut, vec3f(0.0), vec3f(1.25));

	// E4: alpha is the pixel's own exact silhouette; the decoded color rides it.
	let aOut = inputSample.a;
	return vec4f(rgbOut * aOut, aOut);
`;

// Samples per µs at 4× the 3.579545 MHz subcarrier.
const SAMPLES_PER_US = 4 * 3.579545;
// Active-line duration in µs (converts ghost delay to a frame-width fraction).
const ACTIVE_LINE_US = 52.6556;

/**
 * Gain of the 33-tap windowed-sinc luma filter at the subcarrier frequency
 * (0.25 cycles/sample) — how much subcarrier residual survives in raw luma.
 * The separation notch subtracts exactly this much re-modulated chroma.
 */
function lumaSubcarrierGain(lumaCut: number): number {
	let num = 0;
	let den = 0;
	for (let i = -16; i <= 16; i += 1) {
		const t = 2 * Math.PI * lumaCut * i;
		const sinc = Math.abs(t) < 1e-6 ? 1 : Math.sin(t) / t;
		const w = 2 * lumaCut * sinc * (0.5 + 0.5 * Math.cos((Math.PI * i) / 16.5));
		num += w * Math.cos((Math.PI * i) / 2);
		den += w;
	}
	return num / den;
}

export const ntscSignal: EffectRenderer<NtscSignalParams> = {
	type: 'ntsc-signal',
	label: 'NTSC Signal',
	schema: NtscSignalEffectSchema,
	defaults: () => ({
		params: {
			lines: 480,
			lumaBandwidthMhz: 3,
			chromaBandwidthMhz: 0.6,
			separation: 0.35,
			chromaDelayUs: 0.25,
			phaseJitter: 0.15,
			ghost: 0.12,
			ghostDelayUs: 0.9,
			noise: 0.08,
			interlace: false
		}
	}),
	pass: {
		paramsStruct: NtscSignalUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => {
			const lumaCut = (params.lumaBandwidthMhz ?? 3) / SAMPLES_PER_US;
			return {
				resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
				lines: params.lines ?? 480,
				lumaCut,
				chromaCut: (params.chromaBandwidthMhz ?? 0.6) / SAMPLES_PER_US,
				separation: params.separation ?? 0.35,
				lumaScGain: lumaSubcarrierGain(lumaCut),
				chromaDelaySamples: (params.chromaDelayUs ?? 0.25) * SAMPLES_PER_US,
				jitterRad: (params.phaseJitter ?? 0.15) * 0.6,
				ghost: params.ghost ?? 0.12,
				ghostDelayUv: (params.ghostDelayUs ?? 0.9) / ACTIVE_LINE_US,
				noise: params.noise ?? 0.08,
				interlace: (params.interlace ?? false) ? 1 : 0,
				// The NTSC clock: temporal artifacts advance per frame at ~30 Hz,
				// derived from the deterministic scrub timestamp — never wall-clock.
				frame: Math.floor(ctx.timestamp * 30 + 0.5)
			};
		}
	},
	Editor
};
