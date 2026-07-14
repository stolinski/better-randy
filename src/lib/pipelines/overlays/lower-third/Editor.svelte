<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { LowerThirdContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<LowerThirdContent> = $props();

	function handleSubtitleInput(event: Event): void {
		const next = (event.currentTarget as HTMLInputElement).value;
		overlay.content.subtitle = next.length > 0 ? next : undefined;
	}

	function handleKickerInput(event: Event): void {
		const next = (event.currentTarget as HTMLInputElement).value;
		overlay.content.kicker = next.length > 0 ? next : undefined;
	}
</script>

<Field label="Variant">
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id (id)}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</Field>

<Field label="Kicker">
	<input value={overlay.content.kicker ?? ''} oninput={handleKickerInput} type="text" />
</Field>

<Field label="Title">
	<input bind:value={overlay.content.title} type="text" />
</Field>

<Field label="Subtitle">
	<input value={overlay.content.subtitle ?? ''} oninput={handleSubtitleInput} type="text" />
</Field>
