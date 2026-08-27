import { assertEquals, assertRejects } from 'jsr:@std/assert@1.0.14';
import {
	authorizeFactoryFailure,
	executeFactoryFailureBoundary,
	executeFactoryWorkBoundary,
	type FactoryFailureAuthorityContext
} from './factory-execution-failure-authority.ts';
import { model } from './dex-software-factory.ts';

const FACTORY = '90fac686-c724-4aee-97c4-e31b9af4c5e2';
const encoder = new TextEncoder();

function failedResult(
	stderr = 'failed',
	stdout = ''
): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
	return Promise.resolve({
		success: false,
		code: 7,
		stdout: encoder.encode(stdout),
		stderr: encoder.encode(stderr)
	});
}

function succeededResult(
	stdout = 'succeeded'
): Promise<{ success: boolean; code: number; stdout: Uint8Array; stderr: Uint8Array }> {
	return Promise.resolve({
		success: true,
		code: 0,
		stdout: encoder.encode(stdout),
		stderr: encoder.encode('')
	});
}

function contextFor(
	input: {
		dispatchAttempt?: number;
		work?: Record<string, unknown>;
		runCommand?: FactoryFailureAuthorityContext['runCommand'];
		readWorkflowRun?: FactoryFailureAuthorityContext['readWorkflowRun'];
		now?: FactoryFailureAuthorityContext['now'];
		journalVersions?: Record<number, Record<string, unknown>>;
		factoryStartedAt?: string;
		resources?: Map<string, Record<string, unknown>>;
	} = {}
): {
	context: FactoryFailureAuthorityContext;
	resources: Map<string, Record<string, unknown>>;
} {
	const dispatchAttempt = input.dispatchAttempt ?? 2;
	const resources = input.resources ?? new Map<string, Record<string, unknown>>();
	const state = encoder.encode(
		JSON.stringify({
			workItem: 'task-1',
			stageId: 'preflight',
			startedAt: input.factoryStartedAt ?? '2026-08-20T00:00:00.000Z',
			cycles: { preflight: 3 },
			dispatches: { preflight: { cycle: 3, count: dispatchAttempt } }
		})
	);
	const defaultJournal = {
		event: 'dispatched',
		workItem: 'task-1',
		stageId: 'preflight',
		payload: {
			stageId: 'preflight',
			cycle: 3,
			attempt: dispatchAttempt,
			runId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
		}
	};
	const journalVersions: Record<number, Record<string, unknown>> = input.journalVersions ?? {
		1: defaultJournal
	};
	const status = encoder.encode(
		JSON.stringify({
			workItem: 'task-1',
			stage: { id: 'preflight', cycle: 3 },
			dispatch: { attempts: dispatchAttempt },
			work: input.work ?? {
				mode: 'workflow',
				workflow: {
					name: 'factory-policy-sweep',
					inputs: { workItem: 'task-1', evidenceName: 'preflight-run' }
				}
			}
		})
	);
	return {
		resources,
		context: {
			dataRepository: {
				getContent: (_type, modelId, name, version) =>
					Promise.resolve(
						modelId === FACTORY
							? name.startsWith('state-')
								? state
								: name.startsWith('journal-')
									? encoder.encode(JSON.stringify(journalVersions[version ?? 1]))
									: status
							: null
					),
				listVersions: () => Promise.resolve(Object.keys(journalVersions).map(Number))
			},
			readResource: (name) => Promise.resolve(resources.get(name) ?? null),
			writeResource: (specName, name, data) => {
				resources.set(name, structuredClone(data));
				return Promise.resolve({ name: `${specName}:${name}` });
			},
			logger: { info: () => {} },
			globalArgs: {
				sourceFactoryId: FACTORY,
				adapters: {
					failureAuthorizer: { workflow: 'fixture-failure-authorizer' }
				}
			},
			repoDir: '/fixture',
			readWorkflowRun: input.readWorkflowRun,
			now: input.now,
			runCommand: input.runCommand ?? (() => failedResult())
		}
	};
}

