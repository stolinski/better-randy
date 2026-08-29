import { json, type RequestHandler } from '@sveltejs/kit';

import {
	exportSessionStore,
	ExportSessionError
} from '$lib/platform/export-session.server';

export const POST: RequestHandler = async ({ request }) => {
	try {
		return json(await exportSessionStore.create(request), { status: 201 });
	} catch (cause) {
		if (cause instanceof ExportSessionError) {
			return new Response(cause.message, { status: cause.status });
		}
		throw cause;
	}
};
