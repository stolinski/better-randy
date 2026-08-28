import { error, json, type RequestHandler } from '@sveltejs/kit';

import { parseXPostOEmbed, parseXStatusUrl } from '$lib/utils/x-post-oembed';

const X_OEMBED_ENDPOINT = 'https://publish.x.com/oembed';

export const POST: RequestHandler = async ({ request, fetch }) => {
	let input: unknown;
	try {
		input = await request.json();
	} catch {
		error(400, 'X post import request must be JSON');
	}
	if (
		typeof input !== 'object' ||
		input === null ||
		typeof (input as Record<string, unknown>).url !== 'string'
	) {
		error(400, 'X post import requires a URL');
	}

	const sourceUrl = (input as { url: string }).url;
	let normalized: ReturnType<typeof parseXStatusUrl>;
	try {
		normalized = parseXStatusUrl(sourceUrl);
	} catch (errorValue) {
		error(400, errorValue instanceof Error ? errorValue.message : 'Invalid X post URL');
	}

	const endpoint = new URL(X_OEMBED_ENDPOINT);
	endpoint.searchParams.set('url', normalized.url);
	endpoint.searchParams.set('omit_script', 'true');
	endpoint.searchParams.set('dnt', 'true');

	try {
		const response = await fetch(endpoint, {
			headers: { Accept: 'application/json', 'User-Agent': 'GFX X post importer/1.0' },
			signal: AbortSignal.timeout(10_000)
		});
		if (!response.ok) error(response.status === 404 ? 404 : 502, 'X post could not be imported');
		return json(parseXPostOEmbed(await response.json(), normalized.url), { status: 201 });
	} catch (errorValue) {
		if (errorValue instanceof TypeError) error(502, errorValue.message);
		throw errorValue;
	}
};
