import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * The `core` Sound kit: the engine-pinned core samples, unmodified. It
 * declares no samples of its own — every event falls through the ADR-0024
 * core fallback — so it doubles as the completeness reference: if the core
 * vocabulary resolves, this kit sounds every event. Designed kits (by-ear,
 * per channel) override events selectively on top of the same fallback.
 */
export const coreKit: SoundKitManifest = {
	slug: 'core',
	label: 'Core',
	description: 'Neutral engine-synthesized cues — every event resolves through the core fallback.',
	samples: {}
};
