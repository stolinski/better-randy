import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAgentTelemetryPayload, emitAgentTelemetryWithSwamp } from './sentry.ts';
import type { CockpitEvent } from './telemetry.ts';

const events: CockpitEvent[] = [
	event('skill-catalog', { count: 40, metadataBytes: 12_000, overlaps: [] }),
	event('turn', {
		provider: 'openai-codex',
		model: 'gpt 5.6/luna',
		usage: {
			input: 1_000,
			output: 200,
			cacheRead: 800,
			cacheWrite: 10,
			totalTokens: 2_010,
			cost: { input: 0.1, output: 0.2, cacheRead: 0.01, cacheWrite: 0.01, total: 0.32 }
		},
		requestBytes: 30_000,
		contextTokens: 8_000,
		contextWindow: 128_000,
		toolCalls: 2,
		toolErrors: 0,
		toolDurationMs: 500,
		skillUses: ['swamp']
	})
];

test('Sentry payload is numeric and bounded without session attributes', () => {
	const payload = buildAgentTelemetryPayload('private-session:batch', events, {
		FACTORY_PROJECT: 'better-randy',
		FACTORY_NAME: 'supers-delivery',
		FACTORY_PROFILE: 'supers-dex-delivery',
		FACTORY_STAGE: 'verification',
		FACTORY_DEFINITION_VERSION: '7'
	});
	assert.equal(payload.factory.stage, 'verification');
	assert.equal(payload.agent.model, 'gpt-5.6-luna');
	assert.equal(payload.agent.totalTokens, 2_010);
	assert.deepEqual(payload.agent.skillUses, [{ name: 'swamp', count: 1 }]);
	assert.equal('session' in payload.factory, false);
	assert.equal('workItem' in payload.factory, false);
});

test('bridge invokes the existing DSN-owning Swamp model non-interactively', async () => {
	let invocation: { command: string; args: string[]; input: string } | undefined;
	const payload = buildAgentTelemetryPayload('batch', events, {});
	const result = await emitAgentTelemetryWithSwamp(
		'/repo',
		payload,
		async (command, args, input) => {
			invocation = { command, args, input };
			return {
				code: 0,
				stdout: JSON.stringify({
					dataArtifacts: [{ attributes: { status: 'emitted' } }]
				}),
				stderr: ''
			};
		}
	);
	assert.equal(result.ok, true);
	assert.equal(result.status, 'emitted');
	assert.equal(invocation?.command, 'swamp');
	assert.ok(invocation?.args.includes('--stdin'));
	assert.ok(invocation?.args.includes('--json'));
	assert.equal(JSON.parse(invocation?.input ?? '{}').idempotencyKey, 'batch');
});

test('bridge surfaces degraded receipts', async () => {
	const payload = buildAgentTelemetryPayload('batch', events, {});
	const result = await emitAgentTelemetryWithSwamp('/repo', payload, async () => ({
		code: 0,
		stdout: JSON.stringify({
			dataArtifacts: [{ attributes: { status: 'unavailable' } }]
		}),
		stderr: ''
	}));
	assert.equal(result.ok, false);
	assert.equal(result.status, 'unavailable');
});

function event(type: CockpitEvent['type'], payload: Record<string, unknown>): CockpitEvent {
	return {
		schemaVersion: 1,
		timestamp: '2026-08-09T00:00:00.000Z',
		session: 'hashed-session',
		factory: {},
		type,
		payload
	};
}
