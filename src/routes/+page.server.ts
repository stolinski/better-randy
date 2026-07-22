import { listPosterKeys } from '$lib/platform/poster-store.server';

import type { PageServerLoad } from './$types';

// The listing needs to know which composition posters exist so cards start at
// the right fallback level instead of probing per-poster (a console 404 for
// every not-yet-captured composition).
export const load: PageServerLoad = async () => ({
	posterKeys: await listPosterKeys()
});