const identity = {
	sourceFactoryId: FACTORY,
	workItem: 'task-1',
	stage: 'preflight',
	stageCycle: 3,
	dispatchAttempt: 2,
	dispatchRunId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
	retryable: true
} as const;

Deno.test(
	'fixed authority operation executes without caller-controlled executable or arguments',
	async () => {
		const calls: Array<{ command: string; args: readonly string[] }> = [];
		const { context, resources } = contextFor({
			runCommand: (command, args) => {
				calls.push({ command, args });
				return failedResult('git unavailable');
			}
		});
		await executeFactoryFailureBoundary(
			{
				...identity,
				category: 'prerequisite',
				operation: 'git-clean',
				command: 'node',
				args: ['-e', 'process.exit(7)']
			},
			context
		);
		assertEquals(calls, [
			{
				command: 'git',
				args: ['status', '--porcelain=v1', '-z']
			}
		]);
		const receiptName = [...resources.keys()].find((name) =>
			name.startsWith('factory-execution-failure-')
		);
		if (receiptName === undefined) throw new Error('missing receipt');
		const receipt = resources.get(receiptName);
		assertEquals(receipt?.sourceFactoryId, FACTORY);
		await authorizeFactoryFailure(
			{
				receiptName,
				sourceFactoryId: identity.sourceFactoryId,
				workItem: identity.workItem,
				stage: identity.stage,
				stageCycle: identity.stageCycle,
				dispatchAttempt: identity.dispatchAttempt,
				dispatchRunId: identity.dispatchRunId
			},
			context
		);
		assertEquals(
			[...resources.keys()].some((name) => name.startsWith('authorized-')),
			true
		);
	}
);

Deno.test('authority rejects wrong category, wrong Factory, and stale attempt', async () => {
	const current = contextFor();
	await assertRejects(
		() =>
			executeFactoryFailureBoundary(
				{
					...identity,
					category: 'tool-unavailable',
					operation: 'git-clean'
				},
				current.context
			),
		Error,
		'does not own'
	);
	await assertRejects(() =>
		executeFactoryFailureBoundary(
			{
				...identity,
				sourceFactoryId: '11111111-1111-1111-1111-111111111111',
				category: 'prerequisite',
				operation: 'git-clean'
			},
			current.context
		)
	);
	await assertRejects(
		() =>
			executeFactoryFailureBoundary(
				{
					...identity,
					dispatchRunId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					category: 'prerequisite',
					operation: 'git-clean'
				},
				current.context
			),
		Error,
		'exact current Factory dispatch run'
	);
	const stale = contextFor({ dispatchAttempt: 1 });
	await assertRejects(
		() =>
			executeFactoryFailureBoundary(
				{
					...identity,
					category: 'prerequisite',
					operation: 'git-clean'
				},
				stale.context
			),
		Error,
		'current Factory dispatch'
	);
});

Deno.test(
	'newer current-identity dispatch journal entry rejects an older matching run id',
	async () => {
		const newerRunId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
		const { context } = contextFor({
			journalVersions: {
				1: {
					event: 'dispatched',
					workItem: 'task-1',
					stageId: 'preflight',
					payload: {
						stageId: 'preflight',
						cycle: 3,
						attempt: 2,
						runId: identity.dispatchRunId
					}
				},
				2: {
					event: 'dispatched',
					workItem: 'task-1',
					stageId: 'preflight',
					payload: {
						stageId: 'preflight',
						cycle: 3,
						attempt: 2,
						runId: newerRunId
					}
				}
			}
		});
		await assertRejects(
			() =>
				executeFactoryFailureBoundary(
					{
						...identity,
						category: 'prerequisite',
						operation: 'git-clean'
					},
					context
				),
			Error,
			'exact current Factory dispatch run'
		);
	}
);

Deno.test('a later non-dispatch journal event rejects the older matching dispatch', async () => {
	const { context } = contextFor({
		journalVersions: {
			1: {
				event: 'dispatched',
				workItem: 'task-1',
				stageId: 'preflight',
				payload: {
					stageId: 'preflight',
					cycle: 3,
					attempt: 2,
					runId: identity.dispatchRunId
				}
			},
			2: {
				event: 'artifact-recorded',
				workItem: 'task-1',
				stageId: 'preflight',
				payload: { artifactName: 'preflight-run' }
			}
		}
	});
	await assertRejects(
		() =>
			executeFactoryFailureBoundary(
				{
					...identity,
					category: 'prerequisite',
					operation: 'git-clean'
				},
				context
			),
		Error,
		'exact current Factory dispatch run'
	);
});

