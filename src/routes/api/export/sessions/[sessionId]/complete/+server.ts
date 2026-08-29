import { json, type RequestHandler } from '@sveltejs/kit';

import { exportSessionStore, ExportSessionError } from '$lib/platform/export-session.server';
import { PUBLIC_EXPORT_RESPONSE_HEADERS } from '$lib/platform/public-export-security';

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		return json(await exportSessionStore.complete(params.sessionId ?? '', request), {
			headers: PUBLIC_EXPORT_RESPONSE_HEADERS
		});
	} catch (cause) {
		if (cause instanceof ExportSessionError) {
			return new Response(cause.message, {
				status: cause.status,
				headers: PUBLIC_EXPORT_RESPONSE_HEADERS
			});
		}
		throw cause;
	}
};
