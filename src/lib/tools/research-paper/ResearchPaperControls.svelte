<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import ControlGroup from '$lib/platform/ControlGroup.svelte';

	import {
		RESEARCH_PAPER_EASES,
		RESEARCH_PAPER_FONT_FAMILIES,
		researchPaperState,
		type ResearchPaperEase,
		type ResearchPaperFontDefinition,
		type ResearchPaperFontFamily
	} from './research-paper-state.svelte';

	const fontFamilyOptions = Object.entries(RESEARCH_PAPER_FONT_FAMILIES) as [
		ResearchPaperFontFamily,
		ResearchPaperFontDefinition
	][];

	const easeOptions = Object.entries(RESEARCH_PAPER_EASES) as [
		ResearchPaperEase,
		(typeof RESEARCH_PAPER_EASES)[ResearchPaperEase]
	][];
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

	<div class="row">
		<span>Body</span>
		<AnnotationTextEditor
			bind:activeMark={researchPaperState.markStyle}
			bind:value={researchPaperState.body}
			colors={researchPaperState.markColors}
			label="Body"
			rows={10}
		/>
	</div>
</ControlGroup>

<ControlGroup title="Appearance">
	<label class="row">
		<span>Font</span>
		<select bind:value={researchPaperState.fontFamily}>
			{#each fontFamilyOptions as [value, option] (value)}
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

<ControlGroup title="Animation">
	<label class="row">
		<span>Paper ease</span>
		<select bind:value={researchPaperState.animation.paperEntranceEase}>
			{#each easeOptions as [value, option] (value)}
				<option {value}>{option.label}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span>Paper in</span>
		<input
			bind:value={researchPaperState.animation.paperEntranceDuration}
			max="0.6"
			min="0.1"
			step="0.01"
			type="range"
		/>
	</label>
</ControlGroup>
