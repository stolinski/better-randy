import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * The Syntax channel's Sound kit — the first designed kit (ADR-0033 §8).
 * Covers the two events that fire on virtually every composition (the
 * enter/exit whooshes); everything else falls through to the core samples
 * per ADR-0024 until sourced. Swapping in different samples is a two-line
 * change here + the asset registration in `audio-assets.ts`.
 *
 * Sample provenance (all CC0 / public domain, sourced from freesound.org,
 * processed to 48 kHz stereo WAV + peak-normalized via ffmpeg):
 * - syntax-whoosh-in / syntax-whoosh-out — "quick woosh" by florianreichelt,
 *   freesound.org/people/florianreichelt/sounds/683101/ — one ~180 ms
 *   YouTube-style fwip, trimmed tight; the OUT is the forward swish (energy
 *   departs), the IN is the same swish REVERSED (rises into the landing), so
 *   both directions read as one family.
 * - syntax-bed-texture (asset, not kit-resolved) — "Ambient Cinematic
 *   Texture [90bpm] [F# Minor]" by deadrobotmusic,
 *   freesound.org/people/deadrobotmusic/sounds/664150/ (trimmed to 12 s,
 *   faded, low level for bumper beds).
 */
export const syntaxKit: SoundKitManifest = {
	slug: 'syntax',
	label: 'Syntax',
	description:
		'The Syntax channel kit — recorded air whooshes on enters/exits, core fallback elsewhere.',
	samples: {
		'whoosh-in': 'syntax-whoosh-in',
		'whoosh-out': 'syntax-whoosh-out'
	}
};
