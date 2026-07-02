/**
 * Live values of an overlay's authored motion channels (ADR-0035). Present
 * only for overlays that declare `animation.channels` — the composition owns
 * that overlay's motion, so OverlayMount styles from these values INSTEAD of
 * the intrinsic visibilityStyle fade-through. Undeclared channels hold their
 * neutral/static seed (opacity 1, x/y 0, scale/rotation from `position`).
 */
export interface OverlayChannelValues {
	opacity: number;
	x: number;
	y: number;
	scale: number;
	rotation: number;
}

export interface RenderAnimState {
	bodyVisibility: number;
	markProgresses: number[];
	overlayProgresses: number[];
	/**
	 * Index-aligned with `engineState.overlays`; null for overlays without
	 * authored channels (they ride `overlayProgresses` + the intrinsic
	 * motion-form).
	 */
	overlayChannels: (OverlayChannelValues | null)[];
	paperVisibility: number;
	/**
	 * Global timeline progress in [0, 1] — the fraction of the transport
	 * duration the playhead has covered. Distinct from per-overlay
	 * enter/exit progress in `overlayProgresses`; this is the wall-of-the-
	 * composition time that overlays needing whole-timeline awareness
	 * (cursor-trail traversal, counter target value resolution) read.
	 */
	globalProgress: number;
}

export const animState = $state<RenderAnimState>({
	bodyVisibility: 0,
	markProgresses: [],
	overlayProgresses: [],
	overlayChannels: [],
	paperVisibility: 0,
	globalProgress: 0
});

export function syncProgressArray(
	field: 'markProgresses' | 'overlayProgresses',
	length: number
): void {
	const array = animState[field];

	while (array.length < length) {
		array.push(0);
	}

	while (array.length > length) {
		array.pop();
	}
}
