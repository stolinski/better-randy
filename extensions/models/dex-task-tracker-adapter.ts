/**
 * Typed Dex lifecycle adapter for Swamp Factory workflows.
 *
 * Dex CLI output and MCP responses are untrusted process boundaries. This
 * module validates both, serializes mutations per repository task, and writes
 * versioned receipts without persisting command diagnostics.
 *
 * @module
 */
import { z } from 'npm:zod@4';

import {
	DEFAULT_DEX_REPOSITORY_LOCK,
	type DexRepositoryLock,
	DexRepositoryLockOwnershipError,
	DexRepositoryLockTimeoutError
} from './dex-repository-lock.ts';

export const DEX_TASK_TRACKER_ADAPTER_VERSION = '2026.08.05.4';

const MAX_DEX_CONTENT_LENGTH = 50 * 1024;
const OUTPUT_EXCERPT_LENGTH = 800;
const TASK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const GIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

const TaskIdSchema = z.string().min(1).max(128).regex(TASK_ID_PATTERN);
const OwnerTokenSchema = z.string().min(1).max(256);
const IsoTimestampSchema = z.string().datetime();
const NullableIsoTimestampSchema = IsoTimestampSchema.nullable();
const MetadataSchema = z.record(z.string(), z.unknown()).nullable();
const DexTaskRelationSchema = z
	.union([TaskIdSchema, z.object({ id: TaskIdSchema })])
	.transform((relation) => (typeof relation === 'string' ? relation : relation.id));

export const DexTaskTrackerGlobalArgsSchema = z.strictObject({
	ownerToken: OwnerTokenSchema
});

export type DexTaskTrackerGlobalArgs = z.infer<typeof DexTaskTrackerGlobalArgsSchema>;

const DexTaskSourceSchema = z.strictObject({
	id: TaskIdSchema,
	parent_id: TaskIdSchema.nullable(),
	name: z.string(),
	description: z.string(),
	priority: z.number().int().min(0).max(100),
	completed: z.boolean(),
	result: z.string().nullable(),
	metadata: MetadataSchema,
	created_at: IsoTimestampSchema,
	updated_at: IsoTimestampSchema,
	started_at: NullableIsoTimestampSchema,
	completed_at: NullableIsoTimestampSchema,
	blockedBy: z.array(DexTaskRelationSchema),
	blocks: z.array(DexTaskRelationSchema),
	children: z.array(DexTaskRelationSchema)
});

/** Canonical, camelCase task snapshot stored by the model. */
export const DexTaskSnapshotSchema = z.strictObject({
	schemaVersion: z.literal(1),
	adapterVersion: z.literal(DEX_TASK_TRACKER_ADAPTER_VERSION),
	ownerToken: OwnerTokenSchema,
	id: TaskIdSchema,
	parentId: TaskIdSchema.nullable(),
	name: z.string(),
	description: z.string(),
	priority: z.number().int().min(0).max(100),
	completed: z.boolean(),
	result: z.string().nullable(),
	metadata: MetadataSchema,
	createdAt: IsoTimestampSchema,
	updatedAt: IsoTimestampSchema,
	startedAt: NullableIsoTimestampSchema,
	completedAt: NullableIsoTimestampSchema,
	blockedBy: z.array(TaskIdSchema),
	blocks: z.array(TaskIdSchema),
	children: z.array(TaskIdSchema)
});

type DexTaskSnapshot = z.infer<typeof DexTaskSnapshotSchema>;

const DexTaskTrackerActionSchema = z.enum(['get', 'start', 'complete', 'reopen', 'add-note']);
const DexTaskTrackerErrorCodeSchema = z.enum([
	'task-not-found',
	'task-id-mismatch',
	'task-already-completed',
	'task-not-completed',
	'task-already-started',
	'task-not-started',
	'description-too-long',
	'command-failed',
	'invalid-json',
	'invalid-task',
	'mcp-command-failed',
	'mcp-protocol-invalid',
	'mcp-json-invalid',
	'mcp-tool-failed',
	'repository-lock-acquisition-failed',
	'repository-lock-ownership-lost',
	'unexpected-failure',
	'resource-write-failed'
]);

export type DexTaskTrackerErrorCode = z.infer<typeof DexTaskTrackerErrorCodeSchema>;

