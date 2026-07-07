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

/**
 * On-canvas direct selection (epic 0pkzts2c): a one-shot "reveal this entity
 * in the inspector" request — e.g. `"slot:title"` from clicking a rendered
 * text slot. `seq` bumps on every request so repeat clicks on the same target
 * re-reveal (the target string alone wouldn't change). Consumed by the active
 * inspector via an effect (scroll + focus is a true DOM side effect).
 */
export const inspectorFocus = $state<{ target: string | null; seq: number }>({
	target: null,
	seq: 0
});

export function requestInspectorFocus(target: string): void {
	inspectorFocus.target = target;
	inspectorFocus.seq += 1;
}

export function selectKeyframe(trackId: string, channel: string, index: number): void {
	keyframeSelection.key = `${trackId}:${channel}:${index}`;
}

export function clearKeyframeSelection(): void {
	keyframeSelection.key = null;
}

export function selectLayer(id: string): void {
	layerSelection.id = id;
	keyframeSelection.key = null;
	inspectorFocus.target = null;
}

export function deselectLayer(): void {
	layerSelection.id = null;
	keyframeSelection.key = null;
	inspectorFocus.target = null;
}
