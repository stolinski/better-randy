import assert from 'node:assert/strict';
import { join } from 'node:path';

import { createSupersIntegratedTreeFingerprint } from '../extensions/models/supers-deterministic-factory-contract.ts';
import {
	bindPiHandoff,
	bindPiLaunch,
	claimPiExecution,
	createFactoryPiTransportTask,
	recordPiSubmissionAttempt,
	reservePiDispatch,
	type PiDispatchOutboxContext
} from '../extensions/models/factory-pi-dispatch-outbox.ts';
import {
	type FactoryHandoffGateInput,
	validateFactoryFleetWorkerOutputAgainstApprovedPiSchema,
	verifyFactoryHandoffIntegrationGate
} from './factory-handoff-integration-gate.ts';
import { createFactoryFleetWorkerOutputJsonSchema } from '../extensions/models/factory-fleet-worker-output-contract.ts';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

type CommandResult = {
	code: number;
	stdout: Uint8Array;
	stderr: string;
};

type LaneEvidence = {
	rootEpicId: string;
	activeTaskId: string;
	workItem: string;
	piKey: string;
	dispatchToken: string;
	piRunId: string;
	claimNonce: string;
	revision: string;
	patchPath: string;
	patchBytes: Uint8Array;
	changedPaths: string[];
	manifestBytes: Uint8Array;
	readTrustedCurrentDispatchAuthority: () => Promise<unknown>;
	readTrustedHandoffAcceptance: (resourceName: string) => Promise<unknown>;
};

async function runGit(
	repository: string,
	args: readonly string[],
	env?: Record<string, string>
): Promise<CommandResult> {
	const output = await new Deno.Command('git', {
		args: [...args],
		cwd: repository,
		env,
		stdout: 'piped',
		stderr: 'piped'
	}).output();
	return {
		code: output.code,
		stdout: output.stdout,
		stderr: decoder.decode(output.stderr)
	};
}

async function git(repository: string, args: readonly string[]): Promise<string> {
	const result = await runGit(repository, args);
	if (result.code !== 0) {
		throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
	}
	return decoder.decode(result.stdout).trim();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createRepositoryFixture(): Promise<{
	root: string;
	repository: string;
	baseRevision: string;
}> {
	const root = await Deno.makeTempDir({ prefix: 'factory-handoff-' });
	const repository = join(root, 'central');
	await Deno.mkdir(repository);
	await git(repository, ['init', '-b', 'main']);
	await git(repository, ['config', 'user.name', 'Factory Probe']);
	await git(repository, ['config', 'user.email', 'factory@example.test']);
	await Deno.writeTextFile(join(repository, 'a.txt'), 'base-a\n');
	await Deno.writeTextFile(join(repository, 'b.txt'), 'base-b\n');
	await Deno.writeTextFile(join(repository, 'conflict.txt'), 'base\n');
	await git(repository, ['add', '.']);
	await git(repository, ['commit', '-m', 'baseline']);
	return {
		root,
		repository,
		baseRevision: await git(repository, ['rev-parse', 'HEAD'])
	};
}

async function addDetachedWorktree(
	repository: string,
	path: string,
	baseRevision: string
): Promise<void> {
	await git(repository, ['worktree', 'add', '--detach', path, baseRevision]);
}

async function commitLane(
	worktree: string,
	path: string,
	content: string,
	message: string
): Promise<string> {
	await Deno.writeTextFile(join(worktree, path), content);
	await git(worktree, ['add', path]);
	await git(worktree, ['commit', '-m', message]);
	return await git(worktree, ['rev-parse', 'HEAD']);
}

function parseNulPaths(bytes: Uint8Array): string[] {
	return decoder
		.decode(bytes)
		.split('\0')
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));
}

