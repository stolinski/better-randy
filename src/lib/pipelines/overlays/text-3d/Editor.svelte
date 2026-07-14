<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { Text3dContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<Text3dContent> = $props();
</script>

<Field label="Variant">
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id (id)}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</Field>

<Field label="Text">
	<input bind:value={overlay.content.text} type="text" />
</Field>

<Field label="Rotation (°)">
	<input bind:value={overlay.content.rotationDegrees} type="number" step="5" />
</Field>

<Field label="Radius (ch)">
	<input bind:value={overlay.content.radiusCh} type="number" step="0.25" />
</Field>
