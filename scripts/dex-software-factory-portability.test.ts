import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, stringify } from 'jsr:@std/yaml@1.0.10';

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
	transitions: FactoryTransitionStatus[];
};

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_FIXTURE_PATH = join(
	REPOSITORY_ROOT,
	'fixtures/dex-software-factory-consumer/profile.json'
);
const MATERIALIZER_PATH = join(REPOSITORY_ROOT, 'scripts/materialize-dex-software-factory.ts');
const PORTABLE_MODEL_FILES = [
	'dex-software-factory.ts',
	'dex-software-factory-compiler.ts',
	'dex-task-tracker.ts',
	'dex-task-tracker-adapter.ts'
] as const;
const FACTORY_MODEL = 'clean-room-factory';
const PROFILE_MODEL = 'clean-room-profile';
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
	return runFactoryMethod(repository, 'record_artifact', { workItem, name, payload });
}

function recordEvidence(
	repository: string,
	workItem: string,
	name: string,
	payload: JsonObject
): Promise<CommandResult> {
	return runFactoryMethod(repository, 'record_evidence', { workItem, name, payload });
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
		requiredLanes: [{ id: 'fixture-tests', reasons: ['portable lifecycle evidence'] }],
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
const base = { args: { stages: [], globalTransitions: [] }, state, view, workItem: "workflow-fixture", workItemSlug: "workflow-fixture", now: new Date("2026-08-05T20:01:00.000Z"), selfName: ${JSON.stringify(FACTORY_MODEL)}, dataRepository: { findAllForModel: () => Promise.resolve([]), getContent: () => Promise.resolve(null) } };
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
	const missingOutput = matrix.missingOutput as { pass: boolean; reasons: string[] };
	assert.equal(missingOutput.pass, false);
	assert.match(missingOutput.reasons.join(' '), /did not write required output/);
	const current = matrix.current as { pass: boolean; reasons: string[] };
	assert.equal(current.pass, true);
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

	const profileDefinition = await createModel(
		repository,
		'@club_aqua_back_deck/dex-software-factory',
		PROFILE_MODEL
	);
	const profile = parseObject(await Deno.readTextFile(PROFILE_FIXTURE_PATH));
	await setModelGlobalArguments(profileDefinition, profile);
	await runCommand('swamp', ['model', 'method', 'run', PROFILE_MODEL, 'compile'], repository);

	const trackerDefinition = await createModel(
		repository,
		'@club_aqua_back_deck/dex-task-tracker',
		TRACKER_MODEL
	);
	await setModelGlobalArguments(trackerDefinition, { ownerToken: 'clean-room-delivery' });

	const factoryDefinition = await createModel(repository, '@swamp/software-factory', FACTORY_MODEL);
	await runCommand(
		Deno.execPath(),
		[
			'run',
			'--allow-run',
			'--allow-read',
			'--allow-write',
			MATERIALIZER_PATH,
			PROFILE_MODEL,
			factoryDefinition
		],
		repository
	);
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
			factoryDefinition
		],
		repository
	);
	const secondDefinition = parse(await Deno.readTextFile(factoryDefinition)) as JsonObject;
	assert.equal(secondDefinition.version, firstVersion);
	assert.match(secondMaterialization.stdout, /already matches/);

	for (const modelName of [PROFILE_MODEL, TRACKER_MODEL, FACTORY_MODEL]) {
		await runCommand('swamp', ['model', 'validate', modelName, '--json'], repository);
	}
	const dexDirectory = await runCommand('dex', ['dir'], repository);
	assert.equal(dexDirectory.stdout.trim(), join(await Deno.realPath(repository), '.dex'));
	return factoryDefinition;
}

async function runPortabilityMatrix(repository: string): Promise<void> {
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
	await recordArtifact(repository, reviewedTask, 'review-findings', { findings: [] });
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
	await recordArtifact(repository, reviewedTask, 'review-findings', { findings: [] });
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
		const repository = await Deno.makeTempDir({ prefix: 'dex-software-factory-consumer-' });
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
