<script lang="ts">
	import { resolveChartDataTarget } from '$lib/utils/chart-data-target';
	import { createChartTarget, type ChartTargetKind } from './chart-authoring';
	import { engineState } from './engine-state.svelte';
	import type { ChartCallout, ChartDataTarget } from './engine-schema';
	import Field from './Field.svelte';

	interface Props {
		blockId: string;
		entryKind: 'highlight' | 'callout';
		index: number;
	}

	let { blockId, entryKind, index }: Props = $props();
	const block = $derived(
		engineState.surface.chart?.items.find((item) => item.id === blockId) ?? null
	);
	const target = $derived.by((): ChartDataTarget | null => {
		if (!block) return null;
		return entryKind === 'highlight'
			? (block.highlights?.[index]?.target ?? null)
			: (block.callouts?.[index]?.target ?? null);
	});
	const callout = $derived(
		entryKind === 'callout' && block ? (block.callouts?.[index] ?? null) : null
	);

	function replaceTarget(next: ChartDataTarget): void {
		if (!block) return;
		if (entryKind === 'highlight') {
			const entry = block.highlights?.[index];
			if (entry) entry.target = next;
		} else {
			const entry = block.callouts?.[index];
			if (entry) entry.target = next;
		}
	}

	function changeTargetKind(event: Event): void {
		if (!block) return;
		const select = event.currentTarget as HTMLSelectElement;
		const next = createChartTarget(block, select.value as ChartTargetKind);
		if (!next) {
			select.value = target?.kind ?? 'datum';
			select.setCustomValidity('Category sets require at least two categories.');
			select.reportValidity();
			return;
		}
		select.setCustomValidity('');
		replaceTarget(next);
	}

	function changeSeries(event: Event): void {
		if (!target) return;
		const seriesId = (event.currentTarget as HTMLSelectElement).value;
		replaceTarget({ ...target, seriesId });
		ensureFormatterValidity();
	}

	function changeDatumCategory(event: Event): void {
		if (!target || target.kind !== 'datum') return;
		replaceTarget({ ...target, categoryId: (event.currentTarget as HTMLSelectElement).value });
		ensureFormatterValidity();
	}

	function toggleCategorySet(categoryId: string, checked: boolean, input: HTMLInputElement): void {
		if (!target || target.kind !== 'category-set') return;
		const categoryIds = checked
			? [...new Set([...target.categoryIds, categoryId])]
			: target.categoryIds.filter((id) => id !== categoryId);
		if (categoryIds.length < 2) {
			input.checked = true;
			input.setCustomValidity('Select at least two categories.');
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
		replaceTarget({ ...target, categoryIds });
		ensureFormatterValidity();
	}

	function formatterIsValid(kind: ChartCallout['valueLabel']['kind']): boolean {
		if (!block || !target || kind === 'value') return true;
		const resolved = resolveChartDataTarget(block, target);
		if (resolved.seriesTotal <= 0) return false;
		if (kind === 'approximate-fraction-and-percent') {
			const ratio = resolved.value / resolved.seriesTotal;
			return ratio > 0 && ratio <= 1;
		}
		return true;
	}

	function ensureFormatterValidity(): void {
		if (callout && !formatterIsValid(callout.valueLabel.kind)) {
			callout.valueLabel = { kind: 'value' };
		}
	}

	function commitFormatterNumber(
		event: Event,
		field: 'precision' | 'maxDenominator',
		minimum: number,
		maximum: number
	): void {
		if (!callout || callout.valueLabel.kind === 'value') return;
		const input = event.currentTarget as HTMLInputElement;
		const previous =
			field === 'precision'
				? callout.valueLabel.precision
				: callout.valueLabel.kind === 'approximate-fraction-and-percent'
					? callout.valueLabel.maxDenominator
					: minimum;
		const value = Number(input.value);
		if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
			input.value = String(previous);
			input.setCustomValidity(`Value must be an integer from ${minimum} through ${maximum}.`);
			input.reportValidity();
			return;
		}
		input.setCustomValidity('');
		if (field === 'precision') callout.valueLabel.precision = value;
		else if (callout.valueLabel.kind === 'approximate-fraction-and-percent') {
			callout.valueLabel.maxDenominator = value;
		}
	}

	function changeFormatter(event: Event): void {
		if (!callout) return;
		const select = event.currentTarget as HTMLSelectElement;
		const kind = select.value as ChartCallout['valueLabel']['kind'];
		if (!formatterIsValid(kind)) {
			select.value = callout.valueLabel.kind;
			select.setCustomValidity('This computed formatter requires a positive factual ratio.');
			select.reportValidity();
			return;
		}
		select.setCustomValidity('');
		callout.valueLabel =
			kind === 'percent-of-series-total'
				? { kind, precision: 1 }
				: kind === 'approximate-fraction-and-percent'
					? { kind, precision: 1, maxDenominator: 10 }
					: { kind: 'value' };
	}
