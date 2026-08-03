import { z } from 'zod';

export const OpticalShapeSchema = z.enum(['circle', 'rounded-rect']);

export type OpticalShape = z.infer<typeof OpticalShapeSchema>;

export const NormalizedOpticalRegionSchema = z
	.object({
		x: z.number().min(0).max(1).default(0.25),
		y: z.number().min(0).max(1).default(0.25),
		width: z.number().min(0.02).max(1).default(0.5),
		height: z.number().min(0.02).max(1).default(0.5)
	})
	.refine((region) => region.x + region.width <= 1, {
		message: 'Optical region must fit within the frame width.'
	})
	.refine((region) => region.y + region.height <= 1, {
		message: 'Optical region must fit within the frame height.'
	});

export type NormalizedOpticalRegion = z.infer<typeof NormalizedOpticalRegionSchema>;

export const DEFAULT_REFRACTIVE_LENS_REGION: NormalizedOpticalRegion = {
	x: 0.25,
	y: 0.25,
	width: 0.5,
	height: 0.5
};

export const DEFAULT_FROSTED_GLASS_REGION: NormalizedOpticalRegion = {
	x: 0,
	y: 0,
	width: 1,
	height: 1
};

export interface OpticalFrameSize {
	height: number;
	width: number;
}

const OPTICAL_AUTHORING_WIDTH = 3840;
const OPTICAL_AUTHORING_HEIGHT = 2160;

export function packAspectPreservingOpticalRegion(
	region: Partial<NormalizedOpticalRegion> | undefined,
	fallback: NormalizedOpticalRegion,
	frame: OpticalFrameSize
): [number, number, number, number] {
	const x = region?.x ?? fallback.x;
	const y = region?.y ?? fallback.y;
	let width = region?.width ?? fallback.width;
	let height = region?.height ?? fallback.height;

	// A full-frame region explicitly follows the target frame. Local optical
	// geometry is authored against the canonical 16:9 composition and preserves
	// that physical pixel aspect when the transport switches orientation.
	if (width === 1 && height === 1) return [x, y, width, height];
	if (frame.width <= 0 || frame.height <= 0) return [x, y, width, height];
	if (frame.width === OPTICAL_AUTHORING_WIDTH && frame.height === OPTICAL_AUTHORING_HEIGHT) {
		return [x, y, width, height];
	}

	const centerX = x + width / 2;
	const centerY = y + height / 2;
	width = (width * OPTICAL_AUTHORING_WIDTH) / frame.width;
	height = (height * OPTICAL_AUTHORING_HEIGHT) / frame.height;

	const fitScale = Math.min(1, 1 / width, 1 / height);
	if (fitScale < 1) {
		width *= fitScale;
		height *= fitScale;
	}

	return [
		Math.max(0, Math.min(1 - width, centerX - width / 2)),
		Math.max(0, Math.min(1 - height, centerY - height / 2)),
		width,
		height
	];
}

export function getOpticalShapeCode(shape: OpticalShape | undefined): number {
	return shape === 'circle' ? 0 : 1;
}
