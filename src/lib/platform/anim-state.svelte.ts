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
	/**
	 * Diagram Block elements (ADR-0036), keyed by element id — id-keyed rather
	 * than index-aligned because ids are the elements' timeline-row / cascade
	 * identities. `blockProgresses` is the ENTER progress (0→1, holds 1): the
	 * stroke draw-on scalar for edge-arrow / timeline-segment and the entrance
	 * form driver for the DOM elements. `blockAlphas` is the EXIT fade
	 * multiplier (1→0 over the exit window) — an exit fades a diagram element,
	 * it never un-draws the stroke. `blockChannels` mirrors `overlayChannels`
	 * for channel-owned elements (ADR-0035 ownership: intrinsic form bypassed).
	 */
	blockProgresses: Record<string, number>;
	blockAlphas: Record<string, number>;
	blockChannels: Record<string, OverlayChannelValues | null>;
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
	blockProgresses: {},
	blockAlphas: {},
	blockChannels: {},
	paperVisibility: 0,
	globalProgress: 0
});

/**
 * Prune diagram-element records to the current id set and seed missing ids —
 * the id-keyed peer of `syncProgressArray`, so a deleted element's stale
 * progress can't ghost back when an id is reused.
 */
export function syncBlockRecords(ids: readonly string[]): void {
	const keep = new Set(ids);
	for (const record of [animState.blockProgresses, animState.blockAlphas, animState.blockChannels]) {
		for (const key of Object.keys(record)) {
			if (!keep.has(key)) {
				delete record[key];
			}
		}
	}
	for (const id of ids) {
		animState.blockProgresses[id] ??= 0;
		animState.blockAlphas[id] ??= 1;
		animState.blockChannels[id] ??= null;
	}
}

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
