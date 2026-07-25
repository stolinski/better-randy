export const MAX_USER_VIDEO_BYTES = 50 * 1024 * 1024 * 1024;

export type UserVideoMime = 'video/mp4' | 'video/quicktime' | 'video/webm';
export type UserVideoExtension = 'mp4' | 'mov' | 'webm';

export interface UserVideoFormat {
	mime: UserVideoMime;
	extension: UserVideoExtension;
}

const USER_VIDEO_FORMATS: Record<UserVideoMime, UserVideoFormat> = {
	'video/mp4': { mime: 'video/mp4', extension: 'mp4' },
	'video/quicktime': { mime: 'video/quicktime', extension: 'mov' },
	'video/webm': { mime: 'video/webm', extension: 'webm' }
};

export function userVideoFormatForMime(mime: string): UserVideoFormat | null {
	const normalized = mime.split(';', 1)[0].trim().toLowerCase();
	return USER_VIDEO_FORMATS[normalized as UserVideoMime] ?? null;
}

export function hasUserVideoSignature(bytes: Uint8Array, mime: UserVideoMime): boolean {
	if (mime === 'video/webm') {
		return (
			bytes.length >= 4 &&
			bytes[0] === 0x1a &&
			bytes[1] === 0x45 &&
			bytes[2] === 0xdf &&
			bytes[3] === 0xa3
		);
	}

	return (
		bytes.length >= 12 &&
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70
	);
}
