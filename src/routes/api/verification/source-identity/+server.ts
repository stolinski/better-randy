import { error, json, type RequestHandler } from '@sveltejs/kit';

import {
	computeRepositoryScopedTreeFingerprint,
	computeRepositoryTreeFingerprint
} from '$lib/utils/repository-tree-fingerprint.server';

function parseScopedSourceIdentityPaths(value: string | null): string[] | null {
	if (value === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		error(400, 'Source identity paths must be valid JSON');
	}
	if (
		!Array.isArray(parsed) ||
		parsed.length === 0 ||
		parsed.length > 200 ||
		!parsed.every((path): path is string => typeof path === 'string')
	) {
		error(400, 'Source identity paths must be a bounded string array');
	}
	return parsed;
}

/** Local read-only source identity used to reject captures from another checkout. */
export const GET: RequestHandler = async ({ url }): Promise<Response> => {
	const scopedPaths = parseScopedSourceIdentityPaths(url.searchParams.get('paths'));
	const identity =
		scopedPaths === null
			? await computeRepositoryTreeFingerprint(process.cwd())
			: await computeRepositoryScopedTreeFingerprint(process.cwd(), scopedPaths);
	return json({
		schemaVersion: 1,
		sourceRevision: identity.sourceRevision,
		treeFingerprint: identity.treeFingerprint
	});
};
