import type { Preset } from '$lib/platform/engine-schema';
import { getPresetBySlug } from '$lib/platform/preset-catalog';
import { userCompositionFileExists } from '$lib/platform/user-composition-file-index.server';
import { userCompositionStore } from '$lib/platform/user-composition-store';

import type { PageServerLoad } from './$types';

export const load = (async ({ params, url, fetch }) => {
	const slug = params.slug;
	const source = url.searchParams.get('source') === 'builtin' ? ('builtin' as const) : null;

	try {
		const builtinPreset = getPresetBySlug(slug);
		const indexedFileExists = source === 'builtin' ? false : await userCompositionFileExists(slug);
		let userComposition: Preset | null = null;
		if (indexedFileExists !== false) {
			try {
				userComposition = await userCompositionStore.loadUserComposition(slug, fetch);
			} catch (cause) {
				if (!builtinPreset) throw cause;
				console.error('Failed to load User composition; using built-in preset.', { slug, cause });
			}
		}
		const preset = userComposition ?? builtinPreset;

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