Deno.test('a later dispatch for another identity rejects the older matching dispatch', async () => {
	const { context } = contextFor({
		journalVersions: {
			1: {
				event: 'dispatched',
				workItem: 'task-1',
				stageId: 'preflight',
				payload: {
					stageId: 'preflight',
					cycle: 3,
					attempt: 2,
					runId: identity.dispatchRunId
				}
			},
			2: {
				event: 'dispatched',
				workItem: 'task-1',
				stageId: 'preflight',
				payload: {
					stageId: 'preflight',
					cycle: 4,
					attempt: 1,
					runId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
				}
			}
		}
	});
	await assertRejects(
		() =>
			executeFactoryFailureBoundary(
				{
					...identity,
					category: 'prerequisite',
					operation: 'git-clean'
				},
				context
			),
		Error,
		'exact current Factory dispatch run'
	);
});

Deno.test('workflow authority binds the exact failed run created by this invocation', async () => {
	const expectedInputs = { workItem: 'task-1', evidenceName: 'preflight-run' };
	const workflowId = '22222222-2222-4222-8222-222222222222';
	const runId = '33333333-3333-4333-8333-333333333333';
	const invocationStartedAt = new Date('2026-08-17T12:00:00.000Z');
	const invocationCompletedAt = new Date('2026-08-17T12:00:02.000Z');
	const times = [
		new Date('2026-08-17T11:59:59.000Z'),
		invocationStartedAt,
		invocationCompletedAt,
		new Date('2026-08-17T12:00:03.000Z'),
		new Date('2026-08-17T12:00:04.000Z')
	];
	const calls: string[] = [];
	const { context, resources } = contextFor({
		now: () => times.shift() ?? invocationCompletedAt,
		readWorkflowRun: (requestedWorkflowId, requestedRunId) => {
			assertEquals(requestedWorkflowId, workflowId);
			assertEquals(requestedRunId, runId);
			return Promise.resolve({
				id: runId,
				workflowId,
				workflowName: 'factory-policy-sweep',
				status: 'failed',
				inputs: expectedInputs,
				startedAt: '2026-08-17T12:00:00.500Z',
				completedAt: '2026-08-17T12:00:01.500Z'
			});
		},
		runCommand: (command, args) => {
			calls.push(`${command} ${args.join(' ')}`);
			return failedResult(
				'workflow failed',
				JSON.stringify({
					id: runId,
					workflowId,
					workflowName: 'factory-policy-sweep',
					status: 'failed'
				})
			);
		}
	});
	await executeFactoryWorkBoundary(identity, context);
	assertEquals(calls, [
		'swamp workflow run factory-policy-sweep --input evidenceName=preflight-run --input workItem=task-1 --json'
	]);
	const receipt = [...resources.values()].find((value) => value.category === 'workflow-failed');
	assertEquals(receipt?.category, 'workflow-failed');
	assertEquals((receipt?.executionReceipt as { workflowRunId: string }).workflowRunId, runId);
});

