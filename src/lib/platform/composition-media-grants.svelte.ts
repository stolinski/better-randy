/**
 * The video files the visitor has handed this page, and the only thing an
 * authoring operation may add to a composition Media library
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §7).
 *
 * No tool opens a file picker and no tool reads the disk. Bytes enter the page
 * exactly one way — the visitor drops a file on the Media rail themselves — and
 * that gesture records a **grant** here. `media.add-library-entry` then names a
 * grant rather than a path, so an agent can ask for a file the person already
 * gave the page and can never acquire one on their behalf. A page with no
 * grants refuses with `consent_required`, which is the honest answer: the
 * missing thing is the person's gesture, not an argument.
 *
 * A grant outlives library membership on purpose. Removing an entry from the
 * composition does not withdraw the consent that produced it, so "put that clip
 * back" and "also use the second file I dropped" are both reachable without
 * asking the visitor to drop the same file twice.
 *
 * Grants are held in memory for the life of the page, so a reload drops every
 * one of them. That is the browser-scoped session boundary ADR-0053 draws, and
 * it is why nothing here is persisted.
 *
 * Intentionally absent: the bundled demo-asset lane ADR-0054 §7 also names. The
 * engine bundles no demo video today (`src/lib/assets/` carries sounds,
 * substrates, and identity only), so offering a catalog would mean offering an
 * empty one. Adding demo media is adding the assets plus a second grant source
 * here, not a new operation.
 */
import type { UserVideoAssetDescriptor } from './user-video-asset';

/** One file the visitor granted this page, named the way an operation targets it. */
export interface CompositionMediaGrant {
	/** The stable id an operation names; derived from the content address. */
	grantId: string;
	/**
	 * The visitor's own filename. Untrusted composition content — a receipt that
	 * carries it says so rather than presenting it as engine text.
	 */
	name: string;
	descriptor: UserVideoAssetDescriptor;
}

/**
 * The content address a granted asset is stored under. User asset URLs are
 * `/api/user-assets/<sha256>.<ext>`, so the same bytes always produce the same
 * grant id and re-dropping a file updates one grant instead of adding a second.
 */
function readGrantIdForAssetUrl(assetUrl: string): string {
	const digest = assetUrl.split('/').at(-1)?.split('.')[0];
	if (!digest || digest.length < 12) {
		throw new TypeError(`Media grant needs a content-addressed asset URL, got "${assetUrl}".`);
	}
	return `grant-${digest.slice(0, 12)}`;
}

export class CompositionMediaGrantRegistry {
	#grants = $state.raw<readonly CompositionMediaGrant[]>([]);

	get grants(): readonly CompositionMediaGrant[] {
		return this.#grants;
	}

	/** Whether this page may add media at all — that is, whether anyone granted it any. */
	get hasGrant(): boolean {
		return this.#grants.length > 0;
	}

	find(grantId: string): CompositionMediaGrant | null {
		return this.#grants.find((grant) => grant.grantId === grantId) ?? null;
	}

	/**
	 * Record the visitor's gesture. Called from the Media rail once the dropped
	 * file's bytes are stored, never from an operation: an agent may ask a person
	 * to grant a file and may not grant one for them.
	 */
	record(fileName: string, descriptor: UserVideoAssetDescriptor): CompositionMediaGrant {
		const trimmedName = fileName.trim();
		const grant: CompositionMediaGrant = {
			grantId: readGrantIdForAssetUrl(descriptor.url),
			name: trimmedName.length > 0 ? trimmedName : 'Untitled video',
			descriptor
		};
		this.#grants = [
			...this.#grants.filter((existing) => existing.grantId !== grant.grantId),
			grant
		];
		return grant;
	}

	clear(): void {
		this.#grants = [];
	}
}

export const compositionMediaGrants = new CompositionMediaGrantRegistry();
