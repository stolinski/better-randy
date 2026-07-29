import { json, type RequestHandler } from '@sveltejs/kit';

import {
	exportSessionStore,
	ExportSessionError
} from '$lib/platform/export-session.server';

export const POST: RequestHandler = async ({ params }) => {
	try {
		return json(await exportSessionStore.complete(params.sessionId ?? ''));
	} catch (cause) {
		if (cause instanceof ExportSessionError) {
			return new Response(cause.message, { status: cause.status });
		}
		throw cause;
	}
};
