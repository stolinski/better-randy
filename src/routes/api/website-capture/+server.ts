import { error, json, type RequestHandler } from '@sveltejs/kit';

import { captureWebsite, parseWebsiteCaptureRequest } from '$lib/platform/website-capture.server';

export const POST: RequestHandler = async ({ request }) => {
	let input: unknown;
	try {
		input = await request.json();
	} catch {
		error(400, 'Capture request must be JSON');
	}

	try {
		const capture = parseWebsiteCaptureRequest(input);
		return json(await captureWebsite(capture.url), { status: 201 });
	} catch (errorValue) {
		if (errorValue instanceof TypeError) error(400, errorValue.message);
		console.error('Website capture failed', errorValue);
		error(502, errorValue instanceof Error ? errorValue.message : 'Website capture failed');
	}
};
