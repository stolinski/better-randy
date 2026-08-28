// Even the reader module may not resurrect a rename-now value: the deterministic
// capture handles moved to the GFX spelling with every consumer in one change.
export function readTimelineHandle(scope: Record<string, unknown>): unknown {
	return scope['__supersTimeline'];
}
