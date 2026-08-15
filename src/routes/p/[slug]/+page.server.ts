import { getPresetBySlug } from '$lib/platform/preset';
import { userCompositionFileExists } from '$lib/platform/user-composition-file-index.server';
import { userCompositionStore } from '$lib/platform/user-composition-store';

import type { PageServerLoad } from './$types';

export const load = (async ({ params, url, fetch }) => {
	const slug = params.slug;
	const source = url.searchParams.get('source') === 'builtin' ? ('builtin' as const) : null;

	try {
		const indexedFileExists =
			source === 'builtin' ? false : await userCompositionFileExists(slug);
		const userComposition =
			indexedFileExists === false
				? null
				: await userCompositionStore.loadUserComposition(slug, fetch);
		const preset = userComposition ?? getPresetBySlug(slug);

		if (!preset) {
			return { status: 'missing' as const, slug, source, provenance: null, preset: null };
		}

		return {
			status: 'ready' as const,
			slug,
			source,
			provenance: userComposition ? ('user' as const) : ('builtin' as const),
			preset
		};
	} catch (cause) {
		console.error('Failed to load composition route.', { slug, source, cause });
		return { status: 'error' as const, slug, source, provenance: null, preset: null };
	}
}) satisfies PageServerLoad;