async function laneEvidence(
	repository: string,
	root: string,
	baseRevision: string,
	revision: string,
	rootEpicId: string,
	activeTaskId: string,
	index: number
): Promise<LaneEvidence> {
	const patchResult = await runGit(repository, ['diff', baseRevision, revision]);
	assert.equal(patchResult.code, 0);
	const pathResult = await runGit(repository, [
		'diff',
		'--name-only',
		'-z',
		baseRevision,
		revision
	]);
	assert.equal(pathResult.code, 0);
	const changedPaths = parseNulPaths(pathResult.stdout);
	const patchPath = join(root, `${activeTaskId}.patch`);
	await Deno.writeFile(patchPath, patchResult.stdout);
	const identity = {
		rootEpicId,
		activeTaskId,
		workItem: activeTaskId,
		piKey: `factory:${rootEpicId}:${activeTaskId}`
	};
	const dispatchToken = index.toString(16).padStart(64, '0');
	const piRunId = `pi-run-${index.toString().padStart(8, '0')}`;
	const claimNonce = (index + 10).toString(16).padStart(64, '0');
	const concreteOutput = {
		...identity,
		dispatchToken,
		piRunId,
		claimNonce,
		baseCommit: baseRevision,
		childCommittedRevision: revision,
		changedPaths,
		commandsRun: [
			{
				command: 'git commit',
				result: 'passed',
				summary: 'Committed the isolated lane.'
			}
		],
		residualRisks: [],
		summary: 'Implemented and committed the isolated lane.'
	};
	const structuredOutput = validateFactoryFleetWorkerOutputAgainstApprovedPiSchema(
		concreteOutput,
		identity
	);
	assert.strictEqual(structuredOutput, concreteOutput);
	const manifest = {
		version: 1,
		runId: 'factory-probe-run',
		mode: 'parallel',
		source: 'foreground',
		cwd: repository,
		createdAt: 1,
		updatedAt: 2,
		groups: [
			{
				stepIndex: 0,
				baseCommit: baseRevision,
				repoRoot: repository,
				children: [
					{
						index,
						taskIndex: index,
						agent: 'worker',
						status: 'completed',
						summary: 'Completed isolated implementation.',
						structuredOutput,
						patch: {
							path: patchPath,
							branch: `detached-${index}`,
							changed: true,
							diffStat: `${changedPaths.length} file changed`,
							filesChanged: changedPaths.length,
							insertions: 1,
							deletions: 1
						}
					}
				],
				cleanup: {
					state: 'partial',
					tasks: [
						{
							index,
							path: join(root, `lane-${index}`),
							branch: `detached-${index}`,
							worktreeRemoved: false,
							branchRemoved: false,
							preserved: true
						}
					],
					pruned: false
				}
			}
		]
	};
	return {
		rootEpicId,
		activeTaskId,
		workItem: structuredOutput.workItem,
		piKey: structuredOutput.piKey,
		dispatchToken,
		piRunId,
		claimNonce,
		revision,
		patchPath,
		patchBytes: patchResult.stdout,
		changedPaths,
		manifestBytes: encoder.encode(JSON.stringify(manifest)),
		readTrustedCurrentDispatchAuthority: () => Promise.resolve(null),
		readTrustedHandoffAcceptance: () => Promise.resolve(null)
	};
}

