import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
	appendCockpitEvent,
	findSkillOverlaps,
	inferSkillUses,
	readCockpitEvents,
	safeFactoryDimensions,
	serializedByteLength,
	sessionFingerprint,
	skillCatalogSnapshot,
	summarizeCockpit,
	type CockpitEvent,
	type SkillMetadata
} from './telemetry.ts';

const skills: SkillMetadata[] = [
	{
		name: 'code-review',
		description: 'Review code changes for security performance testing and design quality.',
		filePath: '/skills/code-review/SKILL.md',
		kind: 'markdown'
	},
	{
		name: 'security-review',
		description: 'Review code changes for security vulnerabilities and security quality.',
		filePath: '/skills/security-review/SKILL.md',
		kind: 'markdown'
	},
	{
		name: 'websearch',
		description: 'Search the public web through Serper.',
		filePath: '/skills/websearch/SKILL.md',
		kind: 'python',
		python: { importName: 'websearch' }
	}
];

test('skill catalog measures metadata and highlights overlapping routes', () => {
	const snapshot = skillCatalogSnapshot(skills);
	assert.equal(snapshot.count, 3);
	assert.ok(snapshot.metadataBytes > 0);
	assert.deepEqual(findSkillOverlaps(skills, 0.2)[0], {
		left: 'code-review',
		right: 'security-review',
		score: 0.5
	});
});

test('skill use inference records names without retaining tool input', () => {
	assert.deepEqual(
		inferSkillUses({ code: 'Path("/skills/security-review/SKILL.md").read_text()' }, skills),
		['security-review']
	);
	assert.deepEqual(inferSkillUses({ code: "await websearch.run('private query')" }, skills), [
		'websearch'
	]);
});

test('factory dimensions reject unbounded or unsafe values', () => {
	assert.deepEqual(
		safeFactoryDimensions({
			FACTORY_NAME: 'supers-delivery',
			FACTORY_STAGE: 'verification',
			FACTORY_PROFILE: 'bad value with spaces',
			FACTORY_DEFINITION_VERSION: '7'
		}),
		{
			name: 'supers-delivery',
			profile: undefined,
			stage: 'verification',
			definitionVersion: '7'
		}
	);
});

test('ledger stores bounded events and summarizes one session', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'factory-cockpit-'));
	const path = join(directory, 'events.ndjson');
	try {
		await appendCockpitEvent(
			path,
			event('session-a', 'skill-catalog', {
				count: 3,
				metadataBytes: 900,
				overlaps: []
			})
		);
		await appendCockpitEvent(
			path,
			event('session-a', 'turn', {
				usage: {
					input: 100,
					output: 20,
					cacheRead: 50,
					cacheWrite: 5,
					totalTokens: 175,
					cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.01, total: 0.32 }
				},
				requestBytes: 2_000,
				toolCalls: 2,
				toolErrors: 1,
				toolDurationMs: 450,
				skillUses: ['security-review']
			})
		);
		await appendCockpitEvent(path, event('session-a', 'compaction', { tokensBefore: 10_000 }));
		await appendCockpitEvent(path, event('session-b', 'turn', {}));

		const summary = summarizeCockpit(await readCockpitEvents(path, 'session-a'));
		assert.equal(summary.turns, 1);
		assert.equal(summary.totalTokens, 175);
		assert.equal(summary.totalCost, 0.32);
		assert.equal(summary.requestBytes, 2_000);
		assert.equal(summary.toolCalls, 2);
		assert.equal(summary.toolErrors, 1);
		assert.equal(summary.toolDurationMs, 450);
		assert.equal(summary.compactions, 1);
		assert.deepEqual(summary.skillUses, { 'security-review': 1 });
		assert.equal((await readFile(path, 'utf8')).includes('private query'), false);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('session identifiers and provider payload measurements are content-derived', () => {
	assert.equal(sessionFingerprint('/private/session.jsonl').length, 16);
	assert.equal(serializedByteLength({ a: 'é' }), Buffer.byteLength(JSON.stringify({ a: 'é' })));
});

function event(
	session: string,
	type: CockpitEvent['type'],
	payload: Record<string, unknown>
): CockpitEvent {
	return {
		schemaVersion: 1,
		timestamp: '2026-08-09T00:00:00.000Z',
		session,
		factory: {},
		type,
		payload
	};
}
