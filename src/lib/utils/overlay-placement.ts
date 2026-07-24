import type { OverlayPlacement, OverlayPosition } from '$lib/platform/engine-schema';

import type { VideoOrientation } from './video-frame';

/** Resolve the complete authored placement for one transport orientation. */
export function resolveOverlayPlacement(
	position: OverlayPosition,
	orientation: VideoOrientation
): OverlayPlacement {
	return position.orientationOverrides?.[orientation] ?? position;
}

/** Clone only placement geometry, never an OverlayPosition's nested overrides. */
export function cloneOverlayPlacement(placement: OverlayPlacement): OverlayPlacement {
	return {
		anchor: placement.anchor,
		offset: placement.offset ? { ...placement.offset } : undefined,
		rect: placement.rect ? { ...placement.rect } : undefined,
		scale: placement.scale,
		rotation: placement.rotation
	};
}
