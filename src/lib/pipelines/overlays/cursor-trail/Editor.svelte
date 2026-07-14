<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { CursorTrailContent } from './index';

	let { overlay }: OverlayEditorProps<CursorTrailContent> = $props();
</script>

<p class="hint" data-overlay-type={overlay.type}>
	Pointer shape comes from the active Pack; waypoint dwell timing is on the timeline.
</p>

<style>
	.hint {
		color: var(--fg-6);
		font-size: 0.78rem;
		margin: 0;
	}
</style>
