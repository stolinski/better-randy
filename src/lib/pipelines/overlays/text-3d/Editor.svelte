<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { Text3dContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';

	let { overlay = $bindable() }: OverlayEditorProps<Text3dContent> = $props();
</script>

<label class="row">
	<span>Variant</span>
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</label>

<label class="row">
	<span>Text</span>
	<input bind:value={overlay.content.text} type="text" />
</label>

<label class="row">
	<span>Rotation (°)</span>
	<input bind:value={overlay.content.rotationDegrees} type="number" step="5" />
</label>

<label class="row">
	<span>Radius (ch)</span>
	<input bind:value={overlay.content.radiusCh} type="number" step="0.25" />
</label>
