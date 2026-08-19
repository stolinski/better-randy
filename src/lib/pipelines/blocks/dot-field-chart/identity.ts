import type { IdentitySpec } from '$lib/platform/pipelines/identity';

// Stable chart Block identity (ADR-0048). Appearance concedes to the active
// Pack; data, domain, and motion validity remain intrinsic to the Pipeline.
export const dotFieldChartIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'an editorial normalized parts-of-whole dot field whose geometry remains faithful to its validated inline data',
	dimensions: [
		{
			name: 'mark-treatment',
			viaPack: 'chart.mark',
			definition: 'Data-mark fill treatment.',
			probe: {
				kind: 'named-observation',
				region: 'dot-field-chart chart',
				expectation:
					'Appearance resolves through chart.mark; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'axis-treatment',
			viaPack: 'chart.axis',
			definition: 'Axis and baseline ink treatment.',
			probe: {
				kind: 'named-observation',
				region: 'dot-field-chart chart',
				expectation:
					'Appearance resolves through chart.axis; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'grid-treatment',
			viaPack: 'chart.grid',
			definition: 'Reference-grid ink treatment.',
			probe: {
				kind: 'named-observation',
				region: 'dot-field-chart chart',
				expectation:
					'Appearance resolves through chart.grid; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'label-treatment',
			viaPack: 'chart.label',
			definition: 'Category, value, and legend label treatment.',
			probe: {
				kind: 'named-observation',
				region: 'dot-field-chart chart',
				expectation:
					'Appearance resolves through chart.label; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'annotation-treatment',
			viaPack: 'chart.annotation',
			definition: 'Data-bound chart callout treatment.',
			probe: {
				kind: 'named-observation',
				region: 'dot-field-chart chart',
				expectation:
					'Appearance resolves through chart.annotation; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'chrome-separation',
			implementation:
				'src/lib/pipelines/blocks/dot-field-chart/index.ts dotFieldChartBlockRenderer wires the shared src/lib/pipelines/blocks/unit-grid-chart/CanvasSource.svelte + src/lib/pipelines/shader-passes/chart-mark-renderer.ts — chart chrome is flat DOM ink and data marks are analytic masks; enclosing Surface/stage treatments own any edge, depth, or light.',
			definition:
				'Flat chart-local chrome separated from data marks without chart-local edge, depth, or light passes.',
			probe: {
				kind: 'named-observation',
				region: 'dot-field-chart chart',
				expectation:
					'chart chrome remains flat; enclosing composition treatments do not become chart-local Pack roles.'
			}
		},
		{
			name: 'factual-integrity',
			implementation:
				'src/lib/platform/chart-validation.ts validateChartGroupSemantics — strict data, domain, target, normalization, and phase validation before rendering.',
			definition: 'Fail-closed factual contract for the normalized parts-of-whole dot field.',
			probe: {
				kind: 'script',
				path: 'src/lib/platform/chart-validation.test.ts'
			}
		}
	]
};
