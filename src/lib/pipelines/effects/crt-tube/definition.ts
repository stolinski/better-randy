import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

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

export const crtTubeEffectDefinition = {
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
	})
} satisfies EffectPipelineDefinition<CrtTubeParams>;
