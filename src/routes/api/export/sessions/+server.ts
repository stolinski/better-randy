import { json, type RequestHandler } from '@sveltejs/kit';

import {
	exportSessionStore,
	ExportSessionError
} from '$lib/platform/export-session.server';

export const POST: RequestHandler = async ({ request }) => {
	try {
		if (request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') {
			return new Response('Expected application/json export session metadata.', { status: 415 });
		}
		return json(await exportSessionStore.create(await request.json()), { status: 201 });
	} catch (cause) {
		if (cause instanceof ExportSessionError) {
			return new Response(cause.message, { status: cause.status });
		}
		throw cause;
	}
};
