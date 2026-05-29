<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { CounterContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';

	let { overlay = $bindable() }: OverlayEditorProps<CounterContent> = $props();
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
	<span>From</span>
	<input bind:value={overlay.content.from} type="number" step="1" />
</label>

<label class="row">
	<span>To</span>
	<input bind:value={overlay.content.to} type="number" step="1" />
</label>

<label class="row">
	<span>Format</span>
	<select bind:value={overlay.content.format}>
		<option value="integer">Integer</option>
		<option value="currency">Currency</option>
		<option value="percent">Percent</option>
		<option value="timecode">Timecode</option>
	</select>
</label>
