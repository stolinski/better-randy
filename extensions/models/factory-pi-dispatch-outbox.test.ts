import {
	assert,
	assertEquals,
	assertNotEquals,
	assertRejects
} from 'jsr:@std/assert@1.0.19';
import { ensureDir } from 'jsr:@std/fs@1.0.21';
import { join } from 'jsr:@std/path@1.1.4';

import {
	authorizeFactoryFailure,
	type FactoryFailureAuthorityContext
} from './factory-execution-failure-authority.ts';
import {
	authorizePiSubmissionRetry,
	bindPiHandoff,
	bindPiLaunch,
	claimPiExecution,
	createFactoryPiTransportTask,
	getPiDispatchRequest,
	parkPiSubmission,
	reconcilePiDispatch,
	recordPiSubmissionAttempt,
	reservePiDispatch,
	type PiDispatchOutboxContext
} from './factory-pi-dispatch-outbox.ts';
import { createFactoryFleetWorkerOutputJsonSchema } from './factory-fleet-worker-output-contract.ts';

const FACTORY_ID = '90fac686-c724-4aee-97c4-e31b9af4c5e2';
const PROFILE_ID = 'a480da64-8208-4252-8eec-2ee454cd3a6d';
const PROFILE_MODEL_NAME = 'project-delivery-profile';
const LAUNCH_DIGEST = 'a'.repeat(64);
const OUTBOX_STATES = [
	'reserved',
	'dispatch-recorded',
	'submit-pending',
	'submitted',
	'execution-claimed',
	'handoff-ready',
	'completed',
	'submission-uncertain',
	'submission-retryable',
	'submission-parked',
	'execution-failed'
] as const;

