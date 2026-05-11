<script lang="ts">
	import { tick } from 'svelte';

	import ControlGroup from '$lib/platform/ControlGroup.svelte';
	import { wrapTextSelection } from '$lib/utils/text-selection';

	import { getResearchPaperMarkDelimiters } from './research-paper-content';
	import {
		RESEARCH_PAPER_FONT_FAMILIES,
		researchPaperState,
		type ResearchPaperFontDefinition,
		type ResearchPaperFontFamily,
		type ResearchPaperMarkStyle
	} from './research-paper-state.svelte';

	let bodyInput = $state<HTMLTextAreaElement | null>(null);
	const fontFamilyOptions = Object.entries(RESEARCH_PAPER_FONT_FAMILIES) as [
		ResearchPaperFontFamily,
		ResearchPaperFontDefinition
	][];

	function restoreBodySelection(selectionStart: number, selectionEnd: number): void {
		tick()
			.then(() => {
				bodyInput?.focus();
				bodyInput?.setSelectionRange(selectionStart, selectionEnd);
			})
			.catch((error: unknown) => {
				console.error('Unable to restore research paper body selection.', error);
			});
	}

	function applyBodyMark(style: ResearchPaperMarkStyle): void {
		if (!bodyInput) {
			return;
		}

		const delimiters = getResearchPaperMarkDelimiters(style);
		const edit = wrapTextSelection({
			value: researchPaperState.body,
			selectionStart: bodyInput.selectionStart,
			selectionEnd: bodyInput.selectionEnd,
			opener: delimiters.opener,
			closer: delimiters.closer
		});

		researchPaperState.body = edit.value;
		researchPaperState.markStyle = style;
		restoreBodySelection(edit.selectionStart, edit.selectionEnd);
	}

	function handleHighlightMark(): void {
		applyBodyMark('highlight');
	}

	function handleUnderlineMark(): void {
		applyBodyMark('underline');
	}

	function handleStrikeMark(): void {
		applyBodyMark('strike');
	}

	function handleCircleMark(): void {
		applyBodyMark('circle');
	}
</script>

<ControlGroup title="Document">
	<label class="row">
		<span>Title</span>
		<input bind:value={researchPaperState.title} type="text" />
	</label>

	<label class="row">
		<span>Source</span>
		<input bind:value={researchPaperState.sourceUrl} type="url" />
	</label>

	<label class="row">
		<span>Body</span>
		<div class="body-editor stack">
			<div class="mark-toolbar cluster" aria-label="Body marks">
				<button
					aria-pressed={researchPaperState.markStyle === 'highlight'}
					onclick={handleHighlightMark}
					title="Highlight selection"
					type="button"
				>
					==
				</button>
				<button
					aria-pressed={researchPaperState.markStyle === 'underline'}
					onclick={handleUnderlineMark}
					title="Underline selection"
					type="button"
				>
					U
				</button>
				<button
					aria-pressed={researchPaperState.markStyle === 'strike'}
					onclick={handleStrikeMark}
					title="Strike selection"
					type="button"
				>
					S
				</button>
				<button
					aria-pressed={researchPaperState.markStyle === 'circle'}
					onclick={handleCircleMark}
					title="Circle selection"
					type="button"
				>
					O
				</button>
			</div>
			<textarea bind:this={bodyInput} bind:value={researchPaperState.body} rows="10"></textarea>
		</div>
	</label>
</ControlGroup>

<ControlGroup title="Appearance">
	<label class="row">
		<span>Font</span>
		<select bind:value={researchPaperState.fontFamily}>
			{#each fontFamilyOptions as [value, option]}
				<option {value}>{option.label}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span>Paper</span>
		<input bind:value={researchPaperState.paperColor} type="color" />
	</label>

	<label class="row">
		<span>Ink</span>
		<input bind:value={researchPaperState.inkColor} type="color" />
	</label>
</ControlGroup>

<ControlGroup title="Marks">
	<label class="row">
		<span>Intensity</span>
		<input bind:value={researchPaperState.markIntensity} max="1" min="0" step="0.01" type="range" />
	</label>

	<label class="row">
		<span>Highlight</span>
		<input bind:value={researchPaperState.markColors.highlight} type="color" />
	</label>

	<label class="row">
		<span>Underline</span>
		<input bind:value={researchPaperState.markColors.underline} type="color" />
	</label>

	<label class="row">
		<span>Strike</span>
		<input bind:value={researchPaperState.markColors.strike} type="color" />
	</label>

	<label class="row">
		<span>Circle</span>
		<input bind:value={researchPaperState.markColors.circle} type="color" />
	</label>
</ControlGroup>

<style>
	.body-editor {
		inline-size: 100%;
	}

	.mark-toolbar {
		--layout-gap: var(--space-2xs);
	}

	.mark-toolbar button {
		min-inline-size: 2.5rem;
	}
</style>
