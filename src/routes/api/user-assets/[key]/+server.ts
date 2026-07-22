import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { error, type RequestHandler } from '@sveltejs/kit';

import type { UserImageMime } from '$lib/utils/user-image-format-validation';

const STORE_DIR = join(process.cwd(), 'user-assets');
const KEY_RE = /^[a-f0-9]{64}\.(png|jpg|webp)$/;
const MIME_BY_EXTENSION: Record<string, UserImageMime> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	webp: 'image/webp'
};

export const GET: RequestHandler = async ({ params }) => {
	const key = params.key ?? '';
	const match = KEY_RE.exec(key);
	if (!match) error(400, 'Invalid user asset key');

	let bytes: Buffer;
	try {
		bytes = await readFile(join(STORE_DIR, key));
	} catch {
		error(404, 'User asset not found');
	}

	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': MIME_BY_EXTENSION[match[1]] ?? 'application/octet-stream',
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
