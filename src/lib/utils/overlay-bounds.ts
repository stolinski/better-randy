import type { Overlay, OverlayPlacement } from '$lib/platform/engine-schema';

import { resolveOverlayPlacement } from './overlay-placement';
import type { VideoOrientation } from './video-frame';

export interface OverlayBoundsPx {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Measure an overlay's rendered rect in canvas-pixel coordinates relative to
 * the composition element. Used as the `bounds` argument that
 * `OverlayRenderer.shaderPass.packUniforms(overlay.content, bounds)` receives.
 *
 * The composition root and the overlay element share a coordinate system
 * (the composition is `position: relative` and overlays are absolutely
 * positioned inside it), so the bounds are simply the overlay element's
 * `getBoundingClientRect()` minus the composition's, with x/y normalised so
 * `0,0` is the top-left of the composition.
 *
 * When the overlay DOM hasn't been measured yet (compositionRoot is null or
 * the overlay element isn't mounted), fall back to a position-derived
 * estimate (anchor + offset against the composition size, zero-width). This
 * is intentionally coarse — overlay shaderPasses that need pixel-exact
 * bounds (e.g. tear-edge) MUST run after the DOM has settled; the fallback
 * keeps the pack function well-formed before the first paint.
 */
export function measureOverlayBoundsPx(
	overlay: Overlay,
	compositionRoot: HTMLElement | null,
	compositionSize: { width: number; height: number },
	orientation: VideoOrientation
): OverlayBoundsPx {
	if (compositionRoot) {
		const overlayElement = compositionRoot.querySelector<HTMLElement>(
			`[data-overlay-id="${overlay.id}"]`
		);

		if (overlayElement) {
			const overlayRect = overlayElement.getBoundingClientRect();
			const compositionRect = compositionRoot.getBoundingClientRect();
			// The composition root is rendered at CSS pixels which may not match
			// the canvas-pixel coordinate system (the composition can be
			// transform-scaled to fit the viewport). Map the measured client
			// rect into canvas-pixel space via the ratio of canvas width to
			// composition CSS width.
			const cssWidth = compositionRect.width || compositionSize.width;
			const cssHeight = compositionRect.height || compositionSize.height;
			const scaleX = compositionSize.width / cssWidth;
			const scaleY = compositionSize.height / cssHeight;

			return {
				x: (overlayRect.left - compositionRect.left) * scaleX,
				y: (overlayRect.top - compositionRect.top) * scaleY,
				width: overlayRect.width * scaleX,
				height: overlayRect.height * scaleY
			};
		}
	}

	return estimateOverlayBoundsPx(
		resolveOverlayPlacement(overlay.position, orientation),
		compositionSize
	);
}

function estimateOverlayBoundsPx(
	position: OverlayPlacement,
	compositionSize: { width: number; height: number }
): OverlayBoundsPx {
	const { anchor, offset, rect } = position;

	if (anchor === 'normalized-rect' && rect) {
		return {
			x: rect.x * compositionSize.width,
			y: rect.y * compositionSize.height,
			width: rect.width * compositionSize.width,
			height: rect.height * compositionSize.height
		};
	}

	const ox = (offset?.x ?? 0) * compositionSize.width;
	const oy = (offset?.y ?? 0) * compositionSize.height;
	const x = anchor.endsWith('left')
		? ox
		: anchor.endsWith('right')
			? compositionSize.width - ox
			: compositionSize.width / 2;
	const y = anchor.startsWith('top')
		? oy
		: anchor.startsWith('bottom')
			? compositionSize.height - oy
			: compositionSize.height / 2;

	return { x, y, width: 0, height: 0 };
}
