<script lang="ts">
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

	import { ENGINE_EASES, resolveMarkForIndex, type Ease } from './engine-schema';
	import { engineState, ensureMarkTimingAtIndex } from './engine-state.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

	interface Props {
		markIndex: number;
	}

	let { markIndex }: Props = $props();

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
		isolate: 'Isolate'
	};

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

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

	const parsedMark = $derived(parsedMarks[markIndex] ?? null);

	const resolved = $derived.by(() => {
		if (!parsedMark) {
			return null;
		}

		return resolveMarkForIndex(parsedMark.style, markIndex, engineState.marks);
	});

	function handleColorInput(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const timing = ensureMarkTimingAtIndex(markIndex);
		timing.color = target.value;
	}

	function handleIntensityInput(event: Event): void {
		const target = event.currentTarget as HTMLInputElement;
		const timing = ensureMarkTimingAtIndex(markIndex);
		timing.intensity = Number(target.value);
	}

	function handleEaseChange(event: Event): void {
		const target = event.currentTarget as HTMLSelectElement;
		const timing = ensureMarkTimingAtIndex(markIndex);
		timing.ease = target.value as Ease;
	}
</script>

{#if resolved && parsedMark}
	<InspectorSection label={MARK_STYLE_LABELS[parsedMark.style]}>
		<Field label="Text">
			<span class="field-text">{parsedMark.text}</span>
		</Field>
	</InspectorSection>

	<InspectorSection label="Appearance">
		<Field label="Color">
			<input value={resolved.color} oninput={handleColorInput} type="color" />
		</Field>
		<Field label="Intensity">
			<input
				value={resolved.intensity}
				max="1"
				min="0"
				step="0.01"
				type="range"
				oninput={handleIntensityInput}
			/>
		</Field>
		<Field label="Ease">
			<select value={resolved.ease} onchange={handleEaseChange}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</Field>
	</InspectorSection>
{/if}

<style>
	.field-text {
		color: var(--fg-3);
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