function canonicalize(value: unknown): unknown {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		typeof value === 'number'
	)
		return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, canonicalize(entry)])
	);
}
async function digest(value: unknown): Promise<string> {
	const text = typeof value === 'string' ? value : JSON.stringify(canonicalize(value));
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(): Promise<{
	context: PiDispatchOutboxContext & FactoryFailureAuthorityContext;
	resources: Map<string, Record<string, unknown>>;
	setDispatched: () => void;
	resetDispatchAccounting: () => void;
	reserve: (
		overrides?: Record<string, unknown>
	) => Promise<{ dispatchToken: string; state: string }>;
	addRun: (
		token: string,
		taskDigest: string,
		runId?: string,
		recordAttempt?: boolean
	) => Promise<string>;
	completeRun: (runId: string) => Promise<string>;
	setRunState: (
		runId: string,
		state: 'failed' | 'stopped' | 'rejected' | 'paused'
	) => Promise<void>;
	setRunChildId: (runId: string, childRunId: string) => Promise<void>;
	setRunCwd: (runId: string, cwd: string) => Promise<void>;
	setFactoryStartedAt: (startedAt: string) => void;
	setFactoryStageCycle: (stageCycle: number) => void;
	removeRun: (runId: string) => Promise<void>;
	cleanup: () => Promise<void>;
	request: Record<string, unknown>;
}> {
	const root = await Deno.makeTempDir({ prefix: 'factory-pi-outbox-' });
	const asyncRoot = join(root, 'async');
	const sessionRoot = join(root, 'sessions');
	await ensureDir(asyncRoot);
	await ensureDir(sessionRoot);
	const resources = new Map<string, Record<string, unknown>>();
	let dispatchCount = 0;
	let factoryStageCycle = 1;
	let factoryStartedAt = '2026-08-20T00:00:00.000Z';
	const work = {
		mode: 'dispatch',
		skills: ['implementation'],
		systemPrompt: 'Implement task-1.'
	};
	const request = {
		agent: 'worker',
		task: 'Implement task-1.',
		worktree: true,
		context: 'fork',
		skill: ['implementation'],
		outputSchema: createFactoryFleetWorkerOutputJsonSchema({
			rootEpicId: 'epic-1',
			activeTaskId: 'task-1',
			workItem: 'task-1',
			piKey: 'factory:epic-1:task-1'
		}),
		acceptance: false,
		async: true,
		artifacts: true
	};
	const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
	const context: PiDispatchOutboxContext & FactoryFailureAuthorityContext = {
		globalArgs: {
			sourceFactoryId: FACTORY_ID,
			profileModelName: PROFILE_MODEL_NAME,
			adapters: { failureAuthorizer: { workflow: 'project-failure-authorizer' } }
		},
		modelId: PROFILE_ID,
		repoDir: root,
		piAsyncRoots: [asyncRoot],
		piSessionRoots: [sessionRoot],
		dataRepository: {
			getContent: (_type, _model, name) => {
				if (name === 'state-task-1')
					return Promise.resolve(
						encode({
							workItem: 'task-1',
							stageId: 'implementation',
							startedAt: factoryStartedAt,
							cycles: { implementation: factoryStageCycle },
							dispatches: {
								implementation: { cycle: 1, count: dispatchCount }
							}
						})
					);
				if (name === 'status-task-1')
					return Promise.resolve(
						encode({
							workItem: 'task-1',
							stage: { id: 'implementation', cycle: factoryStageCycle },
							dispatch: {
								attempts: factoryStageCycle === 1 ? dispatchCount : 0
							},
							work
						})
					);
				if (name === 'journal-task-1' && dispatchCount === 1)
					return digest(request).then((requestDigest) =>
						encode({
							event: 'dispatched',
							workItem: 'task-1',
							stageId: 'implementation',
							payload: {
								stageId: 'implementation',
								cycle: 1,
								attempt: 1,
								runId: requestDigest
							}
						})
					);
				return Promise.resolve(null);
			},
			listVersions: (_type, _model, name) =>
				Promise.resolve(name === 'journal-task-1' && dispatchCount === 1 ? [1] : [])
		},
		resolveGitCommonDirectory: (repoDir) => Promise.resolve(repoDir),
		lookupCurrentProfileModel: (profileModelName) =>
			Promise.resolve({
				id: PROFILE_ID,
				name: profileModelName,
				type: '@club_aqua_back_deck/dex-software-factory'
			}),
		queryDexTasks: () =>
			Promise.resolve({
				results: [
					{
						id: 'epic-1',
						parent_id: null,
						completed: false,
						started_at: null,
						blockedBy: []
					},
					{
						id: 'task-1',
						parent_id: 'epic-1',
						completed: false,
						started_at: '2026-08-17T00:00:00Z',
						blockedBy: []
					}
				]
			}),
		logger: { info: () => undefined },
		readResource: (name) => Promise.resolve(resources.get(name) ?? null),
		writeResource: (_spec, name, data) => {
			resources.set(name, structuredClone(data));
			return Promise.resolve({ name });
		},
		piLaunchBindingMaximumInspections: 1,
		now: () => new Date()
	};
	return {
		context,
		resources,
		request,
		setDispatched: () => {
			dispatchCount = 1;
		},
		resetDispatchAccounting: () => {
			dispatchCount = 0;
		},
		reserve: async (overrides = {}) =>
			reservePiDispatch(
				{
					sourceFactoryId: FACTORY_ID,
					workItem: 'task-1',
					rootEpicId: 'epic-1',
					stage: 'implementation',
					stageCycle: 1,
					dispatchAttempt: 1,
					exactFrozenRequestDigest: await digest(request),
					piTaskDigest: await digest(request.task),
					piRequest: request,
					maximumTransportAttempts: 3,
					...overrides
				},
				context
			),
		addRun: async (token, taskDigest, runId = 'run-00000001', recordAttempt = true) => {
			const recordedAttempt = recordAttempt
				? await recordPiSubmissionAttempt(
						{
							dispatchToken: token,
							submissionAttemptId: await digest(`submission:${runId}`)
						},
						context
					)
				: null;
			const latestReceipt = (
				resources.get(`pi-dispatch-outbox-${token}`)?.submissionAttemptReceipts as
					| Array<{
							submissionAttemptId: string;
							ordinal: number;
							receiptDigest: string;
					  }>
					| undefined
			)?.at(-1);
			const submissionAttempt = recordedAttempt
				? {
						submissionAttemptId: await digest(`submission:${runId}`),
						ordinal: recordedAttempt.ordinal,
						receiptDigest: recordedAttempt.submissionAttemptReceiptDigest
					}
				: (latestReceipt ?? {
						submissionAttemptId: '0'.repeat(64),
						ordinal: 1,
						receiptDigest: '0'.repeat(64)
					});
			const runRoot = join(asyncRoot, runId);
			await ensureDir(runRoot);
			const sessionFile = join(sessionRoot, `${runId}.jsonl`);
			const transportTask = createFactoryPiTransportTask(
				request.task,
				PROFILE_MODEL_NAME,
				token,
				taskDigest,
				submissionAttempt
			);
			await Deno.writeTextFile(
				sessionFile,
				JSON.stringify({
					type: 'message',
					message: {
						role: 'user',
						content: [
							{
								type: 'text',
								text: `Task: You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.\n\nTask:\n${transportTask}\n\n---\nUpdate progress at: /tmp/runtime-owned-progress.md`
							}
						]
					}
				})
			);
			await Deno.writeTextFile(
				join(runRoot, 'status.json'),
				JSON.stringify({
					runId,
					mode: 'workflow',
					state: 'running',
					cwd: root,
					steps: [
						{
							agent: 'worker',
							status: 'running',
							sessionFile,
							runId: `${runId}-child`
						}
					]
				})
			);
			return runId;
		},
		completeRun: async (runId) => {
			const runRoot = join(asyncRoot, runId);
			const fixtureText = await Deno.readTextFile(
				join(Deno.cwd(), 'fixtures/pi-workflow-lifecycle/completed-run.json')
			);
			const childRunId = `${runId}-child`;
			const sessionFile = join(sessionRoot, `${runId}.jsonl`);
			const schemaFile = join(sessionRoot, 'structured-output', childRunId, 'schema.json');
			const handoffFile = join(sessionRoot, 'handoffs', `${childRunId}.json`);
			await ensureDir(join(sessionRoot, 'structured-output', childRunId));
			await ensureDir(join(sessionRoot, 'handoffs'));
			const values = JSON.parse(
				fixtureText
					.replaceAll('OUTER_RUN_ID', runId)
					.replaceAll('CHILD_RUN_ID', childRunId)
					.replaceAll('REPO_DIR', root)
					.replaceAll('SESSION_FILE', sessionFile)
					.replaceAll('SCHEMA_FILE', schemaFile)
					.replaceAll('HANDOFF_FILE', handoffFile)
					.replaceAll('PATCH_FILE', join(runRoot, 'task-0-worker.patch'))
			) as { status: unknown; handoff: unknown };
			await Deno.writeTextFile(schemaFile, JSON.stringify(request.outputSchema));
			const handoffText = JSON.stringify(values.handoff);
			await Deno.writeTextFile(handoffFile, handoffText);
			await Deno.writeTextFile(join(runRoot, 'status.json'), JSON.stringify(values.status));
			return digest(handoffText);
		},
		setRunState: async (runId, state) => {
			const statusPath = join(asyncRoot, runId, 'status.json');
			const status = JSON.parse(await Deno.readTextFile(statusPath)) as Record<string, unknown>;
			await Deno.writeTextFile(statusPath, JSON.stringify({ ...status, state }));
		},
		setRunChildId: async (runId, childRunId) => {
			const statusPath = join(asyncRoot, runId, 'status.json');
			const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
				steps: Array<Record<string, unknown>>;
			};
			status.steps[0] = { ...status.steps[0], runId: childRunId };
			await Deno.writeTextFile(statusPath, JSON.stringify(status));
		},
		setRunCwd: async (runId, cwd) => {
			const statusPath = join(asyncRoot, runId, 'status.json');
			const status = JSON.parse(await Deno.readTextFile(statusPath)) as Record<string, unknown>;
			await Deno.writeTextFile(statusPath, JSON.stringify({ ...status, cwd }));
		},
		setFactoryStartedAt: (startedAt) => {
			factoryStartedAt = startedAt;
		},
		setFactoryStageCycle: (stageCycle) => {
			factoryStageCycle = stageCycle;
		},
		removeRun: (runId) => Deno.remove(join(asyncRoot, runId), { recursive: true }),
		cleanup: () => Deno.remove(root, { recursive: true })
	};
}

async function withFixture(run: (value: Fixture) => Promise<void>): Promise<void> {
	const value = await fixture();
	try {
		await run(value);
	} finally {
		await value.cleanup();
	}
}

async function prepareExhaustedBoundRun(
	f: Fixture,
	runId = 'run-exhausted-bound-0001'
): Promise<{ dispatchToken: string; runId: string }> {
	const { dispatchToken } = await f.reserve();
	f.setDispatched();
	const outboxName = `pi-dispatch-outbox-${dispatchToken}`;
	for (let index = 0; index < 3; index += 1) {
		if (index > 0) {
			f.resources.set(outboxName, {
				...f.resources.get(outboxName)!,
				state: 'submission-retryable'
			});
		}
		await recordPiSubmissionAttempt(
			{
				dispatchToken,
				submissionAttemptId: await digest(`submission:exhausted:${index + 1}`)
			},
			f.context
		);
	}
	await f.addRun(dispatchToken, await digest(f.request.task), runId, false);
	await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
	return { dispatchToken, runId };
}

