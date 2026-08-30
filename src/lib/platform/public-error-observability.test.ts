import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import { describeErrorResponse } from './public-error-observability';

const OBSERVATION = {
	timestamp: '2026-08-30T00:00:00.000Z',
	status: 500,
	method: 'POST',
	pathname: '/api/export/sessions',
	search: '?slug=quarterly-numbers&pack=syntax',
	body: 'Export encoding failed at /var/lib/gfx/export/gfx-export-abc/out.mov'
} as const;

describe('describeErrorResponse', () => {
	it('keeps the query string and the raw body on a development host', () => {
		const report = describeErrorResponse({ ...OBSERVATION, profile: 'development' });

		assert.ok(report.line.includes('?slug=quarterly-numbers&pack=syntax'));
		assert.equal(report.diagnostic?.body, OBSERVATION.body);
		assert.equal(report.diagnostic?.search, OBSERVATION.search);
	});

	it('drops the query string on a public host', () => {
		const report = describeErrorResponse({ ...OBSERVATION, profile: 'public' });

		assert.ok(!report.line.includes('quarterly-numbers'));
		assert.ok(report.line.includes('500 POST /api/export/sessions'));
		assert.equal(report.diagnostic?.search, '');
	});

	it('strips the work directory out of a public body while keeping the failure', () => {
		const report = describeErrorResponse({ ...OBSERVATION, profile: 'public' });

		assert.ok(!report.diagnostic?.body.includes('/var/lib/gfx/export'));
		assert.ok(report.diagnostic?.body.startsWith('Export encoding failed at '));
	});

	it('promotes nothing when there was no body to read', () => {
		const report = describeErrorResponse({
			...OBSERVATION,
			status: 404,
			body: null,
			profile: 'public'
		});

		assert.equal(report.diagnostic, null);
		assert.equal(report.line, '[2026-08-30T00:00:00.000Z] 404 POST /api/export/sessions');
	});

	it('bounds what one failure can write', () => {
		const report = describeErrorResponse({
			...OBSERVATION,
			profile: 'development',
			body: 'x'.repeat(5000)
		});

		assert.equal(report.diagnostic?.body.length, 2000);
	});
});
