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
 * - syntax-whoosh-in  — "SFX_WOOSH_002" by henrikcederblad,
 *   freesound.org/people/henrikcederblad/sounds/620192/ (crescendo air,
 *   energy builds into the landing — matches the enter's settle).
 * - syntax-whoosh-out — "Whoosh stereo light (transition)" by xkeril,
 *   freesound.org/people/xkeril/sounds/701104/ (peak-early decay — the
 *   energy departs with the exit).
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
