/**
 * Sound-kit registry — pairs Layer `soundKit` slugs with their manifests,
 * exactly as the Pack registry pairs Preset `pack` slugs (ADR-0033 §3 /
 * ADR-0014 pattern). The schema validates every `soundKit` reference against
 * this registry at parse time (the EFFECT_CATALOG precedent), and the boot
 * gate in `audio-assets.ts` refuses to start if a registered kit names a
 * sample slug that is not a bundled asset.
 */
import { coreKit } from '../../sound-kits/core/manifest.ts';
import { messagePopKit } from '../../sound-kits/message-pop/manifest.ts';
import { quickWhooshKit } from '../../sound-kits/quick-whoosh/manifest.ts';

import type { SoundKitManifest } from './types';

export const SOUND_KIT_REGISTRY: Readonly<Record<string, SoundKitManifest>> = {
	core: coreKit,
	'message-pop': messagePopKit,
	'quick-whoosh': quickWhooshKit
};

export function isSoundKit(slug: string): boolean {
	return slug in SOUND_KIT_REGISTRY;
}

export function listSoundKits(): readonly SoundKitManifest[] {
	return Object.values(SOUND_KIT_REGISTRY);
}

export function getSoundKit(slug: string): SoundKitManifest {
	const kit = SOUND_KIT_REGISTRY[slug];
	if (kit === undefined) {
		throw new Error(
			`Unknown Sound kit "${slug}". Registered kits: ${Object.keys(SOUND_KIT_REGISTRY).join(', ')}.`
		);
	}
	return kit;
}
