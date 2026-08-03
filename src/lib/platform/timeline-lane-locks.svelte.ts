import { SvelteSet } from 'svelte/reactivity';

import type { TimelineTrackId } from './timeline-entity-identity';

/**
 * Editor-session lane locks. A locked lane still selects (lock is a review
 * guard, not a blindfold) but refuses clip, keyframe, and video-clip drags.
 * Deliberately not persisted to the Preset — locking protects an editing
 * session, it is not composition content.
 */
export const lockedLaneIds = new SvelteSet<TimelineTrackId>();

export function toggleLaneLock(trackId: TimelineTrackId): void {
	if (!lockedLaneIds.delete(trackId)) lockedLaneIds.add(trackId);
}
