import type { RequestHandler } from '@sveltejs/kit';

import {
	exportSessionStore,
	ExportSessionError
} from '$lib/platform/export-session.server';

export const GET: RequestHandler = async ({ params, request }) => {
	try {
		return await exportSessionStore.outputResponse(params.sessionId ?? '', request.signal);
	} catch (cause) {
		if (cause instanceof ExportSessionError) {
			return new Response(cause.message, { status: cause.status });
		}
		throw cause;
	}
};