Deno.test('1 failed reservation validation consumes no Factory attempt', () =>
	withFixture(async (f) => {
		await assertRejects(() => f.reserve({ piTaskDigest: '0'.repeat(64) }), Error, 'digests');
		assertEquals(f.resources.size, 0);
	})
);
Deno.test('new Factory cycle ignores prior-cycle dispatch accounting', () =>
	withFixture(async (f) => {
		const first = await f.reserve();
		f.setDispatched();
		f.setFactoryStageCycle(2);
		const second = await f.reserve({ stageCycle: 2 });
		assertEquals(second.state, 'reserved');
		assertNotEquals(second.dispatchToken, first.dispatchToken);
	})
);
Deno.test('configured profile name must match the trusted current model identity', () =>
	withFixture(async (f) => {
		f.context.globalArgs.profileModelName = 'wrong-delivery-profile';
		f.context.lookupCurrentProfileModel = () =>
			Promise.resolve({
				id: PROFILE_ID,
				name: PROFILE_MODEL_NAME,
				type: '@club_aqua_back_deck/dex-software-factory'
			});
		await assertRejects(() => f.reserve(), Error, 'not the current profile model instance');
		assertEquals(f.resources.size, 0);
	})
);
Deno.test('2 reservation precedes dispatch and is harmless when record_dispatch fails', () =>
	withFixture(async (f) => {
		const result = await f.reserve();
		assertEquals(result.state, 'reserved');
		assert(f.resources.has(`pi-dispatch-outbox-${result.dispatchToken}`));
	})
);
Deno.test(
	'3 crash after record_dispatch cannot reconcile before a durable submission attempt',
	() =>
		withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			await assertRejects(
				() => reconcilePiDispatch({ dispatchToken }, f.context),
				Error,
				'durable submission-attempt receipt'
			);
			assertEquals(f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.state, 'reserved');
		})
);
Deno.test('4 read-only reconciliation is idempotent and never consumes transport budget', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const submissionAttemptId = await digest('submission:one');
		const firstAttempt = await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId },
			f.context
		);
		const replayedAttempt = await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId },
			f.context
		);
		assertEquals(firstAttempt.newlyConsumed, true);
		assertEquals(firstAttempt.ordinal, 1);
		assertEquals(replayedAttempt.newlyConsumed, false);
		assertEquals(replayedAttempt.ordinal, 1);
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'submission-retryable');
		await assertRejects(
			() => reconcilePiDispatch({ dispatchToken }, f.context),
			Error,
			'not allowed'
		);
		const outbox = f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!;
		assertEquals(outbox.transportAttempts, 1);
		assertEquals((outbox.submissionAttemptReceipts as unknown[]).length, 1);
		assertEquals(outbox.dispatchAttempt, 1);
	})
);
Deno.test('5 lost acknowledgement binds the existing Pi run', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const taskDigest = await digest(f.request.task);
		const runId = await f.addRun(dispatchToken, taskDigest);
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result, {
			dataHandles: result.dataHandles,
			state: 'submitted',
			piRunId: runId
		});
	})
);
for (const sessionCase of [
	{
		name: 'wrong task',
		contents: JSON.stringify({
			type: 'message',
			message: { role: 'user', content: [{ type: 'text', text: 'Task: unrelated work' }] }
		})
	},
	{ name: 'not yet written task', contents: '' }
]) {
	Deno.test(`an acknowledged Pi run with a ${sessionCase.name} is uncertain`, () =>
		withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(dispatchToken, await digest(f.request.task));
			const status = JSON.parse(
				await Deno.readTextFile(join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json'))
			) as { steps: Array<{ sessionFile: string }> };
			await Deno.writeTextFile(status.steps[0]!.sessionFile, sessionCase.contents);
			await assertRejects(
				() => bindPiLaunch({ dispatchToken, piRunId: runId }, f.context),
				Error,
				'malformed'
			);
			const outbox = f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!;
			assertEquals(outbox.state, 'submission-uncertain');
			assertEquals(outbox.parkedReason, 'invalid-runtime-artifact');
		})
	);
}
Deno.test('launch binding waits for the exact Prompt Audit task before accepting the run', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const asyncRoot = (f.context.piAsyncRoots ?? [])[0]!;
		const statusPath = join(asyncRoot, runId, 'status.json');
		const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
			steps: Array<{ sessionFile: string }>;
			workflow?: Record<string, unknown>;
		};
		status.workflow = { trace: [], emits: [], console: [] };
		await Deno.writeTextFile(statusPath, JSON.stringify(status));
		await ensureDir(join(asyncRoot, '.active-runs'));
		const sessionFile = status.steps[0]!.sessionFile;
		const exactSession = await Deno.readTextFile(sessionFile);
		await Deno.writeTextFile(
			sessionFile,
			JSON.stringify({
				type: 'message',
				message: {
					role: 'toolResult',
					content: [{ type: 'text', text: exactSession }]
				}
			})
		);
		let waits = 0;
		f.context.piLaunchBindingMaximumInspections = 2;
		f.context.waitForPiRuntimeArtifact = async () => {
			waits += 1;
			await Deno.writeTextFile(sessionFile, exactSession);
		};
		const result = await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
		assertEquals(result.state, 'submitted');
		assertEquals(result.piRunId, runId);
		assertEquals(waits, 1);
	})
);
Deno.test('execution claim resolves the live child identity from the runtime session', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const statusPath = join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json');
		const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
			state: string;
			steps: Array<{ runId?: string; sessionFile: string }>;
		};
		status.state = 'paused';
		delete status.steps[0]!.runId;
		await Deno.writeTextFile(statusPath, JSON.stringify(status));
		const childRunId = 'child-session-0001';
		const sessionFile = status.steps[0]!.sessionFile;
		const repeatedChildSessionInfo = JSON.stringify({
			type: 'session_info',
			name: `subagent-worker-${childRunId}-1`
		});
		await Deno.writeTextFile(
			sessionFile,
			`${await Deno.readTextFile(sessionFile)}\n${repeatedChildSessionInfo}\n${repeatedChildSessionInfo}`
		);
		const result = await claimPiExecution(
			{ dispatchToken, piRunId: childRunId },
			f.context
		);
		assertEquals(result.granted, true);
		assertEquals(result.ownerPiRunId, runId);
	})
);
Deno.test('execution claim rejects a paused child whose step is no longer running', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const statusPath = join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json');
		const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
			state: string;
			steps: Array<{ status: string; runId?: string; sessionFile: string }>;
		};
		status.state = 'paused';
		status.steps[0]!.status = 'failed';
		delete status.steps[0]!.runId;
		await Deno.writeTextFile(statusPath, JSON.stringify(status));
		const childRunId = 'child-session-0001';
		const sessionFile = status.steps[0]!.sessionFile;
		await Deno.writeTextFile(
			sessionFile,
			`${await Deno.readTextFile(sessionFile)}\n${JSON.stringify({
				type: 'session_info',
				name: `subagent-worker-${childRunId}-1`
			})}`
		);
		await assertRejects(
			() => claimPiExecution({ dispatchToken, piRunId: childRunId }, f.context),
			Error,
			'one verified'
		);
	})
);
Deno.test('execution claim rejects a paused step child without runtime session identity', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await f.setRunState(runId, 'paused');
		await assertRejects(
			() =>
				claimPiExecution(
					{ dispatchToken, piRunId: `${runId}-child` },
					f.context
				),
			Error,
			'one verified'
		);
	})
);
Deno.test('execution claim rejects conflicting runtime session child identities', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const statusPath = join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json');
		const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
			steps: Array<{ runId?: string; sessionFile: string }>;
		};
		delete status.steps[0]!.runId;
		await Deno.writeTextFile(statusPath, JSON.stringify(status));
		const childRunId = 'child-session-0001';
		const sessionFile = status.steps[0]!.sessionFile;
		await Deno.writeTextFile(
			sessionFile,
			`${await Deno.readTextFile(sessionFile)}\n${JSON.stringify({
				type: 'session_info',
				name: `subagent-worker-${childRunId}-1`
			})}\n${JSON.stringify({
				type: 'session_info',
				name: 'subagent-worker-conflict-child-0002-1'
			})}`
		);
		await assertRejects(
			() => claimPiExecution({ dispatchToken, piRunId: childRunId }, f.context),
			Error,
			'one verified'
		);
	})
);
Deno.test('execution claim rejects a valid child identity beside a malformed relevant candidate', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await ensureDir(join((f.context.piAsyncRoots ?? [])[0]!, 'malformed-relevant-run'));
		await assertRejects(
			() =>
				claimPiExecution(
					{ dispatchToken, piRunId: `${runId}-child` },
					f.context
				),
			Error,
			'one verified'
		);
	})
);
Deno.test('execution claim waits for Pi to publish the child run identity', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const statusPath = join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json');
		const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
			steps: Array<{ runId?: string }>;
		};
		delete status.steps[0]!.runId;
		await Deno.writeTextFile(statusPath, JSON.stringify(status));
		let waits = 0;
		f.context.piLaunchBindingMaximumInspections = 2;
		f.context.waitForPiRuntimeArtifact = async () => {
			waits += 1;
			await f.setRunChildId(runId, `${runId}-child`);
		};
		const result = await claimPiExecution(
			{ dispatchToken, piRunId: `${runId}-child` },
			f.context
		);
		assertEquals(result.granted, true);
		assertEquals(result.ownerPiRunId, runId);
		assertEquals(waits, 1);
	})
);
Deno.test('6 unavailable runtime pauses rather than inventing failure', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId: await digest('submission:unavailable') },
			f.context
		);
		f.context.piAsyncRoots = [join('/', 'unavailable')];
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'submission-uncertain');
	})
);
Deno.test('runtime root is unavailable when realpath succeeds but directory listing fails', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId: await digest('submission:unlistable') },
			f.context
		);
		const unlistableRoot = join(f.context.repoDir, 'runtime-root-file');
		await Deno.writeTextFile(unlistableRoot, 'not a directory');
		f.context.piAsyncRoots = [unlistableRoot];
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'submission-uncertain');
		assertEquals(
			f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.parkedReason,
			'runtime-unavailable'
		);
	})
);
Deno.test('7 duplicate delivery cannot claim after one run reaches execution-claimed', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const taskDigest = await digest(f.request.task);
		const owner = await f.addRun(dispatchToken, taskDigest, 'run-00000001');
		await bindPiLaunch({ dispatchToken, piRunId: owner }, f.context);
		const first = await claimPiExecution({ dispatchToken, piRunId: owner }, f.context);
		await f.addRun(dispatchToken, taskDigest, 'run-00000002', false);
		await assertRejects(
			() => claimPiExecution({ dispatchToken, piRunId: 'run-00000002' }, f.context),
			Error,
			'not allowed'
		);
		assertEquals(first.granted, true);
		assertEquals(f.resources.get(`pi-execution-claim-${dispatchToken}`)!.piRunId, owner);
	})
);
Deno.test('8 wrong work item, cycle, attempt, digest, and run fail closed', () =>
	withFixture(async (f) => {
		await assertRejects(() => f.reserve({ workItem: 'other' }), Error);
		await assertRejects(() => f.reserve({ stageCycle: 2 }), Error);
		await assertRejects(() => f.reserve({ dispatchAttempt: 2 }), Error);
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await assertRejects(
			() => bindPiLaunch({ dispatchToken, piRunId: 'run-99999999' }, f.context),
			Error
		);
	})
);
Deno.test('execution claim cannot bind a run without a submission-attempt receipt', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(
			dispatchToken,
			await digest(f.request.task),
			'run-no-attempt-claim',
			false
		);
		await assertRejects(
			() => claimPiExecution({ dispatchToken, piRunId: runId }, f.context),
			Error,
			'durable submission-attempt receipt'
		);
		assertEquals(f.resources.has(`pi-execution-claim-${dispatchToken}`), false);
	})
);
Deno.test('reconciliation cannot bind a run without a submission-attempt receipt', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await f.addRun(dispatchToken, await digest(f.request.task), 'run-no-attempt-reconcile', false);
		await assertRejects(
			() => reconcilePiDispatch({ dispatchToken }, f.context),
			Error,
			'durable submission-attempt receipt'
		);
		assertEquals(f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.piRunId, undefined);
		assertEquals(f.resources.has(`pi-launch-receipt-${dispatchToken}`), false);
	})
);
Deno.test('reservation persists and returns the exact canonical frozen Pi request', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		const canonicalFrozenPiRequest = JSON.stringify(canonicalize(f.request));
		assertEquals(
			f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.canonicalFrozenPiRequest,
			canonicalFrozenPiRequest
		);
		const stored = await getPiDispatchRequest({ dispatchToken }, f.context);
		assertEquals(stored.dispatchToken, dispatchToken);
		assertEquals(stored.state, 'reserved');
		assertEquals(stored.profileModelName, PROFILE_MODEL_NAME);
		assertEquals(
			f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.profileModelName,
			PROFILE_MODEL_NAME
		);
		assertEquals(stored.canonicalFrozenPiRequest, canonicalFrozenPiRequest);
		assertEquals(stored.exactFrozenRequestDigest, await digest(f.request));
		const name = `pi-dispatch-outbox-${dispatchToken}`;
		f.resources.set(name, {
			...f.resources.get(name)!,
			piRequest: { ...f.request, task: 'caller-substituted task' }
		});
		await assertRejects(
			() => getPiDispatchRequest({ dispatchToken }, f.context),
			Error,
			'canonical frozen request'
		);
	})
);
Deno.test('fresh submission attempt IDs are rejected from every non-retryable state', async () => {
	const disallowedStates = [
		'submit-pending',
		'submission-uncertain',
		'submission-parked',
		'submitted',
		'execution-claimed',
		'handoff-ready',
		'completed',
		'execution-failed'
	] as const;
	for (const state of disallowedStates) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			await recordPiSubmissionAttempt(
				{ dispatchToken, submissionAttemptId: await digest(`submission:${state}:first`) },
				f.context
			);
			const name = `pi-dispatch-outbox-${dispatchToken}`;
			f.resources.set(name, {
				...f.resources.get(name)!,
				state,
				...(state === 'submitted' ||
				state === 'execution-claimed' ||
				state === 'handoff-ready' ||
				state === 'completed' ||
				state === 'execution-failed'
					? { piRunId: `run-bound-${state}` }
					: {})
			});
			const freshSubmissionAttemptId = await digest(`submission:${state}:fresh`);
			await assertRejects(
				() =>
					recordPiSubmissionAttempt(
						{ dispatchToken, submissionAttemptId: freshSubmissionAttemptId },
						f.context
					),
				Error,
				'not allowed'
			);
		});
	}
});
Deno.test('bind launch source-state transition table is exhaustive', async () => {
	for (const state of OUTBOX_STATES) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(
				dispatchToken,
				await digest(f.request.task),
				`run-bind-${state.replaceAll(/[^a-z]/g, '').slice(0, 20)}`
			);
			const name = `pi-dispatch-outbox-${dispatchToken}`;
			f.resources.set(name, { ...f.resources.get(name)!, state });
			if (state === 'submit-pending') {
				assertEquals(
					(await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context)).state,
					'submitted'
				);
			} else {
				await assertRejects(
					() => bindPiLaunch({ dispatchToken, piRunId: runId }, f.context),
					Error,
					'not allowed'
				);
			}
		});
	}
});
Deno.test('execution claim source-state transition table is exhaustive', async () => {
	for (const state of OUTBOX_STATES) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(
				dispatchToken,
				await digest(f.request.task),
				`run-claim-${state.replaceAll(/[^a-z]/g, '').slice(0, 20)}`
			);
			if (state === 'submitted') await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
			else if (state !== 'submit-pending') {
				const name = `pi-dispatch-outbox-${dispatchToken}`;
				f.resources.set(name, { ...f.resources.get(name)!, state });
			}
			if (state === 'submit-pending' || state === 'submitted') {
				const result = await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
				assertEquals(result.granted, true);
				assertEquals(result.ownerPiRunId, runId);
			} else {
				await assertRejects(
					() => claimPiExecution({ dispatchToken, piRunId: runId }, f.context),
					Error,
					'not allowed'
				);
			}
		});
	}
});
Deno.test('handoff binding source-state transition table is exhaustive', async () => {
	for (const state of OUTBOX_STATES) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(
				dispatchToken,
				await digest(f.request.task),
				`run-handoff-${state.replaceAll(/[^a-z]/g, '').slice(0, 18)}`
			);
			const claim = await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
			const handoffDigest = await f.completeRun(runId);
			if (state !== 'execution-claimed') {
				const name = `pi-dispatch-outbox-${dispatchToken}`;
				f.resources.set(name, { ...f.resources.get(name)!, state });
			}
			const bind = () =>
				bindPiHandoff(
					{
						dispatchToken,
						piRunId: runId,
						claimNonce: claim.claimNonce!,
						handoffDigest,
						launchContractDigest: LAUNCH_DIGEST
					},
					f.context
				);
			if (state === 'execution-claimed') assertEquals((await bind()).state, 'handoff-ready');
			else await assertRejects(bind, Error, 'not allowed');
		});
	}
});
Deno.test('reconciliation source-state transition table is exhaustive', async () => {
	const allowedStates = new Set([
		'submit-pending',
		'submitted',
		'execution-claimed',
		'handoff-ready'
	]);
	for (const state of OUTBOX_STATES) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(
				dispatchToken,
				await digest(f.request.task),
				`run-reconcile-${state.replaceAll(/[^a-z]/g, '').slice(0, 16)}`
			);
			if (state === 'submitted') {
				await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
			} else if (state === 'execution-claimed' || state === 'handoff-ready') {
				const claim = await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
				if (state === 'handoff-ready') {
					const handoffDigest = await f.completeRun(runId);
					await bindPiHandoff(
						{
							dispatchToken,
							piRunId: runId,
							claimNonce: claim.claimNonce!,
							handoffDigest,
							launchContractDigest: LAUNCH_DIGEST
						},
						f.context
					);
				}
			} else if (state !== 'submit-pending') {
				const name = `pi-dispatch-outbox-${dispatchToken}`;
				f.resources.set(name, { ...f.resources.get(name)!, state });
			}
			if (allowedStates.has(state)) await reconcilePiDispatch({ dispatchToken }, f.context);
			else
				await assertRejects(
					() => reconcilePiDispatch({ dispatchToken }, f.context),
					Error,
					'not allowed'
				);
		});
	}
});
Deno.test('human retry authorization source-state transition table is exhaustive', async () => {
	for (const state of OUTBOX_STATES) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			await recordPiSubmissionAttempt(
				{ dispatchToken, submissionAttemptId: await digest(`submission:human:${state}`) },
				f.context
			);
			const name = `pi-dispatch-outbox-${dispatchToken}`;
			f.resources.set(name, { ...f.resources.get(name)!, state });
			const authorize = () =>
				authorizePiSubmissionRetry(
					{ dispatchToken, resolution: 'human-confirmed-no-live-run' },
					f.context
				);
			if (state === 'submission-uncertain' || state === 'submission-parked')
				assertEquals((await authorize()).state, 'submission-retryable');
			else await assertRejects(authorize, Error, 'not allowed');
		});
	}
});
Deno.test('submission parking source-state transition table is exhaustive', async () => {
	const allowedStates = new Set(['submit-pending', 'submission-uncertain']);
	for (const state of OUTBOX_STATES) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			await recordPiSubmissionAttempt(
				{ dispatchToken, submissionAttemptId: await digest(`submission:park:${state}`) },
				f.context
			);
			const name = `pi-dispatch-outbox-${dispatchToken}`;
			f.resources.set(name, { ...f.resources.get(name)!, state });
			const park = () =>
				parkPiSubmission({ dispatchToken, reason: 'ambiguous-runtime' }, f.context);
			if (allowedStates.has(state)) assertEquals((await park()).state, 'submission-parked');
			else await assertRejects(park, Error, 'not allowed');
		});
	}
});
Deno.test('submission parking rejects a bound run even in an otherwise parkable state', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId: await digest('submission:park:bound') },
			f.context
		);
		const name = `pi-dispatch-outbox-${dispatchToken}`;
		f.resources.set(name, {
			...f.resources.get(name)!,
			state: 'submission-uncertain',
			piRunId: 'run-bound-park'
		});
		await assertRejects(
			() => parkPiSubmission({ dispatchToken, reason: 'ambiguous-runtime' }, f.context),
			Error,
			'bound or claimed'
		);
	})
);
Deno.test('9 claimed handoff requires exact run and nonce', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
		const claim = await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
		const handoffDigest = await f.completeRun(runId);
		await assertRejects(
			() =>
				bindPiHandoff(
					{
						dispatchToken,
						piRunId: runId,
						claimNonce: '0'.repeat(64),
						handoffDigest,
						launchContractDigest: LAUNCH_DIGEST
					},
					f.context
				),
			Error
		);
		await assertRejects(
			() =>
				bindPiHandoff(
					{
						dispatchToken,
						piRunId: runId,
						claimNonce: claim.claimNonce!,
						handoffDigest,
						launchContractDigest: 'c'.repeat(64)
					},
					f.context
				),
			Error,
			'verified final'
		);
		const accepted = await bindPiHandoff(
			{
				dispatchToken,
				piRunId: runId,
				claimNonce: claim.claimNonce!,
				handoffDigest,
				launchContractDigest: LAUNCH_DIGEST
			},
			f.context
		);
		assertEquals(accepted.accepted, true);
	})
);
Deno.test('10 one root submission state does not block an unrelated reservation', () =>
	withFixture(async (first) => {
		await first.reserve();
		first.setDispatched();
		await withFixture(async (second) => assertEquals((await second.reserve()).state, 'reserved'));
	})
);
Deno.test('11 reservation restart and reconciliation are idempotent', () =>
	withFixture(async (f) => {
		const firstReservation = await f.reserve();
		const secondReservation = await f.reserve();
		assertEquals(firstReservation.dispatchToken, secondReservation.dispatchToken);
		f.setDispatched();
		await f.addRun(firstReservation.dispatchToken, await digest(f.request.task));
		const first = await reconcilePiDispatch(
			{ dispatchToken: firstReservation.dispatchToken },
			f.context
		);
		const second = await reconcilePiDispatch(
			{ dispatchToken: firstReservation.dispatchToken },
			f.context
		);
		assertEquals(first.piRunId, second.piRunId);
		assertEquals(second.state, 'submitted');
	})
);
Deno.test('12 only explicit distinct submission attempts exhaust the bounded budget', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve({
			maximumTransportAttempts: 2
		});
		f.setDispatched();
		await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId: await digest('submission:one') },
			f.context
		);
		await reconcilePiDispatch({ dispatchToken }, f.context);
		await recordPiSubmissionAttempt(
			{ dispatchToken, submissionAttemptId: await digest('submission:two') },
			f.context
		);
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'submission-parked');
		assertEquals(f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.transportAttempts, 2);
	})
);
Deno.test('13 ambiguous duplicate runtime pauses until a claim identifies the owner', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const taskDigest = await digest(f.request.task);
		await f.addRun(dispatchToken, taskDigest, 'run-00000001');
		await f.addRun(dispatchToken, taskDigest, 'run-00000002', false);
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'submission-uncertain');
	})
);
Deno.test('14 mismatched task token is not accepted as a Pi receipt', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await f.addRun(dispatchToken, '0'.repeat(64));
		await assertRejects(
			() => bindPiLaunch({ dispatchToken, piRunId: 'run-00000001' }, f.context),
			Error,
			'malformed'
		);
		assertEquals(
			f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.state,
			'submission-uncertain'
		);
	})
);

