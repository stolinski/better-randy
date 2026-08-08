<script lang="ts">
	import { CHART_MOTION_PHASE_NAMES, type ChartMotionPhaseName } from '$lib/utils/chart-motion';
	import { formatFractionAsSeconds } from '$lib/utils/string';
	import { updateChartMotionPhase } from './chart-authoring';
	import { engineState } from './engine-state.svelte';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';

	interface Props {
		blockId: string;
	}

	let { blockId }: Props = $props();
	const block = $derived(
		engineState.surface.chart?.items.find((item) => item.id === blockId) ?? null
	);

	function commitTiming(
		event: Event,
		phaseName: ChartMotionPhaseName,
		field: 'start' | 'duration'
	): void {
		if (!block) return;
		const input = event.currentTarget as HTMLInputElement;
		const phase = block.motion[phaseName];
		const next = Number(input.value);
		const accepted = updateChartMotionPhase(
			engineState.surface,
			blockId,
			phaseName,
			field === 'start' ? next : phase.start,
			field === 'duration' ? next : phase.duration
		);
		if (!accepted) {
			input.value = String(phase[field]);
			input.setCustomValidity(
				'Chart phases must remain positive, ordered, and inside the item window.'
			);
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
	}
</script>

{#if block}
	<InspectorSection label="Motion" defaultOpen={false}>
		{#each CHART_MOTION_PHASE_NAMES as phaseName (phaseName)}
			{@const phase = block.motion[phaseName]}
			<fieldset class="chart-phase">
				<legend>{phaseName}</legend>
				<Field label="Start">
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						aria-label={`${phaseName} start`}
						value={phase.start}
						onchange={(event) => commitTiming(event, phaseName, 'start')}
					/>
					<span class="ins-unit"
						>{formatFractionAsSeconds(phase.start, engineState.transport.durationSeconds)}</span
					>
				</Field>
				<Field label="Duration">
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						aria-label={`${phaseName} duration`}
						value={phase.duration}
						onchange={(event) => commitTiming(event, phaseName, 'duration')}
					/>
					<span class="ins-unit"
						>{formatFractionAsSeconds(phase.duration, engineState.transport.durationSeconds)}</span
					>
				</Field>
				<Field label="Ease">
					<select
						aria-label={`${phaseName} ease`}
						value={phase.ease ?? (phaseName === 'emphasis' ? 'sharp' : 'smooth')}
						onchange={(event) => {
							phase.ease = (event.currentTarget as HTMLSelectElement).value as 'smooth' | 'sharp';
						}}
					>
						<option value="smooth">Smooth</option>
						<option value="sharp">Sharp</option>
					</select>
				</Field>
			</fieldset>
		{/each}
	</InspectorSection>
{/if}

<style>
	.chart-phase {
		border: 0;
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-xs);
		margin: 0;
		padding: var(--vs-s) 0 0;
	}

	.chart-phase legend {
		color: var(--chrome-muted);
		font-family: 'Paper Mono', monospace;
		font-size: 0.625rem;
		letter-spacing: 0.08em;
		padding: 0;
		text-transform: capitalize;
	}
</style>
