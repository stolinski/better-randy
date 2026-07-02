import type { Timeline } from './timeline.svelte';

/**
 * Global handle to the live transport. Workspace registers the Timeline it
 * constructs; inspector components that navigate the playhead (the DaVinci-
 * style keyframe rows' prev/next jumps) read it directly — the manager IS the
 * source of truth, no prop-forwarding layers (ADR-0034 §3).
 */
export const timelineHandle = $state<{ current: Timeline | null }>({ current: null });
