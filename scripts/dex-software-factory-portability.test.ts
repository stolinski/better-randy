import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, stringify } from 'jsr:@std/yaml@1.0.10';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
	checkFactoryDispatchPrerequisites,
	dispatchValidatedFactoryRequest,
	type FactoryPrerequisiteCommandRunner
} from './factory-dispatch-prerequisites.ts';
import { createFactoryPiTransportRequest } from './factory-pi-dispatch-coordinator.ts';
import { createFactoryFleetWorkerOutputJsonSchema } from '../extensions/models/factory-fleet-worker-output-contract.ts';

type JsonObject = Record<string, unknown>;

type CommandResult = {
	code: number;
	stdout: string;
	stderr: string;
};

type FactoryTransitionStatus = {
	name: string;
	satisfied: boolean;
	cycleLimitBlocked: boolean;
};

type FactoryStatus = {
	stage: { id: string; terminal: boolean; cycle: number };
	dispatch: {
		cycle: number;
		attempts: number;
		limit: number;
		required: boolean;
		executed: boolean;
	};
	transitions: FactoryTransitionStatus[];
};

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_FIXTURE_PATH = join(
	REPOSITORY_ROOT,
	'fixtures/dex-software-factory-consumer/profile.json'
);
const FAILURE_AUTHORIZER_EXAMPLE_PATH = join(
	REPOSITORY_ROOT,
	'extensions/packages/dex-software-factory/examples/project-failure-authorizer.workflow.yaml'
);
const MATERIALIZER_PATH = join(REPOSITORY_ROOT, 'scripts/materialize-dex-software-factory.ts');
const PORTABLE_MODEL_FILES = [
	'dex-software-factory.ts',
	'dex-software-factory-compiler.ts',
	'factory-execution-failure-authority.ts',
	'factory-fleet-worker-output-contract.ts',
	'factory-pi-dispatch-outbox.ts',
	'dex-bounded-process.ts',
	'dex-ready-leaf-handoff.ts',
	'dex-repository-lock.ts',
	'dex-plan-applier.ts',
	'dex-plan-applier-adapter.ts',
	'dex-task-tracker.ts',
	'dex-task-tracker-adapter.ts'
] as const;
const FACTORY_MODEL = 'project-delivery';
const PROFILE_MODEL = 'project-delivery-profile';
const PLAN_APPLIER_MODEL = 'clean-room-dex-plan-applier';
const TRACKER_MODEL = 'clean-room-dex-tracker';

async function runCommand(
	command: string,
	args: string[],
	cwd: string,
	expect: 'success' | 'failure' = 'success',
	stdin?: string
): Promise<CommandResult> {
	const child = new Deno.Command(command, {
		args,
		cwd,
		stdin: stdin === undefined ? 'null' : 'piped',
		stdout: 'piped',
		stderr: 'piped',
		env: { NO_COLOR: '1' }
	}).spawn();
	if (stdin !== undefined) {
		const writer = child.stdin.getWriter();
		try {
			await writer.write(new TextEncoder().encode(stdin));
		} finally {
			await writer.close();
		}
	}
	const output = await child.output();
	const result = {
		code: output.code,
		stdout: new TextDecoder().decode(output.stdout),
		stderr: new TextDecoder().decode(output.stderr)
	};
	if (expect === 'success' && result.code !== 0) {
		assert.fail(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
	}
	if (expect === 'failure' && result.code === 0) {
		assert.fail(`${command} ${args.join(' ')} unexpectedly succeeded`);
	}
	return result;
}

function runTrackerMethod(
	repository: string,
	method: string,
	inputs: JsonObject,
	expect: 'success' | 'failure' = 'success'
): Promise<CommandResult> {
	return runCommand(
		'swamp',
		['model', 'method', 'run', TRACKER_MODEL, method, '--stdin'],
		repository,
		expect,
		JSON.stringify(inputs)
	);
}

function runProfileMethod(
	repository: string,
	method: string,
	inputs: JsonObject,
	expect: 'success' | 'failure' = 'success'
): Promise<CommandResult> {
	return runCommand(
		'swamp',
		['model', 'method', 'run', PROFILE_MODEL, method, ...inputArguments(inputs), '--json'],
		repository,
		expect
	);
}

function parseObject(value: string): JsonObject {
	const parsed: unknown = JSON.parse(value);
	assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
	return parsed as JsonObject;
}

function parseArray(value: string): unknown[] {
	const parsed: unknown = JSON.parse(value);
	if (Array.isArray(parsed)) return parsed;
	assert.ok(parsed !== null && typeof parsed === 'object');
	const results = (parsed as JsonObject).results;
	assert.ok(Array.isArray(results));
	return results;
}

function nestedString(value: unknown, key: string): string {
	if (value !== null && typeof value === 'object') {
		const record = value as JsonObject;
		if (typeof record[key] === 'string') return record[key] as string;
		for (const candidate of Object.values(record)) {
			try {
				return nestedString(candidate, key);
			} catch {
				// Continue through command envelope fields.
			}
		}
	}
	throw new Error(`Command output does not contain ${key}.`);
}

function canonicalize(value: unknown): unknown {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value as JsonObject)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)])
		);
	throw new TypeError(`Unsupported canonical value: ${typeof value}`);
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

async function createPortableExtensionSource(repository: string): Promise<string> {
	const sourceRoot = join(repository, 'portable-extension');
	const modelsDirectory = join(sourceRoot, 'extensions', 'models');
	await Deno.mkdir(modelsDirectory, { recursive: true });
	for (const file of PORTABLE_MODEL_FILES) {
		await Deno.copyFile(
			join(REPOSITORY_ROOT, 'extensions', 'models', file),
			join(modelsDirectory, file)
		);
	}
	return sourceRoot;
}

async function createModel(repository: string, type: string, name: string): Promise<string> {
	const result = await runCommand('swamp', ['model', 'create', type, name, '--json'], repository);
	const created = parseObject(result.stdout);
	assert.equal(typeof created.path, 'string');
	return created.path as string;
}

