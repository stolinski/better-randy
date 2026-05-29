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

export const PACK_REGISTRY: Readonly<Record<string, PackManifest>> = {
	syntax: syntaxPack
};

export function getPack(slug: string): PackManifest {
	const pack = PACK_REGISTRY[slug];
	if (pack === undefined) {
		throw new Error(
			`Unknown Pack "${slug}". Registered Packs: ${Object.keys(PACK_REGISTRY).join(', ')}.`
		);
	}
	return pack;
}
