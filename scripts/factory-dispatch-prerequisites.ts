import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	createFactoryFleetWorkerOutputJsonSchema,
	factoryFleetWorkerOutputSchemasSemanticallyEqual,
	type FactoryFleetWorkerOutputJsonSchema
} from '../extensions/models/factory-fleet-worker-output-contract.ts';
import { resolvePlanningDexAncestry, type PlanningDexTask } from './planning-state-checks.ts';

const SUPERS_DELIVERY_FACTORY_ID = '90fac686-c724-4aee-97c4-e31b9af4c5e2';
const SUPERS_DELIVERY_FACTORY_NAME = 'supers-delivery';

export type FactoryPrerequisiteCategory =
	| 'git-dirty'
	| 'dex-unavailable'
	| 'dex-json-invalid'
	| 'dex-lane-invalid'
	| 'node-dependency-unavailable'
	| 'execution-tool-unavailable'
	| 'factory-status-unavailable'
	| 'execution-request-invalid';

export interface FactoryPrerequisiteFailure {
	category: FactoryPrerequisiteCategory;
	commandOrTool: string;
	error: string;
}
export type FactoryPrerequisiteStage =
	| 'preflight'
	| 'implementation'
	| 'classify'
	| 'verification'
	| 'review'
	| 'aesthetic-decision-binding'
	| 'reconciliation'
	| 'postflight'
	| 'terminal-cleanup'
	| 'done-observability'
	| 'aborted-observability'
	| 'escalated-observability';

export type FactoryPiOutputSchema = FactoryFleetWorkerOutputJsonSchema;

export type FactoryCompiledWorkSpec =
	| Readonly<{
			mode: 'workflow';
			workflow: Readonly<{ name: string; inputs: Readonly<Record<string, unknown>> }>;
	  }>
	| Readonly<{
			mode: 'method';
			method: Readonly<{
				modelIdOrName: string;
				methodName: string;
				inputs: Readonly<Record<string, unknown>>;
			}>;
	  }>
	| Readonly<{
			mode: 'dispatch';
			skills: readonly string[];
			systemPrompt: string;
			command?: string;
			constraints?: string;
	  }>
	| Readonly<{ mode: 'interactive'; skills?: readonly string[]; systemPrompt: string }>;

/** Exact top-level asynchronous Pi request approved for one Factory root. */
export interface FactoryPiAsyncRunRequest {
	agent: 'worker';
	task: string;
	worktree: true;
	context: 'fork';
	skill: readonly string[];
	outputSchema: FactoryPiOutputSchema;
	acceptance: false;
	async: true;
	artifacts: true;
}

export type FactoryExecutionInvocation =
	| Readonly<{ mode: 'workflow'; workflowName: string; inputs: Readonly<Record<string, unknown>> }>
	| Readonly<{
			mode: 'method';
			modelIdOrName: string;
			methodName: string;
			inputs: Readonly<Record<string, unknown>>;
	  }>
	| Readonly<{ mode: 'dispatch'; piKey: string; request: FactoryPiAsyncRunRequest }>
	| Readonly<{ mode: 'interactive'; executor: 'driver' }>;

export type FactoryDriverSubmitRequest =
	| Readonly<FactoryPiAsyncRunRequest>
	| Extract<FactoryExecutionInvocation, Readonly<{ mode: 'interactive'; executor: 'driver' }>>;

export interface FactoryTrustedWorkBoundaryRequest {
	sourceFactoryId: string;
	workItem: string;
	stage: FactoryPrerequisiteStage;
	stageCycle: number;
	dispatchAttempt: number;
	dispatchRunId: string;
	retryable: boolean;
}

export interface FactoryDispatchIntent {
	sourceFactory: Readonly<{
		id: typeof SUPERS_DELIVERY_FACTORY_ID;
		name: typeof SUPERS_DELIVERY_FACTORY_NAME;
	}>;
	workItem: string;
	rootEpicId: string;
	activeTaskId: string;
	stage: FactoryPrerequisiteStage;
	invocation: FactoryExecutionInvocation;
}

