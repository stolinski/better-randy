<script lang="ts">
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

	import { ENGINE_EASES, resolveMarkForIndex, type Ease } from './engine-schema';
	import { engineState, ensureMarkTimingAtIndex } from './engine-state.svelte';

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
	<div class="section">
		<div class="section__header">
			<span class="section__label">{MARK_STYLE_LABELS[parsedMark.style]}</span>
		</div>
		<div class="field-row">
			<span class="field-label">Text</span>
			<span class="field-text">{parsedMark.text}</span>
		</div>
	</div>

	<div class="section">
		<div class="section__header">
			<span class="section__label">Color</span>
		</div>
		<div class="field-row">
			<span class="field-label">Color</span>
			<input value={resolved.color} oninput={handleColorInput} type="color" />
		</div>
	</div>

	<div class="section">
		<div class="section__header">
			<span class="section__label">Intensity</span>
		</div>
		<div class="field-row">
			<span class="field-label">Intensity</span>
			<input
				value={resolved.intensity}
				max="1"
				min="0"
				step="0.01"
				type="range"
				oninput={handleIntensityInput}
			/>
		</div>
	</div>

	<div class="section">
		<div class="section__header">
			<span class="section__label">Ease</span>
		</div>
		<div class="field-row">
			<span class="field-label">Ease</span>
			<select value={resolved.ease} onchange={handleEaseChange}>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</div>
{/if}

<style>
	.section {
		border-block-end: var(--border-1);
		display: grid;
		gap: var(--vs-xs);
		padding: var(--vs-s) var(--vs-base);
	}

	.section__header {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
		justify-content: space-between;
		padding-block-end: var(--vs-xs);
	}

	.section__label {
		color: var(--fg-5);
		font-size: 0.7rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.field-row {
		align-items: center;
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: 5rem 1fr;
	}

	.field-label {
		color: var(--fg-6);
		font-size: 0.8rem;
	}

	.field-text {
		color: var(--fg-3);
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
