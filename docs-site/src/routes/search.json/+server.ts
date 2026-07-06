import { json } from '@sveltejs/kit';

import { getSearchIndex } from '$lib/server/docs';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
	return json(getSearchIndex());
};
