<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { CursorTrailContent } from './index';

	let { overlay = $bindable() }: OverlayEditorProps<CursorTrailContent> = $props();
</script>

<label class="row">
	<span>Pointer</span>
	<select bind:value={overlay.content.pointer}>
		<option value="mac-pointer">Mac pointer</option>
		<option value="arrow">Arrow</option>
		<option value="crosshair">Crosshair</option>
		<option value="hand-pointer">Hand</option>
	</select>
</label>

<p class="row hint">Path is edited in the JSON preset — each entry names a <code>data-text-anim-slot</code> target.</p>

<style>
	.hint {
		color: var(--fg-6);
		font-size: 0.85rem;
	}

	code {
		font-family: ui-monospace, monospace;
	}
</style>
