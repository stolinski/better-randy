import {
	MAX_USER_IMAGE_BYTES,
	userImageFormatForMime
} from '$lib/utils/user-image-format-validation';

interface UserImageUploadResponse {
	url: string;
}

function isUserImageUploadResponse(value: unknown): value is UserImageUploadResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		'url' in value &&
		typeof value.url === 'string' &&
		value.url.startsWith('/api/user-assets/')
	);
}

async function responseMessage(response: Response): Promise<string> {
	try {
		const body: unknown = await response.json();
		if (
			typeof body === 'object' &&
			body !== null &&
			'message' in body &&
			typeof body.message === 'string'
		) {
			return body.message;
		}
	} catch {
		// Fall back to the HTTP status when the server did not return JSON.
	}
	return `${response.status} ${response.statusText}`.trim();
}

export async function uploadUserImage(file: File): Promise<string> {
	if (!userImageFormatForMime(file.type)) {
		throw new TypeError(`Cannot upload "${file.name}": expected a PNG, JPEG, or WebP file`);
	}
	if (file.size === 0) throw new TypeError(`Cannot upload "${file.name}": file is empty`);
	if (file.size > MAX_USER_IMAGE_BYTES) {
		throw new RangeError(`Cannot upload "${file.name}": file exceeds the 5 MiB limit`);
	}

	let response: Response;
	try {
		response = await fetch('/api/user-assets', {
			method: 'POST',
			headers: { 'Content-Type': file.type },
			body: file
		});
	} catch (errorValue) {
		throw new Error(`Failed to upload user image "${file.name}": network request failed`, {
			cause: errorValue
		});
	}

	if (!response.ok) {
		throw new Error(
			`Failed to upload user image "${file.name}": ${await responseMessage(response)}`
		);
	}

	const body: unknown = await response.json();
	if (!isUserImageUploadResponse(body)) {
		throw new Error(`Failed to upload user image "${file.name}": invalid server response`);
	}
	return body.url;
}
