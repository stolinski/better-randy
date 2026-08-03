<script lang="ts">
	import { ENGINE_EASES, type Ease, type Transition } from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import { formatFractionAsSeconds } from '$lib/utils/string';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	// The shared Enter/Exit window editor: one motion's start/duration/ease
	// with its enable toggle. `transition` is a live engine-state proxy — the
	// fields mutate in place; `ontoggle` owns materializing / clearing the
	// window on the parent model (defaults differ per Layer).
	interface Props {
		label: 'Enter' | 'Exit';
		transition: Transition | undefined;
		ontoggle: (checked: boolean) => void;
	}

	let { label, transition, ontoggle }: Props = $props();

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	function clampedFraction(value: string): number | null {
		const n = Number(value);
		return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
	}

	function handleInput(key: 'start' | 'duration', event: Event): void {
		if (!transition) return;
		const n = clampedFraction((event.currentTarget as HTMLInputElement).value);
		if (n !== null) transition[key] = n;
	}
</script>

<InspectorSection {label}>
	{#snippet action()}
		<InspectorToggle
			checked={transition !== undefined}
			label={`${label} transition`}
			onchange={ontoggle}
		/>
	{/snippet}
	{#if transition}
		<Field label="Start">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={transition.start}
				oninput={(e) => handleInput('start', e)}
			/>
			<span class="ins-unit"
				>{formatFractionAsSeconds(transition.start, engineState.transport.durationSeconds)}</span
			>
		</Field>
		<Field label="Duration">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={transition.duration}
				oninput={(e) => handleInput('duration', e)}
			/>
			<span class="ins-unit"
				>{formatFractionAsSeconds(transition.duration, engineState.transport.durationSeconds)}</span
			>
		</Field>
		<Field label="Ease">
			<select
				value={transition.ease}
				onchange={(e) => {
					if (transition) transition.ease = (e.currentTarget as HTMLSelectElement).value as Ease;
				}}
			>
				{#each easeOptions as [value, option] (value)}
					<option {value}>{option.label}</option>
				{/each}
			</select>
		</Field>
	{/if}
</InspectorSection>
