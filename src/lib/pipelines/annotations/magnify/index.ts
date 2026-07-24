import type { AnnotationFocalSlot, AnnotationRenderer } from '$lib/platform/pipelines/types';

function easeOutExpo(t: number): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	return 1 - Math.pow(2, -10 * t);
}

function easeInExpo(t: number): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	return Math.pow(2, 10 * (t - 1));
}

export const magnifyAnnotationRenderer: AnnotationRenderer = {
	style: 'magnify',
	kind: 'focal',
	appliesTo: ['paragraph'],
	// The lens is sized from one representative line, not stretched across a
	// wrapped paragraph. Short phrases receive a circular inspection lens;
	// longer lines receive a bounded rounded rectangle so the focal words stay
	// readable without turning the whole paragraph into a glass plate.
	//
	// Reveal envelope uses exponential easing rather than smoothstep:
	// snap in over the first 10% of the bar, hold at full scale for 80%,
	// snap out over the final 10%. The bulk of each transition is
	// concentrated at the bar edges, so visually the lens "is present
	// while the bar is on screen" with smooth bookends, rather than
	// being mid-fade for a full 15% on each side.
	computeFocalSlot({ canvasHeight, canvasWidth, color, intensity, layout, progress }): AnnotationFocalSlot {
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
			: Math.min(Math.max(focalBounds.width + lineHeight * 3, lineHeight * 10), lineHeight * 14);
		const lensHeight = isCircular
			? circularDiameter
			: Math.min(Math.max(focalBounds.height + lineHeight * 2.5, lineHeight * 6.5), lineHeight * 8);
		const lensCenterX = focalBounds.x + focalBounds.width / 2;
		const lensCenterY = focalBounds.y + focalBounds.height / 2;

		const enterT = Math.max(0, Math.min(1, progress / 0.10));
		const exitT = Math.max(0, Math.min(1, (progress - 0.90) / 0.10));
		const fadeIn = easeOutExpo(enterT);
		const fadeOut = 1 - easeInExpo(exitT);
		const reveal = fadeIn * fadeOut;
		const inspectionRipple = Math.max(0, Math.min(1, (progress - 0.08) / 0.34));
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
			dim: (0.42 + safeIntensity * 0.2) * reveal,
			opticalColor: color,
			opticalIntensity: safeIntensity,
			opticalRipple: inspectionRipple,
			opticalShape: isCircular ? 'circle' : 'rounded-rect',
			tear: 0
		};
	}
};
