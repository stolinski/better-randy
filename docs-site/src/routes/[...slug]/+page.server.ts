import { error } from '@sveltejs/kit';

import { getAllHrefs, getDoc } from '$lib/server/docs';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => {
	return getAllHrefs().map((href) => ({ slug: href.slice(1) }));
};

export const load: PageServerLoad = async ({ params }) => {
	const doc = await getDoc(params.slug);
	if (!doc) error(404, 'Not found');
	return { doc };
};
