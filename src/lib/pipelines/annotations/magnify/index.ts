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
	// The lens is sized off ONE LINE of text, not the bounding box of a
	// wrapped multi-line span. A real magnifier is a fixed-size lens; you
	// don't stretch a magnifier to cover a paragraph. When the magnified
	// span wraps to several lines, the lens anchors on the middle
	// fragment and its width is capped at ~4.5× line-height. For long
	// spans the user sees the middle portion magnified — exactly what a
	// real magnifier shows when held over long text.
	//
	// Reveal envelope uses exponential easing rather than smoothstep:
	// snap in over the first 10% of the bar, hold at full scale for 80%,
	// snap out over the final 10%. The bulk of each transition is
	// concentrated at the bar edges, so visually the lens "is present
	// while the bar is on screen" with smooth bookends, rather than
	// being mid-fade for a full 15% on each side.
	computeFocalSlot({ canvasHeight, canvasWidth, layout, progress }): AnnotationFocalSlot {
		const fragments = layout.fragments.length > 0 ? layout.fragments : [layout.bounds];
		const midIdx = Math.min(Math.floor(fragments.length / 2), fragments.length - 1);
		const anchor = fragments[midIdx] ?? layout.bounds;

		const lineHeight = anchor.height;
		const widthCap = lineHeight * 4.5;
		const lensWidth = Math.min(anchor.width + lineHeight * 1.2, widthCap);
		const lensHeight = lineHeight;
		const lensCenterX = anchor.x + anchor.width / 2;
		const lensCenterY = anchor.y + anchor.height / 2;

		const enterT = Math.max(0, Math.min(1, progress / 0.10));
		const exitT = Math.max(0, Math.min(1, (progress - 0.90) / 0.10));
		const fadeIn = easeOutExpo(enterT);
		const fadeOut = 1 - easeInExpo(exitT);
		const reveal = fadeIn * fadeOut;

		return {
			style: 'magnify',
			rect: {
				x: (lensCenterX - lensWidth / 2) / canvasWidth,
				y: (lensCenterY - lensHeight / 2) / canvasHeight,
				width: lensWidth / canvasWidth,
				height: lensHeight / canvasHeight
			},
			magnify: 0.8 * reveal,
			dim: 0,
			tear: 0
		};
	}
};
