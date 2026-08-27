import assert from 'node:assert/strict';

import {
	runStandaloneLayoutContractVerification,
	runVerificationFanout,
	type VerificationCommandOutput,
	type VerificationCommandRunner,
	VerificationFanoutArgumentsSchema
} from './repo-verification-fanout.ts';

const fingerprint = 'a'.repeat(64);
const intentRouteDigest = 'b'.repeat(64);

function argumentsFor(
	lanes: Parameters<typeof runVerificationFanout>[1]['lanes'],
	changedPaths: string[],
	overrides: Partial<Parameters<typeof runVerificationFanout>[1]> = {}
): Parameters<typeof runVerificationFanout>[1] {
	return {
		workItem: 'task-1',
		expectedFingerprint: fingerprint,
		changeImpactResourceName: 'change-impact-task-1',
		changedPaths,
		intentRouteDigest,
		lanes,
		benchmarkScripts: [],
		exportDecodeScripts: [],
		...overrides
	};
}

Deno.test('app fan-out starts check, unit, and browser lanes concurrently', async () => {
	const started: string[] = [];
	const releases = new Map<string, () => void>();
	const initialCommands = new Set([
		'pnpm exec svelte-kit sync',
		'pnpm exec vitest related --run src/lib/platform/RootInspector.svelte',
		'pnpm run test:browser'
	]);
	const runCommand: VerificationCommandRunner = async (command, args) => {
		const invocation = `${command} ${args.join(' ')}`;
		started.push(invocation);
		if (initialCommands.has(invocation)) {
			await new Promise<void>((resolve) => releases.set(invocation, resolve));
		}
		return successfulOutput(invocation);
	};
	const reportPromise = runVerificationFanout(
		'/repo',
		argumentsFor(['check', 'unit', 'browser'], ['src/lib/platform/RootInspector.svelte']),
		runCommand
	);
	await waitFor(() => releases.size === 3);
	assert.deepEqual(started, [
		'pnpm exec svelte-kit sync',
		'pnpm exec vitest related --run src/lib/platform/RootInspector.svelte',
		'pnpm run test:browser'
	]);
	for (const release of releases.values()) release();
	const report = await reportPromise;
	assert.equal(report.passed, true);
	assert.deepEqual(
		report.results.map((result) => result.id),
		['check', 'unit', 'browser']
	);
});

Deno.test('Layout Contract runs only after concurrent CPU-heavy lanes settle', async () => {
	let unitActive = false;
	const calls: string[] = [];
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(
			['unit', 'layout-contract'],
			['src/lib/platform/composition-frame-renderer.ts']
		),
		async (command, args) => {
			const invocation = `${command} ${args.join(' ')}`;
			calls.push(invocation);
			if (
				invocation ===
				'pnpm exec vitest related --run src/lib/platform/composition-frame-renderer.ts'
			) {
				unitActive = true;
				await new Promise((resolve) => setTimeout(resolve, 5));
				unitActive = false;
				return successfulOutput(invocation);
			}
			assert.equal(unitActive, false);
			return layoutContractOutput();
		}
	);
	assert.equal(report.executionMode, 'layout-isolated');
	assert.deepEqual(report.results.map((result) => result.id), ['unit', 'layout-contract']);
	assert.equal(
		calls[0],
		'pnpm exec vitest related --run src/lib/platform/composition-frame-renderer.ts'
	);
	assert.match(calls[1], /run-supers-layout-contract-matrix/);
});

Deno.test('Layout Contract retries one bounded operational timeout', async () => {
	let attempts = 0;
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(
			['layout-contract'],
			['src/lib/platform/composition-frame-renderer.ts']
		),
		async () => {
			attempts += 1;
			if (attempts === 1) {
				return {
					code: 1,
					stdout: new Uint8Array(),
					stderr: new TextEncoder().encode('Layout Contract matrix exceeded 12 minutes')
				};
			}
			return layoutContractOutput();
		}
	);
	assert.equal(attempts, 2);
	assert.equal(report.passed, true);
	assert.equal(report.executionMode, 'layout-isolated');
});

