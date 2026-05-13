<script lang="ts">
	import ControlGroup from '$lib/platform/ControlGroup.svelte';
	import type { TimelineSelection } from '$lib/platform/timeline.svelte';

	import {
		RESEARCH_PAPER_EASES,
		RESEARCH_PAPER_FONT_FAMILIES,
		researchPaperState,
		type ResearchPaperEase,
		type ResearchPaperFontDefinition,
		type ResearchPaperFontFamily,
		type ResearchPaperMarkStyle
	} from './research-paper-state.svelte';

	interface Props {
		selection: TimelineSelection;
	}

	const MARK_STYLE_LABELS: Record<ResearchPaperMarkStyle, string> = {
		highlight: 'Highlight',
		underline: 'Underline',
		strike: 'Strike',
		circle: 'Circle'
	};

	const PAPER_TRANSITION_LABELS: Record<'enter' | 'exit', string> = {
		enter: 'Paper in',
		exit: 'Paper out'
	};

	let { selection }: Props = $props();

	const fontFamilyOptions = Object.entries(RESEARCH_PAPER_FONT_FAMILIES) as [
		ResearchPaperFontFamily,
		ResearchPaperFontDefinition
	][];

	const easeOptions = Object.entries(RESEARCH_PAPER_EASES) as [
		ResearchPaperEase,
		(typeof RESEARCH_PAPER_EASES)[ResearchPaperEase]
	][];

	const markIndex = $derived.by(() => {
		const match = selection.trackId.match(/^mark-(\d+)$/);
		return match ? Number.parseInt(match[1], 10) : null;
	});

	const mark = $derived(
		markIndex === null ? null : researchPaperState.animation.marks[markIndex] ?? null
	);

	const paperTransition = $derived.by(() => {
		if (selection.trackId !== 'paper') {
			return null;
		}

		if (selection.transitionId === 'enter') {
			return researchPaperState.animation.paper.enter;
		}

		if (selection.transitionId === 'exit') {
			return researchPaperState.animation.paper.exit;
		}

		return null;
	});

	const paperTransitionLabel = $derived(
		selection.transitionId === 'enter' || selection.transitionId === 'exit'
			? PAPER_TRANSITION_LABELS[selection.transitionId]
			: ''
	);
</script>

{#if selection.trackId === 'paper' && selection.transitionId === null}
	<ControlGroup title="Paper">
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
{:else if paperTransition}
	<ControlGroup title={paperTransitionLabel}>
		<label class="row">
			<span>Ease</span>
			<select bind:value={paperTransition.ease}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</ControlGroup>
{:else if mark}
	<ControlGroup title={MARK_STYLE_LABELS[mark.style]}>
		<label class="row">
			<span>Color</span>
			<input bind:value={mark.color} type="color" />
		</label>

		<label class="row">
			<span>Intensity</span>
			<input bind:value={mark.intensity} max="1" min="0" step="0.01" type="range" />
		</label>

		<label class="row">
			<span>Ease</span>
			<select bind:value={mark.ease}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</ControlGroup>
{/if}
