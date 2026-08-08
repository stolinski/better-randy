import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type {
	ChartMotion,
	DotFieldChartBlock,
	UnitGridChartBlock
} from '$lib/platform/engine-schema';
import { resolveChartDataTarget, resolveChartTargetGeometry } from './chart-data-target';
import { resolveChartNormalizedGeometry } from './chart-normalized-geometry';
import { resolveChartFrameLayout, type ChartTextMeasurer } from './chart-layout';

function motion(): ChartMotion {
	return {
		entry: { start: 0, duration: 0.1 },
		reveal: { start: 0.1, duration: 0.1 },
		emphasis: { start: 0.2, duration: 0.1 },
		annotation: { start: 0.3, duration: 0.1 },
		exit: { start: 0.8, duration: 0.1 }
	};
}

function unitGrid(unitCount = 100): UnitGridChartBlock {
	return {
		id: 'share',
		type: 'unit-grid-chart',
		title: 'People using multiple agents',
		data: {
			categories: [
				{ id: 'multiple', label: 'Multiple agents' },
				{ id: 'one', label: 'One agent' }
			],
			series: [
				{
					id: 'respondents',
					label: 'Respondents',
					values: [
						{ categoryId: 'multiple', value: 67.4 },
						{ categoryId: 'one', value: 32.6 }
					]
				}
			]
		},
		normalization: { total: 100, unitCount },
		labels: { categories: true, values: true, legend: false },
		highlights: [{ target: { kind: 'datum', seriesId: 'respondents', categoryId: 'multiple' } }],
		callouts: [
			{
				target: { kind: 'datum', seriesId: 'respondents', categoryId: 'multiple' },
				valueLabel: { kind: 'percent-of-series-total', precision: 1 }
			}
		],
		fill: { role: 'series' },
		motion: motion()
	};
}

const measureText: ChartTextMeasurer = ({ text, role }) => ({
	width: text.length * (role === 'title' ? 32 : 20),
	height: role === 'title' ? 88 : 44
});

function geometry(
	block: UnitGridChartBlock | DotFieldChartBlock,
	orientation: 'horizontal' | 'vertical'
) {
	const layout = resolveChartFrameLayout({ block, orientation, measureText });
	return {
		layout,
		geometry: resolveChartNormalizedGeometry({ block, layout, orientation, measureText })
	};
}