Deno.test('15 submitted dispatch never regresses when runtime scan later misses', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
		await f.removeRun(runId);
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'submitted');
		assertEquals(f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.transportAttempts, 1);
	})
);
Deno.test('16 execution claim never regresses when runtime scan later misses', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
		await f.removeRun(runId);
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'execution-claimed'
		);
	})
);
Deno.test('17 handoff-ready and completed dispatches never regress or relaunch', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const claim = await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
		const handoffDigest = await f.completeRun(runId);
		await bindPiHandoff(
			{
				dispatchToken,
				piRunId: runId,
				claimNonce: claim.claimNonce!,
				handoffDigest,
				launchContractDigest: LAUNCH_DIGEST
			},
			f.context
		);
		await f.removeRun(runId);
		assertEquals((await reconcilePiDispatch({ dispatchToken }, f.context)).state, 'handoff-ready');
		const name = `pi-dispatch-outbox-${dispatchToken}`;
		f.resources.set(name, { ...f.resources.get(name)!, state: 'completed' });
		await assertRejects(
			() => reconcilePiDispatch({ dispatchToken }, f.context),
			Error,
			'not allowed'
		);
	})
);
Deno.test('18 final handoff fails closed when the persisted output schema differs', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const claim = await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
		const handoffDigest = await f.completeRun(runId);
		const status = JSON.parse(
			await Deno.readTextFile(join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json'))
		) as {
			workflow: {
				value: { results: Array<{ structuredOutputSchemaPath: string }> };
			};
		};
		await Deno.writeTextFile(
			status.workflow.value.results[0]!.structuredOutputSchemaPath,
			JSON.stringify({ type: 'object' })
		);
		await assertRejects(
			() =>
				bindPiHandoff(
					{
						dispatchToken,
						piRunId: runId,
						claimNonce: claim.claimNonce!,
						handoffDigest,
						launchContractDigest: LAUNCH_DIGEST
					},
					f.context
				),
			Error,
			'verified final'
		);
	})
);
Deno.test('19 reservation rejects caller-invented schema even when it mentions the lane', () =>
	withFixture(async (f) => {
		const piRequest = {
			...f.request,
			outputSchema: { type: 'object', description: 'task-1 epic-1' }
		};
		const requestDigest = await digest(piRequest);
		await assertRejects(
			() => f.reserve({ piRequest, exactFrozenRequestDigest: requestDigest }),
			Error,
			'exact canonical'
		);
	})
);
Deno.test('20 reservation independently rejects a caller-invented effective root', () =>
	withFixture(async (f) => {
		const outputSchema = createFactoryFleetWorkerOutputJsonSchema({
			rootEpicId: 'false-root',
			activeTaskId: 'task-1',
			workItem: 'task-1',
			piKey: 'factory:false-root:task-1'
		});
		const piRequest = { ...f.request, outputSchema };
		const requestDigest = await digest(piRequest);
		await assertRejects(
			() =>
				f.reserve({
					rootEpicId: 'false-root',
					piRequest,
					exactFrozenRequestDigest: requestDigest
				}),
			Error,
			'Dex ancestry'
		);
	})
);
Deno.test(
	'21 pre-claim rejected, failed, and stopped are definite retryable transport failures',
	async () => {
		for (const [index, state] of ['rejected', 'failed', 'stopped'].entries()) {
			await withFixture(async (f) => {
				const runId = `run-terminal-000${index}`;
				const { dispatchToken } = await f.reserve();
				f.setDispatched();
				await f.addRun(dispatchToken, await digest(f.request.task), runId);
				await f.setRunState(runId, state as 'rejected' | 'failed' | 'stopped');
				const result = await reconcilePiDispatch({ dispatchToken }, f.context);
				assertEquals(result.state, 'submission-retryable');
				assertEquals(f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.piRunId, undefined);
			});
		}
	}
);
Deno.test('22 a failed submission attempt cannot poison its bound running retry', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const taskDigest = await digest(f.request.task);
		const failedRunId = await f.addRun(dispatchToken, taskDigest, 'run-failed-attempt-0001');
		await f.setRunState(failedRunId, 'failed');
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'submission-retryable'
		);

		const ownerRunId = await f.addRun(dispatchToken, taskDigest, 'run-retry-owner-0002');
		await bindPiLaunch({ dispatchToken, piRunId: ownerRunId }, f.context);
		const forbiddenAttemptId = await digest('submission:forbidden-third');
		await assertRejects(
			() =>
				recordPiSubmissionAttempt(
					{ dispatchToken, submissionAttemptId: forbiddenAttemptId },
					f.context
				),
			Error,
			'not allowed'
		);
		const reconciled = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(reconciled.state, 'submitted');
		assertEquals(reconciled.piRunId, ownerRunId);
		assertEquals(f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.transportAttempts, 2);

		const claim = await claimPiExecution({ dispatchToken, piRunId: ownerRunId }, f.context);
		assertEquals(claim.granted, true);
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'execution-claimed'
		);
		const handoffDigest = await f.completeRun(ownerRunId);
		const handoff = await bindPiHandoff(
			{
				dispatchToken,
				piRunId: ownerRunId,
				claimNonce: claim.claimNonce!,
				handoffDigest,
				launchContractDigest: LAUNCH_DIGEST
			},
			f.context
		);
		assertEquals(handoff.state, 'handoff-ready');
	})
);
Deno.test('23 pre-claim and claimed paused lifecycles remain submission-uncertain', async () => {
	await withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await f.setRunState(runId, 'paused');
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'submission-uncertain'
		);
	});
	await withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
		await f.setRunState(runId, 'paused');
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'submission-uncertain'
		);
	});
});
Deno.test('claimed supervisor-paused outer normalizes its failed child lifecycle', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
		const statusPath = join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json');
		const status = JSON.parse(await Deno.readTextFile(statusPath)) as {
			state: string;
			steps: Array<{ status: string }>;
		};
		status.state = 'paused';
		status.steps[0]!.status = 'failed';
		await Deno.writeTextFile(statusPath, JSON.stringify(status));
		const result = await reconcilePiDispatch({ dispatchToken }, f.context);
		assertEquals(result.state, 'execution-failed');
		const outbox = f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!;
		const piFailure = [...f.resources.values()].find(
			(value) => value.receiptDigest === outbox.piExecutionFailureReceiptDigest
		)!;
		assertEquals(piFailure.runtimeState, 'failed');
	})
);
Deno.test(
	'24 claimed failed, stopped, and rejected lifecycles enter trusted recovery',
	async () => {
		for (const [index, state] of ['failed', 'stopped', 'rejected'].entries()) {
			await withFixture(async (f) => {
				const { dispatchToken } = await f.reserve();
				f.setDispatched();
				const runId = await f.addRun(
					dispatchToken,
					await digest(f.request.task),
					`run-claimed-000${index}`
				);
				await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
				await claimPiExecution({ dispatchToken, piRunId: runId }, f.context);
				await f.setRunState(runId, state as 'failed' | 'stopped' | 'rejected');
				const result = await reconcilePiDispatch({ dispatchToken }, f.context);
				assertEquals(result.state, 'execution-failed');
				assertEquals(result.piRunId, runId);
				assert(result.factoryExecutionFailureReceiptName);
				const outbox = f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!;
				assertEquals(outbox.failureAuthorizerWorkflow, 'project-failure-authorizer');
				const authorityReceipt = f.resources.get(result.factoryExecutionFailureReceiptName)!;
				assertEquals(authorityReceipt.authorityWorkflow, 'project-failure-authorizer');
				const piFailure = [...f.resources.values()].find(
					(value) => value.receiptDigest === outbox.piExecutionFailureReceiptDigest
				)!;
				assertEquals(piFailure.piRunId, runId);
				assertEquals(piFailure.runtimeState, state);
				assertEquals(piFailure.claimNonceDigest, outbox.claimNonceDigest);
				assertEquals(piFailure.piRuntimeReceiptDigest, outbox.piRuntimeReceiptDigest);
				await authorizeFactoryFailure(
					{
						receiptName: result.factoryExecutionFailureReceiptName,
						sourceFactoryId: FACTORY_ID,
						workItem: 'task-1',
						stage: 'implementation',
						stageCycle: 1,
						dispatchAttempt: 1,
						dispatchRunId: await digest(f.request)
					},
					f.context
				);
				assert(
					[...f.resources.keys()].some((name) => name.startsWith('authorized-')),
					'trusted Pi failure should enter the existing operational authorizer path'
				);
			});
		}
	}
);
Deno.test('25 malformed relevant workflow lifecycle becomes submission-uncertain', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await recordPiSubmissionAttempt(
			{
				dispatchToken,
				submissionAttemptId: await digest('submission:malformed')
			},
			f.context
		);
		const runId = 'run-malformed-0001';
		await ensureDir(join((f.context.piAsyncRoots ?? [])[0]!, runId));
		await Deno.writeTextFile(
			join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json'),
			'{not-json'
		);
		await assertRejects(
			() => bindPiLaunch({ dispatchToken, piRunId: runId }, f.context),
			Error,
			'malformed'
		);
		assertEquals(
			f.resources.get(`pi-dispatch-outbox-${dispatchToken}`)!.state,
			'submission-uncertain'
		);
		await withFixture(async (other) => assertEquals((await other.reserve()).state, 'reserved'));
	})
);
Deno.test('25 full lost-ack scan fails closed on a newly created truncated candidate', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		await recordPiSubmissionAttempt(
			{
				dispatchToken,
				submissionAttemptId: await digest('submission:truncated')
			},
			f.context
		);
		const runId = 'run-truncated-001';
		const runRoot = join((f.context.piAsyncRoots ?? [])[0]!, runId);
		await ensureDir(runRoot);
		await Deno.writeTextFile(
			join(runRoot, 'run-fanout-budget.json'),
			JSON.stringify({
				version: 1,
				rootRunId: runId,
				limit: 64,
				createdAt: Date.now()
			})
		);
		await Deno.writeTextFile(join(runRoot, 'status.json'), '{"runId":"run-truncated');
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'submission-uncertain'
		);
	})
);
Deno.test('26 full lost-ack scan ignores an unrelated old malformed candidate', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = 'run-old-broken-01';
		const runRoot = join((f.context.piAsyncRoots ?? [])[0]!, runId);
		await ensureDir(runRoot);
		await Deno.writeTextFile(
			join(runRoot, 'run-fanout-budget.json'),
			JSON.stringify({
				version: 1,
				rootRunId: runId,
				limit: 64,
				createdAt: 946684800000
			})
		);
		await Deno.writeTextFile(join(runRoot, 'status.json'), '{old-broken');
		const old = new Date('2000-01-01T00:00:00.000Z');
		await Deno.utime(runRoot, old, old);
		await recordPiSubmissionAttempt(
			{
				dispatchToken,
				submissionAttemptId: await digest('submission:after-old')
			},
			f.context
		);
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'submission-retryable'
		);
	})
);
Deno.test('27 full lost-ack scan fails closed when a new candidate session is unreadable', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const runId = await f.addRun(dispatchToken, await digest(f.request.task));
		const status = JSON.parse(
			await Deno.readTextFile(join((f.context.piAsyncRoots ?? [])[0]!, runId, 'status.json'))
		) as { steps: Array<{ sessionFile: string }> };
		await Deno.remove(status.steps[0]!.sessionFile);
		assertEquals(
			(await reconcilePiDispatch({ dispatchToken }, f.context)).state,
			'submission-uncertain'
		);
	})
);

