import assert from "node:assert/strict";
import test from "node:test";

import { sentryCanaryHealth } from "../../src/routes/api/sentry-canary/canary-health.ts";

test("controlled Sentry canary endpoint returns success", () => {
  assert.deepEqual(sentryCanaryHealth(), { ok: true });
});