Deno.test('Layout Contract retries one transient runtime-readiness failure', async () => {
	let attempts = 0;
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(
			['layout-contract'],
			['src/lib/platform/composition-frame-renderer.ts']
		),
		async () => {
			attempts += 1;
			if (attempts === 1) {
				return {
					code: 1,
					stdout: new Uint8Array(),
					stderr: new TextEncoder().encode(
						'web-document-reddit: Layout Contract runtime did not become ready'
					)
				};
			}
			return layoutContractOutput();
		}
	);
	assert.equal(attempts, 2);
	assert.equal(report.passed, true);
});

Deno.test('check routing keeps unrelated central diagnostics visible but non-routing', async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	const changedPath = 'src/routes/api/user-compositions/user-compositions.test.ts';
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(['check'], [changedPath]),
		async (command, args) => {
			calls.push({ command, args });
			if (args.includes('svelte-check')) {
				return {
					code: 1,
					stdout: new TextEncoder().encode(
						'1 START "/repo"\n2 ERROR "scripts/unrelated.ts" 10:2 "unrelated"\n3 COMPLETED 1 ERRORS'
					),
					stderr: new Uint8Array()
				};
			}
			return successfulOutput('scoped check');
		}
	);
	assert.equal(report.passed, true);
	assert.deepEqual(calls, [
		{ command: 'pnpm', args: ['exec', 'svelte-kit', 'sync'] },
		{
			command: 'pnpm',
			args: [
				'exec',
				'svelte-check',
				'--tsconfig',
				'./tsconfig.json',
				'--output',
				'machine',
				'--no-color',
				'--threshold',
				'error'
			]
		},
		{
			command: 'pnpm',
			args: [
				'exec',
				'eslint',
				'--no-warn-ignored',
				'--max-warnings',
				'0',
				'--pass-on-no-patterns',
				changedPath
			]
		}
	]);
	assert.match(report.results[0].outputTail, /unrelated error\(s\).*non-routing evidence/);
});

Deno.test('check routing fails for a diagnostic on a sealed changed path', async () => {
	const changedPath = 'src/routes/api/user-compositions/user-compositions.test.ts';
	const calls: string[] = [];
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(['check'], [changedPath]),
		async (command, args) => {
			calls.push(`${command} ${args.join(' ')}`);
			if (args.includes('svelte-check')) {
				return {
					code: 1,
					stdout: new TextEncoder().encode(`1 ERROR "${changedPath}" 4:8 "changed failure"`),
					stderr: new Uint8Array()
				};
			}
			return successfulOutput('scoped check');
		}
	);
	assert.equal(report.passed, false);
	assert.equal(report.results[0].status, 'failed');
	assert.equal(calls.length, 2, 'ESLint must not run after an in-scope type failure');
	assert.match(report.results[0].outputTail, /1 error\(s\) in 1 sealed changed path/);
});

Deno.test('affected Preset verification receives only trusted changed paths', async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	await runVerificationFanout(
		'/repo',
		argumentsFor(['preset-static'], ['src/lib/presets/lower-third.json']),
		async (command, args) => {
			calls.push({ command, args });
			return successfulOutput('preset');
		}
	);
	assert.deepEqual(calls, [
		{
			command: 'pnpm',
			args: [
				'verify-presets',
				'--affected',
				'--changed-paths-json',
				'["src/lib/presets/lower-third.json"]'
			]
		}
	]);
	assert.ok(!calls[0].args.includes('--all'));
});

