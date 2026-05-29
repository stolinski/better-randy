export interface RenderAnimState {
	bodyVisibility: number;
	markProgresses: number[];
	overlayProgresses: number[];
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
	paperVisibility: 0,
	globalProgress: 0
});

export function syncProgressArray(field: 'markProgresses' | 'overlayProgresses', length: number): void {
	const array = animState[field];

	while (array.length < length) {
		array.push(0);
	}

	while (array.length > length) {
		array.pop();
	}
}
