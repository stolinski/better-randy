import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
	chartRenderTextMeasurer,
	measureChartTextForRender,
	resolveChartTextRoleStyle
} from './chart-text-measurement';

describe('measureChartTextForRender', () => {
	it('returns deterministic native-pixel measurements for every chart text role', () => {
		const roles = ['title', 'axis', 'category', 'value', 'legend', 'source', 'callout'] as const;
		for (const role of roles) {
			const first = measureChartTextForRender({ text: '2 in 3 · 67.4%', role });
			const second = chartRenderTextMeasurer({ text: '2 in 3 · 67.4%', role });
			assert.deepEqual(first, second);
			assert.ok(first.width > 0);
			assert.ok(first.height > 0);
			assert.ok(resolveChartTextRoleStyle(role).fontSize > 0);
		}
	});

	it('measures narrow and wide glyphs without consulting browser state', () => {
		const narrow = measureChartTextForRender({ text: '1111', role: 'value' });
		const wide = measureChartTextForRender({ text: 'MMMM', role: 'value' });
		assert.ok(wide.width > narrow.width * 2);
		assert.equal(measureChartTextForRender({ text: '', role: 'source' }).width, 0);
	});
});
