<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { CursorTrailContent } from './index';

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { overlay = $bindable() }: OverlayEditorProps<CursorTrailContent> = $props();
</script>

<p class="row hint">
	Pointer shape is set by the active Pack (<code>cursor-trail.pointer</code>). Path is edited in the
	JSON preset — each entry names a <code>data-text-anim-slot</code> target.
</p>

<style>
	.hint {
		color: var(--fg-6);
		font-size: 0.85rem;
	}

	code {
		font-family: ui-monospace, monospace;
	}
</style>