Deno.test('Layout Contract lane runs the capture-free numeric matrix', async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(['layout-contract'], ['src/lib/platform/composition-frame-renderer.ts']),
		async (command, args) => {
			calls.push({ command, args });
			return layoutContractOutput();
		}
	);

	assert.equal(report.passed, true);
	assert.equal(report.results[0].layoutContractReceipt?.contentDigest, 'd'.repeat(64));
	assert.deepEqual(calls, [
		{
			command: 'node',
			args: [
				'--experimental-strip-types',
				'scripts/run-supers-layout-contract-matrix.mjs',
				'--summary',
				'--scoped-paths-json',
				'["src/lib/platform/composition-frame-renderer.ts"]'
			]
		}
	]);
});

Deno.test('standalone Layout Contract verification returns a typed full-checkout receipt', async () => {
	const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
	const receipt = await runStandaloneLayoutContractVerification(
		'/repo',
		async (command, args, cwd) => {
			calls.push({ command, args, cwd });
			return layoutContractOutput();
		}
	);
	assert.equal(receipt.passed, true);
	assert.equal(receipt.contentDigest, 'd'.repeat(64));
	assert.deepEqual(calls, [
		{
			command: 'node',
			args: [
				'--experimental-strip-types',
				'scripts/run-supers-layout-contract-matrix.mjs',
				'--summary'
			],
			cwd: '/repo'
		}
	]);
});

Deno.test('Layout Contract lane rejects a receipt outside the sealed tree', async () => {
	await assert.rejects(
		() =>
			runVerificationFanout(
				'/repo',
				argumentsFor(['layout-contract'], ['src/lib/platform/runtime-audit.ts']),
				async () => ({
					...layoutContractOutput(),
					stdout: new TextEncoder().encode(
						new TextDecoder()
							.decode(layoutContractOutput().stdout)
							.replace(fingerprint, 'f'.repeat(64))
					)
				})
			),
		/does not match the sealed change fingerprint/
	);
});

Deno.test(
	'Swamp-only fan-out validates touched definitions and excludes product suites',
	async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		await runVerificationFanout(
			Deno.cwd(),
			argumentsFor(
				['swamp-control-plane'],
				[
					'extensions/models/repo-audit.ts',
					'models/@supers/repo-audit/11111111-1111-1111-1111-111111111111.yaml',
					'workflows/workflow-22222222-2222-2222-2222-222222222222.yaml'
				]
			),
			async (command, args) => {
				calls.push({ command, args });
				return successfulOutput('swamp');
			}
		);
		assert.deepEqual(calls, [
			{
				command: 'swamp',
				args: ['workflow', 'validate', '22222222-2222-2222-2222-222222222222', '--json']
			},
			{
				command: 'swamp',
				args: ['model', 'validate', '11111111-1111-1111-1111-111111111111', '--json']
			},
			{
				command: 'npx',
				args: [
					'--yes',
					'deno',
					'check',
					'--no-config',
					'--import-map=scripts/factory-model-test-import-map.json',
					'--allow-import=raw.githubusercontent.com,jsr.io',
					'extensions/models/repo-audit.ts'
				]
			},
			{
				command: 'npx',
				args: [
					'--yes',
					'deno',
					'test',
					'--no-config',
					'--import-map=scripts/factory-model-test-import-map.json',
					'--allow-import=raw.githubusercontent.com,jsr.io',
					'--allow-env',
					'--allow-run=git,/usr/bin/python3,scripts/factory-pi-runtime-receipt.ts',
					'--allow-read',
					'--allow-write',
					'extensions/models/repo-audit.test.ts'
				]
			},
			{
				command: 'node',
				args: ['--experimental-strip-types', '--test', 'scripts/change-impact-classifier.test.ts']
			},
			{
				command: 'node',
				args: ['--test', 'scripts/supers-delivery-routing-workflows.test.mjs']
			}
		]);
		assert.ok(!calls.some(({ command }) => command === 'pnpm'));
	}
);

