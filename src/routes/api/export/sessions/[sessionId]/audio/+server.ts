import type { RequestHandler } from '@sveltejs/kit';

import {
	exportSessionStore,
	ExportSessionError
} from '$lib/platform/export-session.server';

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		await exportSessionStore.uploadAudio(params.sessionId ?? '', request);
		return new Response(null, { status: 204 });
	} catch (cause) {
		if (cause instanceof ExportSessionError) {
			return new Response(cause.message, { status: cause.status });
		}
		throw cause;
	}
};
