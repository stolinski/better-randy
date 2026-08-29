import { getPresetBySlug } from '$lib/platform/preset-catalog';

import type { PageServerLoad } from './$types';

/**
 * Only the corpus half of this route resolves here. The session composition a
 * slug may shadow lives in the store the browser is configured with, and a
 * browser-scoped session is one the origin cannot see and must never be sent —
 * so the page resolves that half itself, against the same store WebMCP uses
 * (ADR-0053). What the server knows is the Starter this build ships.
 */
export const load = (async ({ params, url }) => {
	const slug = params.slug;
	const source = url.searchParams.get('source') === 'builtin' ? ('builtin' as const) : null;

	return { slug, source, corpusPreset: getPresetBySlug(slug) ?? null };
}) satisfies PageServerLoad;
