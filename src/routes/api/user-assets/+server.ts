import { error, json, type RequestHandler } from '@sveltejs/kit';

import { storeUserImage } from '$lib/platform/user-image-asset-store.server';
import {
	hasUserImageSignature,
	MAX_USER_IMAGE_BYTES,
	userImageFormatForMime
} from '$lib/utils/user-image-assets';

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

	return json({ url: await storeUserImage(bytes, format.mime) }, { status: 201 });
};
