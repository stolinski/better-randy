export const MAX_USER_IMAGE_BYTES = 5 * 1024 * 1024;

export type UserImageMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type UserImageExtension = 'png' | 'jpg' | 'webp';

export interface UserImageFormat {
	mime: UserImageMime;
	extension: UserImageExtension;
}

const FORMATS: Record<UserImageMime, UserImageFormat> = {
	'image/png': { mime: 'image/png', extension: 'png' },
	'image/jpeg': { mime: 'image/jpeg', extension: 'jpg' },
	'image/webp': { mime: 'image/webp', extension: 'webp' }
};

export function userImageFormatForMime(mime: string): UserImageFormat | null {
	return FORMATS[mime as UserImageMime] ?? null;
}

export function hasUserImageSignature(bytes: Uint8Array, mime: UserImageMime): boolean {
	if (mime === 'image/png') {
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	}

	if (mime === 'image/jpeg') {
		return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}

	return (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	);
}