async function authorizeLaneThroughPiOutbox(
	lane: LaneEvidence,
	repository: string,
	root: string
): Promise<LaneEvidence> {
	const sourceFactoryId = '90fac686-c724-4aee-97c4-e31b9af4c5e2';
	const asyncRoot = join(root, `async-${lane.activeTaskId}`);
	const sessionRoot = join(root, `sessions-${lane.activeTaskId}`);
	await Deno.mkdir(asyncRoot, { recursive: true });
	await Deno.mkdir(sessionRoot, { recursive: true });
	const resources = new Map<string, Record<string, unknown>>();
	let dispatchCount = 0;
	const identity = {
		rootEpicId: lane.rootEpicId,
		activeTaskId: lane.activeTaskId,
		workItem: lane.workItem,
		piKey: lane.piKey
	};
	const piRequest = {
		agent: 'worker' as const,
		task: `Implement ${lane.workItem}.`,
		worktree: true as const,
		context: 'fork' as const,
		skill: ['implementation'],
		outputSchema: createFactoryFleetWorkerOutputJsonSchema(identity),
		acceptance: false as const,
		async: true as const,
		artifacts: true as const
	};
	const canonical = (value: unknown): unknown => {
		if (
			value === null ||
			typeof value === 'string' ||
			typeof value === 'boolean' ||
			typeof value === 'number'
		)
			return value;
		if (Array.isArray(value)) return value.map(canonical);
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, canonical(entry)])
		);
	};
	const valueDigest = (value: unknown): Promise<string> =>
		sha256Hex(encoder.encode(typeof value === 'string' ? value : JSON.stringify(canonical(value))));
	const encode = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
	const profileModelName = 'project-delivery-profile';
	const profileModelId = 'a480da64-8208-4252-8eec-2ee454cd3a6d';
	const context: PiDispatchOutboxContext = {
		globalArgs: {
			sourceFactoryId,
			profileModelName,
			adapters: { failureAuthorizer: { workflow: 'project-failure-authorizer' } }
		},
		modelId: profileModelId,
		repoDir: repository,
		piAsyncRoots: [asyncRoot],
		piSessionRoots: [sessionRoot],
		dataRepository: {
			getContent: async (_type, _model, name) => {
				if (name === `state-${lane.workItem}`)
					return encode({
						workItem: lane.workItem,
						stageId: 'implementation',
						cycles: { implementation: 1 },
						dispatches: { implementation: { cycle: 1, count: dispatchCount } }
					});
				if (name === `status-${lane.workItem}`)
					return encode({
						workItem: lane.workItem,
						stage: { id: 'implementation', cycle: 1 },
						dispatch: { attempts: dispatchCount },
						work: { mode: 'dispatch', skills: ['implementation'], systemPrompt: piRequest.task }
					});
				if (name === `journal-${lane.workItem}` && dispatchCount === 1)
					return encode({
						event: 'dispatched',
						workItem: lane.workItem,
						stageId: 'implementation',
						payload: {
							stageId: 'implementation',
							cycle: 1,
							attempt: 1,
							runId: await valueDigest(piRequest)
						}
					});
				return null;
			},
			listVersions: (_type, _model, name) =>
				Promise.resolve(name === `journal-${lane.workItem}` && dispatchCount === 1 ? [1] : [])
		},
		lookupCurrentProfileModel: () =>
			Promise.resolve({
				id: profileModelId,
				name: profileModelName,
				type: '@club_aqua_back_deck/dex-software-factory'
			}),
		queryDexTasks: () =>
			Promise.resolve({
				results: [
					{
						id: lane.rootEpicId,
						parent_id: null,
						completed: false,
						started_at: null,
						blockedBy: []
					},
					{
						id: lane.workItem,
						parent_id: lane.rootEpicId,
						completed: false,
						started_at: '2026-08-17T00:00:00Z',
						blockedBy: []
					}
				]
			}),
		readResource: (name) => Promise.resolve(resources.get(name) ?? null),
		writeResource: (_spec, name, data) => {
			resources.set(name, structuredClone(data));
			return Promise.resolve({ name });
		},
		now: () => new Date('2026-08-17T00:00:00.000Z')
	};
	const reservation = await reservePiDispatch(
		{
			sourceFactoryId,
			workItem: lane.workItem,
			rootEpicId: lane.rootEpicId,
			stage: 'implementation',
			stageCycle: 1,
			dispatchAttempt: 1,
			exactFrozenRequestDigest: await valueDigest(piRequest),
			piTaskDigest: await valueDigest(piRequest.task),
			piRequest,
			maximumTransportAttempts: 3
		},
		context
	);
	dispatchCount = 1;
	const dispatchToken = reservation.dispatchToken;
	const piRunId = lane.piRunId;
	const submissionAttemptId = await valueDigest(`submission:${piRunId}`);
	const submissionAttempt = await recordPiSubmissionAttempt(
		{ dispatchToken, submissionAttemptId },
		context
	);
	const runRoot = join(asyncRoot, piRunId);
	await Deno.mkdir(runRoot, { recursive: true });
	const sessionFile = join(sessionRoot, `${piRunId}.jsonl`);
	await Deno.writeTextFile(
		sessionFile,
		JSON.stringify({
			type: 'message',
			message: {
				role: 'user',
				content: [
					{
						type: 'text',
						text: `Task: ${createFactoryPiTransportTask(
							piRequest.task,
							profileModelName,
							dispatchToken,
							await valueDigest(piRequest.task),
							{
								submissionAttemptId,
								ordinal: submissionAttempt.ordinal,
								receiptDigest: submissionAttempt.submissionAttemptReceiptDigest
							}
						)}`
					}
				]
			}
		})
	);
	const childRunId = `${piRunId}-child`;
	await Deno.writeTextFile(
		join(runRoot, 'status.json'),
		JSON.stringify({
			runId: piRunId,
			mode: 'workflow',
			state: 'running',
			cwd: repository,
			steps: [{ agent: 'worker', status: 'running', sessionFile, runId: childRunId }]
		})
	);
	await bindPiLaunch({ dispatchToken, piRunId }, context);
	const claim = await claimPiExecution({ dispatchToken, piRunId }, context);
	assert.equal(claim.granted, true);
	const claimNonce = claim.claimNonce!;
	const manifest = JSON.parse(decoder.decode(lane.manifestBytes)) as {
		runId: string;
		source: string;
		cwd: string;
		groups: Array<{
			repoRoot: string;
			children: Array<{ structuredOutput: Record<string, unknown> }>;
		}>;
	};
	manifest.runId = childRunId;
	manifest.source = 'foreground';
	manifest.cwd = repository;
	manifest.groups[0]!.repoRoot = repository;
	Object.assign(manifest.groups[0]!.children[0]!.structuredOutput, {
		dispatchToken,
		piRunId,
		claimNonce
	});
	const manifestBytes = encoder.encode(JSON.stringify(manifest));
	const schemaFile = join(sessionRoot, 'structured-output', childRunId, 'schema.json');
	await Deno.mkdir(join(sessionRoot, 'structured-output', childRunId), { recursive: true });
	await Deno.writeTextFile(schemaFile, JSON.stringify(piRequest.outputSchema));
	const handoffFile = join(sessionRoot, 'handoffs', `${childRunId}.json`);
	await Deno.mkdir(join(sessionRoot, 'handoffs'), { recursive: true });
	await Deno.writeFile(handoffFile, manifestBytes);
	const fixtureText = await Deno.readTextFile(
		join(Deno.cwd(), 'fixtures/pi-workflow-lifecycle/completed-run.json')
	);
	const fixture = JSON.parse(
		fixtureText
			.replaceAll('OUTER_RUN_ID', piRunId)
			.replaceAll('CHILD_RUN_ID', childRunId)
			.replaceAll('REPO_DIR', repository)
			.replaceAll('SESSION_FILE', sessionFile)
			.replaceAll('SCHEMA_FILE', schemaFile)
			.replaceAll('HANDOFF_FILE', handoffFile)
			.replaceAll('PATCH_FILE', lane.patchPath)
	) as { status: Record<string, unknown> };
	const status = fixture.status;
	await Deno.writeTextFile(join(runRoot, 'status.json'), JSON.stringify(status));
	const handoffDigest = await sha256Hex(manifestBytes);
	await bindPiHandoff(
		{ dispatchToken, piRunId, claimNonce, handoffDigest, launchContractDigest: 'a'.repeat(64) },
		context
	);
	return {
		...lane,
		dispatchToken,
		piRunId,
		claimNonce,
		manifestBytes,
		readTrustedCurrentDispatchAuthority: () =>
			Promise.resolve({
				outbox: resources.get(`pi-dispatch-outbox-${dispatchToken}`),
				factoryStatus: {
					sourceFactoryId,
					workItem: lane.workItem,
					stage: { id: 'implementation', cycle: 1 },
					dispatch: { attempts: 1 }
				}
			}),
		readTrustedHandoffAcceptance: (name) => Promise.resolve(resources.get(name) ?? null)
	};
}