Deno.test(
	'changed repo-audit, router, and fanout sources run their focused model tests',
	async () => {
		const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
		const repoDir = Deno.cwd();
		await runVerificationFanout(
			repoDir,
			argumentsFor(
				['swamp-control-plane'],
				[
					'extensions/models/repo-audit.ts',
					'extensions/models/repo-verification-fanout.ts',
					'extensions/models/supers-delivery-verification-router.ts'
				]
			),
			async (command, args, cwd) => {
				calls.push({ command, args, cwd });
				return successfulOutput('focused models');
			}
		);
		const testCall = calls.find(
			({ command, args }) =>
				command === 'npx' && args[0] === '--yes' && args[1] === 'deno' && args[2] === 'test'
		);
		assert.ok(testCall);
		assert.equal(testCall.cwd, repoDir);
		assert.deepEqual(testCall.args.slice(0, 3), ['--yes', 'deno', 'test']);
		assert.deepEqual(testCall.args.slice(-3), [
			'extensions/models/repo-audit.test.ts',
			'extensions/models/repo-verification-fanout.test.ts',
			'extensions/models/supers-delivery-verification-router.test.ts'
		]);
		assert.ok(!calls.some(({ command }) => command === 'pnpm'));
	}
);

Deno.test('a changed extension test runs itself once', async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	await runVerificationFanout(
		Deno.cwd(),
		argumentsFor(['swamp-control-plane'], ['extensions/models/repo-verification-fanout.test.ts']),
		async (command, args) => {
			calls.push({ command, args });
			return successfulOutput('changed test');
		}
	);
	const testCall = calls.find(
		({ command, args }) =>
			command === 'npx' && args[0] === '--yes' && args[1] === 'deno' && args[2] === 'test'
	);
	assert.ok(testCall);
	assert.deepEqual(testCall.args.slice(0, 3), ['--yes', 'deno', 'test']);
	assert.deepEqual(testCall.args.slice(-1), ['extensions/models/repo-verification-fanout.test.ts']);
});

Deno.test('workflow-only routing validates the workflow without product tests', async () => {
	const calls: Array<{ command: string; args: string[] }> = [];
	await runVerificationFanout(
		'/repo',
		argumentsFor(
			['swamp-control-plane'],
			['workflows/workflow-22222222-2222-2222-2222-222222222222.yaml']
		),
		async (command, args) => {
			calls.push({ command, args });
			return successfulOutput('workflow');
		}
	);
	assert.deepEqual(calls, [
		{
			command: 'swamp',
			args: ['workflow', 'validate', '22222222-2222-2222-2222-222222222222', '--json']
		},
		{
			command: 'node',
			args: ['--experimental-strip-types', '--test', 'scripts/change-impact-classifier.test.ts']
		},
		{
			command: 'node',
			args: ['--test', 'scripts/supers-delivery-routing-workflows.test.mjs']
		}
	]);
	assert.ok(
		!calls.some(({ command }) => command === 'pnpm' || command === 'deno' || command === 'npx')
	);
});

Deno.test('typed coverage lanes execute their exact bounded audit commands', async () => {
	const calls: string[] = [];
	await runVerificationFanout(
		'/repo',
		argumentsFor(
			[
				'timing-coverage',
				'authoring-dependency-tracking',
				'inspector-editor-parity',
				'planning-discoverability'
			],
			['src/lib/platform/engine-schema.ts']
		),
		async (command, args) => {
			calls.push(`${command} ${args.join(' ')}`);
			return successfulOutput('coverage');
		}
	);
	assert.deepEqual(calls, [
		'pnpm run audit:timing',
		'pnpm run audit:tracking',
		'pnpm run audit:parity',
		'pnpm run audit:planning',
		'pnpm run test:discoverability'
	]);
});

