<script lang="ts">
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

	import ControlGroup from './ControlGroup.svelte';
	import {
		ENGINE_EASES,
		resolveMarkForIndex,
		type Ease
	} from './engine-schema';
	import { engineState, ensureMarkTimingAtIndex } from './engine-state.svelte';
	import type { TimelineSelection } from './timeline.svelte';

	interface Props {
		selection: TimelineSelection;
	}

	let { selection }: Props = $props();

	const MARK_STYLE_LABELS: Record<AnnotationMarkStyle, string> = {
		highlight: 'Highlight',
		underline: 'Underline',
		strike: 'Strike',
		circle: 'Circle',
		box: 'Box',
		'side-note': 'Side note',
		magnify: 'Magnify',
		'lift-out': 'Lift out',
		'tear-out': 'Tear out',
		isolate: 'Isolate',
		callout: 'Callout'
	};

	const SURFACE_TRANSITION_LABELS: Record<'enter' | 'exit', string> = {
		enter: 'Surface in',
		exit: 'Surface out'
	};

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	const markIndex = $derived.by(() => {
		const match = selection.trackId.match(/^mark-(\d+)$/);
		return match ? Number.parseInt(match[1], 10) : null;
	});

	const parsedMarks = $derived.by(() => {
		const result: { style: AnnotationMarkStyle; text: string }[] = [];

		for (const block of engineState.surface.content.body) {
			if (block.type !== 'paragraph') {
				continue;
			}

			for (const segment of block.segments) {
				for (const style of segment.markStyles) {
					result.push({ style, text: segment.text });
				}
			}
		}

		return result;
	});

	const parsedMark = $derived.by(() => {
		if (markIndex === null) {
			return null;
		}

		return parsedMarks[markIndex] ?? null;
	});

	const resolved = $derived.by(() => {
		if (markIndex === null || !parsedMark) {
			return null;
		}

		return resolveMarkForIndex(parsedMark.style, markIndex, engineState.marks);
	});

	const surfaceTransition = $derived.by(() => {
		if (selection.trackId !== 'surface') {
			return null;
		}

		if (selection.transitionId === 'enter') {
			return engineState.surface.enter ?? null;
		}

		if (selection.transitionId === 'exit') {
			return engineState.surface.exit ?? null;
		}

		return null;
	});

	const surfaceTransitionLabel = $derived(
		selection.transitionId === 'enter' || selection.transitionId === 'exit'
			? SURFACE_TRANSITION_LABELS[selection.transitionId]
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

{#if surfaceTransition}
	<ControlGroup title={surfaceTransitionLabel}>
		<label class="row">
			<span>Ease</span>
			<select bind:value={surfaceTransition.ease}>
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
