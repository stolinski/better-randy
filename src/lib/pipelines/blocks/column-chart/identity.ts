import type { IdentitySpec } from '$lib/platform/pipelines/identity';

// Stable chart Block identity (ADR-0048). Appearance concedes to the active
// Pack; data, domain, and motion validity remain intrinsic to the Pipeline.
export const columnChartIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'an editorial bar/column comparison with vertical marks whose geometry remains faithful to its validated inline data',
	dimensions: [
		{
			name: 'mark-treatment',
			viaPack: 'chart.mark',
			definition: 'Data-mark fill treatment.',
			probe: {
				kind: 'named-observation',
				region: 'column-chart chart',
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
				region: 'column-chart chart',
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
				region: 'column-chart chart',
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
				region: 'column-chart chart',
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
				region: 'column-chart chart',
				expectation:
					'Appearance resolves through chart.annotation; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'edge-treatment',
			definition: 'Chart chrome edge treatment.',
			probe: {
				kind: 'named-observation',
				region: 'column-chart chart',
				expectation:
					'Appearance resolves through edge-treatment; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'depth-treatment',
			definition: 'Non-data chart chrome depth treatment.',
			probe: {
				kind: 'named-observation',
				region: 'column-chart chart',
				expectation:
					'Appearance resolves through depth-treatment; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'light-treatment',
			viaPack: 'light-treatment',
			definition: 'Non-data chart chrome light treatment.',
			probe: {
				kind: 'named-observation',
				region: 'column-chart chart',
				expectation:
					'Appearance resolves through light-treatment; no Preset literal or Pack-specific sibling decides it.'
			}
		},
		{
			name: 'mark-render-boundary',
			implementation:
				'src/lib/pipelines/shader-passes/chart-mark-renderer.ts createChartMarkRenderer — one instanced analytic-mask pass using the shared mark-fill WGSL.',
			definition:
				'Premultiplied Pack-driven data marks remain local to factual renderer geometry and never texture chart chrome.',
			probe: {
				kind: 'script',
				path: 'scripts/probe-chart-bar-column-gpu.ts'
			}
		},
		{
			name: 'factual-integrity',
			implementation:
				'src/lib/platform/chart-validation.ts validateChartGroupSemantics — strict data, domain, target, normalization, and phase validation before rendering.',
			definition: 'Fail-closed factual contract for the bar/column comparison with vertical marks.',
			probe: {
				kind: 'script',
				path: 'src/lib/platform/chart-validation.test.ts'
			}
		}
	]
};
