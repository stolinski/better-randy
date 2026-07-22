import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { error, type RequestHandler } from '@sveltejs/kit';

import { POSTER_STORE_DIR, posterPathForKey } from '$lib/platform/poster-store.server';

// Keys are content hashes from hashObject() — 16 hex chars; validate to keep
// the filesystem path safe.
const KEY_RE = /^[a-f0-9]{8,32}$/;

export const GET: RequestHandler = async ({ params }) => {
	const key = params.key ?? '';
	if (!KEY_RE.test(key)) error(400, 'Invalid poster key');
	try {
		const data = await readFile(posterPathForKey(key));
		return new Response(new Uint8Array(data), {
			headers: {
				'Content-Type': 'image/webp',
				// Safe to cache hard: the key is a content hash, so a changed
				// composition resolves to a different URL.
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch {
		error(404, 'No poster for this key');
	}
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const key = params.key ?? '';
	if (!KEY_RE.test(key)) error(400, 'Invalid poster key');
	const body = new Uint8Array(await request.arrayBuffer());
	if (body.byteLength === 0) error(400, 'Empty poster body');
	await mkdir(POSTER_STORE_DIR, { recursive: true });
	await writeFile(posterPathForKey(key), body);
	return new Response(null, { status: 204 });
};