export interface FactoryDispatchRequest extends FactoryDispatchIntent {
	work: FactoryCompiledWorkSpec;
	stageCycle: number;
	dispatchCycle: number;
	currentDispatchCount: number;
	expectedNextDispatchAttempt: number;
}
export interface FactoryPrerequisiteFailureResult {
	passed: false;
	failures: readonly FactoryPrerequisiteFailure[];
}
export interface ValidatedFactoryDispatchPlan {
	readonly passed: true;
	readonly digest: string;
	readonly __validatedFactoryDispatchPlan: unique symbol;
}
export type FactoryPrerequisiteResult =
	FactoryPrerequisiteFailureResult | ValidatedFactoryDispatchPlan;
export type FactoryPrerequisiteCommandRunner = (
	command: string,
	args: readonly string[]
) => { status: number | null; stdout: string; stderr: string };

const STAGES = new Set<FactoryPrerequisiteStage>([
	'preflight',
	'implementation',
	'classify',
	'verification',
	'review',
	'aesthetic-decision-binding',
	'reconciliation',
	'postflight',
	'terminal-cleanup',
	'done-observability',
	'aborted-observability',
	'escalated-observability'
]);
const PI_RUN_REQUEST_FIELDS = [
	'acceptance',
	'agent',
	'artifacts',
	'async',
	'context',
	'outputSchema',
	'skill',
	'task',
	'worktree'
] as const;
const validatedPlans = new WeakMap<
	object,
	{
		request: Readonly<FactoryDispatchRequest>;
		digest: string;
		prerequisiteFactsDigest: string;
		runCommand: FactoryPrerequisiteCommandRunner;
	}
>();

