import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import fixtureJson from './chart-domain-survey-fixture.json';
import { PresetSchema, type ChartBlock } from '../platform/engine-schema';
import { listFixtures, listPresets, parsePreset } from '../platform/preset';
import { presetToWireFormat } from '../platform/preset-pure';
import { validatePresetSemantics } from '../platform/preset-validation';
import { resolveChartDataTarget } from '../utils/chart-data-target';
import { allocateChartNormalizedUnits } from '../utils/chart-normalized-allocation';

const fixture = PresetSchema.parse(fixtureJson);
const chart = fixture.state.surface.chart;

if (!chart) throw new Error('Chart-domain fixture must declare a chart group.');

describe('chart-domain survey fixture', () => {
	it('stays an unlisted Pack-neutral full-frame fixture with all four chart Pipelines', () => {
		assert.equal(fixture.kind, 'fixture');
		assert.equal(fixture.state.backgroundFill, 'pack');
		assert.equal(chart.mode, 'sequence');
		assert.deepEqual(
			chart.items.map((item) => item.type),
			['column-chart', 'bar-chart', 'unit-grid-chart', 'dot-field-chart']
		);
		assert.equal(
			listPresets().some((entry) => entry.slug === 'chart-domain-survey-fixture'),
			false
		);
		assert.equal(
			listFixtures().some((entry) => entry.slug === 'chart-domain-survey-fixture'),
			true
		);
		assert.equal(JSON.stringify(fixture).includes('#'), false);
	});

	it('preserves the supplied survey facts and exact computed 744-of-1,104 targets', () => {
		const expectedDistribution = [360, 354, 237, 73, 80];
		for (const item of chart.items) {
			const values = item.data.series[0].values.map((datum) => datum.value);
			assert.deepEqual(
				values,
				item.data.categories.length === 5 ? expectedDistribution : [360, 744]
			);
			assert.equal(
				values.reduce((sum, value) => sum + value, 0),
				1104
			);
			const callout = item.callouts?.[0];
			assert.ok(callout);
			const target = resolveChartDataTarget(item, callout.target);
			assert.equal(target.value, 744);
			assert.equal(target.seriesTotal, 1104);
			assert.equal(callout.valueLabel.kind, 'approximate-fraction-and-percent');
		}
	});

	it('allocates normalized marks exactly and keeps sequence visibility windows disjoint', () => {
		for (const item of chart.items) {
			if (item.type === 'unit-grid-chart' || item.type === 'dot-field-chart') {
				const allocation = allocateChartNormalizedUnits(item);
				assert.equal(allocation.unitCategoryIndexes.length, item.normalization.unitCount);
			}
		}
		for (let index = 1; index < chart.items.length; index += 1) {
			const previousItem: ChartBlock | undefined = chart.items[index - 1];
			const currentItem: ChartBlock | undefined = chart.items[index];
			if (!previousItem || !currentItem) throw new Error('Missing chart sequence item.');
			assert.ok(
				previousItem.motion.exit.start + previousItem.motion.exit.duration <=
					currentItem.motion.entry.start
			);
		}
	});

	it('keeps broadcast-paced entries, shorter exits, and a readable settled annotation hold', () => {
		for (const item of chart.items) {
			const entryMilliseconds =
				item.motion.entry.duration * fixture.state.transport.durationSeconds * 1000;
			const exitMilliseconds =
				item.motion.exit.duration * fixture.state.transport.durationSeconds * 1000;
			const settledHoldSeconds =
				(item.motion.exit.start -
					(item.motion.annotation.start + item.motion.annotation.duration)) *
				fixture.state.transport.durationSeconds;
			assert.ok(Math.abs(entryMilliseconds - 300) < 1e-9);
			assert.ok(Math.abs(exitMilliseconds - 216) < 1e-9);
			assert.ok(exitMilliseconds <= entryMilliseconds * 0.8);
			assert.ok(settledHoldSeconds >= 1.7);
		}
	});

	it('round-trips through the same strict wire model used by agents and the GUI', () => {
		assert.deepEqual(validatePresetSemantics(fixture), []);
		const wire = presetToWireFormat(fixture);
		assert.deepEqual(parsePreset(wire), fixture);
	});
});
