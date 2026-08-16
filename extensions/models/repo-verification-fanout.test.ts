import assert from 'node:assert/strict';

import {
	runVerificationFanout,
	type VerificationCommandOutput,
	type VerificationCommandRunner,
	VerificationFanoutArgumentsSchema
} from './repo-verification-fanout.ts';

const fingerprint = 'a'.repeat(64);

Deno.test(
	'verification fan-out starts every selected lane before awaiting completion',
	async () => {
		const started: string[] = [];
		const releases = new Map<string, () => void>();
		const runCommand: VerificationCommandRunner = async (_command, args) => {
			const laneCommand = args.at(-1) ?? '';
			started.push(laneCommand);
			await new Promise<void>((resolve) => releases.set(laneCommand, resolve));
			return successfulOutput(laneCommand);
		};

		const reportPromise = runVerificationFanout(
			'/repo',
			{
				workItem: 'task-1',
				expectedFingerprint: fingerprint,
				lanes: ['browser', 'check', 'unit', 'structural']
			},
			runCommand
		);

		await waitFor(() => started.length === 4);
		assert.deepEqual(started, ['test:browser', 'check', 'test', 'test:structural']);
		for (const release of releases.values()) release();

		const report = await reportPromise;
		assert.equal(report.executionMode, 'parallel');
		assert.equal(report.passed, true);
		assert.match(report.contentDigest, /^[0-9a-f]{64}$/);
		assert.deepEqual(
			report.results.map((result) => result.id),
			['browser', 'check', 'unit', 'structural']
		);
	}
);

Deno.test(
	'verification fan-out records lane failures without discarding other results',
	async () => {
		const report = await runVerificationFanout(
			'/repo',
			{
				workItem: 'task-2',
				expectedFingerprint: fingerprint,
				lanes: ['check', 'unit']
			},
			async (_command, args) => ({
				code: args.at(-1) === 'test' ? 1 : 0,
				stdout: new TextEncoder().encode('stdout'),
				stderr: new TextEncoder().encode('failure')
			})
		);

		assert.equal(report.passed, false);
		assert.deepEqual(
			report.results.map(({ id, status }) => ({ id, status })),
			[
				{ id: 'check', status: 'passed' },
				{ id: 'unit', status: 'failed' }
			]
		);
	}
);

Deno.test('verification fan-out rejects duplicate lanes', async () => {
	await assert.rejects(
		() =>
			runVerificationFanout(
				'/repo',
				{
					workItem: 'task-3',
					expectedFingerprint: fingerprint,
					lanes: ['check', 'check']
				},
				async () => successfulOutput('unused')
			),
		/must be unique/
	);
});

Deno.test('verification fan-out accepts an empty deterministic lane set', () => {
	const parsed = VerificationFanoutArgumentsSchema.parse({
		workItem: 'docs-only',
		expectedFingerprint: fingerprint,
		lanes: []
	});
	assert.deepEqual(parsed.lanes, []);
});

function successfulOutput(label: string): VerificationCommandOutput {
	return {
		code: 0,
		stdout: new TextEncoder().encode(`${label} passed`),
		stderr: new Uint8Array()
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error('Timed out waiting for parallel lane starts');
}
