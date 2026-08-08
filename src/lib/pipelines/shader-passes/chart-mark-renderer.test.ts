import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { BarChartBlock, ChartMotion } from '$lib/platform/engine-schema';
import { PACK_REGISTRY } from '$lib/platform/packs/registry';
import { resolveChartMarkFillTreatment } from '$lib/platform/packs/resolve';
import type { ChartRenderInputs } from '$lib/platform/pipelines/types';
import { resolveChartBarColumnGeometry } from '$lib/utils/chart-bar-column-geometry';
import { resolveChartFrameLayout } from '$lib/utils/chart-layout';
import { chartRenderTextMeasurer } from '$lib/utils/chart-text-measurement';
import {
	countChartMarkRendererInstances,
	packChartMarkRendererInstances
} from './chart-mark-renderer';

function motion(): ChartMotion {
	return {
		entry: { start: 0, duration: 0.1 },
		reveal: { start: 0.1, duration: 0.1 },
		emphasis: { start: 0.2, duration: 0.1 },
		annotation: { start: 0.3, duration: 0.1 },
		exit: { start: 0.8, duration: 0.1 }
	};
}
function block(): BarChartBlock {
	return {
		id: 'grouped',
		type: 'bar-chart',
		title: 'Grouped',
		data: {
			categories: [{ id: 'a', label: 'A' }],
			series: [
				{ id: 'first', label: 'First', values: [{ categoryId: 'a', value: 4 }] },
				{ id: 'second', label: 'Second', values: [{ categoryId: 'a', value: 8 }] }
			]
		},
		layout: { mode: 'grouped' },
		domain: { min: 0, max: 10 },
		labels: { values: false, legend: true },
		highlights: [{ target: { kind: 'datum', seriesId: 'second', categoryId: 'a' } }],
		fill: { role: 'series' },
		motion: motion()
	};
}
function inputs(): ChartRenderInputs {
	const chart = block();
	const layout = resolveChartFrameLayout({
		block: chart,
		orientation: 'horizontal',
		measureText: chartRenderTextMeasurer
	});
	const geometry = resolveChartBarColumnGeometry({
		block: chart,
		layout,
		orientation: 'horizontal',
		measureText: chartRenderTextMeasurer
	});
	return {
		block: chart,
		geometry,
		baseFillBySeries: chart.data.series.map((_, index) =>
			resolveChartMarkFillTreatment(PACK_REGISTRY.syntax, 'series', index)
		),
		emphasisFillBySeries: chart.data.series.map((_, index) =>
			resolveChartMarkFillTreatment(PACK_REGISTRY.syntax, 'emphasis', index)
		),
		alpha: 0.75
	};
}

describe('packChartMarkRendererInstances', () => {
	it('packs factual bounds, actual fill discriminators, series phase, highlight, and alpha', () => {
		const source = inputs();
		const packed = packChartMarkRendererInstances(source, 3840, 2160);
		assert.equal(packed.byteLength, countChartMarkRendererInstances(source) * 144);
		assert.equal(countChartMarkRendererInstances(source), 4);
		const view = new DataView(packed);
		assert.ok(Math.abs(view.getFloat32(0, true) - source.geometry.marks[0].bounds.x) < 1e-4);
		assert.ok(Math.abs(view.getFloat32(8, true) - source.geometry.marks[0].bounds.width) < 1e-4);
		assert.equal(view.getUint32(96, true), 0);
		assert.equal(view.getUint32(144 + 96, true), 1);
		assert.equal(view.getUint32(112 + 12, true), 0);
		assert.equal(view.getUint32(144 + 112 + 12, true), 1);
		assert.equal(view.getFloat32(80 + 12, true), 0.75);
		assert.equal(view.getFloat32(16 + 12, true), 1);
		assert.notEqual(view.getFloat32(20, true), view.getFloat32(144 + 20, true));
	});

	it('fails closed when treatment cardinality does not match the declaration', () => {
		const source = inputs();
		assert.throws(
			() =>
				packChartMarkRendererInstances(
					{ ...source, baseFillBySeries: source.baseFillBySeries.slice(0, 1) },
					3840,
					2160
				),
			/one base fill/
		);
	});
});