Deno.test(
	'stale history cannot authorize a failed invocation that created no new run',
	async () => {
		let queriedPersistedRun = false;
		const stale = contextFor({
			readWorkflowRun: () => {
				queriedPersistedRun = true;
				return Promise.resolve({
					id: '44444444-4444-4444-8444-444444444444',
					workflowId: '55555555-5555-4555-8555-555555555555',
					workflowName: 'factory-policy-sweep',
					status: 'failed',
					inputs: { workItem: 'task-1', evidenceName: 'preflight-run' },
					startedAt: '2026-08-16T12:00:00.000Z'
				});
			},
			runCommand: () => failedResult('workflow launcher failed before run creation')
		});
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, stale.context),
			Error,
			'returned no exact Swamp run id'
		);
		assertEquals(queriedPersistedRun, false);
		assertEquals(
			[...stale.resources.values()].some((value) => value.state === 'failed'),
			true
		);

		const workflowId = '66666666-6666-4666-8666-666666666666';
		const runId = '77777777-7777-4777-8777-777777777777';
		const times = [
			new Date('2026-08-17T11:59:59.000Z'),
			new Date('2026-08-17T12:00:00.000Z'),
			new Date('2026-08-17T12:00:01.000Z'),
			new Date('2026-08-17T12:00:02.000Z')
		];
		const staleExactRun = contextFor({
			now: () => times.shift() ?? new Date('2026-08-17T12:00:01.000Z'),
			runCommand: () =>
				failedResult(
					'workflow failed',
					JSON.stringify({
						id: runId,
						workflowId,
						workflowName: 'factory-policy-sweep',
						status: 'failed'
					})
				),
			readWorkflowRun: () =>
				Promise.resolve({
					id: runId,
					workflowId,
					workflowName: 'factory-policy-sweep',
					status: 'failed',
					inputs: { workItem: 'task-1', evidenceName: 'preflight-run' },
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:00:01.000Z'
				})
		});
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, staleExactRun.context),
			Error,
			'does not match this invocation'
		);
		assertEquals(
			[...staleExactRun.resources.values()].some((value) => value.state === 'failed'),
			true
		);

		const dispatch = contextFor({
			work: {
				mode: 'dispatch',
				skills: ['implementation'],
				systemPrompt: 'Implement.'
			}
		});
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, dispatch.context),
			Error,
			'human operational escalation'
		);
		assertEquals('capture_pi_failure_boundary' in model.methods, false);
		assertEquals(dispatch.resources.size, 0);
	}
);

Deno.test(
	'direct concurrent and repeated success calls execute the dispatch exactly once',
	async () => {
		const work = {
			mode: 'method',
			method: {
				modelIdOrName: 'repo-audit',
				methodName: 'audit',
				inputs: { workItem: 'task-1' }
			}
		};
		let sideEffects = 0;
		const succeeded = contextFor({
			work,
			runCommand: async () => {
				sideEffects += 1;
				await Promise.resolve();
				return succeededResult();
			}
		});
		const concurrent = await Promise.allSettled([
			executeFactoryWorkBoundary(identity, succeeded.context),
			executeFactoryWorkBoundary(identity, succeeded.context)
		]);
		assertEquals(sideEffects, 1);
		assertEquals(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
		assertEquals(concurrent.filter((result) => result.status === 'rejected').length, 1);
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, succeeded.context),
			Error,
			'already succeeded'
		);
		assertEquals(sideEffects, 1);
		const claimEntry = [...succeeded.resources.entries()].find(
			([, value]) => value.state === 'succeeded'
		);
		const claim = claimEntry?.[1];
		assertEquals(claim?.dispatchRunId, identity.dispatchRunId);
		assertEquals(typeof claim?.executionDigest, 'string');
		assertEquals(typeof claim?.resultDigest, 'string');
		if (claimEntry === undefined) {
			throw new Error('missing dispatch-boundary claim');
		}
		const startedClaim = structuredClone(claimEntry[1]);
		delete startedClaim.completedAt;
		delete startedClaim.resultDigest;
		succeeded.resources.set(claimEntry[0], { ...startedClaim, state: 'started' });
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, succeeded.context),
			Error,
			'started and stale'
		);
		assertEquals(sideEffects, 1);
	}
);

