import { json } from '@sveltejs/kit';

import { computeRepositoryTreeFingerprint } from '$lib/utils/repository-tree-fingerprint.server';

/** Local read-only source identity used to reject captures from another checkout. */
export async function GET(): Promise<Response> {
	const identity = await computeRepositoryTreeFingerprint(process.cwd());
	return json({
		schemaVersion: 1,
		sourceRevision: identity.sourceRevision,
		treeFingerprint: identity.treeFingerprint
	});
}