async function checkPatchWithoutTargetMutation(
	repository: string,
	patchPath: string,
	temporaryRoot: string
): Promise<boolean> {
	const indexPath = join(temporaryRoot, `alternate-index-${crypto.randomUUID()}`);
	const env = { GIT_INDEX_FILE: indexPath };
	let patchApplies = false;
	let operationError: unknown;
	try {
		const readTree = await runGit(repository, ['read-tree', 'HEAD'], env);
		if (readTree.code === 0) {
			const apply = await runGit(repository, ['apply', '--cached', '--3way', patchPath], env);
			patchApplies = apply.code === 0;
		}
	} catch (error) {
		operationError = error;
	}
	for (const temporaryPath of [indexPath, `${indexPath}.lock`]) {
		try {
			await Deno.remove(temporaryPath);
		} catch (error) {
			if (!(error instanceof Deno.errors.NotFound) && operationError === undefined) {
				operationError = error;
			}
		}
	}
	if (operationError !== undefined) throw operationError;
	return patchApplies;
}

async function baseIsAncestor(repository: string, baseRevision: string): Promise<boolean> {
	return (
		(await runGit(repository, ['merge-base', '--is-ancestor', baseRevision, 'HEAD'])).code === 0
	);
}

async function gateInput(
	repository: string,
	root: string,
	baseRevision: string,
	lane: LaneEvidence
): Promise<FactoryHandoffGateInput> {
	const targetBaselineRevision = await git(repository, ['rev-parse', 'HEAD']);
	return {
		manifestBytes: lane.manifestBytes,
		patchBytes: lane.patchBytes,
		expectedManifestDigest: await sha256Hex(lane.manifestBytes),
		expectedPatchDigest: await sha256Hex(lane.patchBytes),
		expectedRootEpicId: lane.rootEpicId,
		expectedActiveTaskId: lane.activeTaskId,
		expectedWorkItem: lane.workItem,
		expectedPiKey: lane.piKey,
		readTrustedCurrentDispatchAuthority: lane.readTrustedCurrentDispatchAuthority,
		readTrustedHandoffAcceptance: lane.readTrustedHandoffAcceptance,
		targetBaselineRevision,
		currentTargetRevision: targetBaselineRevision,
		targetClean: (await git(repository, ['status', '--porcelain'])) === '',
		baseIsAncestorOfTarget: await baseIsAncestor(repository, baseRevision),
		childRevisionExists:
			(await runGit(repository, ['cat-file', '-e', `${lane.revision}^{commit}`])).code === 0,
		verifiedChildRevision: lane.revision,
		childDiffBytes: lane.patchBytes,
		patchChangedPaths: lane.changedPaths,
		patchApplies: await checkPatchWithoutTargetMutation(repository, lane.patchPath, root)
	};
}