Deno.test(
	'claim normalizes the sole child PI_SUBAGENT_RUN_ID to the top-level workflow owner',
	() =>
		withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const outerRunId = await f.addRun(dispatchToken, await digest(f.request.task));
			const result = await claimPiExecution(
				{ dispatchToken, piRunId: `${outerRunId}-child` },
				f.context
			);
			assertEquals(result.ownerPiRunId, outerRunId);
			assertEquals(f.resources.get(`pi-execution-claim-${dispatchToken}`)?.piRunId, outerRunId);
		})
);

Deno.test('bind launch rejects a child run id while ambiguous child matches grant no claim', () =>
	withFixture(async (f) => {
		const { dispatchToken } = await f.reserve();
		f.setDispatched();
		const first = await f.addRun(dispatchToken, await digest(f.request.task));
		await assertRejects(
			() => bindPiLaunch({ dispatchToken, piRunId: `${first}-child` }, f.context),
			Error,
			'child-scoped'
		);
		const second = await f.addRun(
			dispatchToken,
			await digest(f.request.task),
			'run-00000002',
			false
		);
		await f.setRunChildId(first, 'duplicate-child');
		await f.setRunChildId(second, 'duplicate-child');
		await assertRejects(
			() => claimPiExecution({ dispatchToken, piRunId: 'duplicate-child' }, f.context),
			Error,
			'one verified'
		);
	})
);

