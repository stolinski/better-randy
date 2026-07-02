/**
 * Layer selection store (ADR-0034 §3).
 * Tracks which Layer row is selected in the timeline/canvas.
 * null = composition root → inspector shows transport / Pack / Effects.
 * A string matches a timeline track ID (e.g. 'overlay-abc', 'textanim-xyz').
 */
export const layerSelection = $state<{ id: string | null }>({ id: null });

/**
 * The selected keyframe diamond (ADR-0035 §7) — `"<trackId>:<channel>:<index>"`
 * or null. Set by clicking/dragging a diamond on the timeline; the timeline
 * renders it active and the inspector's keyframe rows reflect it.
 */
export const keyframeSelection = $state<{ key: string | null }>({ key: null });

export function selectKeyframe(trackId: string, channel: string, index: number): void {
	keyframeSelection.key = `${trackId}:${channel}:${index}`;
}

export function clearKeyframeSelection(): void {
	keyframeSelection.key = null;
}

export function selectLayer(id: string): void {
	layerSelection.id = id;
	keyframeSelection.key = null;
}

export function deselectLayer(): void {
	layerSelection.id = null;
	keyframeSelection.key = null;
}