type MutableStructuredOutput = Record<string, unknown> & {
	changedPaths: unknown[];
	commandsRun: unknown[];
};
type MutableManifest = {
	groups: Array<{ children: Array<{ structuredOutput: MutableStructuredOutput }> }>;
};

async function assertStructuredOutputRejected(
	input: FactoryHandoffGateInput,
	mutate: (output: MutableStructuredOutput) => void
): Promise<void> {
	const manifest = JSON.parse(decoder.decode(input.manifestBytes)) as MutableManifest;
	const output = manifest.groups[0]?.children[0]?.structuredOutput;
	if (output === undefined) throw new Error('Fixture manifest has no structured output.');
	mutate(output);
	const manifestBytes = encoder.encode(JSON.stringify(manifest));
	assert.deepEqual(
		await verifyFactoryHandoffIntegrationGate({
			...input,
			manifestBytes,
			expectedManifestDigest: await sha256Hex(manifestBytes)
		}),
		{ disposition: 'rejected', rejectionReason: 'manifest-invalid' }
	);
}

Deno.test('real linked worktrees isolate concurrent filesystem writes', async () => {
	const fixture = await createRepositoryFixture();
	try {
		const laneAPath = join(fixture.root, 'lane-a');
		const laneBPath = join(fixture.root, 'lane-b');
		await Promise.all([
			addDetachedWorktree(fixture.repository, laneAPath, fixture.baseRevision),
			addDetachedWorktree(fixture.repository, laneBPath, fixture.baseRevision)
		]);
		await Promise.all([
			commitLane(laneAPath, 'a.txt', 'lane-a\n', 'lane a'),
			commitLane(laneBPath, 'b.txt', 'lane-b\n', 'lane b')
		]);
		assert.equal(await Deno.readTextFile(join(laneAPath, 'a.txt')), 'lane-a\n');
		assert.equal(await Deno.readTextFile(join(laneAPath, 'b.txt')), 'base-b\n');
		assert.equal(await Deno.readTextFile(join(laneBPath, 'a.txt')), 'base-a\n');
		assert.equal(await Deno.readTextFile(join(laneBPath, 'b.txt')), 'lane-b\n');
		assert.equal(await git(fixture.repository, ['rev-parse', 'HEAD']), fixture.baseRevision);
	} finally {
		await Deno.remove(fixture.root, { recursive: true });
	}
});

