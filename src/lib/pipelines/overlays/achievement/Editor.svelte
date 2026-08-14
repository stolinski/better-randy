<script lang="ts">
	import Field from '$lib/platform/Field.svelte';
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';

	import type { AchievementContent } from './achievement-content';
	import {
		isAchievementVariantId,
		setAchievementBeat,
		setAchievementVariant,
		VARIANT_IDS,
		VARIANTS
	} from './variants';

	let { overlay = $bindable() }: OverlayEditorProps<AchievementContent> = $props();

	function updateVariant(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (isAchievementVariantId(value)) {
			setAchievementVariant(overlay.content, value);
		}
	}
</script>

<Field label="Variant">
	<select value={overlay.content.variant} onchange={updateVariant}>
		{#each VARIANT_IDS as variant (variant)}
			<option value={variant}>{VARIANTS[variant].label}</option>
		{/each}
	</select>
</Field>

<Field label="Kicker">
	<input bind:value={overlay.content.kicker} type="text" />
</Field>

<Field label="Title">
	<input bind:value={overlay.content.title} type="text" />
</Field>

<Field label="Completion beat">
	<input
		value={overlay.content.beat}
		oninput={(event) => setAchievementBeat(overlay.content, event.currentTarget.valueAsNumber)}
		type="number"
		min="0"
		max="1"
		step="0.0025"
	/>
</Field>