async function setModelGlobalArguments(
	definitionPath: string,
	globalArguments: JsonObject
): Promise<void> {
	const parsed = parse(await Deno.readTextFile(definitionPath));
	assert.ok(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
	const definition = parsed as JsonObject;
	definition.globalArguments = globalArguments;
	await Deno.writeTextFile(definitionPath, stringify(definition, { lineWidth: 100 }));
}

function inputArguments(inputs: JsonObject): string[] {
	return Object.entries(inputs).flatMap(([name, value]) => [
		'--input',
		`${name}=${typeof value === 'string' ? value : JSON.stringify(value)}`
	]);
}

function runFactoryMethod(
	repository: string,
	method: string,
	inputs: JsonObject,
	expect: 'success' | 'failure' = 'success'
): Promise<CommandResult> {
	return runCommand(
		'swamp',
		['model', 'method', 'run', FACTORY_MODEL, method, ...inputArguments(inputs)],
		repository,
		expect
	);
}

function recordDispatch(repository: string, workItem: string): Promise<CommandResult> {
	return runFactoryMethod(repository, 'record_dispatch', { workItem });
}

function recordArtifact(
	repository: string,
	workItem: string,
	name: string,
	payload: JsonObject
): Promise<CommandResult> {
	return runFactoryMethod(repository, 'record_artifact', {
		workItem,
		name,
		payload
	});
}

function recordEvidence(
	repository: string,
	workItem: string,
	name: string,
	payload: JsonObject
): Promise<CommandResult> {
	return runFactoryMethod(repository, 'record_evidence', {
		workItem,
		name,
		payload
	});
}

function advance(repository: string, workItem: string, transition: string): Promise<CommandResult> {
	return runFactoryMethod(repository, 'advance', { workItem, transition });
}

async function factoryStatus(repository: string, workItem: string): Promise<FactoryStatus> {
	await runFactoryMethod(repository, 'status', { workItem });
	const result = await runCommand(
		'swamp',
		[
			'data',
			'query',
			`modelName == "${FACTORY_MODEL}" && name == "status-${workItem}"`,
			'--select',
			'attributes',
			'--json'
		],
		repository
	);
	const matches = parseArray(result.stdout);
	assert.equal(matches.length, 1, `Expected one status record for ${workItem}`);
	const status = matches[0];
	assert.ok(status !== null && typeof status === 'object' && !Array.isArray(status));
	return status as FactoryStatus;
}

function satisfiedTransitions(status: FactoryStatus): string[] {
	return status.transitions
		.filter((transition) => transition.satisfied)
		.map((transition) => transition.name);
}

async function createDexTask(repository: string, name: string): Promise<string> {
	const result = await runCommand(
		'dex',
		['create', name, '--description', 'Deterministic clean-room portability fixture'],
		repository
	);
	const match = result.stdout.match(/Created task ([A-Za-z0-9_-]+)/);
	assert.ok(match, `Could not parse Dex task id from:\n${result.stdout}`);
	return match[1];
}

async function startTrackedTask(repository: string, name: string): Promise<string> {
	const taskId = await createDexTask(repository, name);
	await runTrackerMethod(repository, 'start', { taskId });
	return taskId;
}

async function startThroughVerification(repository: string, workItem: string): Promise<void> {
	await runFactoryMethod(repository, 'start', { workItem });
	await recordDispatch(repository, workItem);
	await recordEvidence(repository, workItem, 'preflight-run', {
		status: 'succeeded',
		runId: `preflight-${workItem}`
	});
	await advance(repository, workItem, 'implement');
	await implementationThroughVerification(repository, workItem, 'initial implementation');
}

async function implementationThroughVerification(
	repository: string,
	workItem: string,
	summary: string
): Promise<void> {
	await recordDispatch(repository, workItem);
	await recordArtifact(repository, workItem, 'change-summary', { summary });
	await advance(repository, workItem, 'classify');
	await recordDispatch(repository, workItem);
	await recordArtifact(repository, workItem, 'change-impact', {
		requiredLanes: [
			{
				id: 'fixture-tests',
				reasons: ['portable lifecycle evidence']
			}
		],
		reviewCandidate: true,
		changeFingerprint: `fingerprint-${workItem}-${summary.replaceAll(' ', '-')}`
	});
	await recordEvidence(repository, workItem, 'classify-run', {
		status: 'succeeded',
		runId: `classify-${workItem}-${summary.replaceAll(' ', '-')}`
	});
	await advance(repository, workItem, 'verify');
	await recordDispatch(repository, workItem);
}

function verificationPayload(
	status: 'passed' | 'failed' | 'unavailable',
	reviewRequired: boolean,
	nextStep: 'rework' | 'review' | 'reconcile'
): JsonObject {
	return {
		status,
		executedLanes: [
			{
				id: 'fixture-tests',
				status,
				evidence: `fixture lane ${status}`
			}
		],
		reviewRequired,
		nextStep,
		summary: `verification ${status}`
	};
}

async function advanceToCleanup(repository: string, workItem: string): Promise<void> {
	await recordDispatch(repository, workItem);
	await recordArtifact(repository, workItem, 'reconciliation', {
		status: 'ready',
		nextStep: 'complete',
		summary: 'clean-room reconciliation passed',
		completionResult: 'Portable Factory fixture completed.',
		commit: { kind: 'noCommit' }
	});
	await advance(repository, workItem, 'postflight');
	await recordDispatch(repository, workItem);
	await recordEvidence(repository, workItem, 'postflight-run', {
		status: 'succeeded',
		runId: `postflight-${workItem}`
	});
	await advance(repository, workItem, 'cleanup');
	await recordDispatch(repository, workItem);
}

async function completeTrackedCleanup(repository: string, workItem: string): Promise<void> {
	await runTrackerMethod(repository, 'complete', {
		taskId: workItem,
		result: 'Portable Factory fixture completed.',
		commit: { kind: 'noCommit' }
	});
	await recordEvidence(repository, workItem, 'tracker-completion', {
		status: 'succeeded',
		runId: `tracker-${workItem}`
	});
	await advance(repository, workItem, 'finish');
	const status = await factoryStatus(repository, workItem);
	assert.equal(status.stage.id, 'done');
	assert.equal(status.stage.terminal, true);
	assert.equal(status.stage.cycle, 1);
}

async function approve(
	repository: string,
	workItem: string,
	gateId: string,
	note: string
): Promise<void> {
	await runFactoryMethod(repository, 'approve', {
		workItem,
		gateId,
		actor: 'synthetic-fixture-human',
		note
	});
}

async function reject(
	repository: string,
	workItem: string,
	gateId: string,
	note: string
): Promise<void> {
	await runFactoryMethod(repository, 'reject', {
		workItem,
		gateId,
		actor: 'synthetic-fixture-human',
		note
	});
}

async function abortRun(repository: string, workItem: string): Promise<void> {
	await approve(repository, workItem, 'abort-confirmation', 'Synthetic fixture abort');
	await advance(repository, workItem, 'abort');
	const status = await factoryStatus(repository, workItem);
	assert.equal(status.stage.id, 'aborted');
	assert.equal(status.stage.terminal, true);
}

async function proveStaleWorkflowEvidence(repository: string): Promise<void> {
	const gateModulePath = join(
		repository,
		'.swamp/pulled-extensions/@swamp/software-factory/models/_lib/gates.ts'
	);
	const script = `
const { evaluateGate } = await import(${JSON.stringify(pathToFileURL(gateModulePath).href)});
const gate = { type: "workflow-succeeded", config: { workflow: "consumer-workflow", requireStepOutputs: ["evidence-preflight-run"] } };
const summary = (createdAt) => ({ ownerRef: "consumer-workflow-id", createdAt, content: JSON.stringify({ status: "succeeded", workflowName: "consumer-workflow", workflowRunId: "consumer-run-id" }) });
const state = { workItem: "workflow-fixture", stageId: "preflight", cycles: { preflight: 1 }, enteredAt: "2026-08-05T20:00:00.000Z", status: "active", definitionVersion: 1, startedAt: "2026-08-05T20:00:00.000Z" };
const view = { state, artifacts: new Map(), evidence: new Map(), validations: new Map(), approvals: new Map() };
const base = { args: { stages: [], globalTransitions: [] }, state, view, workItem: "workflow-fixture", workItemSlug: "workflow-fixture", now: new Date("2026-08-05T20:01:00.000Z"), selfName: ${JSON.stringify(
		FACTORY_MODEL
	)}, dataRepository: { findAllForModel: () => Promise.resolve([]), getContent: () => Promise.resolve(null) } };
const stale = await evaluateGate(gate, { ...base, queryData: () => Promise.resolve([summary("2026-08-05T19:59:00.000Z")]) });
const currentSummary = summary("2026-08-05T20:00:30.000Z");
const missingOutput = await evaluateGate(gate, { ...base, queryData: (predicate) => Promise.resolve(predicate.includes("report-swamp-workflow-summary-json") ? [currentSummary] : []) });
const current = await evaluateGate(gate, { ...base, queryData: (predicate) => Promise.resolve(predicate.includes("report-swamp-workflow-summary-json") ? [currentSummary] : [{ name: "evidence-workflow-fixture-preflight-run" }]) });
console.log(JSON.stringify({ stale, missingOutput, current }));
`;
	const result = await runCommand(
		Deno.execPath(),
		['eval', '--node-modules-dir=auto', script],
		repository
	);
	const matrix = parseObject(result.stdout);
	const stale = matrix.stale as { pass: boolean; reasons: string[] };
	assert.equal(stale.pass, false);
	assert.match(stale.reasons.join(' '), /predates the current entry/);
	const missingOutput = matrix.missingOutput as {
		pass: boolean;
		reasons: string[];
	};
	assert.equal(missingOutput.pass, false);
	assert.match(missingOutput.reasons.join(' '), /did not write required output/);
	const current = matrix.current as { pass: boolean; reasons: string[] };
	assert.equal(current.pass, true);
}

async function installFailureAuthorizerExample(repository: string): Promise<void> {
	const workflowDirectory = join(repository, 'workflows');
	await Deno.mkdir(workflowDirectory, { recursive: true });
	await Deno.copyFile(
		FAILURE_AUTHORIZER_EXAMPLE_PATH,
		join(workflowDirectory, 'workflow-project-failure-authorizer.yaml')
	);
	await runCommand(
		'swamp',
		['workflow', 'validate', 'project-failure-authorizer', '--json'],
		repository
	);
}

async function setUpCleanConsumer(repository: string): Promise<string> {
	await runCommand('swamp', ['init', repository, '--tool', 'none', '--json'], REPOSITORY_ROOT);
	await runCommand('git', ['init'], repository);
	const extensionSource = await createPortableExtensionSource(repository);
	await runCommand(
		'swamp',
		['extension', 'source', 'add', extensionSource, '--only', 'models', '--json'],
		repository
	);
	await runCommand(
		'swamp',
		['extension', 'pull', '@swamp/software-factory', '--yes', '--json'],
		repository
	);

	const factoryDefinition = await createModel(repository, '@swamp/software-factory', FACTORY_MODEL);
	const factoryScaffold = parse(await Deno.readTextFile(factoryDefinition)) as JsonObject;
	if (typeof factoryScaffold.id !== 'string') throw new Error('clean-room Factory id missing');
	const profileDefinition = await createModel(
		repository,
		'@club_aqua_back_deck/dex-software-factory',
		PROFILE_MODEL
	);
	const profile = parseObject(await Deno.readTextFile(PROFILE_FIXTURE_PATH));
	profile.sourceFactoryId = factoryScaffold.id;
	await setModelGlobalArguments(profileDefinition, profile);
	await runCommand('swamp', ['model', 'method', 'run', PROFILE_MODEL, 'compile'], repository);

	const trackerDefinition = await createModel(
		repository,
		'@club_aqua_back_deck/dex-task-tracker',
		TRACKER_MODEL
	);
	await setModelGlobalArguments(trackerDefinition, {
		ownerToken: 'clean-room-delivery'
	});
	const planApplierDefinition = await createModel(
		repository,
		'@club_aqua_back_deck/dex-plan-applier',
		PLAN_APPLIER_MODEL
	);
	await setModelGlobalArguments(planApplierDefinition, {
		ownerToken: 'clean-room-delivery'
	});

	await runCommand(
		Deno.execPath(),
		[
			'run',
			'--allow-run',
			'--allow-read',
			'--allow-write',
			MATERIALIZER_PATH,
			PROFILE_MODEL,
			factoryDefinition,
			'clean-room-delivery'
		],
		repository
	);
	await installFailureAuthorizerExample(repository);
	const firstDefinition = parse(await Deno.readTextFile(factoryDefinition)) as JsonObject;
	const firstVersion = firstDefinition.version;
	const secondMaterialization = await runCommand(
		Deno.execPath(),
		[
			'run',
			'--allow-run',
			'--allow-read',
			'--allow-write',
			MATERIALIZER_PATH,
			PROFILE_MODEL,
			factoryDefinition,
			'clean-room-delivery'
		],
		repository
	);
	const secondDefinition = parse(await Deno.readTextFile(factoryDefinition)) as JsonObject;
	assert.equal(secondDefinition.version, firstVersion);
	assert.match(secondMaterialization.stdout, /already matches/);

	for (const modelName of [PROFILE_MODEL, PLAN_APPLIER_MODEL, TRACKER_MODEL, FACTORY_MODEL]) {
		await runCommand('swamp', ['model', 'validate', modelName, '--json'], repository);
	}
	const dexDirectory = await runCommand('dex', ['dir'], repository);
	assert.equal(dexDirectory.stdout.trim(), join(await Deno.realPath(repository), '.dex'));
	return factoryDefinition;
}

async function provePortablePiClaimAndHandoff(repository: string): Promise<void> {
	const workItem = await startTrackedTask(repository, 'Portable Pi profile-name claim and handoff');
	await runFactoryMethod(repository, 'start', { workItem });
	await recordDispatch(repository, workItem);
	await recordEvidence(repository, workItem, 'preflight-run', {
		status: 'succeeded',
		runId: `preflight-${workItem}`
	});
	await advance(repository, workItem, 'implement');
	await factoryStatus(repository, workItem);
	const factoryModel = parseObject(
		(await runCommand('swamp', ['model', 'get', FACTORY_MODEL, '--json'], repository)).stdout
	);
	assert.equal(typeof factoryModel.id, 'string');
	const task = 'Implement the synthetic work item and record a compact summary.';
	const piRequest = {
		agent: 'worker' as const,
		task,
		worktree: true as const,
		context: 'fork' as const,
		skill: ['implementation'],
		outputSchema: createFactoryFleetWorkerOutputJsonSchema({
			rootEpicId: workItem,
			activeTaskId: workItem,
			workItem,
			piKey: `factory:${workItem}:${workItem}`
		}),
		acceptance: false as const,
		async: true as const,
		artifacts: true as const
	};
	const canonicalRequest = JSON.stringify(canonicalize(piRequest));
	const requestDigest = sha256(canonicalRequest);
	const taskDigest = sha256(task);
	const reservationOutput = parseObject(
		(
			await runProfileMethod(repository, 'reserve_pi_dispatch', {
				sourceFactoryId: factoryModel.id,
				workItem,
				rootEpicId: workItem,
				stage: 'implementation',
				stageCycle: 1,
				dispatchAttempt: 1,
				exactFrozenRequestDigest: requestDigest,
				piTaskDigest: taskDigest,
				piRequest,
				maximumTransportAttempts: 3
			})
		).stdout
	);
	const dispatchToken = nestedString(reservationOutput, 'dispatchToken');
	const profileModelName = nestedString(reservationOutput, 'profileModelName');
	assert.equal(profileModelName, PROFILE_MODEL);
	await runFactoryMethod(repository, 'record_dispatch', {
		workItem,
		mode: 'dispatch',
		runId: requestDigest
	});
	const submissionAttemptId = sha256(`portable-submission:${dispatchToken}`);
	await runProfileMethod(repository, 'record_pi_submission_attempt', {
		dispatchToken,
		submissionAttemptId
	});
	const ordinal = 1;
	const receiptDigest = sha256(
		JSON.stringify(
			canonicalize({
				dispatchToken,
				submissionAttemptId,
				ordinal,
				exactFrozenRequestDigest: requestDigest
			})
		)
	);
	const transport = createFactoryPiTransportRequest(
		piRequest,
		profileModelName,
		dispatchToken,
		taskDigest,
		{ submissionAttemptId, ordinal, receiptDigest }
	);
	assert.match(
		transport.task,
		/swamp model method run project-delivery-profile claim_pi_execution/
	);
	assert.doesNotMatch(transport.task, /supers-delivery-profile/);

	const realRepository = await Deno.realPath(repository);
	const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
	const asyncRoot = join(tmpdir(), `pi-subagents-uid-${uid}`, 'async-subagent-runs');
	const sessionRoot = join(homedir(), '.pi', 'agent', 'sessions');
	await Deno.mkdir(asyncRoot, { recursive: true });
	await Deno.mkdir(sessionRoot, { recursive: true });
	const piRunId = `portable-${crypto.randomUUID()}`;
	const childRunId = `${piRunId}-child`;
	const runRoot = join(asyncRoot, piRunId);
	const sessionFile = join(sessionRoot, `${piRunId}.jsonl`);
	const schemaFile = join(sessionRoot, 'structured-output', childRunId, 'schema.json');
	const handoffFile = join(sessionRoot, 'handoffs', `${childRunId}.json`);
	await Deno.mkdir(runRoot, { recursive: true });
	await Deno.mkdir(dirname(schemaFile), { recursive: true });
	await Deno.mkdir(dirname(handoffFile), { recursive: true });
	try {
		await Deno.writeTextFile(
			sessionFile,
			JSON.stringify({
				type: 'message',
				message: {
					role: 'user',
					content: [
						{ type: 'text', text: `Task: ${transport.task}\n\n---\nRuntime output contract.` }
					]
				}
			})
		);
		await Deno.writeTextFile(
			join(runRoot, 'status.json'),
			JSON.stringify({
				runId: piRunId,
				mode: 'workflow',
				state: 'running',
				cwd: realRepository,
				steps: [{ agent: 'worker', status: 'running', sessionFile, runId: childRunId }]
			})
		);
		await runProfileMethod(repository, 'bind_pi_launch', { dispatchToken, piRunId });
		const claimOutput = parseObject(
			(await runProfileMethod(repository, 'claim_pi_execution', { dispatchToken, piRunId })).stdout
		);
		const claimNonce = nestedString(claimOutput, 'claimNonce');
		const fixtureText = await Deno.readTextFile(
			join(REPOSITORY_ROOT, 'fixtures/pi-workflow-lifecycle/completed-run.json')
		);
		const values = JSON.parse(
			fixtureText
				.replaceAll('OUTER_RUN_ID', piRunId)
				.replaceAll('CHILD_RUN_ID', childRunId)
				.replaceAll('REPO_DIR', realRepository)
				.replaceAll('SESSION_FILE', sessionFile)
				.replaceAll('SCHEMA_FILE', schemaFile)
				.replaceAll('HANDOFF_FILE', handoffFile)
				.replaceAll('PATCH_FILE', join(runRoot, 'portable.patch'))
		) as { status: unknown; handoff: unknown };
		await Deno.writeTextFile(schemaFile, JSON.stringify(piRequest.outputSchema));
		const handoffText = JSON.stringify(values.handoff);
		await Deno.writeTextFile(handoffFile, handoffText);
		await Deno.writeTextFile(join(runRoot, 'status.json'), JSON.stringify(values.status));
		await runProfileMethod(repository, 'bind_pi_handoff', {
			dispatchToken,
			piRunId,
			claimNonce,
			handoffDigest: sha256(handoffText),
			launchContractDigest: 'a'.repeat(64)
		});
		const outboxQuery = await runCommand(
			'swamp',
			[
				'data',
				'query',
				`modelName == "${PROFILE_MODEL}" && specName == "pi-dispatch-outbox"`,
				'--select',
				'attributes',
				'--json'
			],
			repository
		);
		const outboxes = parseArray(outboxQuery.stdout) as JsonObject[];
		const current = outboxes.find((entry) => entry.dispatchToken === dispatchToken);
		assert.equal(current?.profileModelName, PROFILE_MODEL);
		assert.equal(current?.state, 'handoff-ready');
	} finally {
		await Deno.remove(runRoot, { recursive: true }).catch(() => undefined);
		await Deno.remove(sessionFile).catch(() => undefined);
		await Deno.remove(dirname(schemaFile), { recursive: true }).catch(() => undefined);
		await Deno.remove(handoffFile).catch(() => undefined);
	}
	await abortRun(repository, workItem);
}

async function provePortableClaimedPiFailureRecovery(repository: string): Promise<void> {
	const workItem = await startTrackedTask(
		repository,
		'Claimed Pi failure uses the configured portable authorizer'
	);
	await runFactoryMethod(repository, 'start', { workItem });
	await recordDispatch(repository, workItem);
	await recordEvidence(repository, workItem, 'preflight-run', {
		status: 'succeeded',
		runId: `preflight-${workItem}`
	});
	await advance(repository, workItem, 'implement');
	await factoryStatus(repository, workItem);
	const factoryModel = parseObject(
		(await runCommand('swamp', ['model', 'get', FACTORY_MODEL, '--json'], repository)).stdout
	);
	assert.equal(typeof factoryModel.id, 'string');
	const task = 'Implement the synthetic work item and record a compact summary.';
	const piRequest = {
		agent: 'worker' as const,
		task,
		worktree: true as const,
		context: 'fork' as const,
		skill: ['implementation'],
		outputSchema: createFactoryFleetWorkerOutputJsonSchema({
			rootEpicId: workItem,
			activeTaskId: workItem,
			workItem,
			piKey: `factory:${workItem}:${workItem}`
		}),
		acceptance: false as const,
		async: true as const,
		artifacts: true as const
	};
	const requestDigest = sha256(JSON.stringify(canonicalize(piRequest)));
	const taskDigest = sha256(task);
	const reservation = parseObject(
		(
			await runProfileMethod(repository, 'reserve_pi_dispatch', {
				sourceFactoryId: factoryModel.id,
				workItem,
				rootEpicId: workItem,
				stage: 'implementation',
				stageCycle: 1,
				dispatchAttempt: 1,
				exactFrozenRequestDigest: requestDigest,
				piTaskDigest: taskDigest,
				piRequest,
				maximumTransportAttempts: 3
			})
		).stdout
	);
	const dispatchToken = nestedString(reservation, 'dispatchToken');
	const profileModelName = nestedString(reservation, 'profileModelName');
	await runFactoryMethod(repository, 'record_dispatch', {
		workItem,
		mode: 'dispatch',
		runId: requestDigest
	});
	const submissionAttemptId = sha256(`portable-claimed-failure:${dispatchToken}`);
	await runProfileMethod(repository, 'record_pi_submission_attempt', {
		dispatchToken,
		submissionAttemptId
	});
	const receiptDigest = sha256(
		JSON.stringify(
			canonicalize({
				dispatchToken,
				submissionAttemptId,
				ordinal: 1,
				exactFrozenRequestDigest: requestDigest
			})
		)
	);
	const transport = createFactoryPiTransportRequest(
		piRequest,
		profileModelName,
		dispatchToken,
		taskDigest,
		{ submissionAttemptId, ordinal: 1, receiptDigest }
	);
	const realRepository = await Deno.realPath(repository);
	const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
	const asyncRoot = join(tmpdir(), `pi-subagents-uid-${uid}`, 'async-subagent-runs');
	const sessionRoot = join(homedir(), '.pi', 'agent', 'sessions');
	await Deno.mkdir(asyncRoot, { recursive: true });
	await Deno.mkdir(sessionRoot, { recursive: true });
	const piRunId = `portable-failure-${crypto.randomUUID()}`;
	const childRunId = `${piRunId}-child`;
	const runRoot = join(asyncRoot, piRunId);
	const sessionFile = join(sessionRoot, `${piRunId}.jsonl`);
	await Deno.mkdir(runRoot, { recursive: true });
	try {
		await Deno.writeTextFile(
			sessionFile,
			JSON.stringify({
				type: 'message',
				message: {
					role: 'user',
					content: [{ type: 'text', text: `Task: ${transport.task}\n\n---\nRuntime output contract.` }]
				}
			})
		);
		const runtimeStatus = (state: 'running' | 'failed') => ({
			runId: piRunId,
			mode: 'workflow',
			state,
			cwd: realRepository,
			steps: [{ agent: 'worker', status: state, sessionFile, runId: childRunId }]
		});
		await Deno.writeTextFile(join(runRoot, 'status.json'), JSON.stringify(runtimeStatus('running')));
		await runProfileMethod(repository, 'bind_pi_launch', { dispatchToken, piRunId });
		await runProfileMethod(repository, 'claim_pi_execution', { dispatchToken, piRunId });
		await Deno.writeTextFile(join(runRoot, 'status.json'), JSON.stringify(runtimeStatus('failed')));
		const reconciliation = parseObject(
			(await runProfileMethod(repository, 'reconcile_pi_dispatch', { dispatchToken })).stdout
		);
		assert.equal(nestedString(reconciliation, 'state'), 'execution-failed');
		const failureReceiptName = nestedString(
			reconciliation,
			'factoryExecutionFailureReceiptName'
		);
		const failureQuery = await runCommand(
			'swamp',
			[
				'data',
				'query',
				`modelName == "${PROFILE_MODEL}" && specName == "execution-failure"`,
				'--select',
				'attributes',
				'--json'
			],
			repository
		);
		const failures = parseArray(failureQuery.stdout) as JsonObject[];
		const claimedFailure = failures.find(
			(entry) => entry.authorityReceiptName === failureReceiptName
		);
		assert.equal(claimedFailure?.authorityWorkflow, 'project-failure-authorizer');
		await runCommand(
			'swamp',
			[
				'workflow',
				'run',
				'project-failure-authorizer',
				'--input',
				`profileModelName=${PROFILE_MODEL}`,
				'--input',
				`sourceFactoryModelName=${FACTORY_MODEL}`,
				'--input',
				`receiptName=${failureReceiptName}`,
				'--input',
				`sourceFactoryId=${factoryModel.id}`,
				'--input',
				`workItem=${workItem}`,
				'--input',
				'stage=implementation',
				'--input',
				'stageCycle=1',
				'--input',
				'dispatchAttempt=1',
				'--input',
				`dispatchRunId=${requestDigest}`
			],
			repository
		);
		const authorized = await factoryStatus(repository, workItem);
		assert.deepEqual(satisfiedTransitions(authorized), ['operational-pause']);
		await advance(repository, workItem, 'operational-pause');
		assert.equal((await factoryStatus(repository, workItem)).stage.id, 'implementation-recovery');
		await approve(repository, workItem, 'retry-implementation', 'Portable Pi failure repaired.');
		await advance(repository, workItem, 'retry-implementation');
		const recovered = await factoryStatus(repository, workItem);
		assert.equal(recovered.stage.id, 'implementation');
		assert.equal(recovered.stage.cycle, 2);
	} finally {
		await Deno.remove(runRoot, { recursive: true }).catch(() => undefined);
		await Deno.remove(sessionFile).catch(() => undefined);
	}
	await abortRun(repository, workItem);
}

async function runPortabilityMatrix(repository: string): Promise<void> {
	await provePortablePiClaimAndHandoff(repository);
	await provePortableClaimedPiFailureRecovery(repository);
	const supersFactory = {
		id: '90fac686-c724-4aee-97c4-e31b9af4c5e2',
		name: 'supers-delivery'
	} as const;
	const runnerFor =
		(
			workItem: string,
			stage: string,
			work: JsonObject,
			dirty = false
		): FactoryPrerequisiteCommandRunner =>
		(command, args) => ({
			status: 0,
			stdout:
				command === 'dex'
					? JSON.stringify({
							results: [
								{
									id: `root-${workItem}`,
									parent_id: null,
									completed: false,
									started_at: null,
									blockedBy: []
								},
								{
									id: workItem,
									parent_id: `root-${workItem}`,
									completed: false,
									started_at: '2026-08-17T00:00:00Z',
									blockedBy: []
								}
							]
						})
					: command === 'git' && dirty
						? ' M dirty-file\0'
						: command === 'swamp' && args[0] === 'data'
							? JSON.stringify([
									{
										attributes: {
											workItem,
											stage: { id: stage, cycle: 1 },
											dispatch: { cycle: 1, attempts: 0 },
											work
										}
									}
								])
							: '',
			stderr: ''
		});
	for (const fixture of [
		{
			workItem: 'mode-method',
			stage: 'preflight' as const,
			work: {
				mode: 'method',
				method: {
					modelIdOrName: 'consumer-policy',
					methodName: 'preflight',
					inputs: { workItem: 'mode-method' }
				}
			},
			invocation: {
				mode: 'method' as const,
				modelIdOrName: 'consumer-policy',
				methodName: 'preflight',
				inputs: { workItem: 'mode-method' }
			}
		},
		{
			workItem: 'mode-interactive',
			stage: 'verification' as const,
			work: { mode: 'interactive', systemPrompt: 'Execute fixture verification.' },
			invocation: { mode: 'interactive' as const, executor: 'driver' as const }
		}
	]) {
		const intent = {
			sourceFactory: supersFactory,
			workItem: fixture.workItem,
			rootEpicId: `root-${fixture.workItem}`,
			activeTaskId: fixture.workItem,
			stage: fixture.stage,
			invocation: fixture.invocation
		};
		const plan = checkFactoryDispatchPrerequisites({
			intent,
			runCommand: runnerFor(fixture.workItem, fixture.stage, fixture.work)
		});
		assert.equal(plan.passed, true);
		if (!plan.passed) throw new Error('clean-room prerequisite mode failed');
		const boundary: string[] = [];
		await dispatchValidatedFactoryRequest({
			plan,
			recordDispatch: async (_exact, digest) => {
				boundary.push(`dispatch:${digest}`);
			},
			executeTrustedWorkBoundary: async (exact) => {
				boundary.push(`execute:${exact.dispatchRunId}`);
			},
			submitDriverRequest: async (_exact, digest) => {
				boundary.push(`submit:${digest}`);
			}
		});
		assert.equal(boundary.length, 2);
		assert.equal(
			boundary.every((entry) => entry.endsWith(plan.digest)),
			true
		);
	}

	const prerequisiteTask = await startTrackedTask(
		repository,
		'Prerequisites protect actual dispatch accounting'
	);
	await runFactoryMethod(repository, 'start', { workItem: prerequisiteTask });
	const compiledMethodWork = {
		mode: 'method',
		method: {
			modelIdOrName: 'consumer-policy',
			methodName: 'preflight',
			inputs: { workItem: prerequisiteTask }
		}
	};
	const compiledMethodIntent = {
		sourceFactory: supersFactory,
		workItem: prerequisiteTask,
		rootEpicId: `root-${prerequisiteTask}`,
		activeTaskId: prerequisiteTask,
		stage: 'preflight' as const,
		invocation: {
			mode: 'method' as const,
			modelIdOrName: 'consumer-policy',
			methodName: 'preflight',
			inputs: { workItem: prerequisiteTask }
		}
	};
	const failedPlan = checkFactoryDispatchPrerequisites({
		intent: compiledMethodIntent,
		runCommand: runnerFor(prerequisiteTask, 'preflight', compiledMethodWork, true)
	});
	assert.equal(failedPlan.passed, false);
	assert.equal((await factoryStatus(repository, prerequisiteTask)).dispatch.attempts, 0);
	const validPlan = checkFactoryDispatchPrerequisites({
		intent: compiledMethodIntent,
		runCommand: runnerFor(prerequisiteTask, 'preflight', compiledMethodWork)
	});
	if (!validPlan.passed) throw new Error('expected valid clean-room dispatch plan');
	let executedDigest = '';
	await dispatchValidatedFactoryRequest({
		plan: validPlan,
		recordDispatch: async (_exact, digest) => {
			await runFactoryMethod(repository, 'record_dispatch', {
				workItem: prerequisiteTask,
				mode: 'method',
				runId: digest
			});
		},
		executeTrustedWorkBoundary: async (exact) => {
			executedDigest = exact.dispatchRunId;
		}
	});
	assert.equal(executedDigest, validPlan.digest);
	assert.equal((await factoryStatus(repository, prerequisiteTask)).dispatch.attempts, 1);
	await abortRun(repository, prerequisiteTask);

	const recoveryTask = await startTrackedTask(repository, 'Operational recovery preserves history');
	const recoveryDispatchRunId = 'b'.repeat(64);
	await runFactoryMethod(repository, 'start', { workItem: recoveryTask });
	await runFactoryMethod(repository, 'record_dispatch', {
		workItem: recoveryTask,
		mode: 'workflow',
		runId: recoveryDispatchRunId
	});
	await runFactoryMethod(repository, 'record_dispatch', { workItem: recoveryTask }, 'failure');
	assert.equal((await factoryStatus(repository, recoveryTask)).dispatch.attempts, 1);
	const factoryModel = parseObject(
		(await runCommand('swamp', ['model', 'get', FACTORY_MODEL, '--json'], repository)).stdout
	);
	assert.equal(typeof factoryModel.id, 'string');
	const dirtyProbePath = join(repository, 'operational-prerequisite-probe.txt');
	await Deno.writeTextFile(dirtyProbePath, 'force a real git-clean prerequisite failure');
	await runProfileMethod(repository, 'execute_failure_boundary', {
		sourceFactoryId: factoryModel.id,
		workItem: recoveryTask,
		stage: 'preflight',
		stageCycle: 1,
		dispatchAttempt: 1,
		dispatchRunId: recoveryDispatchRunId,
		category: 'prerequisite',
		operation: 'git-clean',
		retryable: true
	});
	await Deno.remove(dirtyProbePath);
	const receiptQuery = await runCommand(
		'swamp',
		[
			'data',
			'query',
			`modelName == "${PROFILE_MODEL}" && specName == "execution-failure" && attributes.workItem == "${recoveryTask}"`,
			'--select',
			'name',
			'--json'
		],
		repository
	);
	const receiptNames = parseArray(receiptQuery.stdout).filter(
		(name): name is string => typeof name === 'string'
	);
	assert.equal(receiptNames.length, 1);
	await runCommand(
		'swamp',
		[
			'workflow',
			'run',
			'project-failure-authorizer',
			'--input',
			`profileModelName=${PROFILE_MODEL}`,
			'--input',
			`sourceFactoryModelName=${FACTORY_MODEL}`,
			'--input',
			`receiptName=${receiptNames[0]}`,
			'--input',
			`sourceFactoryId=${factoryModel.id}`,
			'--input',
			`workItem=${recoveryTask}`,
			'--input',
			'stage=preflight',
			'--input',
			'stageCycle=1',
			'--input',
			'dispatchAttempt=1',
			'--input',
			`dispatchRunId=${recoveryDispatchRunId}`
		],
		repository
	);
	const authorizedRecoveryStatus = await factoryStatus(repository, recoveryTask);
	assert.deepEqual(
		satisfiedTransitions(authorizedRecoveryStatus),
		['operational-pause'],
		JSON.stringify(authorizedRecoveryStatus)
	);
	await advance(repository, recoveryTask, 'operational-pause');
	assert.equal((await factoryStatus(repository, recoveryTask)).stage.id, 'preflight-recovery');
	await approve(repository, recoveryTask, 'retry-preflight', 'Synthetic tool repair completed.');
	await advance(repository, recoveryTask, 'retry-preflight');
	const recovered = await factoryStatus(repository, recoveryTask);
	assert.equal(recovered.stage.id, 'preflight');
	assert.equal(recovered.stage.cycle, 2);
	assert.equal(recovered.dispatch.attempts, 0);
	await recordDispatch(repository, recoveryTask);
	assert.equal((await factoryStatus(repository, recoveryTask)).dispatch.attempts, 1);
	await abortRun(repository, recoveryTask);

	const patchedTask = await startTrackedTask(repository, 'Patch-cycle terminal success');
	await startThroughVerification(repository, patchedTask);
	await recordArtifact(
		repository,
		patchedTask,
		'verification',
		verificationPayload('failed', true, 'review')
	);
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, patchedTask)), []);
	await recordArtifact(
		repository,
		patchedTask,
		'verification',
		verificationPayload('failed', false, 'rework')
	);
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, patchedTask)), ['rework']);
	await advance(repository, patchedTask, 'rework');
	await implementationThroughVerification(repository, patchedTask, 'patched implementation');
	await recordArtifact(
		repository,
		patchedTask,
		'verification',
		verificationPayload('passed', false, 'reconcile')
	);
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, patchedTask)), [
		'reconcile'
	]);
	await advance(repository, patchedTask, 'reconcile');
	await advanceToCleanup(repository, patchedTask);
	await completeTrackedCleanup(repository, patchedTask);

	const reviewedTask = await startTrackedTask(repository, 'Review approval and rejection');
	await startThroughVerification(repository, reviewedTask);
	await recordArtifact(
		repository,
		reviewedTask,
		'verification',
		verificationPayload('passed', true, 'review')
	);
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, reviewedTask)), ['review']);
	await advance(repository, reviewedTask, 'review');
	await recordDispatch(repository, reviewedTask);
	await recordArtifact(repository, reviewedTask, 'review-findings', {
		findings: []
	});
	await recordArtifact(repository, reviewedTask, 'review-verdict', {
		status: 'accept',
		summary: 'Synthetic review accepted the first result.'
	});
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, reviewedTask)), []);
	await reject(
		repository,
		reviewedTask,
		'fixture-acceptance',
		'Rework the deterministic fixture once.'
	);
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, reviewedTask)), [
		'human-revision'
	]);
	await advance(repository, reviewedTask, 'human-revision');
	await implementationThroughVerification(repository, reviewedTask, 'human-requested patch');
	await recordArtifact(
		repository,
		reviewedTask,
		'verification',
		verificationPayload('passed', true, 'review')
	);
	await advance(repository, reviewedTask, 'review');
	await recordDispatch(repository, reviewedTask);
	await recordArtifact(repository, reviewedTask, 'review-findings', {
		findings: []
	});
	await recordArtifact(repository, reviewedTask, 'review-verdict', {
		status: 'accept',
		summary: 'Synthetic review accepted the patched result.'
	});
	await approve(repository, reviewedTask, 'fixture-acceptance', 'Synthetic fixture approval');
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, reviewedTask)), ['accept']);
	await advance(repository, reviewedTask, 'accept');
	await advanceToCleanup(repository, reviewedTask);
	await completeTrackedCleanup(repository, reviewedTask);

	const missingTask = 'missing-tracker-task';
	await startThroughVerification(repository, missingTask);
	await recordArtifact(
		repository,
		missingTask,
		'verification',
		verificationPayload('passed', false, 'reconcile')
	);
	await advance(repository, missingTask, 'reconcile');
	await advanceToCleanup(repository, missingTask);
	await runTrackerMethod(
		repository,
		'complete',
		{
			taskId: missingTask,
			result: 'This must fail closed.',
			commit: { kind: 'noCommit' }
		},
		'failure'
	);
	const failedReceipts = await runCommand(
		'swamp',
		[
			'data',
			'query',
			`modelName == "${TRACKER_MODEL}" && attributes.taskId == "${missingTask}"`,
			'--select',
			'attributes',
			'--json'
		],
		repository
	);
	const receiptRecords = parseArray(failedReceipts.stdout) as JsonObject[];
	assert.ok(
		receiptRecords.some(
			(receipt) => receipt.status === 'failed' && receipt.errorCode === 'task-not-found'
		)
	);
	const cleanupStatus = await factoryStatus(repository, missingTask);
	assert.equal(cleanupStatus.stage.id, 'terminal-cleanup');
	assert.deepEqual(satisfiedTransitions(cleanupStatus), []);
	await abortRun(repository, missingTask);

	const parkedTask = 'cycle-limit-fixture';
	await startThroughVerification(repository, parkedTask);
	await recordArtifact(
		repository,
		parkedTask,
		'verification',
		verificationPayload('failed', false, 'rework')
	);
	await advance(repository, parkedTask, 'rework');
	await implementationThroughVerification(repository, parkedTask, 'second failing cycle');
	await recordArtifact(
		repository,
		parkedTask,
		'verification',
		verificationPayload('failed', false, 'rework')
	);
	const parkedStatus = await factoryStatus(repository, parkedTask);
	const parkedTransition = parkedStatus.transitions.find(
		(transition) => transition.name === 'rework'
	);
	assert.ok(parkedTransition);
	assert.equal(parkedTransition.satisfied, false);
	assert.equal(parkedTransition.cycleLimitBlocked, true);
	await approve(
		repository,
		parkedTask,
		'cycle-override:implementation',
		'Synthetic fixture exercises one cycle override.'
	);
	assert.deepEqual(satisfiedTransitions(await factoryStatus(repository, parkedTask)), ['rework']);
	await advance(repository, parkedTask, 'rework');
	await abortRun(repository, parkedTask);
}

Deno.test({
	name: 'portable Factory passes the independent clean-room lifecycle matrix',
	sanitizeOps: false,
	sanitizeResources: false,
	fn: async () => {
		const repository = await Deno.makeTempDir({
			prefix: 'dex-software-factory-consumer-'
		});
		try {
			const definitionPath = await setUpCleanConsumer(repository);
			const definitionText = await Deno.readTextFile(definitionPath);
			assert.equal(definitionText.toLowerCase().includes('supers'), false);
			await proveStaleWorkflowEvidence(repository);
			await runPortabilityMatrix(repository);
		} finally {
			if (Deno.env.get('KEEP_FACTORY_PORTABILITY_FIXTURE') === undefined) {
				await Deno.remove(repository, { recursive: true });
			} else {
				console.log(`Kept portability fixture at ${repository}`);
			}
		}
	}
});
