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

export function packNormalizedOpticalRegion(
	region: Partial<NormalizedOpticalRegion> | undefined,
	fallback: NormalizedOpticalRegion
): [number, number, number, number] {
	return [
		region?.x ?? fallback.x,
		region?.y ?? fallback.y,
		region?.width ?? fallback.width,
		region?.height ?? fallback.height
	];
}

export function getOpticalShapeCode(shape: OpticalShape | undefined): number {
	return shape === 'circle' ? 0 : 1;
}
