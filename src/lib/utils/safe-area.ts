import type { VideoOrientation } from './video-frame.ts';

export interface SafeAreaMargins {
	/** Fraction of frame height */
	top: number;
	/** Fraction of frame width */
	right: number;
	/** Fraction of frame height */
	bottom: number;
	/** Fraction of frame width */
	left: number;
}

/**
 * Platform-aware safe-area margins as fractions of frame dimensions.
 *
 * Horizontal (16:9, broadcast + YouTube): standard 5% title-safe on all sides.
 * Vertical (9:16, TikTok / Reels / Shorts): asymmetric platform UI bands —
 *   - top 6%: profile row + like/share chips
 *   - right 9%: action-button column
 *   - bottom 16%: caption + sounds shelf + progress bar
 *   - left 5%: standard safety margin
 *
 * Both the layout layer (CanvasSources) and the static linter (preset-rubric.ts)
 * read from this function so they agree on what "inside the safe zone" means.
 */
export function getLayoutSafeArea(orientation: VideoOrientation): SafeAreaMargins {
	if (orientation === 'vertical') {
		return { top: 0.06, right: 0.09, bottom: 0.16, left: 0.05 };
	}
	return { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 };
}
