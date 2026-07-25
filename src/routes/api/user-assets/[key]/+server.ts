import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { createReadableStream } from '@sveltejs/kit/node';
import { error, type RequestHandler } from '@sveltejs/kit';

import type { UserImageMime } from '$lib/utils/user-image-format-validation';
import { parseHttpByteRange } from '$lib/utils/http-byte-range';
import type { UserVideoMime } from '$lib/utils/user-video-format-validation';

const STORE_DIR = join(process.cwd(), 'user-assets');
const KEY_RE = /^[a-f0-9]{64}\.(png|jpg|webp|mp4|mov|webm)$/;
const MIME_BY_EXTENSION: Record<string, UserImageMime | UserVideoMime> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm'
};

async function assetResponse(
	params: Record<string, string | undefined>,
	request: Request,
	includeBody: boolean
): Promise<Response> {
	const key = params.key ?? '';
	const match = KEY_RE.exec(key);
	if (!match) error(400, 'Invalid user asset key');

	const filePath = join(STORE_DIR, key);
	let size: number;
	try {
		size = (await stat(filePath)).size;
	} catch {
		error(404, 'User asset not found');
	}

	const baseHeaders = {
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'public, max-age=31536000, immutable',
		'Content-Type': MIME_BY_EXTENSION[match[1]] ?? 'application/octet-stream'
	};
	let range;
	try {
		range = parseHttpByteRange(request.headers.get('range'), size);
	} catch {
		return new Response(null, {
			status: 416,
			headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` }
		});
	}

	if (!range) {
		return new Response(includeBody ? createReadableStream(filePath) : null, {
			headers: { ...baseHeaders, 'Content-Length': String(size) }
		});
	}

	const length = range.end - range.start + 1;
	const body = includeBody
		? (Readable.toWeb(
				createReadStream(filePath, { start: range.start, end: range.end })
			) as ReadableStream<Uint8Array>)
		: null;
	return new Response(body, {
		status: 206,
		headers: {
			...baseHeaders,
			'Content-Length': String(length),
			'Content-Range': `bytes ${range.start}-${range.end}/${size}`
		}
	});
}

export const GET: RequestHandler = ({ params, request }) => assetResponse(params, request, true);

export const HEAD: RequestHandler = ({ params, request }) => assetResponse(params, request, false);
