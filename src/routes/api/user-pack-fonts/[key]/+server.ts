import { stat } from 'node:fs/promises';

import { createReadableStream } from '@sveltejs/kit/node';
import { error, type RequestHandler } from '@sveltejs/kit';

import { assertOriginUserPackStoreServed } from '$lib/platform/origin-composition-routes.server';
import {
	USER_PACK_FONT_KEY_PATTERN,
	userPackFontCacheFilePath
} from '$lib/platform/user-pack-font-cache.server';
import { requireUserPackStoreLocation } from '$lib/platform/user-pack-store-location.server';

/**
 * Serve one hash-pinned woff2 from the User Pack font cache (ADR-0055). The key
 * IS the content hash, so the bytes are immutable by construction and the
 * browser may cache them forever. Development-host only: the public runtime has
 * no cache to serve and answers 404 before touching the filesystem.
 */
async function fontResponse(
	params: Record<string, string | undefined>,
	includeBody: boolean
): Promise<Response> {
	assertOriginUserPackStoreServed();
	const location = requireUserPackStoreLocation();
	const key = params.key ?? '';
	if (!USER_PACK_FONT_KEY_PATTERN.test(key)) error(400, 'Invalid user pack font key');

	const filePath = userPackFontCacheFilePath(location, key);
	let size: number;
	try {
		size = (await stat(filePath)).size;
	} catch {
		error(404, 'User pack font not found in the cache');
	}

	return new Response(includeBody ? createReadableStream(filePath) : null, {
		headers: {
			'Cache-Control': 'public, max-age=31536000, immutable',
			'Content-Type': 'font/woff2',
			'Content-Length': String(size)
		}
	});
}

export const GET: RequestHandler = ({ params }) => fontResponse(params, true);

export const HEAD: RequestHandler = ({ params }) => fontResponse(params, false);
