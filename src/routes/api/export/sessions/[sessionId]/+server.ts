import type { RequestHandler } from '@sveltejs/kit';

import { exportSessionStore } from '$lib/platform/export-session.server';

export const DELETE: RequestHandler = async ({ params }) => {
	await exportSessionStore.cancel(params.sessionId ?? '');
	return new Response(null, { status: 204 });
};
