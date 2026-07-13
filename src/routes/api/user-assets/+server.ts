import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { error, json, type RequestHandler } from '@sveltejs/kit';

import {
	hasUserImageSignature,
	MAX_USER_IMAGE_BYTES,
	userImageFormatForMime
} from '$lib/utils/user-image-assets';

const STORE_DIR = join(process.cwd(), 'user-assets');

function isAlreadyStored(errorValue: unknown): boolean {
	return (
		typeof errorValue === 'object' &&
		errorValue !== null &&
		'code' in errorValue &&
		errorValue.code === 'EEXIST'
	);
}

export const POST: RequestHandler = async ({ request }) => {
	const contentLength = request.headers.get('content-length');
	if (contentLength !== null && Number(contentLength) > MAX_USER_IMAGE_BYTES) {
		error(413, 'User image exceeds the 5 MiB limit');
	}

	const format = userImageFormatForMime(request.headers.get('content-type') ?? '');
	if (!format) error(415, 'User image must be PNG, JPEG, or WebP');

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0) error(400, 'User image body is empty');
	if (bytes.byteLength > MAX_USER_IMAGE_BYTES) error(413, 'User image exceeds the 5 MiB limit');
	if (!hasUserImageSignature(bytes, format.mime)) {
		error(415, `User image bytes do not match ${format.mime}`);
	}

	const hash = createHash('sha256').update(bytes).digest('hex');
	const key = `${hash}.${format.extension}`;
	await mkdir(STORE_DIR, { recursive: true });
	try {
		await writeFile(join(STORE_DIR, key), bytes, { flag: 'wx' });
	} catch (errorValue) {
		if (!isAlreadyStored(errorValue)) throw errorValue;
	}

	return json({ url: `/api/user-assets/${key}` }, { status: 201 });
};