</script>

{#if block && target}
	<div class="chart-target-row">
		<Field label="Target">
			<select
				aria-label={`${entryKind} ${index + 1} target kind`}
				value={target.kind}
				onchange={changeTargetKind}
			>
				<option value="datum">Datum</option>
				<option value="category-set" disabled={block.data.categories.length < 2}
					>Category set</option
				>
				<option value="series-total">Series total</option>
			</select>
		</Field>
		<Field label="Series">
			<select
				aria-label={`${entryKind} ${index + 1} series`}
				value={target.seriesId}
				onchange={changeSeries}
			>
				{#each block.data.series as series (series)}
					<option value={series.id}>{series.label}</option>
				{/each}
			</select>
		</Field>
		{#if target.kind === 'datum'}
			<Field label="Category">
				<select
					aria-label={`${entryKind} ${index + 1} category`}
					value={target.categoryId}
					onchange={changeDatumCategory}
				>
					{#each block.data.categories as category (category)}
						<option value={category.id}>{category.label}</option>
					{/each}
				</select>
			</Field>
		{:else if target.kind === 'category-set'}
			<fieldset class="chart-category-set">
				<legend>Categories</legend>
				{#each block.data.categories as category (category)}
					<label>
						<input
							type="checkbox"
							checked={target.categoryIds.includes(category.id)}
							onchange={(event) =>
								toggleCategorySet(
									category.id,
									(event.currentTarget as HTMLInputElement).checked,
									event.currentTarget as HTMLInputElement
								)}
						/>
						<span>{category.label}</span>
					</label>
				{/each}
			</fieldset>
		{/if}
		{#if callout}
			<Field label="Format">
				<select
					aria-label={`Callout ${index + 1} format`}
					value={callout.valueLabel.kind}
					onchange={changeFormatter}
				>
					<option value="value">Value</option>
					<option
						value="percent-of-series-total"
						disabled={!formatterIsValid('percent-of-series-total')}>Percent</option
					>
					<option
						value="approximate-fraction-and-percent"
						disabled={!formatterIsValid('approximate-fraction-and-percent')}
						>Fraction + percent</option
					>
				</select>
			</Field>
			{#if callout.valueLabel.kind !== 'value'}
				<Field label="Precision">
					<input
						type="number"
						min="0"
						max="4"
						step="1"
						aria-label={`Callout ${index + 1} precision`}
						value={callout.valueLabel.precision}
						onchange={(event) => commitFormatterNumber(event, 'precision', 0, 4)}
					/>
				</Field>
			{/if}
			{#if callout.valueLabel.kind === 'approximate-fraction-and-percent'}
				<Field label="Denominator">
					<input
						type="number"
						min="2"
						max="20"
						step="1"
						aria-label={`Callout ${index + 1} maximum denominator`}
						value={callout.valueLabel.maxDenominator}
						onchange={(event) => commitFormatterNumber(event, 'maxDenominator', 2, 20)}
					/>
				</Field>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.chart-target-row {
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-s);
	}

	.chart-category-set {
		border: 0;
		display: grid;
		gap: var(--vs-xs);
		margin: 0;
		padding: 0;
	}

	.chart-category-set legend {
		color: var(--chrome-muted);
		font-size: 0.625rem;
		padding: 0;
	}

	.chart-category-set label {
		align-items: center;
		display: flex;
		font-size: 0.6875rem;
		gap: var(--vs-xs);
	}
</style>
