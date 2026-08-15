import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';
import { magnifyAnnotationDefinition } from './definition';

function smoothstep01(value: number): number {
	const t = Math.max(0, Math.min(1, value));
	return t * t * (3 - 2 * t);
}

export const magnifyAnnotationRenderer: AnnotationRenderer = {
	...magnifyAnnotationDefinition,
	// Short phrases receive a circular inspection lens. Wrapped phrases use
	// their full marked bounds for centering, then receive a line-height-bounded
	// rounded rectangle so the focal words stay readable without stretching the
	// lens across an entire paragraph.
	//
	// Entry occupies 40% of the authored Mark duration, clamped to G6's
	// 250–400 ms band. Exit is exactly 25% shorter and clamped to 180–280 ms.
	// Absolute-duration envelopes keep every legal focal Mark smooth regardless
	// of how its normalized Timeline window changes.
	computeFocalSlot({
		canvasHeight,
		canvasWidth,
		color,
		durationMs,
		intensity,
		layout,
		progress
	}): AnnotationFocalSlot {
		const fragments = layout.fragments.length > 0 ? layout.fragments : [layout.bounds];
		const midIdx = Math.min(Math.floor(fragments.length / 2), fragments.length - 1);
		const anchor = fragments[midIdx] ?? layout.bounds;

		const lineHeight = anchor.height;
		const hasMultipleLines = fragments.length > 1;
		const focalBounds = hasMultipleLines ? layout.bounds : anchor;
		const isCircular = !hasMultipleLines && focalBounds.width <= lineHeight * 2.4;
		const circularDiameter = lineHeight * 7;
		const lensWidth = isCircular
			? circularDiameter
			: Math.min(Math.max(focalBounds.width + lineHeight * 2.5, lineHeight * 18), lineHeight * 26);
		const lensHeight = isCircular
			? circularDiameter
			: Math.min(Math.max(focalBounds.height + lineHeight, lineHeight * 3.5), lineHeight * 4);
		const lensCenterX = focalBounds.x + focalBounds.width / 2;
		const lensCenterY = focalBounds.y + focalBounds.height / 2;

		const safeDurationMs = Math.max(1, durationMs);
		const enterDurationMs = Math.max(250, Math.min(400, safeDurationMs * 0.4));
		const exitDurationMs = Math.max(180, Math.min(280, enterDurationMs * 0.75));
		const enterFraction = enterDurationMs / safeDurationMs;
		const exitFraction = exitDurationMs / safeDurationMs;
		const fadeIn = smoothstep01(progress / enterFraction);
		const fadeOut = 1 - smoothstep01((progress - (1 - exitFraction)) / exitFraction);
		const reveal = fadeIn * fadeOut;
		const inspectionRipple = Math.max(0, Math.min(1, (progress - 0.04) / 0.22));
		const safeIntensity = Math.max(0, Math.min(1, intensity));

		return {
			style: 'magnify',
			rect: {
				x: (lensCenterX - lensWidth / 2) / canvasWidth,
				y: (lensCenterY - lensHeight / 2) / canvasHeight,
				width: lensWidth / canvasWidth,
				height: lensHeight / canvasHeight
			},
			magnify: (0.62 + safeIntensity * 0.26) * reveal,
			dim: (0.32 + safeIntensity * 0.18) * reveal,
			opticalColor: color,
			opticalIntensity: safeIntensity,
			opticalRipple: inspectionRipple,
			opticalShape: isCircular ? 'circle' : 'rounded-rect',
			tear: 0
		};
	}
};
