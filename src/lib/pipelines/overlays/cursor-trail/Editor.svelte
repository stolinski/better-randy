<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { CursorTrailContent } from './index';

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { overlay = $bindable() }: OverlayEditorProps<CursorTrailContent> = $props();
</script>

<p class="hint">
	Pointer shape comes from the active Pack; waypoint dwell timing is on the timeline.
</p>

<style>
	.hint {
		color: var(--fg-6);
		font-size: 0.78rem;
		margin: 0;
	}
</style>
