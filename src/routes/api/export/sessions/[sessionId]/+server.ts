import type { RequestHandler } from '@sveltejs/kit';

import { exportSessionStore, ExportSessionError } from '$lib/platform/export-session.server';
import { PUBLIC_EXPORT_RESPONSE_HEADERS } from '$lib/platform/public-export-security';

export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		await exportSessionStore.cancel(params.sessionId ?? '', request);
		return new Response(null, { status: 204, headers: PUBLIC_EXPORT_RESPONSE_HEADERS });
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
