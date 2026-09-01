import { json, error, type RequestHandler } from '@sveltejs/kit';

import { assertOriginUserPackStoreServed } from '$lib/platform/origin-composition-routes.server';
import { PACK_REGISTRY_SLUGS } from '$lib/platform/packs/registry';
import { PACK_SLUG_PATTERN, formatPackValidationIssues } from '$lib/platform/packs/validation';
import {
	forkedManifestFromBuiltin,
	listStoredUserPacks,
	prepareUserPackSave,
	readStoredUserPack,
	writeStoredUserPack
} from '$lib/platform/user-pack-store-documents.server';
import { requireUserPackStoreLocation } from '$lib/platform/user-pack-store-location.server';

/**
 * The User Pack collection (ADR-0055): list what the store holds, and fork a
 * built-in into it. Development-host only; the public runtime refuses before
 * reading a body.
 */
export const GET: RequestHandler = async () => {
	assertOriginUserPackStoreServed();
	const location = requireUserPackStoreLocation();
	return json(await listStoredUserPacks(location));
};

export const POST: RequestHandler = async ({ request }) => {
	assertOriginUserPackStoreServed();
	const location = requireUserPackStoreLocation();

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}
	if (typeof body !== 'object' || body === null || !('slug' in body) || !('forkedFrom' in body)) {
		error(400, 'Body must have { slug, forkedFrom }');
	}
	const { slug, forkedFrom, label, description } = body as {
		slug: unknown;
		forkedFrom: unknown;
		label?: unknown;
		description?: unknown;
	};
	if (typeof slug !== 'string' || !PACK_SLUG_PATTERN.test(slug)) {
		error(400, 'slug must be lowercase kebab-case');
	}
	if (
		typeof forkedFrom !== 'string' ||
		!(PACK_REGISTRY_SLUGS as readonly string[]).includes(forkedFrom)
	) {
		error(400, `forkedFrom must name a built-in pack: ${PACK_REGISTRY_SLUGS.join(', ')}`);
	}
	if (label !== undefined && typeof label !== 'string') error(400, 'label must be a string');
	if (description !== undefined && typeof description !== 'string') {
		error(400, 'description must be a string');
	}

	const existing = await readStoredUserPack(location, slug);
	if (existing.kind === 'held') {
		error(409, `The store already holds a User Pack at "${slug}"; save it or choose another slug`);
	}
	if (existing.kind === 'corrupt') error(500, `Corrupt user pack file: ${existing.reason}`);

	const manifest = forkedManifestFromBuiltin(slug, forkedFrom, { label, description });
	if (manifest === null) error(400, `Unknown built-in pack "${forkedFrom}"`);
	const preparation = await prepareUserPackSave(slug, manifest, location, { forkedFrom });
	if (preparation.kind === 'refused') {
		return json(
			{ message: formatPackValidationIssues(preparation.issues), issues: preparation.issues },
			{ status: 422 }
		);
	}
	await writeStoredUserPack(location, slug, preparation.document);
	return json(preparation.document, { status: 201 });
};
