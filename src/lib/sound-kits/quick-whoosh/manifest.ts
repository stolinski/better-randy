import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * Quick Whoosh — the first designed Sound kit (ADR-0033 §8): short
 * YouTube-style fwips on the enter/exit whooshes. Kits are named for their
 * SONIC personality, never for a Pack or channel — appearance (Pack) and
 * sound (Kit) are independent axes (ADR-0023 / ADR-0033 §3), so any Pack can
 * wear any kit. Events this kit doesn't cover fall through to the core
 * samples per ADR-0024. Swapping in different samples is a two-line change
 * here + the asset registration in `audio-assets.ts`.
 *
 * Sample provenance (all CC0 / public domain, sourced from freesound.org,
 * processed to 48 kHz stereo WAV + peak-normalized via ffmpeg):
 * - quick-whoosh-in / quick-whoosh-out — "quick woosh" by florianreichelt,
 *   freesound.org/people/florianreichelt/sounds/683101/ — one ~180 ms
 *   fwip, trimmed tight; the OUT is the forward swish (energy departs), the
 *   IN is the same swish REVERSED (rises into the landing), so both
 *   directions read as one family.
 * - bed-ambient-texture (asset, not kit-resolved) — "Ambient Cinematic
 *   Texture [90bpm] [F# Minor]" by deadrobotmusic,
 *   freesound.org/people/deadrobotmusic/sounds/664150/ (trimmed to 12 s,
 *   faded, low level for bumper beds).
 */
export const quickWhooshKit: SoundKitManifest = {
	slug: 'quick-whoosh',
	label: 'Quick Whoosh',
	description: 'Short recorded fwips on enters/exits — the fast YouTube transition sound.',
	samples: {
		'whoosh-in': 'quick-whoosh-in',
		'whoosh-out': 'quick-whoosh-out'
	}
};
