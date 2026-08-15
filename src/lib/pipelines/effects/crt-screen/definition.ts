import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

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

export const crtScreenEffectDefinition = {
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
	})
} satisfies EffectPipelineDefinition<CrtScreenParams>;