const defaultRunner: FactoryPrerequisiteCommandRunner = (command, args) => {
	const result = spawnSync(command, [...args], { encoding: 'utf8' });
	return {
		status: result.status,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? result.error?.message ?? ''
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function cloneFreeze<T>(value: T): Readonly<T> {
	const clone = structuredClone(value);
	const freeze = (entry: unknown): void => {
		if (entry !== null && typeof entry === 'object' && !Object.isFrozen(entry)) {
			for (const child of Object.values(entry)) freeze(child);
			Object.freeze(entry);
		}
	};
	freeze(clone);
	return clone;
}
function canonicalize(value: unknown): unknown {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	if (isRecord(value))
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([key, entry]) => [key, canonicalize(entry)])
		);
	throw new TypeError(`Unsupported dispatch value: ${typeof value}`);
}
function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}
export function createFactoryDispatchDigest(value: FactoryDispatchRequest): string {
	return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

type FactoryDexLane = Readonly<{ rootEpicId: string; activeTaskId: string }>;
type ParsedFactoryDexTasks = Readonly<{
	tasks: PlanningDexTask[];
	startedAtById: ReadonlyMap<string, string | null>;
}>;

function parseFactoryDexTasks(stdout: string): ParsedFactoryDexTasks | string {
	try {
		const parsed: unknown = JSON.parse(stdout);
		const entries = Array.isArray(parsed)
			? parsed
			: isRecord(parsed) && Array.isArray(parsed.results)
				? parsed.results
				: null;
		if (entries === null) return 'Dex JSON must be an array or an object with a results array.';
		const tasks: PlanningDexTask[] = [];
		const startedAtById = new Map<string, string | null>();
		for (const entry of entries) {
			if (
				!isRecord(entry) ||
				typeof entry.id !== 'string' ||
				entry.id.length === 0 ||
				!(entry.parent_id === null || typeof entry.parent_id === 'string') ||
				typeof entry.completed !== 'boolean' ||
				!(entry.started_at === null || typeof entry.started_at === 'string') ||
				!Array.isArray(entry.blockedBy) ||
				entry.blockedBy.some((blocker) => typeof blocker !== 'string')
			) {
				return 'Every Dex result must contain authoritative id, parent_id, completed, started_at, and blockedBy fields.';
			}
			if (startedAtById.has(entry.id)) return `Dex returned duplicate task id ${entry.id}.`;
			const blockedBy = entry.blockedBy as string[];
			tasks.push({
				id: entry.id,
				parentId: entry.parent_id,
				name: typeof entry.name === 'string' ? entry.name : entry.id,
				description: typeof entry.description === 'string' ? entry.description : '',
				priority:
					typeof entry.priority === 'number' && Number.isFinite(entry.priority)
						? entry.priority
						: 0,
				completed: entry.completed,
				started: entry.started_at !== null,
				blockedBy: [...blockedBy]
			});
			startedAtById.set(entry.id, entry.started_at);
		}
		return { tasks, startedAtById };
	} catch (error) {
		return error instanceof Error ? error.message : 'Dex returned malformed JSON.';
	}
}

/** Derive one active Delivery lane from official Dex task identity and open ancestry. */
function deriveFactoryDexLane(
	parsed: ParsedFactoryDexTasks,
	workItem: string
): FactoryDexLane | string {
	const taskById = new Map(parsed.tasks.map((task) => [task.id, task]));
	const selected = taskById.get(workItem);
	if (selected === undefined)
		return `Factory work item ${workItem} is absent from authoritative Dex JSON.`;
	if (selected.completed || parsed.startedAtById.get(workItem) === null)
		return `Factory work item ${workItem} is not an open active Dex task.`;
	const ancestry = resolvePlanningDexAncestry(workItem, taskById);
	if (ancestry.status !== 'resolved')
		return `Factory work item ${workItem} has ${ancestry.status} ancestry at ${ancestry.invalidTaskId}.`;
	if (parsed.tasks.some((task) => !task.completed && task.parentId === workItem))
		return `Factory work item ${workItem} is not an active Dex leaf.`;
	for (const task of ancestry.path) {
		for (const blockerId of task.blockedBy) {
			const blocker = taskById.get(blockerId);
			if (blocker === undefined)
				return `Dex ancestry task ${task.id} has unknown blocker ${blockerId}.`;
			if (!blocker.completed) return `Dex ancestry task ${task.id} has open blocker ${blockerId}.`;
		}
	}

	const competingActiveLeaves = parsed.tasks.filter((task) => {
		if (
			task.id === workItem ||
			task.completed ||
			!task.started ||
			parsed.tasks.some((candidate) => !candidate.completed && candidate.parentId === task.id)
		)
			return false;
		const candidateAncestry = resolvePlanningDexAncestry(task.id, taskById);
		return (
			candidateAncestry.status === 'resolved' &&
			candidateAncestry.executionRoot.id === ancestry.executionRoot.id
		);
	});
	if (competingActiveLeaves.length > 0)
		return `Dex execution root ${ancestry.executionRoot.id} has more than one active leaf.`;
	return { rootEpicId: ancestry.executionRoot.id, activeTaskId: selected.id };
}

function validateOutputSchema(
	value: unknown,
	intent: FactoryDispatchIntent,
	expectedPiKey: string
): string | null {
	const expected = createFactoryFleetWorkerOutputJsonSchema({
		rootEpicId: intent.rootEpicId,
		activeTaskId: intent.activeTaskId,
		workItem: intent.workItem,
		piKey: expectedPiKey
	});
	return factoryFleetWorkerOutputSchemasSemanticallyEqual(value, expected)
		? null
		: 'Output schema must be semantically equal to the exact approved Factory handoff schema.';
}

function exactEqual(left: unknown, right: unknown): boolean {
	return canonicalJson(left) === canonicalJson(right);
}

/** Deterministically preserve every compiled dispatch instruction in Pi's task field. */
export function createFactoryPiDispatchTask(
	work: Extract<FactoryCompiledWorkSpec, { mode: 'dispatch' }>
): string {
	return [
		work.systemPrompt,
		...(work.command === undefined ? [] : [`Command:\n${work.command}`]),
		...(work.constraints === undefined ? [] : [`Constraints:\n${work.constraints}`])
	].join('\n\n');
}

function validatePiAsyncRunRequest(
	value: unknown,
	request: Readonly<FactoryDispatchRequest>,
	expectedPiKey: string
): string | null {
	if (!isRecord(value)) return 'Dispatch work requires the exact top-level Pi request object.';
	if (!exactEqual(Object.keys(value).sort(), [...PI_RUN_REQUEST_FIELDS]))
		return 'Top-level Pi request contains missing, translated, or extra fields.';
	if (request.work.mode !== 'dispatch')
		return 'Top-level Pi request requires authoritative dispatch work.';
	if (
		value.agent !== 'worker' ||
		value.worktree !== true ||
		value.context !== 'fork' ||
		value.acceptance !== false ||
		value.async !== true ||
		value.artifacts !== true
	) {
		return 'Pi request must be one top-level asynchronous worker in an isolated worktree with durable artifacts and prose acceptance disabled.';
	}
	if (!exactEqual(value.skill, request.work.skills))
		return 'Pi skill selection must exactly match authoritative compiled skills.';
	if (value.task !== createFactoryPiDispatchTask(request.work))
		return 'Pi task must exactly preserve authoritative systemPrompt, command, and constraints.';
	return validateOutputSchema(value.outputSchema, request, expectedPiKey);
}

function validateWorkBinding(request: Readonly<FactoryDispatchRequest>): string | null {
	if (request.work.mode !== request.invocation.mode)
		return 'Invocation mode must exactly match the authoritative current stage work mode.';
	const invocation = request.invocation;
	if (invocation.mode === 'workflow' && request.work.mode === 'workflow') {
		if (
			invocation.workflowName !== request.work.workflow.name ||
			!exactEqual(invocation.inputs, request.work.workflow.inputs)
		)
			return 'Workflow invocation does not exactly match authoritative compiled work.';
		return null;
	}
	if (invocation.mode === 'method' && request.work.mode === 'method') {
		if (
			invocation.modelIdOrName !== request.work.method.modelIdOrName ||
			invocation.methodName !== request.work.method.methodName ||
			!exactEqual(invocation.inputs, request.work.method.inputs)
		)
			return 'Method invocation does not exactly match authoritative compiled work.';
		return null;
	}
	if (invocation.mode === 'dispatch' && request.work.mode === 'dispatch') {
		const expectedPiKey = `factory:${request.rootEpicId}:${request.activeTaskId}`;
		if (request.activeTaskId !== request.workItem)
			return 'Approved active task must be the Factory work item.';
		if (invocation.piKey !== expectedPiKey)
			return 'Dispatch work must exactly bind the approved Pi key.';
		return validatePiAsyncRunRequest(invocation.request, request, expectedPiKey);
	}
	if (invocation.mode === 'interactive' && request.work.mode === 'interactive')
		return invocation.executor === 'driver'
			? null
			: 'Interactive work must be owned by the driver.';
	return 'Unsupported authoritative work mode.';
}

type FactoryAuthoritativeStatus = Readonly<{
	work: FactoryCompiledWorkSpec;
	stageCycle: number;
	dispatchCycle: number;
	currentDispatchCount: number;
	expectedNextDispatchAttempt: number;
}>;

function parseAuthoritativeStatus(
	stdout: string,
	intent: FactoryDispatchIntent
): FactoryAuthoritativeStatus | string {
	try {
		const parsed: unknown = JSON.parse(stdout);
		const resultEntries =
			isRecord(parsed) && Array.isArray(parsed.results) ? parsed.results : parsed;
		const candidate =
			Array.isArray(resultEntries) && resultEntries.length === 1 ? resultEntries[0] : resultEntries;
		const attributes =
			isRecord(candidate) && isRecord(candidate.attributes) ? candidate.attributes : candidate;
		if (
			!isRecord(attributes) ||
			attributes.workItem !== intent.workItem ||
			!isRecord(attributes.stage) ||
			attributes.stage.id !== intent.stage ||
			!isRecord(attributes.work)
		)
			return 'Factory status does not match the requested work item and stage.';
		if (
			!Number.isSafeInteger(attributes.stage.cycle) ||
			(attributes.stage.cycle as number) < 1 ||
			!isRecord(attributes.dispatch) ||
			!Number.isSafeInteger(attributes.dispatch.cycle) ||
			(attributes.dispatch.cycle as number) < 1 ||
			!Number.isSafeInteger(attributes.dispatch.attempts) ||
			(attributes.dispatch.attempts as number) < 0
		) {
			return 'Factory status has no authoritative stage cycle, dispatch cycle, and dispatch count.';
		}
		const work = attributes.work as unknown as FactoryCompiledWorkSpec;
		if (!isRecord(work) || typeof work.mode !== 'string')
			return 'Factory status has no resolved work spec.';
		const stageCycle = attributes.stage.cycle as number;
		const dispatchCycle = attributes.dispatch.cycle as number;
		if (dispatchCycle !== stageCycle)
			return 'Factory dispatch cycle does not match the current stage cycle.';
		const currentDispatchCount = attributes.dispatch.attempts as number;
		if (currentDispatchCount >= Number.MAX_SAFE_INTEGER)
			return 'Factory dispatch count cannot be incremented safely.';
		return {
			work,
			stageCycle,
			dispatchCycle,
			currentDispatchCount,
			expectedNextDispatchAttempt: currentDispatchCount + 1
		};
	} catch (error) {
		return error instanceof Error ? error.message : 'Factory status is malformed.';
	}
}

function readAuthoritativeStatus(
	intent: FactoryDispatchIntent,
	runCommand: FactoryPrerequisiteCommandRunner
): FactoryAuthoritativeStatus | string {
	const refresh = runCommand('swamp', [
		'model',
		'method',
		'run',
		intent.sourceFactory.name,
		'status',
		'--input',
		`workItem=${intent.workItem}`
	]);
	if (refresh.status !== 0) return refresh.stderr || 'Factory status is unavailable.';
	const queryExpression = `modelName == "${intent.sourceFactory.name}" && name == "status-${intent.workItem}"`;
	const statusQuery = runCommand('swamp', [
		'data',
		'query',
		queryExpression,
		'--select',
		'attributes',
		'--json'
	]);
	return statusQuery.status === 0
		? parseAuthoritativeStatus(statusQuery.stdout, intent)
		: statusQuery.stderr || 'Factory status is unavailable.';
}

function validateIntent(intent: Readonly<FactoryDispatchIntent>): string | null {
	const allowed = new Set([
		'sourceFactory',
		'workItem',
		'rootEpicId',
		'activeTaskId',
		'stage',
		'invocation'
	]);
	if (Object.keys(intent).some((key) => !allowed.has(key)))
		return 'Dispatch intent cannot supply authoritative compiled work or extra fields.';
	if (
		intent.sourceFactory.id !== SUPERS_DELIVERY_FACTORY_ID ||
		intent.sourceFactory.name !== SUPERS_DELIVERY_FACTORY_NAME
	)
		return 'Dispatch must target the configured supers-delivery Factory.';
	if (!intent.workItem || !intent.rootEpicId || !intent.activeTaskId || !STAGES.has(intent.stage))
		return 'Factory dispatch requires approved root, active task, work item, and supported stage.';
	if (!isRecord(intent.invocation)) return 'Factory dispatch requires one invocation.';
	return null;
}

type FactoryPrerequisiteInspection = Readonly<{
	authoritative: FactoryAuthoritativeStatus | string;
	dexLane: FactoryDexLane | string;
	failures: readonly FactoryPrerequisiteFailure[];
	factsDigest: string;
}>;

function inspectFactoryDispatchPrerequisites(
	intent: Readonly<FactoryDispatchIntent>,
	runCommand: FactoryPrerequisiteCommandRunner
): FactoryPrerequisiteInspection {
	const failures: FactoryPrerequisiteFailure[] = [];
	const authoritative = readAuthoritativeStatus(intent, runCommand);
	if (typeof authoritative === 'string')
		failures.push({
			category: 'factory-status-unavailable',
			commandOrTool: 'supers-delivery status',
			error: authoritative
		});

	const git = runCommand('git', ['status', '--porcelain=v1', '-z']);
	if (git.status !== 0 || git.stdout.length > 0)
		failures.push({
			category: 'git-dirty',
			commandOrTool: 'git status --porcelain=v1 -z',
			error:
				git.status === 0
					? 'Central checkout is not clean.'
					: git.stderr.trim() || 'Git status failed.'
		});

	const dex = runCommand('dex', ['list', '--all', '--json']);
	let parsedDexFacts: readonly PlanningDexTask[] | null = null;
	let dexLane: FactoryDexLane | string = 'Dex is unavailable.';
	if (dex.status !== 0)
		failures.push({
			category: 'dex-unavailable',
			commandOrTool: 'dex list --all --json',
			error: dex.stderr.trim() || 'Dex is unavailable.'
		});
	else {
		const parsedDex = parseFactoryDexTasks(dex.stdout);
		if (typeof parsedDex === 'string') {
			dexLane = parsedDex;
			failures.push({
				category: 'dex-json-invalid',
				commandOrTool: 'dex list --all --json',
				error: parsedDex
			});
		} else {
			parsedDexFacts = parsedDex.tasks;
			dexLane = deriveFactoryDexLane(parsedDex, intent.workItem);
			if (typeof dexLane === 'string')
				failures.push({
					category: 'dex-lane-invalid',
					commandOrTool: 'Dex active lane ancestry',
					error: dexLane
				});
			else if (
				intent.rootEpicId !== dexLane.rootEpicId ||
				intent.activeTaskId !== dexLane.activeTaskId
			) {
				failures.push({
					category: 'dex-lane-invalid',
					commandOrTool: 'Dex active lane identity',
					error: `Requested root/leaf ${intent.rootEpicId}/${intent.activeTaskId} does not match authoritative ${dexLane.rootEpicId}/${dexLane.activeTaskId}.`
				});
			}
		}
	}

	const node = runCommand('node', ['--input-type=module', '--eval', "await import('zod')"]);
	if (node.status !== 0)
		failures.push({
			category: 'node-dependency-unavailable',
			commandOrTool: "node --input-type=module --eval await import('zod')",
			error: node.stderr.trim() || 'Required Node dependency resolution failed.'
		});

	const executionTool =
		intent.invocation.mode === 'dispatch'
			? { command: 'pi', error: 'Pi is unavailable.' }
			: intent.invocation.mode === 'workflow' || intent.invocation.mode === 'method'
				? { command: 'swamp', error: 'Swamp is unavailable.' }
				: null;
	const executionToolProbe =
		executionTool === null ? null : runCommand(executionTool.command, ['--version']);
	if (executionTool !== null && executionToolProbe?.status !== 0) {
		failures.push({
			category: 'execution-tool-unavailable',
			commandOrTool: `${executionTool.command} --version`,
			error: executionToolProbe?.stderr.trim() || executionTool.error
		});
	}

	const factsDigest = createHash('sha256')
		.update(
			canonicalJson({
				authoritative,
				git: { status: git.status, stdout: git.stdout },
				dex: { status: dex.status, tasks: parsedDexFacts },
				dexLane,
				node: { status: node.status, stdout: node.stdout },
				executionTool:
					executionTool === null
						? null
						: {
								command: executionTool.command,
								status: executionToolProbe?.status ?? null,
								stdout: executionToolProbe?.stdout ?? ''
							}
			})
		)
		.digest('hex');
	return { authoritative, dexLane, failures, factsDigest };
}

function factoryDispatchRequestFromInspection(
	intent: Readonly<FactoryDispatchIntent>,
	inspection: FactoryPrerequisiteInspection
): Readonly<FactoryDispatchRequest> | null {
	if (typeof inspection.authoritative === 'string' || typeof inspection.dexLane === 'string')
		return null;
	return cloneFreeze({
		...intent,
		rootEpicId: inspection.dexLane.rootEpicId,
		activeTaskId: inspection.dexLane.activeTaskId,
		work: inspection.authoritative.work,
		stageCycle: inspection.authoritative.stageCycle,
		dispatchCycle: inspection.authoritative.dispatchCycle,
		currentDispatchCount: inspection.authoritative.currentDispatchCount,
		expectedNextDispatchAttempt: inspection.authoritative.expectedNextDispatchAttempt
	}) as Readonly<FactoryDispatchRequest>;
}

/** Validate prerequisites from authoritative current Factory and Dex state and return an opaque plan. */
export function checkFactoryDispatchPrerequisites(input: {
	intent: FactoryDispatchIntent | Readonly<FactoryDispatchIntent>;
	runCommand?: FactoryPrerequisiteCommandRunner;
}): FactoryPrerequisiteResult {
	const intent = cloneFreeze(input.intent as FactoryDispatchIntent);
	const runCommand = input.runCommand ?? defaultRunner;
	const intentError = validateIntent(intent);
	if (intentError !== null) throw new TypeError(intentError);

	const inspection = inspectFactoryDispatchPrerequisites(intent, runCommand);
	const failures = [...inspection.failures];
	const request = factoryDispatchRequestFromInspection(intent, inspection);
	if (request === null)
		return Object.freeze({ passed: false as const, failures: cloneFreeze(failures) });
	const requestError = validateWorkBinding(request);
	if (requestError !== null)
		failures.push({
			category: 'execution-request-invalid',
			commandOrTool: 'authoritative compiled work request',
			error: requestError
		});
	if (failures.length > 0)
		return Object.freeze({ passed: false as const, failures: cloneFreeze(failures) });
	const digest = createFactoryDispatchDigest(request as FactoryDispatchRequest);
	const plan = Object.freeze({ passed: true as const, digest }) as ValidatedFactoryDispatchPlan;
	validatedPlans.set(plan, {
		request,
		digest,
		prerequisiteFactsDigest: inspection.factsDigest,
		runCommand
	});
	return plan;
}

function consumeValidatedFactoryPlan(plan: ValidatedFactoryDispatchPlan): {
	request: Readonly<FactoryDispatchRequest>;
	digest: string;
	prerequisiteFactsDigest: string;
	runCommand: FactoryPrerequisiteCommandRunner;
} {
	const validated = validatedPlans.get(plan as object);
	if (validated === undefined || plan.passed !== true || plan.digest !== validated.digest)
		throw new Error('Untrusted, forged, or already consumed Factory dispatch plan.');
	validatedPlans.delete(plan as object);
	return validated;
}

function refreshValidatedFactoryPlan(
	validated: ReturnType<typeof consumeValidatedFactoryPlan>
): void {
	const digest = createFactoryDispatchDigest(validated.request as FactoryDispatchRequest);
	if (validateWorkBinding(validated.request) !== null || digest !== validated.digest)
		throw new Error('Validated Factory dispatch plan changed before submission.');
	const refreshed = inspectFactoryDispatchPrerequisites(validated.request, validated.runCommand);
	if (refreshed.failures.length > 0) {
		throw new Error(
			`Factory dispatch prerequisite refresh failed: ${refreshed.failures.map((failure) => `${failure.category}: ${failure.error}`).join('; ')}`
		);
	}
	const refreshedRequest = factoryDispatchRequestFromInspection(validated.request, refreshed);
	if (
		refreshed.factsDigest !== validated.prerequisiteFactsDigest ||
		refreshedRequest === null ||
		validateWorkBinding(refreshedRequest) !== null ||
		createFactoryDispatchDigest(refreshedRequest as FactoryDispatchRequest) !== validated.digest ||
		!exactEqual(refreshedRequest, validated.request)
	) {
		throw new Error(
			'Authoritative Factory, Dex, work, or immutable request digest changed after prerequisite validation.'
		);
	}
}

export interface PreparedFactoryPiDispatch {
	readonly digest: string;
	readonly __preparedFactoryPiDispatch: unique symbol;
}

export interface FactoryPreparedPiDispatchRecord {
	readonly request: Readonly<FactoryDispatchRequest>;
	readonly digest: string;
	readonly piKey: string;
	readonly piRequest: Readonly<FactoryPiAsyncRunRequest>;
	readonly refresh: () => void;
}

const preparedPiDispatches = new WeakMap<object, FactoryPreparedPiDispatchRecord>();

/** Consume and refresh a complete wave before any durable reservation or dispatch attempt. */
export function prepareValidatedFactoryPiDispatchWave(
	plans: readonly ValidatedFactoryDispatchPlan[]
): readonly PreparedFactoryPiDispatch[] {
	if (plans.length === 0) throw new Error('Factory Pi dispatch wave requires at least one plan.');
	const validatedWave = plans.map(consumeValidatedFactoryPlan);
	const roots = new Set<string>();
	const digests = new Set<string>();
	const piKeys = new Set<string>();
	for (const validated of validatedWave) {
		const invocation = validated.request.invocation;
		if (invocation.mode !== 'dispatch') throw new Error('Factory Pi wave accepts dispatch work only.');
		if (roots.has(validated.request.rootEpicId))
			throw new Error(`Duplicate Factory execution root ${validated.request.rootEpicId}.`);
		if (digests.has(validated.digest)) throw new Error(`Duplicate Factory request ${validated.digest}.`);
		if (piKeys.has(invocation.piKey)) throw new Error(`Duplicate Pi lane ${invocation.piKey}.`);
		refreshValidatedFactoryPlan(validated);
		roots.add(validated.request.rootEpicId);
		digests.add(validated.digest);
		piKeys.add(invocation.piKey);
	}
	return Object.freeze(validatedWave
		.toSorted((left, right) => left.request.rootEpicId.localeCompare(right.request.rootEpicId))
		.map((validated) => {
			const invocation = validated.request.invocation;
			if (invocation.mode !== 'dispatch') throw new Error('Factory Pi wave changed mode.');
			const prepared = Object.freeze({ passed: true as const, digest: validated.digest }) as unknown as PreparedFactoryPiDispatch;
			preparedPiDispatches.set(prepared, {
				request: validated.request,
				digest: validated.digest,
				piKey: invocation.piKey,
				piRequest: invocation.request,
				refresh: () => refreshValidatedFactoryPlan(validated)
			});
			return prepared;
		}));
}

/** One-time opaque prepared-plan consumption by the code-owned Pi coordinator. */
export function consumePreparedFactoryPiDispatch(
	prepared: PreparedFactoryPiDispatch
): FactoryPreparedPiDispatchRecord {
	const record = preparedPiDispatches.get(prepared as object);
	if (record === undefined || prepared.digest !== record.digest)
		throw new Error('Untrusted, forged, or already consumed prepared Pi dispatch.');
	preparedPiDispatches.delete(prepared as object);
	return record;
}

/** Consume one opaque plan, record dispatch, then route the original work through its sole execution owner. */
export async function dispatchValidatedFactoryRequest<T>(input: {
	plan: ValidatedFactoryDispatchPlan;
	recordDispatch: (request: Readonly<FactoryDispatchRequest>, digest: string) => Promise<void>;
	executeTrustedWorkBoundary?: (request: Readonly<FactoryTrustedWorkBoundaryRequest>) => Promise<T>;
	submitDriverRequest?: (
		request: Readonly<FactoryDriverSubmitRequest>,
		digest: string,
		piKey?: string
	) => Promise<T>;
}): Promise<T> {
	const validated = consumeValidatedFactoryPlan(input.plan);
	refreshValidatedFactoryPlan(validated);
	const digest = validated.digest;
	const invocation = validated.request.invocation;
	if (
		(invocation.mode === 'workflow' || invocation.mode === 'method') &&
		input.executeTrustedWorkBoundary === undefined
	) {
		throw new Error(
			'Workflow/method dispatch has no trusted integrated execution boundary; use explicit operational escalation.'
		);
	}
	if (
		(invocation.mode === 'dispatch' || invocation.mode === 'interactive') &&
		input.submitDriverRequest === undefined
	) {
		throw new Error(
			'Pi/interactive dispatch has no configured original-run submitter; use explicit operational escalation.'
		);
	}
	await input.recordDispatch(validated.request, digest);
	if (invocation.mode === 'workflow' || invocation.mode === 'method') {
		return input.executeTrustedWorkBoundary!(
			Object.freeze({
				sourceFactoryId: validated.request.sourceFactory.id,
				workItem: validated.request.workItem,
				stage: validated.request.stage,
				stageCycle: validated.request.stageCycle,
				dispatchAttempt: validated.request.expectedNextDispatchAttempt,
				dispatchRunId: digest,
				retryable: true
			})
		);
	}
	return input.submitDriverRequest!(
		invocation.mode === 'dispatch' ? invocation.request : invocation,
		digest,
		invocation.mode === 'dispatch' ? invocation.piKey : undefined
	);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
	const requestIndex = process.argv.indexOf('--request');
	if (requestIndex === -1)
		throw new Error('Usage: factory-dispatch-prerequisites.ts --request <json-file>');
	const raw: unknown = JSON.parse(readFileSync(process.argv[requestIndex + 1] ?? '', 'utf8'));
	if (!isRecord(raw)) throw new TypeError('Dispatch intent JSON must be an object.');
	const result = checkFactoryDispatchPrerequisites({
		intent: raw as unknown as FactoryDispatchIntent
	});
	console.log(JSON.stringify(result.passed ? { passed: true, digest: result.digest } : result));
	if (!result.passed) process.exitCode = 1;
}
