/**
 * Timeline entity selection store (ADR-0034 §3).
 * Tracks selected Layer rows, Sound references, and Video clips in the timeline/canvas.
 * null = composition root → inspector shows transport / Pack / Effects.
 * Runtime selection IDs are created and parsed by timeline-entity-identity.ts.
 */
import {
	createKeyframeSelectionId,
	createSoundRailReferenceId,
	createVideoClipSelectionId,
	type KeyframeSelectionId,
	type SoundRailReference,
	type TimelineEntitySelectionId,
	type TimelineTrackId
} from './timeline-entity-identity.ts';

export const layerSelection = $state<{ id: TimelineEntitySelectionId | null }>({ id: null });

/**
 * The selected keyframe diamond (ADR-0035 §7). Set by clicking/dragging a
 * diamond on the timeline; the timeline renders it active and the inspector's
 * keyframe rows reflect it.
 */
export const keyframeSelection = $state<{ id: KeyframeSelectionId | null }>({ id: null });

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

export function selectKeyframe(trackId: TimelineTrackId, channel: string, index: number): void {
	keyframeSelection.id = createKeyframeSelectionId(trackId, channel, index);
}

export function clearKeyframeSelection(): void {
	keyframeSelection.id = null;
}

export function selectLayer(id: TimelineTrackId): void {
	layerSelection.id = id;
	keyframeSelection.id = null;
	inspectorFocus.target = null;
}

export function selectSoundRailReference(reference: SoundRailReference): void {
	layerSelection.id = createSoundRailReferenceId(reference);
	keyframeSelection.id = null;
	inspectorFocus.target = null;
}

export function selectVideoClip(clipId: string): void {
	layerSelection.id = createVideoClipSelectionId(clipId);
	keyframeSelection.id = null;
	inspectorFocus.target = null;
}

export function deselectLayer(): void {
	layerSelection.id = null;
	keyframeSelection.id = null;
	inspectorFocus.target = null;
}