/** Versioned, diagnostic-safe outcome of one adapter invocation. */
export const DexTaskTrackerReceiptSchema = z.strictObject({
	schemaVersion: z.literal(1),
	adapterVersion: z.literal(DEX_TASK_TRACKER_ADAPTER_VERSION),
	action: DexTaskTrackerActionSchema,
	ownerToken: OwnerTokenSchema,
	taskId: TaskIdSchema,
	status: z.enum(['succeeded', 'failed']),
	errorCode: DexTaskTrackerErrorCodeSchema.nullable(),
	occurredAt: IsoTimestampSchema,
	task: DexTaskSnapshotSchema.nullable()
});

// Swamp includes evaluated global arguments in the object passed through method
// validation, so method schemas intentionally strip those known outer extras.
export const DexTaskGetArgsSchema = z.object({ taskId: TaskIdSchema });
export const DexTaskStartArgsSchema = z.object({ taskId: TaskIdSchema });
export const DexTaskCompleteArgsSchema = z.object({
	taskId: TaskIdSchema,
	result: z.string().min(1).max(MAX_DEX_CONTENT_LENGTH),
	commit: z.discriminatedUnion('kind', [
		z.strictObject({ kind: z.literal('commit'), sha: z.string().regex(GIT_SHA_PATTERN) }),
		z.strictObject({ kind: z.literal('noCommit') })
	])
});
export const DexTaskReopenArgsSchema = z.object({ taskId: TaskIdSchema });
export const DexTaskAddNoteArgsSchema = z.object({
	taskId: TaskIdSchema,
	note: z.string().min(1).max(MAX_DEX_CONTENT_LENGTH)
});

export type DexTaskGetArgs = z.infer<typeof DexTaskGetArgsSchema>;
export type DexTaskStartArgs = z.infer<typeof DexTaskStartArgsSchema>;
export type DexTaskCompleteArgs = z.infer<typeof DexTaskCompleteArgsSchema>;
export type DexTaskReopenArgs = z.infer<typeof DexTaskReopenArgsSchema>;
export type DexTaskAddNoteArgs = z.infer<typeof DexTaskAddNoteArgsSchema>;

export type DexTaskTrackerExecutionResult = {
	dataHandles: Array<{ name: string }>;
};

export type DexTaskTrackerMethodContext = {
	repoDir: string;
	globalArgs: DexTaskTrackerGlobalArgs;
	logger: {
		info: (message: string, properties?: Record<string, unknown>) => void;
		warning: (message: string, properties?: Record<string, unknown>) => void;
	};
	readResource: (name: string) => Promise<Record<string, unknown> | null>;
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>
	) => Promise<{ name: string }>;
};

export type DexCommandResult = {
	code: number;
	stdout: string;
	stderr: string;
};

export type DexMcpUpdateTaskArguments =
	{ id: string; completed: false; started_at: null } | { id: string; description: string };

/** Process boundary injected in tests so fixtures never invoke a real Dex installation. */
export interface DexTaskCommandAdapter {
	run(args: readonly string[], cwd: string): Promise<DexCommandResult>;
	updateTask(cwd: string, args: DexMcpUpdateTaskArguments): Promise<void>;
}

export type DexTaskTrackerDependencies = {
	commandAdapter: DexTaskCommandAdapter;
	repositoryLock: DexRepositoryLock;
	now: () => string;
};

type DexTaskActionRequest =
	| { action: 'get'; args: DexTaskGetArgs }
	| { action: 'start'; args: DexTaskStartArgs }
	| { action: 'complete'; args: DexTaskCompleteArgs }
	| { action: 'reopen'; args: DexTaskReopenArgs }
	| { action: 'add-note'; args: DexTaskAddNoteArgs };
type DexTaskMutationRequest = Exclude<DexTaskActionRequest, { action: 'get' }>;
type DexTaskMcpMutationRequest = Extract<DexTaskMutationRequest, { action: 'reopen' | 'add-note' }>;

const invocationTails = new Map<string, Promise<void>>();
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/** Error carrying the stable code persisted in failed receipts. */
export class DexTaskTrackerError extends Error {
	readonly errorCode: DexTaskTrackerErrorCode;

