import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	hasUserImageSignature,
	MAX_USER_IMAGE_BYTES,
	type UserImageMime,
	userImageFormatForMime
} from '../utils/user-image-assets.ts';

const STORE_DIR = join(process.cwd(), 'user-assets');

function isAlreadyStored(errorValue: unknown): boolean {
	return (
		typeof errorValue === 'object' &&
		errorValue !== null &&
		'code' in errorValue &&
		errorValue.code === 'EEXIST'
	);
}

export async function storeUserImage(bytes: Uint8Array, mime: UserImageMime): Promise<string> {
	const format = userImageFormatForMime(mime);
	if (!format) throw new TypeError(`Unsupported user image MIME type: ${mime}`);
	if (bytes.byteLength === 0) throw new TypeError('User image body is empty');
	if (bytes.byteLength > MAX_USER_IMAGE_BYTES)
		throw new RangeError('User image exceeds the 5 MiB limit');
	if (!hasUserImageSignature(bytes, mime))
		throw new TypeError(`User image bytes do not match ${mime}`);

	const hash = createHash('sha256').update(bytes).digest('hex');
	const key = `${hash}.${format.extension}`;
	await mkdir(STORE_DIR, { recursive: true });
	try {
		await writeFile(join(STORE_DIR, key), bytes, { flag: 'wx' });
	} catch (errorValue) {
		if (!isAlreadyStored(errorValue)) throw errorValue;
	}
	return `/api/user-assets/${key}`;
}
