import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * Desk — the paper/desk-object palette (ADR-0033 §8): quick paper air on the
 * slides, a book slap on arrivals, pencil and marker on the marks. Kits are
 * PALETTES named for their sound-world — never for one sample (a kit named
 * "Quick Whoosh" read as nonsense next to a marker swipe), and never for a
 * Pack or channel (appearance and sound are independent axes, ADR-0023 /
 * ADR-0033 §3). A palette is exactly its sounds — events it doesn't carry
 * are SILENT (no hidden fallback). Swapping a sample is a one-line change
 * here + the asset registration in `audio-assets.ts`.
 *
 * Sample provenance (all CC0 / public domain, sourced from freesound.org,
 * processed to 48 kHz stereo WAV + peak-normalized via ffmpeg):
 * - quick-whoosh-in / quick-whoosh-out — "quick woosh" by florianreichelt,
 *   freesound.org/people/florianreichelt/sounds/683101/ — one ~180 ms
 *   fwip, trimmed tight; the OUT is the forward swish (energy departs), the
 *   IN is the same swish REVERSED (rises into the landing), so both
 *   directions read as one family.
 * - impact-book — sliced from "book-hit" by Kneeling,
 *   freesound.org/people/Kneeling/sounds/448005/ (a real book slap — the
 *   papery thump that fits the print aesthetic; fires at arrival settles).
 * - tick-pencil — one tap sliced from "Penciltap.aif" by kbnevel,
 *   freesound.org/people/kbnevel/sounds/119848/ (near-subliminal pencil
 *   tap for mark draw-ons and kinetic-text beats; normalized low, 0.7).
 * - marker-swipe — one felt-tip drag sliced from "fast and slow marker
 *   strokes" by MBPiM, freesound.org/people/MBPiM/sounds/351145/.
 * - pencil-stroke — one stroke sliced from "writing-short-9" by newagesoup,
 *   freesound.org/people/newagesoup/sounds/335519/.
 * - bed-ambient-texture (asset, not kit-resolved) — "Ambient Cinematic
 *   Texture [90bpm] [F# Minor]" by deadrobotmusic,
 *   freesound.org/people/deadrobotmusic/sounds/664150/ (trimmed to 12 s,
 *   faded, low level for bumper beds).
 */
export const deskKit: SoundKitManifest = {
	slug: 'desk',
	label: 'Desk',
	description: 'Paper air, book slap, pencil & marker — the desk-object palette.',
	samples: {
		'whoosh-in': 'quick-whoosh-in',
		'whoosh-out': 'quick-whoosh-out',
		impact: 'impact-book',
		tick: 'tick-pencil',
		swipe: 'marker-swipe',
		scratch: 'pencil-stroke'
	}
};
