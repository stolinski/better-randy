<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { CounterContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<CounterContent> = $props();
</script>

<Field label="Variant">
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</Field>

<Field label="From">
	<input bind:value={overlay.content.from} type="number" step="1" />
</Field>

<Field label="To">
	<input bind:value={overlay.content.to} type="number" step="1" />
</Field>

<Field label="Format">
	<select bind:value={overlay.content.format}>
		<option value="integer">Integer</option>
		<option value="currency">Currency</option>
		<option value="percent">Percent</option>
		<option value="timecode">Timecode</option>
	</select>
</Field>
