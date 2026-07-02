import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * Core — the neutral synthesized palette: one engine-generated sample per
 * event (`scripts/gen-core-sounds.mjs`, deterministic). The only palette
 * guaranteed to cover the whole event vocabulary, which makes it the
 * completeness reference and the workbench default. It is an ORDINARY
 * pickable palette — not a fallback: a palette is exactly its sounds, and
 * events another palette doesn't carry resolve to silence (ADR-0033 §3,
 * amended 2026-07-02).
 */
export const coreKit: SoundKitManifest = {
	slug: 'core',
	label: 'Core',
	description: 'Neutral engine-synthesized cues covering every event.',
	samples: {
		'whoosh-in': 'core-whoosh-in',
		'whoosh-out': 'core-whoosh-out',
		impact: 'core-impact',
		tick: 'core-tick',
		pop: 'core-pop',
		swipe: 'core-swipe',
		scratch: 'core-scratch',
		'sub-drop': 'core-sub-drop',
		sting: 'core-sting'
	}
};