Deno.test(
	'linked worktree repository identity passes while different or unknown Git identity fails closed',
	() =>
		withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(dispatchToken, await digest(f.request.task));
			await f.setRunCwd(runId, '/linked/worktree');
			f.context.resolveGitCommonDirectory = (repoDir) =>
				Promise.resolve(repoDir === '/different/repo' ? '/different/.git' : '/shared/.git');
			await bindPiLaunch({ dispatchToken, piRunId: runId }, f.context);
		})
);

Deno.test('post-reset reservation rejects incomplete transport exhaustion', () =>
	withFixture(async (f) => {
		const first = await f.reserve();
		const name = `pi-dispatch-outbox-${first.dispatchToken}`;
		f.resources.set(name, {
			...f.resources.get(name)!,
			state: 'submitted',
			piRunId: 'bound-run-0001',
			updatedAt: '2026-08-21T00:00:00.000Z'
		});
		f.setFactoryStartedAt('2026-08-22T00:00:00.000Z');
		await assertRejects(() => f.reserve(), Error, 'not a safely recyclable');
	})
);

Deno.test('post-reset reservation versions a durably exhausted bound but unclaimed launch', () =>
	withFixture(async (f) => {
		const { dispatchToken, runId } = await prepareExhaustedBoundRun(f);
		const name = `pi-dispatch-outbox-${dispatchToken}`;
		assertEquals(f.resources.get(name)?.state, 'submitted');
		assertEquals(f.resources.get(name)?.piRunId, runId);
		assertEquals(f.resources.get(name)?.transportAttempts, 3);
		f.resetDispatchAccounting();
		f.setFactoryStartedAt('2026-08-22T00:00:00.000Z');
		const reset = await f.reserve();
		assertEquals(reset.state, 'reserved');
		assertEquals(f.resources.get(name)?.factoryStartedAt, '2026-08-22T00:00:00.000Z');
		assertEquals(f.resources.get(name)?.transportAttempts, 0);
		assertEquals(f.resources.get(name)?.piRunId, undefined);
	})
);

