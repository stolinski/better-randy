<script lang="ts">
	import { appendChartCallout, appendChartHighlight } from './chart-authoring';
	import { engineState } from './engine-state.svelte';
	import ChartTargetRow from './ChartTargetRow.svelte';
	import InspectorSection from './InspectorSection.svelte';

	interface Props {
		blockId: string;
		entryKind: 'highlight' | 'callout';
	}

	let { blockId, entryKind }: Props = $props();
	const block = $derived(
		engineState.surface.chart?.items.find((item) => item.id === blockId) ?? null
	);
	const count = $derived(
		block
			? entryKind === 'highlight'
				? (block.highlights?.length ?? 0)
				: (block.callouts?.length ?? 0)
			: 0
	);
	const entries = $derived(
		block ? (entryKind === 'highlight' ? (block.highlights ?? []) : (block.callouts ?? [])) : []
	);

	function removeEntry(index: number): void {
		if (!block) return;
		if (entryKind === 'highlight') block.highlights?.splice(index, 1);
		else block.callouts?.splice(index, 1);
	}
</script>

{#if block}
	<InspectorSection
		label={entryKind === 'highlight' ? 'Highlights' : 'Callouts'}
		summary={`${count}`}
		defaultOpen={false}
	>
		{#each entries as entry, index (entry)}
			<div class="chart-target-entry">
				<div class="chart-target-entry__heading">
					<span>{index + 1}</span>
					<button
						type="button"
						aria-label={`Remove ${entryKind} ${index + 1}`}
						onclick={() => removeEntry(index)}>×</button
					>
				</div>
				<ChartTargetRow {blockId} {entryKind} {index} />
			</div>
		{/each}
		<button
			type="button"
			class="ins-add"
			disabled={count >= (entryKind === 'highlight' ? 24 : 4)}
			onclick={() =>
				entryKind === 'highlight' ? appendChartHighlight(block) : appendChartCallout(block)}
			>+ {entryKind === 'highlight' ? 'Highlight' : 'Callout'}</button
		>
	</InspectorSection>
{/if}

<style>
	.chart-target-entry {
		display: grid;
		gap: var(--vs-xs);
	}

	.chart-target-entry__heading {
		align-items: center;
		color: var(--chrome-muted);
		display: flex;
		font-family: 'Paper Mono', monospace;
		font-size: 0.625rem;
		justify-content: space-between;
	}

	.chart-target-entry__heading button {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 var(--vs-xs);
	}

	.chart-target-entry__heading button:hover {
		color: #f0453d;
	}
</style>
