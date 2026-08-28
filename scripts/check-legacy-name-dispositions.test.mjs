// Focused fixtures for scripts/check-legacy-name-dispositions.mjs — one
// deliberately stale-named fixture per failure mode plus a reconciled baseline,
// so ADR-0053's classification is proven to go red with actionable paths and
// green on a tree where every remaining Legacy Supers name carries a
// disposition.
//
// Run: node --test scripts/check-legacy-name-dispositions.test.mjs
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
	LEGACY_NAME_DISPOSITION_CONFIG,
	auditLegacyNameDispositions,
	formatLegacyNameViolation
} from './check-legacy-name-dispositions.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptsDirectory, '..');
const fixturesRoot = resolve(scriptsDirectory, 'fixtures/legacy-name-dispositions');

describe('legacy-name disposition audit', () => {
	it('catches one violation per failure mode and nothing else', () => {
		const result = auditLegacyNameDispositions({ root: resolve(fixturesRoot, 'violations') });

		assert.deepEqual(
			result.violations.map((violation) => [violation.file, violation.rule]),
			[
				['docs/preset-format.md', 'undeclared-legacy-documentation'],
				['src/lib/platform/frame-notes.ts', 'unclassified-legacy-name'],
				['src/lib/utils/legacy-supers-compatibility.ts', 'stale-current-name']
			]
		);
		for (const violation of result.violations) {
			const formatted = formatLegacyNameViolation(violation);
			assert.match(formatted, /^(?!\/).+:\d+: \[[a-z-]+\]/);
			assert.match(formatted, /Remediation: /);
		}
	});

	it('accepts declared legacy surfaces and skips records that are never rewritten', () => {
		const result = auditLegacyNameDispositions({ root: resolve(fixturesRoot, 'valid') });
		assert.deepEqual(result.violations, []);
		assert.ok(result.filesChecked > 0);
	});

	it('names the rename-now replacement a stale value must move to', () => {
		const result = auditLegacyNameDispositions({ root: resolve(fixturesRoot, 'violations') });
		const stale = result.violations.find((violation) => violation.rule === 'stale-current-name');
		assert.match(stale.message, /__supersTimeline/);
		assert.match(stale.remediation, /__gfx\*/);
	});

	it('holds the reconciled repository green', () => {
		const result = auditLegacyNameDispositions({ root: repositoryRoot });
		assert.deepEqual(
			result.violations.map(formatLegacyNameViolation),
			[],
			'every current Legacy Supers name must carry a recorded disposition'
		);
	});

	it('keeps every declared surface and stale rule self-describing and globally matched', () => {
		for (const surface of LEGACY_NAME_DISPOSITION_CONFIG.declaredSurfaces) {
			assert.ok(surface.reason.length > 0, `${surface.value} needs a reason`);
			assert.ok(surface.paths.length > 0, `${surface.value} needs at least one path`);
			assert.ok(surface.pattern.flags.includes('g'), `${surface.value} pattern must be global`);
		}
		for (const stale of LEGACY_NAME_DISPOSITION_CONFIG.staleCurrentNames) {
			assert.ok(stale.pattern.flags.includes('g'), `${stale.pattern} must be global`);
			assert.ok(stale.replacement.length > 0, `${stale.pattern} needs a replacement`);
		}
		for (const entry of [
			...LEGACY_NAME_DISPOSITION_CONFIG.historicalRoots,
			...LEGACY_NAME_DISPOSITION_CONFIG.unscannedRoots
		]) {
			assert.ok(entry.reason.length > 0, `${entry.path} needs a documented reason`);
		}
	});
});