Deno.test('post-reset reservation rejects a durably exhausted launch with an execution claim', () =>
	withFixture(async (f) => {
		const { dispatchToken, runId } = await prepareExhaustedBoundRun(
			f,
			'run-exhausted-claimed-0001'
		);
		const claim = await claimPiExecution(
			{ dispatchToken, piRunId: `${runId}-child` },
			f.context
		);
		assertEquals(claim.granted, true);
		const name = `pi-dispatch-outbox-${dispatchToken}`;
		f.resources.set(name, {
			...f.resources.get(name)!,
			state: 'submitted'
		});
		f.resetDispatchAccounting();
		f.setFactoryStartedAt('2026-08-22T00:00:00.000Z');
		await assertRejects(() => f.reserve(), Error, 'not a safely recyclable');
	})
);

Deno.test('different or unresolvable Git repository identity fails closed', async () => {
	for (const resolution of ['different', 'unknown'] as const) {
		await withFixture(async (f) => {
			const { dispatchToken } = await f.reserve();
			f.setDispatched();
			const runId = await f.addRun(dispatchToken, await digest(f.request.task));
			await f.setRunCwd(runId, '/other/worktree');
			f.context.resolveGitCommonDirectory = (repoDir) =>
				resolution === 'unknown'
					? Promise.resolve(null)
					: Promise.resolve(repoDir === '/other/worktree' ? '/other/.git' : '/shared/.git');
			await assertRejects(
				() => bindPiLaunch({ dispatchToken, piRunId: runId }, f.context),
				Error,
				'malformed'
			);
		});
	}
});
