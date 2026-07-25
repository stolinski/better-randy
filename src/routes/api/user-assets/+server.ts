import { error, json, type RequestHandler } from '@sveltejs/kit';

import { storeUserImage } from '$lib/platform/user-image-asset-store.server';
import { storeUserVideo } from '$lib/platform/user-video-asset-store.server';
import {
	hasUserImageSignature,
	MAX_USER_IMAGE_BYTES,
	userImageFormatForMime
} from '$lib/utils/user-image-format-validation';
import {
	MAX_USER_VIDEO_BYTES,
	userVideoFormatForMime
} from '$lib/utils/user-video-format-validation';

export const POST: RequestHandler = async ({ request }) => {
	const contentType = request.headers.get('content-type') ?? '';
	const contentLength = request.headers.get('content-length');
	const videoFormat = userVideoFormatForMime(contentType);
	if (videoFormat) {
		if (!request.body) error(400, 'User video body is empty');
		if (contentLength !== null && Number(contentLength) > MAX_USER_VIDEO_BYTES) {
			error(413, 'User video exceeds the 50 GiB limit');
		}
		try {
			return json(await storeUserVideo(request.body, videoFormat.mime), { status: 201 });
		} catch (errorValue) {
			const message = errorValue instanceof Error ? errorValue.message : 'User video upload failed';
			if (errorValue instanceof RangeError) error(413, message);
			if (errorValue instanceof TypeError) error(415, message);
			throw errorValue;
		}
	}

	if (contentLength !== null && Number(contentLength) > MAX_USER_IMAGE_BYTES) {
		error(413, 'User image exceeds the 5 MiB limit');
	}

	const format = userImageFormatForMime(contentType);
	if (!format) error(415, 'User asset must be PNG, JPEG, WebP, MP4, MOV, or WebM');

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0) error(400, 'User image body is empty');
	if (bytes.byteLength > MAX_USER_IMAGE_BYTES) error(413, 'User image exceeds the 5 MiB limit');
	if (!hasUserImageSignature(bytes, format.mime)) {
		error(415, `User image bytes do not match ${format.mime}`);
	}

	return json({ url: await storeUserImage(bytes, format.mime) }, { status: 201 });
};
