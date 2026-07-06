import { getNav } from '$lib/server/docs';
import type { LayoutServerLoad } from './$types';

export const prerender = true;

export const load: LayoutServerLoad = () => {
	return { nav: getNav() };
};
