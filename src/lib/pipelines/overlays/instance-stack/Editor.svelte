<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { InstanceStackContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<InstanceStackContent> = $props();
</script>

<Field label="Variant">
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</Field>

<Field label="Text">
	<input bind:value={overlay.content.text} type="text" />
</Field>

<Field label="Count">
	<input bind:value={overlay.content.count} type="number" min="2" max="40" />
</Field>
