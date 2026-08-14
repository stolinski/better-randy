<script lang="ts">
	import {
		appendChartCategory,
		appendChartSeries,
		removeChartCategory,
		removeChartSeries,
		renameChartCategory,
		renameChartSeries,
		setChartDatumValue
	} from './chart-authoring';
	import { CHART_CATEGORY_LIMIT, CHART_SERIES_LIMIT } from './engine-schema';
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

	function commitRequiredText(
		event: Event,
		currentValue: string,
		commit: (value: string) => void
	): void {
		const input = event.currentTarget as HTMLInputElement;
		const value = input.value.trim();
		if (!value) {
			input.value = currentValue;
			input.setCustomValidity('A value is required.');
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
		commit(value);
	}

	function commitCategoryId(event: Event, previousId: string): void {
		if (!block) return;
		const input = event.currentTarget as HTMLInputElement;
		if (!renameChartCategory(block, previousId, input.value)) {
			input.value = previousId;
			input.setCustomValidity('Category IDs must be non-empty and unique.');
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
	}

	function commitSeriesId(event: Event, previousId: string): void {
		if (!block) return;
		const input = event.currentTarget as HTMLInputElement;
		if (!renameChartSeries(block, previousId, input.value)) {
			input.value = previousId;
			input.setCustomValidity('Series IDs must be non-empty and unique.');
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
	}

	function commitDatumValue(
		event: Event,
		seriesId: string,
		categoryId: string,
		current: number
	): void {
		if (!block) return;
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		if (!setChartDatumValue(block, seriesId, categoryId, value)) {
			input.value = String(current);
			input.setCustomValidity('Value must be finite and valid for this chart layout and domain.');
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
	}
</script>

{#if block}
	<InspectorSection label="Categories" summary={`${block.data.categories.length}`}>
		{#each block.data.categories as category, categoryIndex (category)}
			<div class="chart-row">
				<div class="chart-row__heading">
					<span>{categoryIndex + 1}</span>
					<button
						type="button"
						aria-label={`Remove ${category.label}`}
						disabled={block.data.categories.length === 1}
						onclick={() => removeChartCategory(block, category.id)}>×</button
					>
				</div>
				<Field label="ID">
					<input
						type="text"
						aria-label={`Category ${categoryIndex + 1} ID`}
						value={category.id}
						onchange={(event) => commitCategoryId(event, category.id)}
					/>
				</Field>
				<Field label="Label">
					<input
						type="text"
						aria-label={`Category ${categoryIndex + 1} label`}
						value={category.label}
						onchange={(event) =>
							commitRequiredText(event, category.label, (value) => (category.label = value))}
					/>
				</Field>
			</div>
		{/each}
		<button
			type="button"
			class="ins-add"
			disabled={block.data.categories.length >= CHART_CATEGORY_LIMIT}
			onclick={() => appendChartCategory(block)}>+ Category</button
		>
	</InspectorSection>

	<InspectorSection label="Series" summary={`${block.data.series.length}`}>
		{#each block.data.series as series, seriesIndex (series)}
			<div class="chart-row">
				<div class="chart-row__heading">
					<span>{seriesIndex + 1}</span>
					<button
						type="button"
						aria-label={`Remove ${series.label}`}
						disabled={block.data.series.length === 1}
						onclick={() => removeChartSeries(block, series.id)}>×</button
					>
				</div>
				<Field label="ID">
					<input
						type="text"
						aria-label={`Series ${seriesIndex + 1} ID`}
						value={series.id}
						onchange={(event) => commitSeriesId(event, series.id)}
					/>
				</Field>
				<Field label="Label">
					<input
						type="text"
						aria-label={`Series ${seriesIndex + 1} label`}
						value={series.label}
						onchange={(event) =>
							commitRequiredText(event, series.label, (value) => (series.label = value))}
					/>
				</Field>
				{#each block.data.categories as category (category)}
					{@const datum = series.values.find((entry) => entry.categoryId === category.id)}
					{#if datum}
						<Field label={category.label}>
							<input
								type="number"
								step="any"
								min={block.type === 'unit-grid-chart' ||
								block.type === 'dot-field-chart' ||
								((block.type === 'bar-chart' || block.type === 'column-chart') &&
									block.layout.mode === 'stacked')
									? 0
									: undefined}
								aria-label={`${series.label}, ${category.label} value`}
								value={datum.value}
								onchange={(event) => commitDatumValue(event, series.id, category.id, datum.value)}
							/>
						</Field>
					{/if}
				{/each}
			</div>
		{/each}
		{#if block.type === 'bar-chart' || block.type === 'column-chart' || block.type === 'line-chart'}
			<button
				type="button"
				class="ins-add"
				disabled={block.data.series.length >= CHART_SERIES_LIMIT}
				onclick={() => appendChartSeries(block)}>+ Series</button
			>
		{/if}
	</InspectorSection>
{/if}

<style>
	.chart-row {
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-s);
	}

	.chart-row__heading {
		align-items: center;
		color: var(--chrome-muted);
		display: flex;
		font-family: 'Paper Mono', monospace;
		font-size: 0.625rem;
		justify-content: space-between;
	}

	.chart-row__heading button {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 var(--vs-xs);
	}

	.chart-row__heading button:hover:not(:disabled) {
		color: #f0453d;
	}

	.chart-row__heading button:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
</style>