Deno.test(
	'exact prerequisite Pi output passes the handoff gate and identity mismatches reject',
	async () => {
		const fixture = await createRepositoryFixture();
		try {
			const laneAPath = join(fixture.root, 'lane-0');
			const laneBPath = join(fixture.root, 'lane-1');
			const conflictPath = join(fixture.root, 'lane-2');
			await Promise.all([
				addDetachedWorktree(fixture.repository, laneAPath, fixture.baseRevision),
				addDetachedWorktree(fixture.repository, laneBPath, fixture.baseRevision),
				addDetachedWorktree(fixture.repository, conflictPath, fixture.baseRevision)
			]);
			const [laneARevision, laneBRevision, conflictRevision] = await Promise.all([
				commitLane(laneAPath, 'a.txt', 'lane-a\n', 'lane a'),
				commitLane(laneBPath, 'b.txt', 'lane-b\n', 'lane b'),
				commitLane(conflictPath, 'conflict.txt', 'lane-conflict\n', 'conflicting lane')
			]);
			const laneA = await authorizeLaneThroughPiOutbox(
				await laneEvidence(
					fixture.repository,
					fixture.root,
					fixture.baseRevision,
					laneARevision,
					'epic-a',
					'task-a',
					0
				),
				fixture.repository,
				fixture.root
			);
			const laneB = await authorizeLaneThroughPiOutbox(
				await laneEvidence(
					fixture.repository,
					fixture.root,
					fixture.baseRevision,
					laneBRevision,
					'epic-b',
					'task-b',
					1
				),
				fixture.repository,
				fixture.root
			);
			const conflictLane = await authorizeLaneThroughPiOutbox(
				await laneEvidence(
					fixture.repository,
					fixture.root,
					fixture.baseRevision,
					conflictRevision,
					'epic-conflict',
					'task-conflict',
					2
				),
				fixture.repository,
				fixture.root
			);

			const validA = await gateInput(fixture.repository, fixture.root, fixture.baseRevision, laneA);
			assert.equal((await verifyFactoryHandoffIntegrationGate(validA)).disposition, 'accepted');

			await assertStructuredOutputRejected(validA, (output) => {
				output.extra = true;
			});
			await assertStructuredOutputRejected(validA, (output) => {
				output.changedPaths = ['z.txt', 'a.txt'];
			});
			await assertStructuredOutputRejected(validA, (output) => {
				output.changedPaths = ['a.txt', 'a.txt'];
			});
			await assertStructuredOutputRejected(validA, (output) => {
				output.changedPaths = ['../a.txt'];
			});
			for (const protectedPath of [
				'.claude/skills/software-factory/SKILL.md',
				'extensions/models/upstream_extensions.json',
				'.swamp/pulled-extensions/@swamp/software-factory/models/software_factory.ts',
				'.swamp/bundles/factory/software_factory.js',
				'.swamp/report-bundles/factory/work_item_summary_report.js'
			]) {
				await assertStructuredOutputRejected(validA, (output) => {
					output.changedPaths = [protectedPath];
				});
				assert.deepEqual(
					await verifyFactoryHandoffIntegrationGate({
						...validA,
						patchChangedPaths: [protectedPath],
						patchApplies: true
					}),
					{ disposition: 'rejected', rejectionReason: 'protected-path' }
				);
			}
			await assertStructuredOutputRejected(validA, (output) => {
				output.commandsRun = [
					{ command: 'git commit', result: 'maybe', summary: 'Malformed result.' }
				];
			});
			await assertStructuredOutputRejected(validA, (output) => {
				output.summary = '';
			});
			await assertStructuredOutputRejected(validA, (output) => {
				output.childCommittedRevision = 'bad-revision';
			});

			for (const [from, to] of [
				['"workItem":"task-a"', '"workItem":"other-task"'],
				['"piKey":"factory:epic-a:task-a"', '"piKey":"factory:epic-a:other-task"'],
				['"summary":"Implemented and committed the isolated lane."', '"summary":""']
			] as const) {
				const manifestBytes = encoder.encode(
					decoder.decode(validA.manifestBytes).replace(from, to)
				);
				assert.notDeepEqual(manifestBytes, validA.manifestBytes);
				assert.deepEqual(
					await verifyFactoryHandoffIntegrationGate({
						...validA,
						manifestBytes,
						expectedManifestDigest: await sha256Hex(manifestBytes)
					}),
					{ disposition: 'rejected', rejectionReason: 'manifest-invalid' }
				);
			}

			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					manifestBytes: new Uint8Array([...validA.manifestBytes, 0x20])
				}),
				{ disposition: 'rejected', rejectionReason: 'manifest-invalid' }
			);
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					patchBytes: new Uint8Array([...validA.patchBytes, 0x0a])
				}),
				{ disposition: 'rejected', rejectionReason: 'patch-digest-mismatch' }
			);
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					readTrustedHandoffAcceptance: () => Promise.resolve(null)
				}),
				{ disposition: 'rejected', rejectionReason: 'execution-claim-mismatch' }
			);
			const currentAuthority = (await validA.readTrustedCurrentDispatchAuthority()) as {
				outbox: Record<string, unknown>;
				factoryStatus: { stage: { id: string; cycle: number }; dispatch: { attempts: number } };
			};
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					readTrustedCurrentDispatchAuthority: () =>
						Promise.resolve({
							...currentAuthority,
							factoryStatus: {
								...currentAuthority.factoryStatus,
								stage: { ...currentAuthority.factoryStatus.stage, cycle: 2 }
							}
						})
				}),
				{ disposition: 'rejected', rejectionReason: 'execution-claim-mismatch' }
			);
			const wrongFactoryId = '11111111-1111-4111-8111-111111111111';
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					readTrustedCurrentDispatchAuthority: () =>
						Promise.resolve({
							outbox: { ...currentAuthority.outbox, sourceFactoryId: wrongFactoryId },
							factoryStatus: {
								...currentAuthority.factoryStatus,
								sourceFactoryId: wrongFactoryId
							}
						})
				}),
				{ disposition: 'rejected', rejectionReason: 'execution-claim-mismatch' }
			);
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					verifiedChildRevision: laneBRevision
				}),
				{ disposition: 'rejected', rejectionReason: 'child-revision-mismatch' }
			);
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					patchChangedPaths: ['different.txt']
				}),
				{ disposition: 'rejected', rejectionReason: 'changed-path-mismatch' }
			);
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					currentTargetRevision: laneBRevision
				}),
				{ disposition: 'rejected', rejectionReason: 'stale-target-baseline' }
			);
			assert.deepEqual(
				await verifyFactoryHandoffIntegrationGate({
					...validA,
					baseIsAncestorOfTarget: false
				}),
				{ disposition: 'rejected', rejectionReason: 'stale-target-baseline' }
			);

			await git(fixture.repository, ['apply', '--3way', laneA.patchPath]);
			await git(fixture.repository, ['add', '-A']);
			await git(fixture.repository, ['commit', '-m', 'integrate lane a']);
			const treeListing = await runGit(fixture.repository, [
				'ls-tree',
				'-r',
				'-z',
				'--full-tree',
				'HEAD'
			]);
			assert.equal(treeListing.code, 0);
			assert.equal(
				await createSupersIntegratedTreeFingerprint(treeListing.stdout),
				await sha256Hex(treeListing.stdout)
			);

			const validB = await gateInput(fixture.repository, fixture.root, fixture.baseRevision, laneB);
			assert.equal((await verifyFactoryHandoffIntegrationGate(validB)).disposition, 'accepted');

			await Deno.writeTextFile(join(fixture.repository, 'conflict.txt'), 'target-conflict\n');
			await git(fixture.repository, ['add', 'conflict.txt']);
			await git(fixture.repository, ['commit', '-m', 'target conflict']);
			const conflictInput = await gateInput(
				fixture.repository,
				fixture.root,
				fixture.baseRevision,
				conflictLane
			);
			assert.equal(conflictInput.patchApplies, false);
			const targetBeforeConflictGate = await git(fixture.repository, ['rev-parse', 'HEAD']);
			assert.deepEqual(await verifyFactoryHandoffIntegrationGate(conflictInput), {
				disposition: 'rejected',
				rejectionReason: 'patch-conflict'
			});
			assert.equal(await git(fixture.repository, ['rev-parse', 'HEAD']), targetBeforeConflictGate);
			assert.equal(await git(fixture.repository, ['status', '--porcelain']), '');
		} finally {
			await Deno.remove(fixture.root, { recursive: true });
		}
	}
);
