<script lang="ts">
	import ControlGroup from '$lib/platform/ControlGroup.svelte';

	import {
		QUOTE_FOCUS_CAMERA_MOTIONS,
		QUOTE_FOCUS_FOCUS_STYLES,
		QUOTE_FOCUS_FONT_FAMILIES,
		QUOTE_FOCUS_MARK_STYLES,
		getQuoteFocusSegments,
		quoteFocusState,
		type QuoteFocusFontDefinition,
		type QuoteFocusFontFamily
	} from './quote-focus-state.svelte';

	const fontFamilyOptions = Object.entries(QUOTE_FOCUS_FONT_FAMILIES) as [
		QuoteFocusFontFamily,
		QuoteFocusFontDefinition
	][];
	const matchStatus = $derived.by(() => {
		if (quoteFocusState.quote.trim().length === 0) {
			return '';
		}

		return getQuoteFocusSegments(quoteFocusState.body, quoteFocusState.quote).matched
			? ''
			: 'Quote not found in body.';
	});
</script>

<ControlGroup title="Source">
	<label class="row">
		<span>Body</span>
		<textarea bind:value={quoteFocusState.body} rows="8" spellcheck="true"></textarea>
	</label>

	<label class="row">
		<span>Quote</span>
		<textarea bind:value={quoteFocusState.quote} rows="3" spellcheck="true"></textarea>
	</label>

	{#if matchStatus}
		<p class="quote-focus-controls__status" role="status">{matchStatus}</p>
	{/if}

	<label class="row">
		<span>Author</span>
		<input bind:value={quoteFocusState.author} type="text" />
	</label>

	<label class="row">
		<span>Source</span>
		<input bind:value={quoteFocusState.source} type="text" />
	</label>

	<label class="row">
		<span>Date</span>
		<input bind:value={quoteFocusState.dateLabel} type="text" />
	</label>

	<label class="row">
		<input bind:checked={quoteFocusState.showSourceMetadata} type="checkbox" />
		<span>Show attribution</span>
	</label>
</ControlGroup>

<ControlGroup title="Appearance">
	<label class="row">
		<span>Font</span>
		<select bind:value={quoteFocusState.fontFamily}>
			{#each fontFamilyOptions as [value, option] (value)}
				<option {value}>{option.label}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span>Paper</span>
		<input bind:value={quoteFocusState.paperColor} type="color" />
	</label>

	<label class="row">
		<span>Ink</span>
		<input bind:value={quoteFocusState.inkColor} type="color" />
	</label>

	<label class="row">
		<span>Highlight</span>
		<input bind:value={quoteFocusState.highlightColor} type="color" />
	</label>

	<label class="row">
		<span>Mark</span>
		<input bind:value={quoteFocusState.markColor} type="color" />
	</label>
</ControlGroup>

<ControlGroup title="Focus">
	<label class="row">
		<span>Style</span>
		<select bind:value={quoteFocusState.focusStyle}>
			{#each QUOTE_FOCUS_FOCUS_STYLES as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span>Background</span>
		<input
			bind:value={quoteFocusState.backgroundVisibility}
			max="1"
			min="0"
			step="0.01"
			type="range"
		/>
	</label>

	<label class="row">
		<span>Intensity</span>
		<input bind:value={quoteFocusState.markIntensity} max="1" min="0" step="0.01" type="range" />
	</label>

	<label class="row">
		<span>Mark</span>
		<select bind:value={quoteFocusState.markStyle}>
			{#each QUOTE_FOCUS_MARK_STYLES as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span>Camera</span>
		<select bind:value={quoteFocusState.cameraMotion}>
			{#each QUOTE_FOCUS_CAMERA_MOTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>
</ControlGroup>

<style>
	.quote-focus-controls__status {
		color: var(--fg-6);
		font-size: 0.85rem;
		margin: 0;
	}
</style>
