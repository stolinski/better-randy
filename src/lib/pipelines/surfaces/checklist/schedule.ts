import type { ChecklistItem, Ease } from '$lib/platform/engine-schema';

/**
 * Per-item timing for the `checklist` Surface — the build-in entrance and the
 * completion strike — shared by the renderer (CanvasSource), the timeline
 * (Workspace `buildTracks`), and the inspector, so each beat is a real,
 * draggable timeline clip driven by the composition, never a hardcoded
 * component constant. See docs/adr/0040-checklist-surface.md.
 */

// Default staggered build-in cadence (fractions of the clip) materialized when
// an item's build-in is toggled on in the inspector; the preset authors its own.
const BUILD_START = 0.06;
const BUILD_STEP = 0.15;
const BUILD_POP = 0.09;

export function defaultItemEnter(index: number): { start: number; duration: number; ease: Ease } {
	return { start: BUILD_START + index * BUILD_STEP, duration: BUILD_POP, ease: 'settled' };
}

// Materialized when an item flips from a static strike to an animated one
// (inspector mode switch, or dragging a static bar on the timeline): a
// mid-clip, quick decisive draw (~480 ms at the 6 s transport), `sharp` per
// the check-off character.
export function defaultStrikeWindow(): { start: number; duration: number; ease: Ease } {
	return { start: 0.42, duration: 0.08, ease: 'sharp' };
}

/**
 * The item's strike draw progress at clip progress `p` (0..1): 1 for a static
 * checked item, a linear 0..1 ramp across the authored window for an animated
 * one, 0 for an unchecked item. The marks canvas draws the rule itself off the
 * manifest tween (power1.inOut — the pen-drag craft rule); this linear ramp
 * only drives the DOM-side done-dim, where the exact curve is immaterial.
 */
export function strikeProgressAt(item: ChecklistItem, p: number): number {
	if (!item.checked) {
		return 0;
	}
	if (!item.strike) {
		return 1;
	}
	if (item.strike.duration <= 0) {
		return p >= item.strike.start ? 1 : 0;
	}
	return Math.max(0, Math.min(1, (p - item.strike.start) / item.strike.duration));
}

/**
 * Raw 0..1 reveal of an item's build-in entrance at clip progress `p`: 1 when
 * the item has no authored `enter` (it's present from the block's own
 * entrance), else a linear ramp across the item's window. The CanvasSource
 * applies the easing curve (slide overshoot / opacity) — this stays the plain
 * window fraction, like `strikeProgressAt`.
 */
export function itemRevealAt(item: ChecklistItem, p: number): number {
	if (!item.enter) {
		return 1;
	}
	if (item.enter.duration <= 0) {
		return p >= item.enter.start ? 1 : 0;
	}
	return Math.max(0, Math.min(1, (p - item.enter.start) / item.enter.duration));
}
