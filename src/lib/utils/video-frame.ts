export type VideoOrientation = 'horizontal' | 'vertical';

export interface VideoFrameSize {
	width: number;
	height: number;
}

const VIDEO_FRAME_SIZES: Record<VideoOrientation, VideoFrameSize> = {
	horizontal: {
		width: 3840,
		height: 2160
	},
	vertical: {
		width: 2160,
		height: 3840
	}
};

export function getVideoFrameSize(orientation: VideoOrientation): VideoFrameSize {
	return VIDEO_FRAME_SIZES[orientation];
}

export function getVideoFrameAspectRatio(orientation: VideoOrientation): string {
	const size = getVideoFrameSize(orientation);

	return `${size.width} / ${size.height}`;
}
