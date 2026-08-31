import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findSpawnCalls, findSpawnHygieneViolations } from './check-verification-spawn-hygiene.mjs';

test('reads one call at a time through nested brackets and strings', () => {
	const calls = findSpawnCalls(
		`spawn(bin, ['-i', '(x)'], { cwd: root });\nspawnSync('git', ['rev-parse'], { cwd: root });`
	);
	assert.equal(calls.length, 2);
	assert.ok(calls[0].text.endsWith('{ cwd: root })'));
	assert.equal(calls[0].line, 1);
	assert.equal(calls[1].line, 2);
});

// The exact shape that cost thirty compositions on 2026-08-29.
test('rejects a spawn that inherits the caller cwd', () => {
	const violations = findSpawnHygieneViolations(
		'scripts/probe-example.ts',
		`const child = spawn(process.execPath, [script], { stdio: 'inherit' });`
	);
	assert.equal(violations.length, 1);
	assert.match(violations[0], /^scripts\/probe-example\.ts:1: spawn without an explicit `cwd`/);
});

test('rejects a server spawn that names no jail', () => {
	const violations = findSpawnHygieneViolations(
		'scripts/probe-example.ts',
		`spawn(process.execPath, [serverEntryPath], { cwd: repoRoot, env: { ...process.env, PORT: '7311' } });`
	);
	assert.equal(violations.length, 1);
	assert.match(violations[0], /GFX_VERIFICATION_RUN.*GFX_EXPORT_TEMPORARY_DIRECTORY/);
});

test('accepts a jailed server spawn', () => {
	assert.deepEqual(
		findSpawnHygieneViolations(
			'scripts/probe-example.ts',
			`spawn(process.execPath, [serverEntryPath], {
				cwd: repoRoot,
				env: { ...process.env, ...jail.environment, PORT: '7311' }
			});`
		),
		[]
	);
});

test('accepts the three jail variables spelled out', () => {
	assert.deepEqual(
		findSpawnHygieneViolations(
			'scripts/probe-example.ts',
			`spawn(node, ['build/index.js'], {
				cwd: repoRoot,
				env: {
					GFX_VERIFICATION_RUN: '1',
					GFX_USER_COMPOSITION_STORE_DIRECTORY: store,
					GFX_EXPORT_TEMPORARY_DIRECTORY: scratch
				}
			});`
		),
		[]
	);
});

test('leaves a non-server spawn alone once it names a cwd', () => {
	assert.deepEqual(
		findSpawnHygieneViolations(
			'scripts/probe-example.ts',
			`spawn('ffmpeg', args, { cwd: repositoryRoot });`
		),
		[]
	);
});