Deno.test(
	'direct concurrent and repeated failure calls execute the dispatch exactly once',
	async () => {
		const work = {
			mode: 'method',
			method: {
				modelIdOrName: 'repo-audit',
				methodName: 'audit',
				inputs: { workItem: 'task-1' }
			}
		};
		let sideEffects = 0;
		const failed = contextFor({
			work,
			runCommand: async (command, args) => {
				sideEffects += 1;
				await Promise.resolve();
				assertEquals(
					`${command} ${args.join(' ')}`,
					'swamp model method run repo-audit audit --input workItem=task-1'
				);
				return failedResult('method failed');
			}
		});
		const concurrent = await Promise.allSettled([
			executeFactoryWorkBoundary(identity, failed.context),
			executeFactoryWorkBoundary(identity, failed.context)
		]);
		assertEquals(sideEffects, 1);
		assertEquals(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
		assertEquals(concurrent.filter((result) => result.status === 'rejected').length, 1);
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, failed.context),
			Error,
			'already failed'
		);
		assertEquals(sideEffects, 1);
		const receipt = [...failed.resources.values()].find(
			(value) => value.category === 'method-failed'
		);
		assertEquals(receipt?.dispatchRunId, identity.dispatchRunId);
		assertEquals(
			(receipt?.executionReceipt as { receiptId: string }).receiptId,
			`method:${identity.dispatchRunId}`
		);
		const claim = [...failed.resources.values()].find((value) => value.state === 'failed');
		assertEquals(typeof claim?.executionDigest, 'string');
		assertEquals(typeof claim?.resultDigest, 'string');
	}
);

Deno.test(
	'post-reset terminal dispatch boundary is versioned while an old started boundary remains fail closed',
	async () => {
		const resources = new Map<string, Record<string, unknown>>();
		let sideEffects = 0;
		const work = {
			mode: 'method',
			method: { modelIdOrName: 'repo-audit', methodName: 'audit', inputs: { workItem: 'task-1' } }
		};
		const oldRun = contextFor({
			resources,
			factoryStartedAt: '2026-08-20T00:00:00.000Z',
			work,
			runCommand: () => {
				sideEffects += 1;
				return succeededResult();
			}
		});
		await executeFactoryWorkBoundary(identity, oldRun.context);
		const resetRun = contextFor({
			resources,
			factoryStartedAt: '2026-08-21T00:00:00.000Z',
			work,
			runCommand: () => {
				sideEffects += 1;
				return succeededResult();
			}
		});
		await executeFactoryWorkBoundary(identity, resetRun.context);
		assertEquals(sideEffects, 2);
		const boundary = [...resources.values()].find((value) => value.state === 'succeeded');
		assertEquals(boundary?.factoryStartedAt, '2026-08-21T00:00:00.000Z');

		if (!boundary) throw new Error('missing boundary');
		const { completedAt: _completedAt, resultDigest: _resultDigest, ...boundaryBase } = boundary;
		const staleStarted = { ...boundaryBase, state: 'started' };
		const boundaryName = [...resources.entries()].find(([, value]) => value === boundary)?.[0];
		if (!boundaryName) throw new Error('missing boundary name');
		resources.set(boundaryName, staleStarted);
		const laterRun = contextFor({
			resources,
			factoryStartedAt: '2026-08-22T00:00:00.000Z',
			work,
			runCommand: () => succeededResult()
		});
		await assertRejects(
			() => executeFactoryWorkBoundary(identity, laterRun.context),
			Error,
			'started and stale'
		);
	}
);

Deno.test(
	'pre-reset operational failure receipt cannot authorize a new Factory epoch',
	async () => {
		const resources = new Map<string, Record<string, unknown>>();
		const oldRun = contextFor({
			resources,
			factoryStartedAt: '2026-08-20T00:00:00.000Z',
			runCommand: () => failedResult('git unavailable')
		});
		await executeFactoryFailureBoundary(
			{ ...identity, category: 'prerequisite', operation: 'git-clean' },
			oldRun.context
		);
		const receiptName = [...resources.keys()].find((name) =>
			name.startsWith('factory-execution-failure-')
		);
		if (!receiptName) throw new Error('missing receipt');
		const resetRun = contextFor({
			resources,
			factoryStartedAt: '2026-08-21T00:00:00.000Z'
		});
		await assertRejects(
			() =>
				authorizeFactoryFailure(
					{
						receiptName,
						sourceFactoryId: identity.sourceFactoryId,
						workItem: identity.workItem,
						stage: identity.stage,
						stageCycle: identity.stageCycle,
						dispatchAttempt: identity.dispatchAttempt,
						dispatchRunId: identity.dispatchRunId
					},
					resetRun.context
				),
			Error,
			'stale or substituted'
		);
	}
);
