import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

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

export const ntscSignalEffectDefinition = {
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
	})
} satisfies EffectPipelineDefinition<NtscSignalParams>;