describe('resolveChartNormalizedGeometry', () => {
	it('produces stable bounded row-major geometry and exact category voices at both native targets', () => {
		for (const orientation of ['horizontal', 'vertical'] as const) {
			const first = geometry(unitGrid(100), orientation);
			const second = geometry(unitGrid(100), orientation);
			assert.equal(JSON.stringify(first.geometry), JSON.stringify(second.geometry));
			assert.equal(first.geometry.marks.length, 100);
			assert.deepEqual(first.geometry.overflow, []);
			assert.equal(first.geometry.marks.filter((mark) => mark.fillVoiceIndex === 0).length, 67);
			assert.equal(first.geometry.marks.filter((mark) => mark.fillVoiceIndex === 1).length, 33);
			assert.equal(first.geometry.marks.filter((mark) => mark.isHighlighted).length, 67);
			assert.equal(first.geometry.annotations[0].text, '67.4%');
			for (const mark of first.geometry.marks) {
				assert.ok(mark.bounds.x >= first.layout.plotBounds.x);
				assert.ok(mark.bounds.y >= first.layout.plotBounds.y);
				assert.ok(
					mark.bounds.x + mark.bounds.width <=
						first.layout.plotBounds.x + first.layout.plotBounds.width
				);
				assert.ok(
					mark.bounds.y + mark.bounds.height <=
						first.layout.plotBounds.y + first.layout.plotBounds.height
				);
			}
		}
	});

	it('distinguishes square unit-grid marks from circular dot-field marks', () => {
		const grid = geometry(unitGrid(10), 'horizontal').geometry;
		const dotBlock: DotFieldChartBlock = { ...unitGrid(10), type: 'dot-field-chart' };
		const dots = geometry(dotBlock, 'horizontal').geometry;
		assert.ok(grid.marks[0].cornerRadius < grid.marks[0].bounds.width / 2);
		assert.equal(dots.marks[0].cornerRadius, dots.marks[0].bounds.width / 2);
	});

	it('keeps one thousand marks bounded and records quantization provenance without fractional pixels', () => {
		const result = geometry(unitGrid(1000), 'vertical').geometry;
		assert.equal(result.marks.length, 1000);
		assert.ok(result.grid.columns * result.grid.rows >= 1000);
		assert.ok(result.grid.markSize >= 8);
		assert.equal(
			result.marks.filter((mark) => mark.allocationKind === 'largest-remainder').length,
			0
		);
		assert.deepEqual(
			result.allocations.map((allocation) => allocation.exactUnitQuota),
			[674, 326]
		);
	});
	it('materializes every declared unit without overlap for both variants, orientations, and bounds', () => {
		for (const unitCount of [10, 100, 1000]) {
			for (const type of ['unit-grid-chart', 'dot-field-chart'] as const) {
				for (const orientation of ['horizontal', 'vertical'] as const) {
					const block = { ...unitGrid(unitCount), type } as UnitGridChartBlock | DotFieldChartBlock;
					const result = geometry(block, orientation);
					assert.deepEqual(result.layout.overflow, []);
					assert.deepEqual(result.geometry.overflow, []);
					assert.equal(result.geometry.marks.length, unitCount);
					assert.equal(result.geometry.annotations[0].text, '67.4%');
					assert.equal(
						new Set(result.geometry.marks.map((mark) => `${mark.bounds.x}:${mark.bounds.y}`)).size,
						unitCount
					);
					assert.ok(
						result.geometry.marks.every((mark) =>
							[mark.bounds.x, mark.bounds.y, mark.bounds.width, mark.bounds.height].every(
								Number.isFinite
							)
						)
					);
				}
			}
		}
	});

	it('keeps a zero-allocation category available to exact callout targeting', () => {
		const block = unitGrid(10);
		block.data.series[0].values = [
			{ categoryId: 'multiple', value: 100 },
			{ categoryId: 'one', value: 0 }
		];
		block.callouts = [
			{
				target: { kind: 'datum', seriesId: 'respondents', categoryId: 'one' },
				valueLabel: { kind: 'percent-of-series-total', precision: 1 }
			}
		];
		const result = geometry(block, 'horizontal').geometry;
		assert.equal(result.marks.filter((mark) => mark.categoryId === 'one').length, 0);
		assert.equal(result.annotations[0].text, '0.0%');
		assert.deepEqual(result.overflow, []);
	});
	it('exposes aggregate datum targets for datum, category-set, and series-total annotations', () => {
		const block = unitGrid(100);
		const result = geometry(block, 'horizontal').geometry;
		const datum = resolveChartTargetGeometry(
			resolveChartDataTarget(block, {
				kind: 'datum',
				seriesId: 'respondents',
				categoryId: 'multiple'
			}),
			result.datumGeometry
		);
		const categorySet = resolveChartTargetGeometry(
			resolveChartDataTarget(block, {
				kind: 'category-set',
				seriesId: 'respondents',
				categoryIds: ['multiple', 'one']
			}),
			result.datumGeometry
		);
		const seriesTotal = resolveChartTargetGeometry(
			resolveChartDataTarget(block, { kind: 'series-total', seriesId: 'respondents' }),
			result.datumGeometry
		);
		assert.ok(datum.bounds.x >= categorySet.bounds.x);
		assert.ok(datum.bounds.y >= categorySet.bounds.y);
		assert.ok(
			datum.bounds.x + datum.bounds.width <= categorySet.bounds.x + categorySet.bounds.width
		);
		assert.ok(
			datum.bounds.y + datum.bounds.height <= categorySet.bounds.y + categorySet.bounds.height
		);
		assert.deepEqual(categorySet.bounds, seriesTotal.bounds);
		assert.deepEqual(categorySet.anchor, seriesTotal.anchor);
	});
	it('fails closed when direct-call highlight targets do not resolve factually', () => {
		const wrongSeries = unitGrid(100);
		wrongSeries.highlights = [
			{ target: { kind: 'datum', seriesId: 'missing', categoryId: 'multiple' } }
		];
		assert.throws(() => geometry(wrongSeries, 'horizontal'), /Unknown chart series "missing"/);

		const unknownCategory = unitGrid(100);
		unknownCategory.highlights = [
			{ target: { kind: 'datum', seriesId: 'respondents', categoryId: 'missing' } }
		];
		assert.throws(
			() => geometry(unknownCategory, 'horizontal'),
			/Unknown chart category "missing"/
		);

		const partiallyInvalidSet = unitGrid(100);
		partiallyInvalidSet.highlights = [
			{
				target: {
					kind: 'category-set',
					seriesId: 'respondents',
					categoryIds: ['multiple', 'missing']
				}
			}
		];
		assert.throws(
			() => geometry(partiallyInvalidSet, 'horizontal'),
			/Unknown chart category "missing"/
		);
	});
});
