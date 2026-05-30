/**
 * Pack registry — pairs Preset `pack` slugs with their loaded manifests.
 * Per ADR-0014, the active Pack is named by the Preset\'s top-level `pack`
 * field and the engine resolves Role references through the matching
 * manifest. The validator from `identity-registry.ts` walks the active
 * manifest at boot and refuses to start if any `viaPack` reference does
 * not resolve.
 */

import type { PackManifest } from './types';
import { syntaxPack } from '$lib/packs/syntax/manifest';
import { editorialMonoPack } from '$lib/packs/editorial-mono/manifest';

export const PACK_REGISTRY: Readonly<Record<string, PackManifest>> = {
	syntax: syntaxPack,
	'editorial-mono': editorialMonoPack
};

/**
 * The completeness-reference Pack: the one manifest that resolves *every*
 * `viaPack` Role the Identity registry declares, used by the ADR-0019 boot
 * gate. This is NOT a default Pack for Presets — ADR-0023 removed that (every
 * Preset names its own Pack). It is purely the baseline the registry's viaPack
 * contract is validated against; secondary Packs may be partial (override a
 * subset, fall back through `resolveAppearanceVars`).
 */
export const REFERENCE_PACK_SLUG = 'syntax';

export function getPack(slug: string): PackManifest {
	const pack = PACK_REGISTRY[slug];
	if (pack === undefined) {
		throw new Error(
			`Unknown Pack "${slug}". Registered Packs: ${Object.keys(PACK_REGISTRY).join(', ')}.`
		);
	}
	return pack;
}
