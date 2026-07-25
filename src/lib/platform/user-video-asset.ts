import type { UserVideoMime } from '$lib/utils/user-video-format-validation';

export interface UserVideoAssetMetadata {
	durationSeconds: number;
	displayWidth: number;
	displayHeight: number;
	rotation: 0 | 90 | 180 | 270;
	averageFrameRate: number;
	videoCodec: string;
	hasAudio: boolean;
	audioCodec?: string;
	audioChannels?: number;
	audioSampleRate?: number;
}

export interface UserVideoAssetDescriptor extends UserVideoAssetMetadata {
	url: string;
	mime: UserVideoMime;
	sizeBytes: number;
}

export function isUserVideoAssetDescriptor(value: unknown): value is UserVideoAssetDescriptor {
	return (
		typeof value === 'object' &&
		value !== null &&
		'url' in value &&
		typeof value.url === 'string' &&
		value.url.startsWith('/api/user-assets/') &&
		'mime' in value &&
		(value.mime === 'video/mp4' ||
			value.mime === 'video/quicktime' ||
			value.mime === 'video/webm') &&
		'sizeBytes' in value &&
		typeof value.sizeBytes === 'number' &&
		'durationSeconds' in value &&
		typeof value.durationSeconds === 'number' &&
		'displayWidth' in value &&
		typeof value.displayWidth === 'number' &&
		'displayHeight' in value &&
		typeof value.displayHeight === 'number' &&
		'rotation' in value &&
		(value.rotation === 0 ||
			value.rotation === 90 ||
			value.rotation === 180 ||
			value.rotation === 270) &&
		'averageFrameRate' in value &&
		typeof value.averageFrameRate === 'number' &&
		'videoCodec' in value &&
		typeof value.videoCodec === 'string' &&
		'hasAudio' in value &&
		typeof value.hasAudio === 'boolean'
	);
}
