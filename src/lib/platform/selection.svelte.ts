/**
 * Layer selection store (ADR-0034 §3).
 * Tracks which Layer row is selected in the timeline/canvas.
 * null = composition root → inspector shows transport / Pack / Effects.
 * A string matches a timeline track ID (e.g. 'overlay-abc', 'textanim-xyz').
 */
export const layerSelection = $state<{ id: string | null }>({ id: null });

export function selectLayer(id: string): void {
	layerSelection.id = id;
}

export function deselectLayer(): void {
	layerSelection.id = null;
}
