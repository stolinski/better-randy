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
import { crtTerminalPack } from '$lib/packs/crt-terminal/manifest';
import { cleanLightPack } from '$lib/packs/clean-light/manifest';
import { sentryPack } from '$lib/packs/sentry/manifest';

export const PACK_REGISTRY_SLUGS = [
	'syntax',
	'editorial-mono',
	'crt-terminal',
	'clean-light',
	'sentry'
] as const;
export type PackRegistrySlug = (typeof PACK_REGISTRY_SLUGS)[number];

export const PACK_REGISTRY: Readonly<Record<string, PackManifest>> = {
	syntax: syntaxPack,
	'editorial-mono': editorialMonoPack,
	'crt-terminal': crtTerminalPack,
	'clean-light': cleanLightPack,
	sentry: sentryPack
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

/**
 * The second pack source (ADR-0055): User Packs loaded from the store into the
 * running engine. Installed by `user-pack-runtime.svelte.ts` when the client
 * boots; never installed under Node, so every script and deliverable gate sees
 * the built-in registry alone. Reads go through the source on every call so a
 * reactive implementation can re-run the derived reads that depend on it.
 */
export interface RuntimePackSource {
	read(slug: string): PackManifest | undefined;
	list(): readonly PackManifest[];
}

let runtimePackSource: RuntimePackSource | null = null;

export function installRuntimePackSource(source: RuntimePackSource): void {
	runtimePackSource = source;
}

/** The User Packs currently loaded into this engine; empty wherever no source is installed. */
export function listRuntimeUserPacks(): readonly PackManifest[] {
	return runtimePackSource?.list() ?? [];
}

export type PackSource = 'builtin' | 'user';

/** Built-ins first, then the runtime User Packs; null when neither source holds the slug. */
export function findPack(slug: string): PackManifest | null {
	return PACK_REGISTRY[slug] ?? runtimePackSource?.read(slug) ?? null;
}

export function packSourceOf(slug: string): PackSource | null {
	if (PACK_REGISTRY[slug] !== undefined) return 'builtin';
	return runtimePackSource?.read(slug) !== undefined ? 'user' : null;
}

/**
 * A slug neither source resolves. Named so callers can tell it from every other
 * failure, and worded so the recovery is in the message: nothing ever
 * substitutes another look for a Pack that is missing.
 */
export class UnknownPackError extends Error {
	readonly slug: string;

	constructor(slug: string) {
		const loaded = listRuntimeUserPacks().map((pack) => pack.slug);
		super(
			`Unknown Pack "${slug}". Registered Packs: ${Object.keys(PACK_REGISTRY).join(', ')}` +
				(loaded.length > 0 ? `; loaded User Packs: ${loaded.join(', ')}` : '') +
				`. A User Pack must be loaded from the User Pack store before a composition can bind to it; if the store no longer holds "${slug}", bind the composition to another Pack.`
		);
		this.name = 'UnknownPackError';
		this.slug = slug;
	}
}

export function getPack(slug: string): PackManifest {
	const pack = findPack(slug);
	if (pack === null) throw new UnknownPackError(slug);
	return pack;
}
