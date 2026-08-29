import { json, type RequestHandler } from '@sveltejs/kit';

import { exportSessionStore, ExportSessionError } from '$lib/platform/export-session.server';
import { PUBLIC_EXPORT_RESPONSE_HEADERS } from '$lib/platform/public-export-security';

// POST only, deliberately: the open sessions are private to the browsers that
// opened them, so the collection is never listable.
export const POST: RequestHandler = async ({ request }) => {
	try {
		const opened = await exportSessionStore.create(request);
		return json(opened.document, {
			status: 201,
			headers: { ...PUBLIC_EXPORT_RESPONSE_HEADERS, 'Set-Cookie': opened.credentialCookie }
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
