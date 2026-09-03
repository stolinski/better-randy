<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { DimensionalTypeContent } from './index';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<DimensionalTypeContent> = $props();
</script>

<Field label="Text">
	<input bind:value={overlay.content.text} type="text" maxlength="64" />
</Field>

<Field label="Size">
	<input bind:value={overlay.content.size} type="number" min="0.03" max="0.4" step="0.01" />
</Field>

<Field label="Depth">
	<input bind:value={overlay.content.depth} type="number" min="0" max="1.5" step="0.05" />
</Field>

<Field label="Bevel">
	<input bind:value={overlay.content.bevel} type="number" min="0" max="0.3" step="0.01" />
</Field>

<Field label="Lift">
	<input bind:value={overlay.content.lift} type="number" min="0" max="3" step="0.1" />
</Field>

<Field label="Lean°">
	<input bind:value={overlay.content.lean} type="number" min="0" max="45" step="1" />
</Field>