Deno.test(
	'planning lane runs planning and discoverability without browser or Preset checks',
	async () => {
		const calls: string[] = [];
		await runVerificationFanout(
			'/repo',
			argumentsFor(['planning-discoverability'], ['docs/project-control-plane.md']),
			async (command, args) => {
				calls.push(`${command} ${args.join(' ')}`);
				return successfulOutput('docs');
			}
		);
		assert.deepEqual(calls, ['pnpm run audit:planning', 'pnpm run test:discoverability']);
	}
);

Deno.test('performance and export lanes require declared evidence scripts', async () => {
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(
			['performance', 'export-decode'],
			['src/lib/platform/composition-export-controller.ts']
		),
		async () => successfulOutput('unused')
	);
	assert.equal(report.passed, false);
	assert.deepEqual(
		report.results.map(({ id, status, unavailableReason }) => ({
			id,
			status,
			unavailableReason
		})),
		[
			{
				id: 'performance',
				status: 'unavailable',
				unavailableReason: 'benchmark-evidence-not-declared'
			},
			{
				id: 'export-decode',
				status: 'unavailable',
				unavailableReason: 'export-decode-evidence-not-declared'
			}
		]
	);
});

Deno.test('declared performance and export evidence scripts execute exactly', async () => {
	const calls: string[] = [];
	const report = await runVerificationFanout(
		'/repo',
		argumentsFor(
			['performance', 'export-decode'],
			['src/lib/platform/composition-export-controller.ts'],
			{
				benchmarkScripts: ['benchmark:export'],
				exportDecodeScripts: ['verify:export-decode:composition']
			}
		),
		async (command, args) => {
			calls.push(`${command} ${args.join(' ')}`);
			return successfulOutput('evidence');
		}
	);
	assert.equal(report.passed, true);
	assert.deepEqual(calls, [
		'pnpm run benchmark:export',
		'pnpm run verify:export-decode:composition'
	]);
});

Deno.test(
	'verification fan-out records failures and rejects duplicate lanes or unsorted paths',
	async () => {
		const report = await runVerificationFanout(
			'/repo',
			argumentsFor(['check', 'unit'], ['src/a.ts']),
			async (_command, args) => ({
				code: args.includes('related') ? 1 : 0,
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
		await assert.rejects(
			() =>
				runVerificationFanout('/repo', argumentsFor(['check', 'check'], ['src/a.ts']), async () =>
					successfulOutput('unused')
				),
			/must be unique/
		);
		await assert.rejects(
			() =>
				runVerificationFanout(
					'/repo',
					argumentsFor(['check'], ['src/z.ts', 'src/a.ts']),
					async () => successfulOutput('unused')
				),
			/canonical order/
		);
	}
);

Deno.test('locale-independent changed-path ordering is required', async () => {
	await assert.rejects(
		() =>
			runVerificationFanout(
				'/repo',
				argumentsFor(['repository-infrastructure'], ['scripts/ä.ts', 'scripts/z.ts']),
				async () => successfulOutput('unused')
			),
		/canonical order/
	);
});

Deno.test('fan-out schema accepts an empty automated lane set for render-only work', () => {
	const parsed = VerificationFanoutArgumentsSchema.parse(
		argumentsFor([], ['src/lib/presets/lower-third.json'])
	);
	assert.deepEqual(parsed.lanes, []);
});

function layoutContractOutput(): VerificationCommandOutput {
	return {
		code: 0,
		stdout: new TextEncoder().encode(
			JSON.stringify({
				schemaVersion: 1,
				sourceRevision: 'c'.repeat(40),
				treeFingerprint: fingerprint,
				manifestDigest: 'e'.repeat(64),
				authoritativeFullCorpus: true,
				diagnosticPresetSlug: null,
				startedAt: '2026-08-26T20:00:00.000Z',
				completedAt: '2026-08-26T20:08:00.000Z',
				coordinateCount: 1744,
				passedCount: 1744,
				failedCount: 0,
				failureCounts: [],
				passed: true,
				contentDigest: 'd'.repeat(64)
			})
		),
		stderr: new Uint8Array()
	};
}

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
