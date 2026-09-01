/**
 * The User Packs loaded into this engine, as reactive state (ADR-0055).
 *
 * `getPack` resolves built-ins first and then asks the runtime source this
 * module installs. The record is `$state.raw` and replaced whole on every
 * change, so a `$derived` that read a pack through `getPack` re-runs when that
 * pack is loaded, updated after a save, or unloaded — the same way it already
 * re-runs when `packState.slug` changes. Nothing here touches the network; the
 * loading lives in `user-pack-runtime.ts`.
 *
 * Node never imports this module, which is what keeps every script and
 * deliverable gate on the built-in registry alone.
 */
import { installRuntimePackSource, PACK_REGISTRY } from './packs/registry';
import type { PackManifest } from './packs/types';

let runtimeUserPacks = $state.raw<Readonly<Record<string, PackManifest>>>({});

installRuntimePackSource({
	read: (slug) => runtimeUserPacks[slug],
	list: () => Object.values(runtimeUserPacks)
});

/** Make a manifest resolvable through `getPack`; a re-registration replaces the previous one. */
export function registerRuntimeUserPack(manifest: PackManifest): void {
	if (PACK_REGISTRY[manifest.slug] !== undefined) {
		throw new Error(
			`User Pack "${manifest.slug}" would shadow the built-in Pack of the same slug; the store never admits one`
		);
	}
	runtimeUserPacks = { ...runtimeUserPacks, [manifest.slug]: manifest };
}

export function unregisterRuntimeUserPack(slug: string): void {
	if (!Object.hasOwn(runtimeUserPacks, slug)) return;
	const next = { ...runtimeUserPacks };
	delete next[slug];
	runtimeUserPacks = next;
}
