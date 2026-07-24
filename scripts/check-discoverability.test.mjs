import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
	DISCOVERABILITY_CONFIG,
	auditDiscoverability,
	formatDiscoverabilityViolation
} from './check-discoverability.mjs';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptsDirectory, '..');
const fixturesRoot = resolve(scriptsDirectory, 'fixtures/discoverability');

describe('discoverability audit', () => {
	it('catches every seeded objective violation', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const rules = result.violations.map((violation) => violation.rule);

		assert.deepEqual(rules.toSorted(), [
			'adr-index-status-mismatch',
			'broken-active-guidance-link',
			'broken-adr-link',
			'broken-adr-link',
			'broken-adr-link',
			'broken-adr-link',
			'broken-adr-link',
			'broken-adr-link',
			'canonical-terminology',
			'complete-pack-immunity-guidance',
			'export-orchestration-owner',
			'implicit-authoring-pack',
			'missing-adr-status',
			'no-forwarding-re-export',
			'no-forwarding-re-export',
			'no-forwarding-re-export',
			'orientation-duplicate-deliverable',
			'orientation-labeled-deliverable',
			'orientation-neutral-brief-acceptance',
			'orientation-neutral-brief-acceptance',
			'orientation-specific-preset-authoring',
			'pack-redress-deliverable',
			'pack-redress-deliverable',
			'paired-test-name',
			'qualified-export-name',
			'required-brief-pack',
			'required-preset-pack',
			'retired-active-guidance',
			'retired-active-guidance',
			'retired-active-guidance',
			'retired-active-guidance',
			'retired-active-guidance',
			'retired-current-protocol',
			'retired-current-protocol',
			'retired-current-protocol',
			'retired-current-protocol',
			'searchable-error-prefix',
			'stale-current-status',
			'stale-current-status',
			'supported-export-codec',
			'unmarked-historical-idea',
			'unrecognized-adr-status',
			'unregistered-brief-pack'
		]);
		for (const violation of result.violations) {
			const formatted = formatDiscoverabilityViolation(violation);
			assert.match(formatted, /^(?!\/).+:\d+: \[[a-z-]+\]/);
			assert.match(formatted, /Remediation: /);
		}
	});

	it('accepts framework, direct, and concept-qualified index/types exports', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'valid') });
		assert.deepEqual(result.violations, []);
	});

	it('reports retired guidance with its exact location and canonical replacement', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const guidanceViolations = result.violations.filter(
			(violation) => violation.rule === 'retired-active-guidance'
		);

		assert.deepEqual(
			guidanceViolations.map(({ file, line }) => ({ file, line })),
			[
				{ file: '.claude/skills/example/SKILL.md', line: 8 },
				{ file: 'AGENTS.md', line: 3 },
				{ file: 'docs/briefs/stale.md', line: 3 },
				{ file: 'docs/briefs/stale.md', line: 9 },
				{ file: 'docs/ideas/stale.md', line: 3 }
			]
		);
		for (const violation of guidanceViolations) {
			assert.notEqual(violation.remediation.trim(), '');
			assert.match(formatDiscoverabilityViolation(violation), /Remediation: (Use|Use the)/);
		}
	});

	it('reports retired runtime identity and sound protocols in source text', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const protocolViolations = result.violations.filter(
			(violation) =>
				violation.rule === 'retired-current-protocol' && violation.file.startsWith('src/')
		);

		assert.deepEqual(
			protocolViolations.map(({ file, line }) => ({ file, line })),
			[
				{ file: 'src/lib/stale-runtime-protocol.ts', line: 1 },
				{ file: 'src/lib/stale-runtime-protocol.ts', line: 2 }
			]
		);
		assert.match(protocolViolations[0].remediation, /createTimelineTrackId/);
		assert.match(protocolViolations[1].remediation, /engine-default samples/);
	});

	it('scans skill sources for stale guidance claims and retired protocols', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const sourceViolations = result.violations.filter(
			(violation) => violation.file === '.claude/skills/example/SOURCES.md'
		);

		assert.deepEqual(
			sourceViolations.map((violation) => violation.rule).toSorted(),
			[
				'export-orchestration-owner',
				'required-preset-pack',
				'retired-current-protocol',
				'retired-current-protocol',
				'supported-export-codec'
			]
		);
	});

	it('requires both orientation terms in every live Brief acceptance section', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const violations = result.violations.filter(
			(entry) => entry.rule === 'orientation-neutral-brief-acceptance'
		);

		assert.deepEqual(
			violations.map(({ file, line }) => ({ file, line })),
			[
				{ file: 'docs/briefs/missing-orientations.md', line: 6 },
				{ file: 'docs/briefs/stale.md', line: 7 }
			]
		);
	});

	it('rejects copied concrete Pack-immunity guidance', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const violation = result.violations.find(
			(entry) => entry.rule === 'complete-pack-immunity-guidance'
		);

		assert.deepEqual(
			violation && { file: violation.file, line: violation.line },
			{ file: 'docs/briefs/stale.md', line: 11 }
		);
		assert.match(violation?.remediation ?? '', /PACK_IMMUNE_PIPELINE_KEYS/);
	});

	it('requires registered Brief Pack metadata and valid active-guidance link targets', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const selected = result.violations.filter((entry) =>
			['required-brief-pack', 'unregistered-brief-pack', 'broken-active-guidance-link'].includes(
				entry.rule
			)
		);

		assert.deepEqual(
			selected.map(({ file, line, rule }) => ({ file, line, rule })),
			[
				{
					file: '.claude/skills/example/SKILL.md',
					line: 9,
					rule: 'broken-active-guidance-link'
				},
				{
					file: 'docs/briefs/missing-orientations.md',
					line: 3,
					rule: 'unregistered-brief-pack'
				},
				{ file: 'docs/briefs/stale.md', line: 1, rule: 'required-brief-pack' }
			]
		);
	});

	it('requires numbered ADR status authority and valid local links', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const selected = result.violations.filter((entry) =>
			[
				'missing-adr-status',
				'broken-adr-link',
				'adr-index-status-mismatch',
				'unrecognized-adr-status'
			].includes(entry.rule)
		);

		assert.deepEqual(
			selected.map(({ file, line, rule }) => ({ file, line, rule })),
			[
				{ file: 'docs/adr/0002-missing-status.md', line: 1, rule: 'missing-adr-status' },
				{ file: 'docs/adr/0002-missing-status.md', line: 3, rule: 'broken-adr-link' },
				{ file: 'docs/adr/0002-missing-status.md', line: 4, rule: 'broken-adr-link' },
				{ file: 'docs/adr/0002-missing-status.md', line: 5, rule: 'broken-adr-link' },
				{ file: 'docs/adr/0002-missing-status.md', line: 6, rule: 'broken-adr-link' },
				{ file: 'docs/adr/0002-missing-status.md', line: 7, rule: 'broken-adr-link' },
				{
					file: 'docs/adr/0003-index-mismatch.md',
					line: 3,
					rule: 'adr-index-status-mismatch'
				},
				{ file: 'docs/adr/0004-negated-status.md', line: 3, rule: 'unrecognized-adr-status' },
				{ file: 'docs/adr/README.md', line: 8, rule: 'broken-adr-link' }
			]
		);
	});

	it('rejects implicit Pack and orientation variants in URL authoring', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const selected = result.violations.filter((entry) =>
			['implicit-authoring-pack', 'orientation-specific-preset-authoring'].includes(entry.rule)
		);

		assert.deepEqual(
			selected.map(({ file, line, rule }) => ({ file, line, rule })),
			[
				{ file: 'scripts/url-to-preset.mjs', line: 1, rule: 'implicit-authoring-pack' },
				{
					file: 'scripts/url-to-preset.mjs',
					line: 2,
					rule: 'orientation-specific-preset-authoring'
				}
			]
		);
	});

	it('keeps orientation and Pack re-dresses out of the deliverable listing', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const selected = result.violations.filter((entry) =>
			[
				'orientation-duplicate-deliverable',
				'orientation-labeled-deliverable',
				'pack-redress-deliverable'
			].includes(entry.rule)
		);

		assert.deepEqual(
			selected.map(({ file, rule }) => ({ file, rule })),
			[
				{
					file: 'src/lib/presets/branded-piece.json',
					rule: 'pack-redress-deliverable'
				},
				{
					file: 'src/lib/presets/example-clean-light.json',
					rule: 'pack-redress-deliverable'
				},
				{
					file: 'src/lib/presets/example-vertical.json',
					rule: 'orientation-duplicate-deliverable'
				},
				{
					file: 'src/lib/presets/example-vertical.json',
					rule: 'orientation-labeled-deliverable'
				}
			]
		);
	});

	it('rejects stale create-from-blank status in current-truth docs', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const violations = result.violations.filter(
			(entry) => entry.rule === 'stale-current-status'
		);

		assert.deepEqual(
			violations.map(({ file, line }) => ({ file, line })),
			[
				{ file: 'docs/CONTEXT.md', line: 3 },
				{ file: 'docs/roadmap.md', line: 3 }
			]
		);
	});

	it('requires the known pre-ADR compositor idea to declare historical status', () => {
		const result = auditDiscoverability({ root: resolve(fixturesRoot, 'violations') });
		const violation = result.violations.find(
			(entry) => entry.rule === 'unmarked-historical-idea'
		);

		assert.deepEqual(
			violation && { file: violation.file, line: violation.line },
			{ file: 'docs/ideas/unified-webgpu-compositor.md', line: 1 }
		);
	});

	it('ignores historical ADR and generated or history guidance content', () => {
		const result = auditDiscoverability({
			root: resolve(fixturesRoot, 'valid'),
			config: {
				...DISCOVERABILITY_CONFIG,
				activeGuidanceGlobs: ['docs/**/*.md', '**/*.schema.json']
			}
		});
		assert.deepEqual(result.violations, []);
	});

	it('passes the current repository conventions', () => {
		const result = auditDiscoverability({ root: repositoryRoot });
		assert.deepEqual(result.violations, []);
	});

	it('returns a failing CLI status with actionable diagnostics', () => {
		const result = spawnSync(
			process.execPath,
			[resolve(scriptsDirectory, 'check-discoverability.mjs'), resolve(fixturesRoot, 'violations')],
			{ encoding: 'utf8' }
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /src\/lib\/generic\.ts:\d+: \[qualified-export-name\]/);
		assert.match(result.stderr, /Remediation: /);
	});
});
