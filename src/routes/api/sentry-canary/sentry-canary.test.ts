import assert from 'node:assert/strict';

import { sentryCanaryHealth } from './canary-health.ts';

Deno.test('controlled Sentry canary endpoint returns success', () => {
	assert.deepEqual(sentryCanaryHealth(), { ok: true });
});
