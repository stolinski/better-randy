import { json, error, type RequestHandler } from '@sveltejs/kit';

import { assertOriginUserPackStoreServed } from '$lib/platform/origin-composition-routes.server';
import { PACK_SLUG_PATTERN } from '$lib/platform/packs/types';
import { formatPackValidationIssues } from '$lib/platform/packs/validation';
import { parsePackManifestWire } from '$lib/platform/user-pack-store';
import {
	moveUserPackToTrash,
	prepareUserPackSave,
	readStoredUserPack,
	writeStoredUserPack
} from '$lib/platform/user-pack-store-documents.server';
import {
	assertUserPackDeleteAuthorized,
	requireUserPackStoreLocation
} from '$lib/platform/user-pack-store-location.server';

function requireSlug(params: Record<string, string | undefined>): string {
	const slug = params.slug;
	if (!slug) error(400, 'Missing slug');
	if (!PACK_SLUG_PATTERN.test(slug)) error(400, 'slug must be lowercase kebab-case');
	return slug;
}

/** One User Pack document (ADR-0055): read, save against an observed revision, delete to trash. */
export const GET: RequestHandler = async ({ params }) => {
	assertOriginUserPackStoreServed();
	const location = requireUserPackStoreLocation();
	const slug = requireSlug(params);
	const result = await readStoredUserPack(location, slug);
	if (result.kind === 'corrupt') error(500, `Corrupt user pack file: ${result.reason}`);
	return json(result.kind === 'held' ? result.document : null);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	assertOriginUserPackStoreServed();
	const location = requireUserPackStoreLocation();
	const slug = requireSlug(params);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}
	if (typeof body !== 'object' || body === null || !('manifest' in body)) {
		error(400, 'Body must have { manifest, expectedContentHash }');
	}
	const { manifest: wireManifest, expectedContentHash } = body as {
		manifest: unknown;
		expectedContentHash?: unknown;
	};
	if (
		expectedContentHash !== undefined &&
		expectedContentHash !== null &&
		typeof expectedContentHash !== 'string'
	) {
		error(400, 'expectedContentHash must be a string or null');
	}
	let manifest;
	try {
		manifest = parsePackManifestWire(wireManifest);
	} catch (cause) {
		error(400, `Invalid pack manifest: ${cause instanceof Error ? cause.message : String(cause)}`);
	}

	const existing = await readStoredUserPack(location, slug);
	if (existing.kind === 'corrupt') error(500, `Corrupt user pack file: ${existing.reason}`);
	// ADR-0054: a mutating operation applies against the revision it observed or
	// not at all. The refusal carries the revision that actually stands.
	if (typeof expectedContentHash === 'string') {
		const currentContentHash = existing.kind === 'held' ? existing.document.contentHash : null;
		if (currentContentHash !== expectedContentHash) {
			return json(
				{
					message: `User Pack "${slug}" changed since revision ${expectedContentHash} was read; reload it and apply the edit again`,
					currentContentHash
				},
				{ status: 409 }
			);
		}
	}

	const preparation = await prepareUserPackSave(slug, manifest, location, {
		forkedFrom: existing.kind === 'held' ? existing.document.forkedFrom : null
	});
	if (preparation.kind === 'refused') {
		return json(
			{ message: formatPackValidationIssues(preparation.issues), issues: preparation.issues },
			{ status: 422 }
		);
	}
	await writeStoredUserPack(location, slug, preparation.document);
	return json(preparation.document);
};

export const DELETE: RequestHandler = async ({ params }) => {
	assertOriginUserPackStoreServed();
	const location = requireUserPackStoreLocation();
	// Refuse before touching the filesystem: automation never deletes an author's work.
	assertUserPackDeleteAuthorized(location);
	const slug = requireSlug(params);
	if (!(await moveUserPackToTrash(location, slug))) error(404, `User Pack "${slug}" not found`);
	return new Response(null, { status: 204 });
};
