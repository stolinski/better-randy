<script lang="ts">
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-marks';
	import ControlGroup from '$lib/platform/ControlGroup.svelte';
	import {
		ENGINE_EASES,
		ENGINE_FONT_FAMILIES,
		resolveMarkForIndex,
		type Ease,
		type FontDefinition,
		type FontFamily
	} from '$lib/platform/engine-schema';
	import {
		engineState,
		ensureMarkTimingAtIndex,
		getResearchPaperSurface
	} from '$lib/platform/engine-state.svelte';
	import type { TimelineSelection } from '$lib/platform/timeline.svelte';

	import { readResearchPaperMarks } from './research-paper-animation.svelte';

	interface Props {
		selection: TimelineSelection;
	}

	const MARK_STYLE_LABELS: Record<AnnotationMarkStyle, string> = {
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

	const fontFamilyOptions = Object.entries(ENGINE_FONT_FAMILIES) as [FontFamily, FontDefinition][];

	const easeOptions = Object.entries(ENGINE_EASES) as [
		Ease,
		(typeof ENGINE_EASES)[Ease]
	][];

	const surface = $derived(getResearchPaperSurface());

	const markIndex = $derived.by(() => {
		const match = selection.trackId.match(/^mark-(\d+)$/);
		return match ? Number.parseInt(match[1], 10) : null;
	});

	const parsedMark = $derived.by(() => {
		if (markIndex === null) {
			return null;
		}

		const marks = readResearchPaperMarks();
		return marks[markIndex] ?? null;
	});

	const resolved = $derived.by(() => {
		if (markIndex === null || !parsedMark) {
			return null;
		}

		return resolveMarkForIndex(parsedMark.style, markIndex, engineState.marks);
	});

	const paperTransition = $derived.by(() => {
		if (selection.trackId !== 'paper') {
			return null;
		}

		if (selection.transitionId === 'enter') {
			return surface.enter;
		}

		if (selection.transitionId === 'exit') {
			return surface.exit;
		}

		return null;
	});

	const paperTransitionLabel = $derived(
		selection.transitionId === 'enter' || selection.transitionId === 'exit'
			? PAPER_TRANSITION_LABELS[selection.transitionId]
			: ''
	);

	function handleColorInput(event: Event): void {
		if (markIndex === null) {
			return;
		}

		const target = event.currentTarget as HTMLInputElement;
		const timing = ensureMarkTimingAtIndex(markIndex);

		timing.color = target.value;
	}

	function handleIntensityInput(event: Event): void {
		if (markIndex === null) {
			return;
		}

		const target = event.currentTarget as HTMLInputElement;
		const timing = ensureMarkTimingAtIndex(markIndex);

		timing.intensity = Number(target.value);
	}

	function handleEaseChange(event: Event): void {
		if (markIndex === null) {
			return;
		}

		const target = event.currentTarget as HTMLSelectElement;
		const timing = ensureMarkTimingAtIndex(markIndex);

		timing.ease = target.value as Ease;
	}
</script>

{#if selection.trackId === 'paper' && selection.transitionId === null}
	<ControlGroup title="Paper">
		<label class="row">
			<span>Font</span>
			<select bind:value={engineState.typography.fontFamily}>
				{#each fontFamilyOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</label>

		<label class="row">
			<span>Paper</span>
			<input bind:value={engineState.typography.paperColor} type="color" />
		</label>

		<label class="row">
			<span>Ink</span>
			<input bind:value={engineState.typography.inkColor} type="color" />
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
{:else if resolved && parsedMark}
	<ControlGroup title={MARK_STYLE_LABELS[parsedMark.style]}>
		<label class="row">
			<span>Color</span>
			<input value={resolved.color} oninput={handleColorInput} type="color" />
		</label>

		<label class="row">
			<span>Intensity</span>
			<input
				value={resolved.intensity}
				max="1"
				min="0"
				step="0.01"
				type="range"
				oninput={handleIntensityInput}
			/>
		</label>

		<label class="row">
			<span>Ease</span>
			<select value={resolved.ease} onchange={handleEaseChange}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</label>
	</ControlGroup>
{/if}