	constructor(errorCode: DexTaskTrackerErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'DexTaskTrackerError';
		this.errorCode = errorCode;
	}
}

function trackerError(
	errorCode: DexTaskTrackerErrorCode,
	message: string,
	cause?: unknown
): DexTaskTrackerError {
	return new DexTaskTrackerError(errorCode, message, cause === undefined ? undefined : { cause });
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Deterministic resource name for one logical action input. */
async function createDexTaskReceiptResourceName(
	request: DexTaskActionRequest,
	ownerToken: string
): Promise<string> {
	const identity = JSON.stringify({
		adapterVersion: DEX_TASK_TRACKER_ADAPTER_VERSION,
		action: request.action,
		ownerToken,
		args: request.args
	});
	return `receipt-${await sha256Hex(identity)}`;
}

/** Deterministic resource name for the latest normalized owner/task snapshot. */
async function createDexTaskSnapshotResourceName(
	taskId: string,
	ownerToken: string
): Promise<string> {
	return `task-${await sha256Hex(`${ownerToken}\0${taskId}`)}`;
}

function normalizeDexTask(value: unknown, ownerToken: string): DexTaskSnapshot {
	const object = z.record(z.string(), z.unknown()).parse(value);
	let source: z.infer<typeof DexTaskSourceSchema>;
	try {
		source = DexTaskSourceSchema.parse({
			id: object.id,
			parent_id: object.parent_id,
			name: object.name,
			description: object.description,
			priority: object.priority,
			completed: object.completed,
			result: object.result,
			metadata: object.metadata,
			created_at: object.created_at,
			updated_at: object.updated_at,
			started_at: object.started_at,
			completed_at: object.completed_at,
			blockedBy: object.blockedBy,
			blocks: object.blocks,
			children: object.children
		});
	} catch (error) {
		throw trackerError('invalid-task', 'Dex returned a task outside the canonical schema', error);
	}

	return DexTaskSnapshotSchema.parse({
		schemaVersion: 1,
		adapterVersion: DEX_TASK_TRACKER_ADAPTER_VERSION,
		ownerToken,
		id: source.id,
		parentId: source.parent_id,
		name: source.name,
		description: source.description,
		priority: source.priority,
		completed: source.completed,
		result: source.result,
		metadata: source.metadata,
		createdAt: source.created_at,
		updatedAt: source.updated_at,
		startedAt: source.started_at,
		completedAt: source.completed_at,
		blockedBy: source.blockedBy,
		blocks: source.blocks,
		children: source.children
	});
}

function commandFailureMessage(args: readonly string[], result: DexCommandResult): string {
	const excerpt = (result.stderr.trim() || result.stdout.trim()).slice(0, OUTPUT_EXCERPT_LENGTH);
	return `dex ${args[0] ?? 'command'} exited ${result.code}${excerpt ? `: ${excerpt}` : ''}`;
}

function parseDexShowOutput(
	taskId: string,
	args: readonly string[],
	result: DexCommandResult
): unknown {
	if (result.code !== 0) {
		const diagnostic = `${result.stdout}\n${result.stderr}`;
		if (/not found/i.test(diagnostic)) {
			throw trackerError('task-not-found', `Dex task ${taskId} was not found`);
		}
		throw trackerError('command-failed', commandFailureMessage(args, result));
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch (error) {
		throw trackerError('invalid-json', 'Dex show returned malformed JSON', error);
	}
	return parsed;
}

function requireRequestedTask(task: DexTaskSnapshot, taskId: string): DexTaskSnapshot {
	if (task.id !== taskId) {
		throw trackerError(
			'task-id-mismatch',
			`Dex show returned task ${task.id} while ${taskId} was requested`
		);
	}
	return task;
}

async function readDexTask(
	taskId: string,
	context: DexTaskTrackerMethodContext,
	commandAdapter: DexTaskCommandAdapter
): Promise<DexTaskSnapshot> {
	const args = ['show', taskId, '--json'] as const;
	const result = await commandAdapter.run(args, context.repoDir);
	const parsed = parseDexShowOutput(taskId, args, result);
	return requireRequestedTask(normalizeDexTask(parsed, context.globalArgs.ownerToken), taskId);
}

async function runDexMutation(
	args: readonly string[],
	context: DexTaskTrackerMethodContext,
	commandAdapter: DexTaskCommandAdapter
): Promise<void> {
	const result = await commandAdapter.run(args, context.repoDir);
	if (result.code !== 0) {
		throw trackerError('command-failed', commandFailureMessage(args, result));
	}
}

function requireStartable(task: DexTaskSnapshot): void {
	if (task.completed) {
		throw trackerError('task-already-completed', `Dex task ${task.id} is already completed`);
	}
	if (task.startedAt !== null) {
		throw trackerError('task-already-started', `Dex task ${task.id} is already started`);
	}
}

function requireCompletable(task: DexTaskSnapshot): void {
	if (task.completed) {
		throw trackerError('task-already-completed', `Dex task ${task.id} is already completed`);
	}
	if (task.startedAt === null) {
		throw trackerError('task-not-started', `Dex task ${task.id} has not been started`);
	}
}

function appendDexTaskNote(
	description: string,
	note: string,
	ownerToken: string,
	occurredAt: string
): string {
	const block = [
		'<!-- dex-task-tracker:note -->',
		'### Dex task note',
		'',
		`- Occurred at: ${occurredAt}`,
		`- Owner: ${ownerToken}`,
		'',
		note,
		'<!-- /dex-task-tracker:note -->'
	].join('\n');
	return description.length === 0 ? block : `${description}\n\n${block}`;
}

async function executeMcpTaskMutation(
	request: DexTaskMcpMutationRequest,
	current: DexTaskSnapshot,
	context: DexTaskTrackerMethodContext,
	commandAdapter: DexTaskCommandAdapter,
	occurredAt: string
): Promise<void> {
	if (request.action === 'reopen') {
		if (!current.completed) {
			throw trackerError('task-not-completed', `Dex task ${current.id} is not completed`);
		}
		await commandAdapter.updateTask(context.repoDir, {
			id: current.id,
			completed: false,
			started_at: null
		});
		return;
	}

	const description = appendDexTaskNote(
		current.description,
		request.args.note,
		context.globalArgs.ownerToken,
		occurredAt
	);
	if (textEncoder.encode(description).byteLength > MAX_DEX_CONTENT_LENGTH) {
		throw trackerError(
			'description-too-long',
			`Dex task ${current.id} description would exceed ${MAX_DEX_CONTENT_LENGTH} bytes`
		);
	}
	await commandAdapter.updateTask(context.repoDir, { id: current.id, description });
}

async function executeTaskMutation(
	request: DexTaskMutationRequest,
	current: DexTaskSnapshot,
	context: DexTaskTrackerMethodContext,
	commandAdapter: DexTaskCommandAdapter,
	occurredAt: string
): Promise<void> {
	if (request.action === 'start') {
		requireStartable(current);
		await runDexMutation(['start', current.id], context, commandAdapter);
		return;
	}
	if (request.action === 'complete') {
		requireCompletable(current);
		const commitArgs =
			request.args.commit.kind === 'commit'
				? (['--commit', request.args.commit.sha] as const)
				: (['--no-commit'] as const);
		await runDexMutation(
			['complete', current.id, '--result', request.args.result, ...commitArgs],
			context,
			commandAdapter
		);
		return;
	}
	await executeMcpTaskMutation(request, current, context, commandAdapter, occurredAt);
}

async function executeTaskAction(
	request: DexTaskActionRequest,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies,
	occurredAt: string,
	observeTask: (task: DexTaskSnapshot) => void
): Promise<DexTaskSnapshot> {
	const { commandAdapter } = dependencies;
	const taskId = request.args.taskId;
	if (request.action === 'get') {
		const task = await readDexTask(taskId, context, commandAdapter);
		observeTask(task);
		return task;
	}

	const current = await readDexTask(taskId, context, commandAdapter);
	observeTask(current);
	await executeTaskMutation(request, current, context, commandAdapter, occurredAt);

	const updated = await readDexTask(taskId, context, commandAdapter);
	observeTask(updated);
	return updated;
}

function normalizeTrackerError(error: unknown): DexTaskTrackerError {
	if (error instanceof DexTaskTrackerError) return error;
	return trackerError('unexpected-failure', 'Unexpected Dex task tracker failure', error);
}

async function persistSuccess(
	request: DexTaskActionRequest,
	context: DexTaskTrackerMethodContext,
	task: DexTaskSnapshot,
	occurredAt: string
): Promise<DexTaskTrackerExecutionResult> {
	const snapshotName = await createDexTaskSnapshotResourceName(
		task.id,
		context.globalArgs.ownerToken
	);
	const receiptName = await createDexTaskReceiptResourceName(
		request,
		context.globalArgs.ownerToken
	);
	try {
		const taskHandle = await context.writeResource('task', snapshotName, task);
		const receipt = DexTaskTrackerReceiptSchema.parse({
			schemaVersion: 1,
			adapterVersion: DEX_TASK_TRACKER_ADAPTER_VERSION,
			action: request.action,
			ownerToken: context.globalArgs.ownerToken,
			taskId: request.args.taskId,
			status: 'succeeded',
			errorCode: null,
			occurredAt,
			task
		});
		const receiptHandle = await context.writeResource('receipt', receiptName, receipt);
		return { dataHandles: [taskHandle, receiptHandle] };
	} catch (error) {
		throw trackerError('resource-write-failed', 'Could not persist Dex task resources', error);
	}
}

async function persistFailure(
	request: DexTaskActionRequest,
	context: DexTaskTrackerMethodContext,
	task: DexTaskSnapshot | null,
	occurredAt: string,
	errorCode: DexTaskTrackerErrorCode
): Promise<void> {
	const receiptName = await createDexTaskReceiptResourceName(
		request,
		context.globalArgs.ownerToken
	);
	const receipt = DexTaskTrackerReceiptSchema.parse({
		schemaVersion: 1,
		adapterVersion: DEX_TASK_TRACKER_ADAPTER_VERSION,
		action: request.action,
		ownerToken: context.globalArgs.ownerToken,
		taskId: request.args.taskId,
		status: 'failed',
		errorCode,
		occurredAt,
		task
	});
	await context.writeResource('receipt', receiptName, receipt);
}

function repositoryLockTrackerError(error: unknown): DexTaskTrackerError {
	return error instanceof DexRepositoryLockOwnershipError
		? trackerError(
				'repository-lock-ownership-lost',
				'Dex repository lock ownership was lost',
				error
			)
		: trackerError(
				'repository-lock-acquisition-failed',
				error instanceof DexRepositoryLockTimeoutError
					? 'Timed out acquiring the Dex repository lock'
					: 'Could not acquire the Dex repository lock',
				error
			);
}

async function persistRepositoryLockTrackerFailure(
	request: DexTaskActionRequest,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies,
	failure: DexTaskTrackerError
): Promise<void> {
	const receiptName = await createDexTaskReceiptResourceName(
		request,
		context.globalArgs.ownerToken
	);
	const priorReceipt = DexTaskTrackerReceiptSchema.safeParse(
		await context.readResource(receiptName)
	);
	if (priorReceipt.success && priorReceipt.data.status === 'succeeded') return;
	try {
		await persistFailure(request, context, null, dependencies.now(), failure.errorCode);
	} catch (error) {
		throw trackerError(
			'resource-write-failed',
			'Could not persist the repository lock failure receipt',
			error
		);
	}
}

async function withTaskInvocationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
	const previous = invocationTails.get(key) ?? Promise.resolve();
	let release = (): void => undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const tail = previous.catch(() => undefined).then(() => gate);
	invocationTails.set(key, tail);
	await previous.catch(() => undefined);
	try {
		return await operation();
	} finally {
		release();
		if (invocationTails.get(key) === tail) invocationTails.delete(key);
	}
}

function executeDexTaskRequest(
	request: DexTaskActionRequest,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies
): Promise<DexTaskTrackerExecutionResult> {
	const taskId = request.args.taskId;
	const lockKey = `${context.repoDir}\0${taskId}`;
	return withTaskInvocationLock(lockKey, async () => {
		const action = async (): Promise<DexTaskTrackerExecutionResult> => {
			const occurredAt = dependencies.now();
			let task: DexTaskSnapshot | null = null;
			try {
				task = await executeTaskAction(request, context, dependencies, occurredAt, (observed) => {
					task = observed;
				});
				context.logger.info('Dex task {taskId} action {action} succeeded', {
					taskId,
					action: request.action
				});
				return await persistSuccess(request, context, task, occurredAt);
			} catch (error) {
				const trackerFailure = normalizeTrackerError(error);
				context.logger.warning('Dex task {taskId} action {action} failed with {errorCode}', {
					taskId,
					action: request.action,
					errorCode: trackerFailure.errorCode
				});
				try {
					await persistFailure(request, context, task, occurredAt, trackerFailure.errorCode);
				} catch (writeError) {
					throw trackerError(
						'resource-write-failed',
						'Could not persist the failed Dex task receipt',
						writeError
					);
				}
				throw trackerFailure;
			}
		};
		if (request.action === 'get') return action();
		let committedResult: DexTaskTrackerExecutionResult | null = null;
		try {
			return await dependencies.repositoryLock.runExclusive(context.repoDir, async () => {
				const result = await action();
				committedResult = result;
				return result;
			});
		} catch (error) {
			if (committedResult !== null) {
				context.logger.warning('Dex repository lock cleanup failed after task commit', {
					taskId,
					action: request.action
				});
				return committedResult;
			}
			if (error instanceof DexTaskTrackerError) throw error;
			const failure = repositoryLockTrackerError(error);
			await persistRepositoryLockTrackerFailure(request, context, dependencies, failure);
			throw failure;
		}
	});
}

const JsonRpcResponseSchema = z
	.object({
		jsonrpc: z.literal('2.0'),
		id: z.union([z.number(), z.string()]),
		result: z.unknown().optional(),
		error: z.unknown().optional()
	})
	.refine((response) => (response.result === undefined) !== (response.error === undefined));

const McpToolResponseSchema = z.object({
	content: z.array(
		z.object({
			type: z.string(),
			text: z.string().optional()
		})
	),
	isError: z.boolean().optional()
});

function serializeJsonRpcMessage(message: Record<string, unknown>): Uint8Array {
	return textEncoder.encode(`${JSON.stringify(message)}\n`);
}

function parseJsonRpcResponses(stdout: string): Array<z.infer<typeof JsonRpcResponseSchema>> {
	const responses: Array<z.infer<typeof JsonRpcResponseSchema>> = [];
	for (const line of stdout.split(/\r?\n/)) {
		if (line.length === 0) continue;
		try {
			responses.push(JsonRpcResponseSchema.parse(JSON.parse(line)));
		} catch (error) {
			throw trackerError(
				'mcp-protocol-invalid',
				`Dex MCP returned invalid JSON-RPC: ${line.slice(0, OUTPUT_EXCERPT_LENGTH)}`,
				error
			);
		}
	}
	return responses;
}

function requireJsonRpcResult(
	responses: Array<z.infer<typeof JsonRpcResponseSchema>>,
	id: number,
	operation: string
): unknown {
	const response = responses.find((candidate) => candidate.id === id);
	if (response === undefined || response.error !== undefined) {
		throw trackerError('mcp-protocol-invalid', `Dex MCP ${operation} did not succeed`);
	}
	return response.result;
}

function parseMcpToolResponse(value: unknown): z.infer<typeof McpToolResponseSchema> {
	try {
		return McpToolResponseSchema.parse(value);
	} catch (error) {
		throw trackerError('mcp-protocol-invalid', 'Dex MCP returned an invalid tool response', error);
	}
}

function parseMcpTextPayload(toolResponse: z.infer<typeof McpToolResponseSchema>): unknown {
	const textBlock = toolResponse.content.find(
		(block): block is { type: string; text: string } =>
			block.type === 'text' && block.text !== undefined
	);
	if (textBlock === undefined) {
		throw trackerError('mcp-protocol-invalid', 'Dex MCP update_task returned no text payload');
	}
	let parsedPayload: unknown;
	try {
		parsedPayload = JSON.parse(textBlock.text);
	} catch (error) {
		throw trackerError('mcp-json-invalid', 'Dex MCP update_task returned malformed JSON', error);
	}
	return parsedPayload;
}

function validateMcpUpdateResponse(stdout: string): void {
	const responses = parseJsonRpcResponses(stdout);
	requireJsonRpcResult(responses, 1, 'initialization');
	const updateResult = requireJsonRpcResult(responses, 2, 'update_task');
	const toolResponse = parseMcpToolResponse(updateResult);
	const parsedPayload = parseMcpTextPayload(toolResponse);
	if (toolResponse.isError === true) {
		throw trackerError(
			'mcp-tool-failed',
			`Dex MCP update_task failed: ${JSON.stringify(parsedPayload).slice(0, OUTPUT_EXCERPT_LENGTH)}`
		);
	}
}

/** Production Dex process adapter using argument arrays and structured MCP JSON-RPC. */
function createDenoDexTaskCommandAdapter(): DexTaskCommandAdapter {
	return {
		run: async (args, cwd) => {
			const result = await new Deno.Command('dex', {
				args: [...args],
				cwd,
				stdout: 'piped',
				stderr: 'piped'
			}).output();
			return {
				code: result.code,
				stdout: textDecoder.decode(result.stdout),
				stderr: textDecoder.decode(result.stderr)
			};
		},
		updateTask: async (cwd, args) => {
			const child = new Deno.Command('dex', {
				args: ['mcp'],
				cwd,
				stdin: 'piped',
				stdout: 'piped',
				stderr: 'piped'
			}).spawn();
			const writer = child.stdin.getWriter();
			const messages = [
				{
					jsonrpc: '2.0',
					id: 1,
					method: 'initialize',
					params: {
						protocolVersion: '2024-11-05',
						capabilities: {},
						clientInfo: {
							name: 'swamp-dex-task-tracker',
							version: DEX_TASK_TRACKER_ADAPTER_VERSION
						}
					}
				},
				{ jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
				{
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/call',
					params: { name: 'update_task', arguments: args }
				}
			] as const;
			try {
				for (const message of messages) {
					await writer.write(serializeJsonRpcMessage(message));
				}
			} finally {
				await writer.close();
			}
			const result = await child.output();
			const stdout = textDecoder.decode(result.stdout);
			const stderr = textDecoder.decode(result.stderr);
			if (result.code !== 0) {
				throw trackerError(
					'mcp-command-failed',
					`dex mcp exited ${result.code}${stderr ? `: ${stderr.slice(0, OUTPUT_EXCERPT_LENGTH)}` : ''}`
				);
			}
			validateMcpUpdateResponse(stdout);
		}
	};
}

const DEFAULT_DEPENDENCIES: DexTaskTrackerDependencies = {
	commandAdapter: createDenoDexTaskCommandAdapter(),
	repositoryLock: DEFAULT_DEX_REPOSITORY_LOCK,
	now: () => new Date().toISOString()
};

/** Read and persist one canonical Dex task snapshot. */
export function executeDexTaskGet(
	args: DexTaskGetArgs,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies = DEFAULT_DEPENDENCIES
): Promise<DexTaskTrackerExecutionResult> {
	return executeDexTaskRequest({ action: 'get', args }, context, dependencies);
}

/** Start a pending, unstarted Dex task. */
export function executeDexTaskStart(
	args: DexTaskStartArgs,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies = DEFAULT_DEPENDENCIES
): Promise<DexTaskTrackerExecutionResult> {
	return executeDexTaskRequest({ action: 'start', args }, context, dependencies);
}

/** Complete an active Dex task with an explicit commit/no-commit choice. */
export function executeDexTaskComplete(
	args: DexTaskCompleteArgs,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies = DEFAULT_DEPENDENCIES
): Promise<DexTaskTrackerExecutionResult> {
	return executeDexTaskRequest({ action: 'complete', args }, context, dependencies);
}

/** Reopen a completed task through Dex's official MCP update_task API. */
export function executeDexTaskReopen(
	args: DexTaskReopenArgs,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies = DEFAULT_DEPENDENCIES
): Promise<DexTaskTrackerExecutionResult> {
	return executeDexTaskRequest({ action: 'reopen', args }, context, dependencies);
}

/** Append one stable Markdown note block through Dex's official MCP API. */
export function executeDexTaskAddNote(
	args: DexTaskAddNoteArgs,
	context: DexTaskTrackerMethodContext,
	dependencies: DexTaskTrackerDependencies = DEFAULT_DEPENDENCIES
): Promise<DexTaskTrackerExecutionResult> {
	return executeDexTaskRequest({ action: 'add-note', args }, context, dependencies);
}
