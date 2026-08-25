import { z } from 'npm:zod@4.4.3';

import {
	createSupersDeterministicContractHash,
	SupersFactoryIntegrationReceiptSchema,
	type SupersFactoryIntegrationReceipt,
	verifySupersFactoryIntegrationReceipt
} from './supers-deterministic-factory-contract.ts';

const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const SHA64_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INVOCATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const decoder = new TextDecoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const MAX_UNTRACKED_FILE_BYTES = 16 * 1024 * 1024;
const MAX_UNTRACKED_AGGREGATE_BYTES = 64 * 1024 * 1024;
const MAX_CHANGED_PATHS = 256;
const MAX_CHANGED_BLOB_BYTES = 8 * 1024 * 1024;
const MAX_CHANGED_BLOB_AGGREGATE_BYTES = 32 * 1024 * 1024;
const MAX_NAME_STATUS_BYTES = 1024 * 1024;
const MAX_TREE_LISTING_BYTES = 8 * 1024 * 1024;
const MAX_BINARY_DIFF_BYTES = 32 * 1024 * 1024;
const MAX_GIT_PROTOCOL_BYTES = 1024 * 1024;
const MAX_GIT_ERROR_BYTES = 64 * 1024;
const MAX_RECONCILIATION_CLAIMS = 256;
const MAX_DIRECTORY_MEASUREMENT_ENTRIES = 500_000;
const ABANDONED_WORKTREE_MIN_AGE_MS = 2 * 60 * 60 * 1000;

export const SupersAgentWorktreePurposeSchema = z.enum(['sentry-reproduction', 'delivery-coding']);
export type SupersAgentWorktreePurpose = z.infer<typeof SupersAgentWorktreePurposeSchema>;

export const PrepareSupersAgentWorktreeArgsSchema = z
	.object({
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		baseRevision: z.string().regex(SHA40_PATTERN),
		purpose: SupersAgentWorktreePurposeSchema,
		workItem: z.string().regex(SAFE_ID_PATTERN)
	})
	.strict();
export type PrepareSupersAgentWorktreeArgs = z.infer<typeof PrepareSupersAgentWorktreeArgsSchema>;

export const SupersAgentWorktreeBindingSchema = z
	.object({
		schemaVersion: z.literal(1),
		claimId: z.string().regex(SHA64_PATTERN),
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		baseRevision: z.string().regex(SHA40_PATTERN),
		purpose: SupersAgentWorktreePurposeSchema,
		workItem: z.string().regex(SAFE_ID_PATTERN),
		repositoryDir: z.string().min(1),
		worktreePath: z.string().min(1),
		attachedBranch: z.string().min(1),
		expectedInvocationTags: z.record(z.string(), z.string())
	})
	.strict();
export type SupersAgentWorktreeBinding = z.infer<typeof SupersAgentWorktreeBindingSchema>;

export const SupersAgentWorktreeIntentSchema = SupersAgentWorktreeBindingSchema.extend({
	preparedAt: z.string().datetime()
}).strict();
export type SupersAgentWorktreeIntent = z.infer<typeof SupersAgentWorktreeIntentSchema>;

export const SupersAgentWorktreeClaimSchema = SupersAgentWorktreeIntentSchema.extend({
	headSha: z.string().regex(SHA40_PATTERN),
	stateHash: z.string().regex(SHA64_PATTERN)
}).strict();
export type SupersAgentWorktreeClaim = z.infer<typeof SupersAgentWorktreeClaimSchema>;

export const VerifySupersAgentWorktreeUnchangedArgsSchema = z
	.object({
		claimId: z.string().regex(SHA64_PATTERN)
	})
	.strict();
export type VerifySupersAgentWorktreeUnchangedArgs = z.infer<
	typeof VerifySupersAgentWorktreeUnchangedArgsSchema
>;

const SupersAgentObjectiveProofNominationSchema = z
	.object({
		runner: z.enum(['vitest-exact-v1', 'deno-exact-v1']),
		testPath: z.string().min(1).max(500),
		exactTestName: z.string().min(1).max(300)
	})
	.strict();

export const VerifySupersAgentWorktreeCommitArgsSchema = z
	.object({
		claimId: z.string().regex(SHA64_PATTERN),
		invocationModelId: z.string().min(1),
		invocationResourceName: z.string().min(1),
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		expectedProvider: z.string().min(1),
		expectedModel: z.string().min(1),
		expectedActor: z.literal('actor'),
		expectedRepositoryExpectation: z
			.object({
				attachedBranch: z.string().min(1),
				headSha: z.string().regex(SHA40_PATTERN),
				stateHash: z.string().regex(SHA64_PATTERN)
			})
			.strict(),
		expectedPromptDigest: z.string().regex(SHA64_PATTERN),
		expectedBaseRevision: z.string().regex(SHA40_PATTERN),
		expectedCommitRevision: z.string().regex(SHA40_PATTERN),
		objectiveProofNomination: SupersAgentObjectiveProofNominationSchema.optional()
	})
	.strict();
export type VerifySupersAgentWorktreeCommitArgs = z.infer<
	typeof VerifySupersAgentWorktreeCommitArgsSchema
>;

const InvocationResultSchema = z
	.object({
		invocationId: z.string(),
		cwd: z.string(),
		exitCode: z.number(),
		success: z.boolean(),
		timedOut: z.boolean(),
		tags: z.record(z.string(), z.string()).optional()
	})
	.passthrough();

const CommittedInvocationResultSchema = InvocationResultSchema.extend({
	provider: z.string().min(1),
	model: z.string().min(1),
	promptHash: z.string().regex(SHA64_PATTERN)
});

const InvocationLaunchBindingSchema = z
	.object({
		operation: z.enum(['invoke', 'invokeAndParse']),
		invocationId: z.string(),
		cwd: z.string(),
		repositoryExpectation: z
			.object({
				attachedBranch: z.string(),
				headSha: z.string().regex(SHA40_PATTERN),
				stateHash: z.string().regex(SHA64_PATTERN)
			})
			.strict(),
		tags: z.record(z.string(), z.string())
	})
	.passthrough();

const CommittedInvocationLaunchSchema = InvocationLaunchBindingSchema.extend({
	provider: z.string().min(1),
	model: z.string().min(1),
	promptHash: z.string().regex(SHA64_PATTERN),
	definition: z
		.object({
			id: z.string().min(1)
		})
		.passthrough(),
	toolProfile: z.literal('actor')
});

export const SupersAgentWorktreeUnchangedReceiptSchema = z
	.object({
		schemaVersion: z.literal(1),
		receiptId: z.string().regex(SHA64_PATTERN),
		claimId: z.string().regex(SHA64_PATTERN),
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		purpose: SupersAgentWorktreePurposeSchema,
		workItem: z.string().regex(SAFE_ID_PATTERN),
		worktreePath: z.string().min(1),
		attachedBranch: z.string().min(1),
		headSha: z.string().regex(SHA40_PATTERN),
		stateHash: z.string().regex(SHA64_PATTERN),
		invocationResource: z.string().min(1),
		verifiedAt: z.string().datetime()
	})
	.strict();
export type SupersAgentWorktreeUnchangedReceipt = z.infer<
	typeof SupersAgentWorktreeUnchangedReceiptSchema
>;

export const SupersAgentWorktreeCommitReceiptSchema = z
	.object({
		schemaVersion: z.literal(1),
		receiptId: z.string().regex(SHA64_PATTERN),
		claimId: z.string().regex(SHA64_PATTERN),
		invocationModelId: z.string().min(1),
		invocationResourceName: z.string().min(1),
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		provider: z.string().min(1),
		model: z.string().min(1),
		actor: z.literal('actor'),
		promptDigest: z.string().regex(SHA64_PATTERN),
		purpose: SupersAgentWorktreePurposeSchema,
		workItem: z.string().regex(SAFE_ID_PATTERN),
		worktreePath: z.string().min(1),
		attachedBranch: z.string().min(1),
		baseRevision: z.string().regex(SHA40_PATTERN),
		commitRevision: z.string().regex(SHA40_PATTERN),
		commitTree: z.string().regex(SHA40_PATTERN),
		treeDigest: z.string().regex(SHA64_PATTERN),
		changedPaths: z.array(z.string().min(1)).min(1).max(MAX_CHANGED_PATHS),
		changedPathsDigest: z.string().regex(SHA64_PATTERN),
		diffDigest: z.string().regex(SHA64_PATTERN),
		objectiveProofNomination: SupersAgentObjectiveProofNominationSchema.optional(),
		verifiedAt: z.string().datetime(),
		fingerprint: z.string().regex(SHA64_PATTERN)
	})
	.strict();
export type SupersAgentWorktreeCommitReceipt = z.infer<
	typeof SupersAgentWorktreeCommitReceiptSchema
>;

const GitCherryPickResultSchema = z
	.object({
		commits: z.array(z.string().regex(SHA40_PATTERN)),
		conflict: z.boolean(),
		conflictFiles: z.array(z.string()).optional(),
		aborted: z.boolean().optional(),
		raw: z.string()
	})
	.strict();

export const VerifySupersAgentIntegrationArgsSchema = z
	.object({
		commitReceiptName: z.string().min(1),
		expectedCommitReceiptId: z.string().regex(SHA64_PATTERN),
		expectedCommitReceiptFingerprint: z.string().regex(SHA64_PATTERN),
		integrationGitModelId: z.string().min(1),
		cherryPickResourceName: z.string().min(1),
		rootEpicId: z.string().regex(SAFE_ID_PATTERN),
		activeTaskId: z.string().regex(SAFE_ID_PATTERN),
		expectedPreRevision: z.string().regex(SHA40_PATTERN),
		expectedPostRevision: z.string().regex(SHA40_PATTERN)
	})
	.strict();
export type VerifySupersAgentIntegrationArgs = z.infer<
	typeof VerifySupersAgentIntegrationArgsSchema
>;

export const SupersAgentIntegrationIntentSchema = z
	.object({
		schemaVersion: z.literal(1),
		workItem: z.string().regex(SAFE_ID_PATTERN),
		commitReceiptName: z.string().min(1),
		commitReceiptId: z.string().regex(SHA64_PATTERN),
		commitReceiptFingerprint: z.string().regex(SHA64_PATTERN),
		integrationGitModelId: z.string().min(1),
		cherryPickResourceName: z.string().min(1),
		cherryPickDigest: z.string().regex(SHA64_PATTERN),
		rootEpicId: z.string().regex(SAFE_ID_PATTERN),
		activeTaskId: z.string().regex(SAFE_ID_PATTERN),
		expectedPreRevision: z.string().regex(SHA40_PATTERN),
		expectedPostRevision: z.string().regex(SHA40_PATTERN),
		preparedAt: z.string().datetime(),
		fingerprint: z.string().regex(SHA64_PATTERN)
	})
	.strict();
export type SupersAgentIntegrationIntent = z.infer<typeof SupersAgentIntegrationIntentSchema>;

export const SupersAgentIntegrationHandoffManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		authority: z.literal('supers-agent-worktree-integration-v1'),
		workItem: z.string().regex(SAFE_ID_PATTERN),
		rootEpicId: z.string().regex(SAFE_ID_PATTERN),
		activeTaskId: z.string().regex(SAFE_ID_PATTERN),
		commitReceiptName: z.string().min(1),
		commitReceiptId: z.string().regex(SHA64_PATTERN),
		commitReceiptFingerprint: z.string().regex(SHA64_PATTERN),
		objectiveProofNomination: SupersAgentObjectiveProofNominationSchema.optional(),
		baseRevision: z.string().regex(SHA40_PATTERN),
		childCommitRevision: z.string().regex(SHA40_PATTERN),
		integratedRevision: z.string().regex(SHA40_PATTERN),
		changedPaths: z.array(z.string().min(1)).min(1).max(MAX_CHANGED_PATHS),
		patchDigest: z.string().regex(SHA64_PATTERN),
		integratedTreeFingerprint: z.string().regex(SHA64_PATTERN),
		verifiedAt: z.string().datetime(),
		fingerprint: z.string().regex(SHA64_PATTERN)
	})
	.strict();
export type SupersAgentIntegrationHandoffManifest = z.infer<
	typeof SupersAgentIntegrationHandoffManifestSchema
>;

const SupersAgentWorktreeRemovalAuthorizationSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('unchanged') }).strict(),
	z
		.object({
			kind: z.literal('committed'),
			receiptName: z.string().min(1),
			receiptId: z.string().regex(SHA64_PATTERN),
			fingerprint: z.string().regex(SHA64_PATTERN)
		})
		.strict(),
	z
		.object({
			kind: z.literal('superseded'),
			centralRevision: z.string().regex(SHA40_PATTERN)
		})
		.strict()
]);

export const RemoveSupersAgentWorktreeArgsSchema = z
	.object({
		claimId: z.string().regex(SHA64_PATTERN),
		authorization: SupersAgentWorktreeRemovalAuthorizationSchema.optional()
	})
	.strict();
export type RemoveSupersAgentWorktreeArgs = z.infer<typeof RemoveSupersAgentWorktreeArgsSchema>;

export const SupersAgentSupersededWorktreeReceiptSchema = z
	.object({
		schemaVersion: z.literal(1),
		claimId: z.string().regex(SHA64_PATTERN),
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		invocationState: z.enum(['missing', 'succeeded', 'failed']),
		centralRevision: z.string().regex(SHA40_PATTERN),
		worktreeHead: z.string().regex(SHA40_PATTERN),
		worktreePresence: z.enum(['present', 'missing']),
		cleanupBasis: z.enum(['unchanged', 'integrated']),
		verifiedAt: z.string().datetime(),
		fingerprint: z.string().regex(SHA64_PATTERN)
	})
	.strict();
export type SupersAgentSupersededWorktreeReceipt = z.infer<
	typeof SupersAgentSupersededWorktreeReceiptSchema
>;

export const SupersAgentWorktreeRemovalIntentSchema = z
	.object({
		schemaVersion: z.literal(1),
		claimId: z.string().regex(SHA64_PATTERN),
		receiptId: z.string().regex(SHA64_PATTERN),
		worktreePath: z.string().min(1),
		attachedBranch: z.string().min(1),
		authorizationKind: z.enum(['unchanged', 'committed', 'superseded']).optional(),
		authorizationReceiptId: z.string().regex(SHA64_PATTERN).optional(),
		requestedAt: z.string().datetime()
	})
	.strict();
export type SupersAgentWorktreeRemovalIntent = z.infer<
	typeof SupersAgentWorktreeRemovalIntentSchema
>;

export const SupersAgentWorktreeRemovalReceiptSchema =
	SupersAgentWorktreeRemovalIntentSchema.extend({
		removed: z.literal(true),
		removedAt: z.string().datetime()
	}).strict();
export type SupersAgentWorktreeRemovalReceipt = z.infer<
	typeof SupersAgentWorktreeRemovalReceiptSchema
>;

export const ReconcileSupersAgentWorktreesArgsSchema = z
	.object({
		claimIds: z
			.array(z.string().regex(SHA64_PATTERN))
			.max(MAX_RECONCILIATION_CLAIMS)
			.refine((claimIds) => new Set(claimIds).size === claimIds.length, {
				message: 'claimIds must be unique'
			})
	})
	.strict();
export type ReconcileSupersAgentWorktreesArgs = z.infer<
	typeof ReconcileSupersAgentWorktreesArgsSchema
>;

const SupersAgentWorktreeReconciliationItemSchema = z
	.object({
		claimId: z.string().regex(SHA64_PATTERN),
		workItem: z.string().regex(SAFE_ID_PATTERN),
		invocationId: z.string().regex(INVOCATION_ID_PATTERN),
		worktreePath: z.string().min(1),
		attachedBranch: z.string().min(1),
		preparedAt: z.string().datetime(),
		ageMs: z.number().int().nonnegative(),
		invocationState: z.enum(['missing', 'succeeded', 'failed']),
		observedHead: z.string().regex(SHA40_PATTERN).optional(),
		logicalBytes: z.number().int().nonnegative(),
		sizeComplete: z.boolean(),
		disposition: z.enum([
			'preserved-active',
			'preserved-dirty',
			'preserved-unique-commits',
			'preserved-unsafe-history',
			'removed-unchanged',
			'removed-integrated',
			'removed-stale-registration',
			'absent'
		])
	})
	.strict();
export type SupersAgentWorktreeReconciliationItem = z.infer<
	typeof SupersAgentWorktreeReconciliationItemSchema
>;

export const SupersAgentWorktreeReconciliationReceiptSchema = z
	.object({
		schemaVersion: z.literal(1),
		reconciliationId: z.string().regex(SHA64_PATTERN),
		repositoryDir: z.string().min(1),
		centralRevision: z.string().regex(SHA40_PATTERN),
		items: z.array(SupersAgentWorktreeReconciliationItemSchema).max(MAX_RECONCILIATION_CLAIMS),
		removedCount: z.number().int().nonnegative(),
		preservedCount: z.number().int().nonnegative(),
		absentCount: z.number().int().nonnegative(),
		logicalBytesBefore: z.number().int().nonnegative(),
		reconciledAt: z.string().datetime(),
		fingerprint: z.string().regex(SHA64_PATTERN)
	})
	.strict();
export type SupersAgentWorktreeReconciliationReceipt = z.infer<
	typeof SupersAgentWorktreeReconciliationReceiptSchema
>;

export interface SupersAgentGitResult {
	success: boolean;
	code: number;
	stdout: Uint8Array;
	stderr: Uint8Array;
}

export interface SupersAgentFileInfo {
	isFile: boolean;
	isSymlink: boolean;
	size: number;
}

export interface SupersAgentGitOutputLimits {
	stdoutBytes: number;
	stderrBytes: number;
}

export interface SupersAgentWorktreeDependencies {
	runGit(
		cwd: string,
		args: readonly string[],
		limits: SupersAgentGitOutputLimits
	): Promise<SupersAgentGitResult>;
	realPath(path: string): Promise<string>;
	/** Resolve the canonical repository-scoped OS-managed root for disposable checkouts. */
	resolveWorktreeRoot(repositoryDir: string): Promise<string>;
	measureDirectory(path: string): Promise<{ logicalBytes: number; complete: boolean }>;
	pathExists(path: string): Promise<boolean>;
	fileInfo(path: string): Promise<SupersAgentFileInfo>;
	readFile(path: string): Promise<Uint8Array>;
	rename(from: string, to: string): Promise<void>;
	now(): Date;
}

export interface SupersAgentWorktreeMethodContext {
	repoDir: string;
	dataRepository?: {
		getContent(
			type: unknown,
			modelId: string,
			dataName: string,
			version?: number
		): Promise<Uint8Array | null>;
	};
	readResource(instanceName: string): Promise<Record<string, unknown> | null>;
	writeResource(
		specName: string,
		instanceName: string,
		data: Record<string, unknown>
	): Promise<{ name: string }>;
}

interface WorktreeRecord {
	path: string;
	headSha: string;
	attachedBranch: string | null;
}

interface RepositorySnapshot {
	canonicalDir: string;
	headSha: string;
}

function decoded(bytes: Uint8Array): string {
	return decoder.decode(bytes);
}

function gitFailure(args: readonly string[], result: SupersAgentGitResult): Error {
	const detail = decoded(result.stderr).trim() || decoded(result.stdout).trim();
	return new Error(
		`git ${args.join(' ')} failed with exit ${result.code}${detail.length > 0 ? `: ${detail}` : ''}`
	);
}

async function requiredGitBytes(
	deps: SupersAgentWorktreeDependencies,
	cwd: string,
	args: readonly string[],
	maxBytes: number
): Promise<Uint8Array> {
	const result = await deps.runGit(cwd, args, {
		stdoutBytes: maxBytes,
		stderrBytes: MAX_GIT_ERROR_BYTES
	});
	if (!result.success) {
		throw gitFailure(args, result);
	}
	if (result.stdout.length > maxBytes) {
		throw new Error(`git ${args[0]} output exceeds the ${maxBytes}-byte safety limit`);
	}
	return result.stdout;
}

async function requiredGitOutput(
	deps: SupersAgentWorktreeDependencies,
	cwd: string,
	args: readonly string[],
	maxBytes: number
): Promise<string> {
	try {
		return strictDecoder.decode(await requiredGitBytes(deps, cwd, args, maxBytes));
	} catch (error) {
		throw new Error(`git ${args[0]} returned invalid UTF-8 for a textual protocol`, { cause: error });
	}
}

function frameHashParts(parts: readonly Uint8Array[]): Uint8Array {
	const size = parts.reduce((total, part) => total + 8 + part.length, 0);
	const framed = new Uint8Array(size);
	const view = new DataView(framed.buffer);
	let offset = 0;
	for (const part of parts) {
		view.setBigUint64(offset, BigInt(part.length), false);
		offset += 8;
		framed.set(part, offset);
		offset += part.length;
	}
	return framed;
}

async function rawSha256(bytes: Uint8Array): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
	return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(parts: readonly Uint8Array[]): Promise<string> {
	return await rawSha256(frameHashParts(parts));
}

export async function createSupersAgentStableIdentityHash(value: Record<string, unknown>): Promise<string> {
	return await sha256([encoder.encode(JSON.stringify(value))]);
}

interface ValidatedUntrackedFile {
	relativePath: string;
	absolutePath: string;
	canonicalPath: string;
	size: number;
}

function isContainedPath(root: string, candidate: string): boolean {
	return root === '/'
		? candidate.startsWith('/') && candidate !== '/'
		: candidate.startsWith(`${root}/`);
}

/** Matches @mgreten/cli-agent's tracked-diff-v1 hash for accepted regular files. */
export async function createSupersAgentRepositoryStateHash(
	cwd: string,
	deps: SupersAgentWorktreeDependencies
): Promise<string> {
	const diff = await requiredGitOutput(
		deps,
		cwd,
		['diff', '--binary', '--full-index', 'HEAD', '--'],
		MAX_BINARY_DIFF_BYTES
	);
	const untracked = await requiredGitOutput(
		deps,
		cwd,
		['ls-files', '--others', '--exclude-standard', '-z'],
		MAX_NAME_STATUS_BYTES
	);
	const canonicalRoot = await deps.realPath(cwd);
	const validatedFiles: ValidatedUntrackedFile[] = [];
	let aggregateBytes = 0;
	for (const relativePath of untracked.split('\0').filter(Boolean).sort()) {
		if (
			relativePath.startsWith('/') ||
			relativePath.split('/').some((segment) => segment === '..' || segment.length === 0)
		) {
			throw new Error(`unsafe untracked repository path: ${relativePath}`);
		}
		const absolutePath = `${cwd}/${relativePath}`;
		const info = await deps.fileInfo(absolutePath);
		if (info.isSymlink) {
			throw new Error(`untracked symlinks cannot be repository evidence: ${relativePath}`);
		}
		if (!info.isFile) {
			throw new Error(`untracked non-regular files cannot be repository evidence: ${relativePath}`);
		}
		if (info.size < 0 || !Number.isSafeInteger(info.size)) {
			throw new Error(`untracked file has an invalid size: ${relativePath}`);
		}
		if (info.size > MAX_UNTRACKED_FILE_BYTES) {
			throw new Error(`untracked file exceeds the repository evidence size limit: ${relativePath}`);
		}
		aggregateBytes += info.size;
		if (aggregateBytes > MAX_UNTRACKED_AGGREGATE_BYTES) {
			throw new Error('untracked files exceed the aggregate repository evidence size limit');
		}
		const canonicalPath = await deps.realPath(absolutePath);
		if (!isContainedPath(canonicalRoot, canonicalPath)) {
			throw new Error(`untracked file resolves outside the repository: ${relativePath}`);
		}
		validatedFiles.push({ relativePath, absolutePath, canonicalPath, size: info.size });
	}

	const parts: Uint8Array[] = [encoder.encode('tracked-diff-v1'), encoder.encode(diff)];
	for (const file of validatedFiles) {
		const bytes = await deps.readFile(file.absolutePath);
		const currentInfo = await deps.fileInfo(file.absolutePath);
		const currentCanonicalPath = await deps.realPath(file.absolutePath);
		if (
			currentInfo.isSymlink ||
			!currentInfo.isFile ||
			currentInfo.size !== file.size ||
			bytes.length !== file.size ||
			currentCanonicalPath !== file.canonicalPath ||
			!isContainedPath(canonicalRoot, currentCanonicalPath)
		) {
			throw new Error(
				`untracked file changed while collecting repository evidence: ${file.relativePath}`
			);
		}
		parts.push(encoder.encode(file.relativePath));
		parts.push(bytes);
	}
	return await sha256(parts);
}

function parseWorktreeRecords(output: string): WorktreeRecord[] {
	const records: WorktreeRecord[] = [];
	let current: Partial<WorktreeRecord> = {};
	const flush = (): void => {
		if (current.path !== undefined && current.headSha !== undefined) {
			records.push({
				path: current.path,
				headSha: current.headSha,
				attachedBranch: current.attachedBranch ?? null
			});
		}
		current = {};
	};
	for (const line of output.split('\n')) {
		if (line.length === 0) {
			flush();
		} else if (line.startsWith('worktree ')) {
			if (current.path !== undefined) flush();
			current.path = line.slice('worktree '.length);
		} else if (line.startsWith('HEAD ')) {
			current.headSha = line.slice('HEAD '.length);
		} else if (line.startsWith('branch refs/heads/')) {
			current.attachedBranch = line.slice('branch refs/heads/'.length);
		} else if (line === 'detached') {
			current.attachedBranch = null;
		}
	}
	flush();
	return records;
}

async function listWorktrees(
	deps: SupersAgentWorktreeDependencies,
	repositoryDir: string
): Promise<WorktreeRecord[]> {
	return parseWorktreeRecords(
		await requiredGitOutput(
			deps,
			repositoryDir,
			['worktree', 'list', '--porcelain'],
			MAX_GIT_PROTOCOL_BYTES
		)
	);
}

async function requireStableCentralRepository(
	deps: SupersAgentWorktreeDependencies,
	repoDir: string,
	expectedRevision: string
): Promise<RepositorySnapshot> {
	const canonicalDir = await deps.realPath(repoDir);
	const topLevel = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--show-toplevel'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (topLevel !== canonicalDir) {
		throw new Error('central repository path is not its canonical Git top-level');
	}
	const gitDir = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--path-format=absolute', '--git-dir'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const commonDir = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (gitDir !== commonDir) {
		throw new Error('central repository must be the primary worktree, not a linked worktree');
	}
	const firstHead = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (firstHead !== expectedRevision) {
		throw new Error(
			`central repository HEAD mismatch: expected ${expectedRevision}, got ${firstHead}`
		);
	}
	const secondHead = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (secondHead !== firstHead) {
		throw new Error('central repository HEAD changed during worktree preflight');
	}
	return { canonicalDir, headSha: firstHead };
}

async function requireStableCentralRevision(
	deps: SupersAgentWorktreeDependencies,
	repoDir: string,
	baseRevision: string
): Promise<RepositorySnapshot> {
	return await requireStableCentralRepository(deps, repoDir, baseRevision);
}

// Commit verification is isolated from central integration. The central branch may
// advance concurrently, but it must still contain the exact worktree base.
async function requireCentralContainsRevision(
	deps: SupersAgentWorktreeDependencies,
	repoDir: string,
	baseRevision: string
): Promise<RepositorySnapshot> {
	const canonicalDir = await deps.realPath(repoDir);
	const topLevel = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--show-toplevel'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (topLevel !== canonicalDir) {
		throw new Error('central repository path is not its canonical Git top-level');
	}
	const gitDir = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--path-format=absolute', '--git-dir'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const commonDir = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--path-format=absolute', '--git-common-dir'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (gitDir !== commonDir) {
		throw new Error('central repository must be the primary worktree, not a linked worktree');
	}
	const centralHead = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const ancestorCheck = await deps.runGit(
		canonicalDir,
		['merge-base', '--is-ancestor', baseRevision, centralHead],
		{ stdoutBytes: MAX_GIT_PROTOCOL_BYTES, stderrBytes: MAX_GIT_ERROR_BYTES }
	);
	if (!ancestorCheck.success) {
		throw new Error(
			`central repository does not contain worktree base revision ${baseRevision}`
		);
	}
	return { canonicalDir, headSha: centralHead };
}

function parentDirectory(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash <= 0 ? '/' : path.slice(0, slash);
}

function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1) || 'repository';
}

function worktreePathAtRoot(
	repositoryDir: string,
	worktreeRoot: string,
	suffix: string
): string {
	const worktreeName = `${baseName(repositoryDir)}-supers-agent-${suffix}`;
	return worktreeRoot === '/' ? `/${worktreeName}` : `${worktreeRoot}/${worktreeName}`;
}

async function createBinding(
	args: PrepareSupersAgentWorktreeArgs,
	repositoryDir: string,
	worktreeRoot: string
): Promise<SupersAgentWorktreeBinding> {
	if (worktreeRoot === repositoryDir || isContainedPath(repositoryDir, worktreeRoot)) {
		throw new Error('agent worktree root must be outside the central repository');
	}
	const claimId = await createSupersAgentStableIdentityHash({
		schemaVersion: 1,
		invocationId: args.invocationId,
		baseRevision: args.baseRevision,
		purpose: args.purpose,
		workItem: args.workItem,
		repositoryDir
	});
	const suffix = claimId.slice(0, 20);
	const worktreePath = worktreePathAtRoot(repositoryDir, worktreeRoot, suffix);
	const attachedBranch = `supers-agent/${args.purpose}/${suffix}`;
	return {
		schemaVersion: 1,
		claimId,
		invocationId: args.invocationId,
		baseRevision: args.baseRevision,
		purpose: args.purpose,
		workItem: args.workItem,
		repositoryDir,
		worktreePath,
		attachedBranch,
		expectedInvocationTags: {
			supersAgentClaimId: claimId,
			supersAgentPurpose: args.purpose,
			supersAgentWorkItem: args.workItem
		}
	};
}

async function createSupportedBindings(
	args: PrepareSupersAgentWorktreeArgs,
	repositoryDir: string,
	deps: SupersAgentWorktreeDependencies
): Promise<readonly SupersAgentWorktreeBinding[]> {
	const managedRoot = await deps.resolveWorktreeRoot(repositoryDir);
	const managedBinding = await createBinding(args, repositoryDir, managedRoot);
	const legacyRoot = parentDirectory(repositoryDir);
	if (managedRoot === legacyRoot) return [managedBinding];
	return [managedBinding, await createBinding(args, repositoryDir, legacyRoot)];
}

function bindingMatches(
	binding: SupersAgentWorktreeBinding,
	expectedBindings: readonly SupersAgentWorktreeBinding[]
): boolean {
	return expectedBindings.some((expected) => JSON.stringify(binding) === JSON.stringify(expected));
}

function createIntent(
	binding: SupersAgentWorktreeBinding,
	preparedAt: string
): SupersAgentWorktreeIntent {
	return { ...binding, preparedAt };
}

async function requireValidClaimIdentity(
	claim: SupersAgentWorktreeClaim,
	deps: SupersAgentWorktreeDependencies
): Promise<void> {
	const expectedBindings = await createSupportedBindings(
		{
			invocationId: claim.invocationId,
			baseRevision: claim.baseRevision,
			purpose: claim.purpose,
			workItem: claim.workItem
		},
		claim.repositoryDir,
		deps
	);
	const claimIntent: Record<string, unknown> = { ...claim };
	delete claimIntent.headSha;
	delete claimIntent.stateHash;
	const intentMatches = expectedBindings.some(
		(binding) =>
			JSON.stringify(claimIntent) === JSON.stringify(createIntent(binding, claim.preparedAt))
	);
	if (!intentMatches) {
		throw new Error('worktree claim content does not match its content-addressed identity');
	}
	if (claim.headSha !== claim.baseRevision) {
		throw new Error('worktree claim HEAD is not its exact base revision');
	}
}

type SupersAgentInvocationResult = z.infer<typeof InvocationResultSchema>;
type SupersAgentInvocationState = SupersAgentWorktreeReconciliationItem['invocationState'];
type SupersAgentReconciliationDisposition =
	SupersAgentWorktreeReconciliationItem['disposition'];

function getSupersAgentInvocationState(
	invocation: SupersAgentInvocationResult | null
): SupersAgentInvocationState {
	if (invocation === null) return 'missing';
	if (invocation.success && invocation.exitCode === 0 && !invocation.timedOut) {
		return 'succeeded';
	}
	return 'failed';
}

function getRemovedWorktreeDisposition(
	observed: SupersAgentObservedWorktree,
	history: SupersAgentCleanupHistoryDisposition
): SupersAgentReconciliationDisposition {
	if (observed.presence === 'missing') return 'removed-stale-registration';
	if (history === 'unchanged') return 'removed-unchanged';
	return 'removed-integrated';
}

function sumWorktreeLogicalBytes(items: readonly SupersAgentWorktreeReconciliationItem[]): number {
	let total = 0;
	for (const item of items) {
		total += item.logicalBytes;
		if (!Number.isSafeInteger(total)) {
			throw new Error('reconciled worktree sizes exceed the safe integer range');
		}
	}
	return total;
}

async function readBoundFinalInvocation(
	context: SupersAgentWorktreeMethodContext,
	claim: SupersAgentWorktreeClaim
): Promise<SupersAgentInvocationResult | null> {
	const invocationResource = `invocation-${claim.invocationId}`;
	const invocationRaw = await context.readResource(invocationResource);
	if (invocationRaw === null) return null;
	const invocation = InvocationResultSchema.parse(invocationRaw);
	if (invocation.invocationId !== claim.invocationId) {
		throw new Error('CLI-agent invocation identity does not match the worktree claim');
	}
	if (invocation.cwd !== claim.worktreePath) {
		throw new Error('CLI-agent invocation ran outside the claimed worktree');
	}
	const tags = invocation.tags ?? {};
	for (const [key, value] of Object.entries(claim.expectedInvocationTags)) {
		if (tags[key] !== value) {
			throw new Error(`CLI-agent invocation tag mismatch for ${key}`);
		}
	}
	const launchResource = `launch-claim-${claim.invocationId}`;
	const launchRaw = await context.readResource(launchResource);
	if (launchRaw === null) {
		throw new Error(`CLI-agent launch claim is missing: ${launchResource}`);
	}
	const launch = InvocationLaunchBindingSchema.parse(launchRaw);
	if (
		launch.invocationId !== claim.invocationId ||
		launch.cwd !== claim.worktreePath ||
		launch.repositoryExpectation.attachedBranch !== claim.attachedBranch ||
		launch.repositoryExpectation.headSha !== claim.headSha ||
		launch.repositoryExpectation.stateHash !== claim.stateHash
	) {
		throw new Error('CLI-agent launch claim does not match the exact worktree expectation');
	}
	for (const [key, value] of Object.entries(claim.expectedInvocationTags)) {
		if (launch.tags[key] !== value) {
			throw new Error(`CLI-agent launch claim tag mismatch for ${key}`);
		}
	}
	return invocation;
}

interface SupersAgentObservedWorktree {
	presence: 'present' | 'missing';
	headSha: string;
	dirty: boolean;
}

async function observeClaimedWorktree(
	deps: SupersAgentWorktreeDependencies,
	claim: SupersAgentWorktreeClaim
): Promise<SupersAgentObservedWorktree | null> {
	const matchingRecords = (await listWorktrees(deps, claim.repositoryDir)).filter(
		(candidate) =>
			candidate.path === claim.worktreePath || candidate.attachedBranch === claim.attachedBranch
	);
	if (matchingRecords.length === 0) {
		if (await deps.pathExists(claim.worktreePath)) {
			throw new Error('claimed worktree path exists without its exact Git registration');
		}
		return null;
	}
	if (matchingRecords.length !== 1) {
		throw new Error('claimed worktree path and branch resolve to conflicting Git registrations');
	}
	const record = matchingRecords[0];
	if (record.path !== claim.worktreePath || record.attachedBranch !== claim.attachedBranch) {
		throw new Error('claimed worktree Git registration conflicts with its exact identity');
	}
	if (!(await deps.pathExists(claim.worktreePath))) {
		return { presence: 'missing', headSha: record.headSha, dirty: false };
	}
	const canonicalPath = await deps.realPath(claim.worktreePath);
	if (canonicalPath !== claim.worktreePath) {
		throw new Error('worktree path is not canonical');
	}
	const [topLevel, branch, headSha, status] = await Promise.all([
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--show-toplevel'],
			MAX_GIT_PROTOCOL_BYTES
		),
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			MAX_GIT_PROTOCOL_BYTES
		),
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		),
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['status', '--porcelain=v1', '--untracked-files=all', '-z'],
			MAX_NAME_STATUS_BYTES
		)
	]);
	const observedHead = headSha.trim();
	if (
		topLevel.trim() !== claim.worktreePath ||
		branch.trim() !== claim.attachedBranch ||
		observedHead !== record.headSha
	) {
		throw new Error('worktree checkout identity changed during reconciliation');
	}
	return { presence: 'present', headSha: observedHead, dirty: status.length !== 0 };
}

async function gitRevisionIsAncestor(
	deps: SupersAgentWorktreeDependencies,
	repositoryDir: string,
	ancestor: string,
	descendant: string
): Promise<boolean> {
	const args = ['merge-base', '--is-ancestor', ancestor, descendant] as const;
	const result = await deps.runGit(repositoryDir, args, {
		stdoutBytes: MAX_GIT_PROTOCOL_BYTES,
		stderrBytes: MAX_GIT_ERROR_BYTES
	});
	if (result.success) return true;
	if (result.code === 1) return false;
	throw gitFailure(args, result);
}

type SupersAgentCleanupHistoryDisposition =
	| 'unchanged'
	| 'integrated'
	| 'unique-commits'
	| 'unsafe-history';

async function classifySupersAgentCleanupHistory(
	deps: SupersAgentWorktreeDependencies,
	claim: SupersAgentWorktreeClaim,
	worktreeHead: string,
	centralRevision: string
): Promise<SupersAgentCleanupHistoryDisposition> {
	if (worktreeHead === claim.baseRevision) return 'unchanged';
	if (await gitRevisionIsAncestor(deps, claim.repositoryDir, worktreeHead, centralRevision)) {
		return 'integrated';
	}
	const [basePrecedesWorktree, basePrecedesCentral] = await Promise.all([
		gitRevisionIsAncestor(deps, claim.repositoryDir, claim.baseRevision, worktreeHead),
		gitRevisionIsAncestor(deps, claim.repositoryDir, claim.baseRevision, centralRevision)
	]);
	if (!basePrecedesWorktree || !basePrecedesCentral) return 'unsafe-history';
	const mergeCommits = await requiredGitOutput(
		deps,
		claim.repositoryDir,
		['rev-list', '--min-parents=2', `${claim.baseRevision}..${worktreeHead}`],
		MAX_GIT_PROTOCOL_BYTES
	);
	if (mergeCommits.trim().length > 0) return 'unsafe-history';
	const cherry = await requiredGitOutput(
		deps,
		claim.repositoryDir,
		['cherry', centralRevision, worktreeHead],
		MAX_GIT_PROTOCOL_BYTES
	);
	const entries = cherry.trim().length === 0 ? [] : cherry.trim().split('\n');
	for (const entry of entries) {
		if (!/^[+-] [0-9a-f]{40}$/.test(entry)) {
			throw new Error('git cherry returned malformed reconciliation evidence');
		}
	}
	return entries.some((entry) => entry.startsWith('+ ')) ? 'unique-commits' : 'integrated';
}

async function verifySupersededWorktreeCleanup(
	deps: SupersAgentWorktreeDependencies,
	context: SupersAgentWorktreeMethodContext,
	claim: SupersAgentWorktreeClaim,
	centralRevision: string
): Promise<SupersAgentSupersededWorktreeReceipt> {
	await requireStableCentralRepository(deps, claim.repositoryDir, centralRevision);
	const receiptName = `supers-agent-worktree-superseded-${claim.claimId}-${centralRevision}`;
	const existing = await readParsedResource(
		context,
		receiptName,
		SupersAgentSupersededWorktreeReceiptSchema
	);
	if (existing !== null) {
		const existingBase: Record<string, unknown> = { ...existing };
		delete existingBase.fingerprint;
		if (
			existing.claimId !== claim.claimId ||
			existing.invocationId !== claim.invocationId ||
			existing.centralRevision !== centralRevision ||
			existing.fingerprint !== (await createSupersAgentStableIdentityHash(existingBase))
		) {
			throw new Error('superseded cleanup receipt conflicts with the exact worktree claim');
		}
		return existing;
	}
	const invocation = await readBoundFinalInvocation(context, claim);
	const claimAgeMs = Math.max(0, deps.now().getTime() - Date.parse(claim.preparedAt));
	if (invocation === null && claimAgeMs < ABANDONED_WORKTREE_MIN_AGE_MS) {
		throw new Error('superseded cleanup preserves a recent worktree without final invocation');
	}
	const observed = await observeClaimedWorktree(deps, claim);
	if (observed === null) {
		throw new Error('superseded cleanup found no worktree or stale registration');
	}
	if (observed.dirty) {
		throw new Error('superseded cleanup preserves a dirty worktree');
	}
	const cleanupBasis = await classifySupersAgentCleanupHistory(
		deps,
		claim,
		observed.headSha,
		centralRevision
	);
	if (cleanupBasis === 'unique-commits') {
		throw new Error('superseded cleanup preserves unique commits');
	}
	if (cleanupBasis === 'unsafe-history') {
		throw new Error('superseded cleanup preserves unsafe history');
	}
	await requireStableCentralRepository(deps, claim.repositoryDir, centralRevision);
	const receiptBase = {
		schemaVersion: 1 as const,
		claimId: claim.claimId,
		invocationId: claim.invocationId,
		invocationState: getSupersAgentInvocationState(invocation),
		centralRevision,
		worktreeHead: observed.headSha,
		worktreePresence: observed.presence,
		cleanupBasis,
		verifiedAt: deps.now().toISOString()
	};
	const receipt: SupersAgentSupersededWorktreeReceipt = {
		...receiptBase,
		fingerprint: await createSupersAgentStableIdentityHash(receiptBase)
	};
	await context.writeResource('supers-agent-worktree-superseded', receiptName, receipt);
	return receipt;
}

function expectedUnchangedReceipt(
	claim: SupersAgentWorktreeClaim,
	receiptId: string,
	verifiedAt: string
): SupersAgentWorktreeUnchangedReceipt {
	return {
		schemaVersion: 1,
		receiptId,
		claimId: claim.claimId,
		invocationId: claim.invocationId,
		purpose: claim.purpose,
		workItem: claim.workItem,
		worktreePath: claim.worktreePath,
		attachedBranch: claim.attachedBranch,
		headSha: claim.headSha,
		stateHash: claim.stateHash,
		invocationResource: `invocation-${claim.invocationId}`,
		verifiedAt
	};
}

function requireExactResource<T>(
	schema: z.ZodType<T>,
	raw: Record<string, unknown> | null,
	expected: T,
	label: string
): T | null {
	if (raw === null) return null;
	const parsed = schema.parse(raw);
	if (JSON.stringify(parsed) !== JSON.stringify(expected)) {
		throw new Error(`${label} conflicts with the caller-owned identity`);
	}
	return parsed;
}

async function branchExists(
	deps: SupersAgentWorktreeDependencies,
	repositoryDir: string,
	attachedBranch: string
): Promise<boolean> {
	const result = await deps.runGit(
		repositoryDir,
		['show-ref', '--verify', '--quiet', `refs/heads/${attachedBranch}`],
		{ stdoutBytes: MAX_GIT_PROTOCOL_BYTES, stderrBytes: MAX_GIT_ERROR_BYTES }
	);
	if (result.success) return true;
	if (result.code === 1) return false;
	throw gitFailure(['show-ref', '--verify', '--quiet', `refs/heads/${attachedBranch}`], result);
}

async function requireNoPreparationCollision(
	deps: SupersAgentWorktreeDependencies,
	binding: SupersAgentWorktreeBinding
): Promise<void> {
	const registration = (await listWorktrees(deps, binding.repositoryDir)).find(
		(record) =>
			record.path === binding.worktreePath || record.attachedBranch === binding.attachedBranch
	);
	if (registration !== undefined) {
		throw new Error(
			'deterministic worktree path or branch is already registered without a prior preparation intent'
		);
	}
	if (
		(await deps.pathExists(binding.worktreePath)) ||
		(await branchExists(deps, binding.repositoryDir, binding.attachedBranch))
	) {
		throw new Error(
			'deterministic worktree path or branch already exists with no recoverable worktree'
		);
	}
}

async function requireExactWorktree(
	deps: SupersAgentWorktreeDependencies,
	claim: SupersAgentWorktreeIntent | SupersAgentWorktreeClaim,
	expectedStateHash?: string
): Promise<{ headSha: string; stateHash: string }> {
	if (!(await deps.pathExists(claim.worktreePath))) {
		throw new Error(`expected worktree is absent: ${claim.worktreePath}`);
	}
	const canonicalPath = await deps.realPath(claim.worktreePath);
	if (canonicalPath !== claim.worktreePath) {
		throw new Error('worktree path is not canonical');
	}
	const record = (await listWorktrees(deps, claim.repositoryDir)).find(
		(candidate) => candidate.path === claim.worktreePath
	);
	if (record === undefined) {
		throw new Error('existing path is not a registered worktree of the central repository');
	}
	if (record.headSha !== claim.baseRevision || record.attachedBranch !== claim.attachedBranch) {
		throw new Error('registered worktree conflicts with the prepared branch or revision');
	}
	const topLevel = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--show-toplevel'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const branch = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const headSha = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (topLevel !== claim.worktreePath || branch !== claim.attachedBranch) {
		throw new Error('worktree checkout identity does not match its claim');
	}
	if (headSha !== claim.baseRevision) {
		throw new Error(`worktree HEAD mismatch: expected ${claim.baseRevision}, got ${headSha}`);
	}
	const stateHash = await createSupersAgentRepositoryStateHash(claim.worktreePath, deps);
	if (expectedStateHash !== undefined && stateHash !== expectedStateHash) {
		throw new Error('worktree repository state changed after the agent invocation');
	}
	return { headSha, stateHash };
}

async function requireCommittedCheckoutIdentity(
	deps: SupersAgentWorktreeDependencies,
	claim: SupersAgentWorktreeClaim,
	expectedCommitRevision: string
): Promise<void> {
	const record = (await listWorktrees(deps, claim.repositoryDir)).find(
		(candidate) => candidate.path === claim.worktreePath
	);
	if (
		record === undefined ||
		record.attachedBranch !== claim.attachedBranch ||
		record.headSha !== expectedCommitRevision
	) {
		throw new Error('registered worktree changed after committed evidence collection');
	}
	const [topLevel, branch, head, status] = await Promise.all([
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--show-toplevel'],
			MAX_GIT_PROTOCOL_BYTES
		),
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			MAX_GIT_PROTOCOL_BYTES
		),
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		),
		requiredGitOutput(
			deps,
			claim.worktreePath,
			['status', '--porcelain=v1', '--untracked-files=all', '-z'],
			MAX_NAME_STATUS_BYTES
		)
	]);
	if (
		topLevel.trim() !== claim.worktreePath ||
		branch.trim() !== claim.attachedBranch ||
		head.trim() !== expectedCommitRevision ||
		status.length !== 0
	) {
		throw new Error('committed worktree changed after evidence collection');
	}
}

function hasControlCharacter(value: string): boolean {
	return [...value].some((character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127;
	});
}

function requireSafeRepositoryPath(path: string): void {
	if (
		path.length === 0 ||
		path.startsWith('/') ||
		path.includes('\\') ||
		hasControlCharacter(path) ||
		path.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')
	) {
		throw new Error(`unsafe changed repository path: ${path}`);
	}
}

function requireObjectiveTestPath(path: string): void {
	requireSafeRepositoryPath(path);
	if (
		!/^src\/.+\.(?:test|spec)\.ts$/.test(path) &&
		!/^scripts\/.+\.test\.(?:ts|mjs)$/.test(path) &&
		!/^extensions\/models\/.+\.test\.ts$/.test(path)
	) {
		throw new Error(`unsupported objective proof test path: ${path}`);
	}
}

async function collectCommittedWorktreeEvidence(
	deps: SupersAgentWorktreeDependencies,
	claim: SupersAgentWorktreeClaim,
	args: VerifySupersAgentWorktreeCommitArgs
): Promise<{
	commitTree: string;
	treeDigest: string;
	changedPaths: string[];
	changedPathsDigest: string;
	diffDigest: string;
}> {
	if (!(await deps.pathExists(claim.worktreePath))) {
		throw new Error(`expected worktree is absent: ${claim.worktreePath}`);
	}
	if ((await deps.realPath(claim.worktreePath)) !== claim.worktreePath) {
		throw new Error('worktree path is not canonical');
	}
	const record = (await listWorktrees(deps, claim.repositoryDir)).find(
		(candidate) => candidate.path === claim.worktreePath
	);
	if (
		record === undefined ||
		record.attachedBranch !== claim.attachedBranch ||
		record.headSha !== args.expectedCommitRevision
	) {
		throw new Error('registered worktree conflicts with the committed branch or revision');
	}
	const topLevel = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--show-toplevel'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const branch = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['symbolic-ref', '--quiet', '--short', 'HEAD'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	const head = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (
		topLevel !== claim.worktreePath ||
		branch !== claim.attachedBranch ||
		head !== args.expectedCommitRevision
	) {
		throw new Error('committed worktree checkout identity does not match its claim');
	}
	const status = await requiredGitOutput(
		deps,
		claim.worktreePath,
		['status', '--porcelain=v1', '--untracked-files=all', '-z'],
		MAX_NAME_STATUS_BYTES
	);
	if (status.length !== 0) {
		throw new Error('committed worktree must be clean');
	}
	if (args.expectedCommitRevision === args.expectedBaseRevision) {
		throw new Error('committed worktree must advance beyond its base revision');
	}
	const ancestor = await deps.runGit(
		claim.worktreePath,
		['merge-base', '--is-ancestor', args.expectedBaseRevision, args.expectedCommitRevision],
		{ stdoutBytes: MAX_GIT_PROTOCOL_BYTES, stderrBytes: MAX_GIT_ERROR_BYTES }
	);
	if (!ancestor.success) {
		if (ancestor.code === 1) throw new Error('worktree base is not an ancestor of its commit');
		throw gitFailure(
			['merge-base', '--is-ancestor', args.expectedBaseRevision, args.expectedCommitRevision],
			ancestor
		);
	}
	const nameStatus = await requiredGitOutput(
		deps,
		claim.worktreePath,
		[
			'diff',
			'--name-status',
			'-z',
			args.expectedBaseRevision,
			args.expectedCommitRevision,
			'--'
		],
		MAX_NAME_STATUS_BYTES
	);
	const fields = nameStatus.split('\0').filter(Boolean);
	if (fields.length === 0 || fields.length % 2 !== 0) {
		throw new Error('committed worktree has no valid changed paths');
	}
	if (fields.length / 2 > MAX_CHANGED_PATHS) {
		throw new Error(`committed worktree exceeds the ${MAX_CHANGED_PATHS}-path safety limit`);
	}
	const changedPaths: string[] = [];
	let aggregateBlobBytes = 0;
	for (let index = 0; index < fields.length; index += 2) {
		const statusCode = fields[index];
		const path = fields[index + 1];
		if (statusCode !== 'A' && statusCode !== 'M') {
			throw new Error(`unsupported changed path status: ${statusCode}`);
		}
		requireSafeRepositoryPath(path);
		const treeEntry = (
			await requiredGitOutput(
				deps,
				claim.worktreePath,
				['ls-tree', '-z', args.expectedCommitRevision, '--', path],
				MAX_GIT_PROTOCOL_BYTES
			)
		).replace(/\0$/, '');
		const match = /^(100644|100755) blob [0-9a-f]{40}\t(.+)$/.exec(treeEntry);
		if (match === null || match[2] !== path) {
			throw new Error(`changed path is not an exact regular Git blob: ${path}`);
		}
		const blobSizeText = (
			await requiredGitOutput(deps, claim.worktreePath, [
				'cat-file',
				'-s',
				`${args.expectedCommitRevision}:${path}`
			], 64)
		).trim();
		const blobSize = Number(blobSizeText);
		if (!Number.isSafeInteger(blobSize) || blobSize < 0) {
			throw new Error(`changed path has an invalid Git blob size: ${path}`);
		}
		if (blobSize > MAX_CHANGED_BLOB_BYTES) {
			throw new Error(`changed path exceeds the ${MAX_CHANGED_BLOB_BYTES}-byte safety limit: ${path}`);
		}
		aggregateBlobBytes += blobSize;
		if (aggregateBlobBytes > MAX_CHANGED_BLOB_AGGREGATE_BYTES) {
			throw new Error(
				`changed blobs exceed the ${MAX_CHANGED_BLOB_AGGREGATE_BYTES}-byte aggregate safety limit`
			);
		}
		changedPaths.push(path);
	}
	changedPaths.sort();
	const commitTree = (
		await requiredGitOutput(
			deps,
			claim.worktreePath,
			['rev-parse', '--verify', `${args.expectedCommitRevision}^{tree}`],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (!SHA40_PATTERN.test(commitTree)) {
		throw new Error('committed worktree tree identity is invalid');
	}
	const treeListing = await requiredGitBytes(
		deps,
		claim.worktreePath,
		['ls-tree', '--full-tree', '-r', '-z', args.expectedCommitRevision],
		MAX_TREE_LISTING_BYTES
	);
	const diff = await requiredGitBytes(
		deps,
		claim.worktreePath,
		[
			'diff',
			'--binary',
			'--full-index',
			args.expectedBaseRevision,
			args.expectedCommitRevision,
			'--'
		],
		MAX_BINARY_DIFF_BYTES
	);
	return {
		commitTree,
		treeDigest: await rawSha256(treeListing),
		changedPaths,
		changedPathsDigest: await createSupersAgentStableIdentityHash({ changedPaths }),
		diffDigest: await rawSha256(diff)
	};
}

async function readParsedResource<T>(
	context: SupersAgentWorktreeMethodContext,
	name: string,
	schema: z.ZodType<T>
): Promise<T | null> {
	const raw = await context.readResource(name);
	return raw === null ? null : schema.parse(raw);
}

async function readExternalParsedResource<T>(
	context: SupersAgentWorktreeMethodContext,
	type: string,
	modelId: string,
	name: string,
	schema: z.ZodType<T>
): Promise<T> {
	if (context.dataRepository === undefined) {
		throw new Error('cross-model data repository access is unavailable');
	}
	const content = await context.dataRepository.getContent(type, modelId, name);
	if (content === null) throw new Error(`external integration resource is missing: ${name}`);
	try {
		return schema.parse(JSON.parse(strictDecoder.decode(content)));
	} catch (error) {
		throw new Error(`external integration resource is malformed: ${name}`, { cause: error });
	}
}

function withoutFingerprint(value: Readonly<Record<string, unknown>>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'fingerprint'));
}

export interface SupersAgentWorktreeResourceResult<T> {
	resource: T;
	dataHandles: Array<{ name: string }>;
}

export interface SupersAgentWorktreeOperations {
	prepareSupersAgentWorktree(
		args: PrepareSupersAgentWorktreeArgs,
		context: SupersAgentWorktreeMethodContext
	): Promise<SupersAgentWorktreeResourceResult<SupersAgentWorktreeClaim>>;
	verifySupersAgentWorktreeUnchanged(
		args: VerifySupersAgentWorktreeUnchangedArgs,
		context: SupersAgentWorktreeMethodContext
	): Promise<SupersAgentWorktreeResourceResult<SupersAgentWorktreeUnchangedReceipt>>;
	verifySupersAgentWorktreeCommit(
		args: VerifySupersAgentWorktreeCommitArgs,
		context: SupersAgentWorktreeMethodContext
	): Promise<SupersAgentWorktreeResourceResult<SupersAgentWorktreeCommitReceipt>>;
	verifySupersAgentIntegration(
		args: VerifySupersAgentIntegrationArgs,
		context: SupersAgentWorktreeMethodContext
	): Promise<SupersAgentWorktreeResourceResult<SupersFactoryIntegrationReceipt>>;
	removeSupersAgentWorktree(
		args: RemoveSupersAgentWorktreeArgs,
		context: SupersAgentWorktreeMethodContext
	): Promise<SupersAgentWorktreeResourceResult<SupersAgentWorktreeRemovalReceipt>>;
	reconcileSupersAgentWorktrees(
		args: ReconcileSupersAgentWorktreesArgs,
		context: SupersAgentWorktreeMethodContext
	): Promise<SupersAgentWorktreeResourceResult<SupersAgentWorktreeReconciliationReceipt>>;
}

/** Dependency-injected implementation used by the extension and adversarial tests. */
export function createSupersAgentWorktreeOperations(
	deps: SupersAgentWorktreeDependencies
): SupersAgentWorktreeOperations {
	const operations: SupersAgentWorktreeOperations = {
		async prepareSupersAgentWorktree(argsInput, context) {
			const args = PrepareSupersAgentWorktreeArgsSchema.parse(argsInput);
			const canonicalRepositoryDir = await deps.realPath(context.repoDir);
			const supportedBindings = await createSupportedBindings(
				args,
				canonicalRepositoryDir,
				deps
			);
			const proposedBinding = supportedBindings[0];
			const bindingName = `supers-agent-worktree-binding-${args.invocationId}`;
			const existingBinding = await readParsedResource(
				context,
				bindingName,
				SupersAgentWorktreeBindingSchema
			);
			if (existingBinding !== null && !bindingMatches(existingBinding, supportedBindings)) {
				throw new Error(
					'worktree invocation binding conflicts with the caller-owned identity'
				);
			}

			const createdHandles: Array<{ name: string }> = [];
			let creationSnapshot: RepositorySnapshot | null = null;
			const binding = existingBinding ?? proposedBinding;
			const intentName = `supers-agent-worktree-intent-${binding.claimId}`;
			const existingIntent = await readParsedResource(
				context,
				intentName,
				SupersAgentWorktreeIntentSchema
			);
			if (existingIntent !== null) {
				requireExactResource(
					SupersAgentWorktreeIntentSchema,
					existingIntent,
					createIntent(binding, existingIntent.preparedAt),
					'worktree intent'
				);
			}

			let intent = existingIntent;
			if (intent === null) {
				creationSnapshot = await requireStableCentralRevision(
					deps,
					canonicalRepositoryDir,
					args.baseRevision
				);
				await requireNoPreparationCollision(deps, binding);
				if (existingBinding === null) {
					createdHandles.push(
						await context.writeResource(
							'supers-agent-worktree-binding',
							bindingName,
							proposedBinding
						)
					);
				}
				intent = createIntent(binding, deps.now().toISOString());
				createdHandles.push(
					await context.writeResource('supers-agent-worktree-intent', intentName, intent)
				);
			} else if (existingBinding === null) {
				createdHandles.push(
					await context.writeResource('supers-agent-worktree-binding', bindingName, proposedBinding)
				);
			}

			const claimName = `supers-agent-worktree-claim-${intent.claimId}`;
			const existingClaim = await readParsedResource(
				context,
				claimName,
				SupersAgentWorktreeClaimSchema
			);
			if (existingClaim !== null) {
				await requireValidClaimIdentity(existingClaim, deps);
				requireExactResource(
					SupersAgentWorktreeClaimSchema,
					existingClaim,
					{
						...intent,
						headSha: existingClaim.headSha,
						stateHash: existingClaim.stateHash
					},
					'worktree claim'
				);
				await requireExactWorktree(deps, existingClaim, existingClaim.stateHash);
				return { resource: existingClaim, dataHandles: createdHandles };
			}

			if (existingIntent !== null && (await deps.pathExists(intent.worktreePath))) {
				const recovered = await requireExactWorktree(deps, intent);
				const recoveredClaim: SupersAgentWorktreeClaim = SupersAgentWorktreeClaimSchema.parse({
					...intent,
					headSha: recovered.headSha,
					stateHash: recovered.stateHash
				});
				createdHandles.push(
					await context.writeResource('supers-agent-worktree-claim', claimName, recoveredClaim)
				);
				return { resource: recoveredClaim, dataHandles: createdHandles };
			}

			creationSnapshot ??= await requireStableCentralRevision(
				deps,
				canonicalRepositoryDir,
				args.baseRevision
			);
			await requireStableCentralRevision(
				deps,
				creationSnapshot.canonicalDir,
				creationSnapshot.headSha
			);
			const existingRecord = (await listWorktrees(deps, intent.repositoryDir)).find(
				(record) => record.path === intent.worktreePath
			);
			const pathAlreadyExists = await deps.pathExists(intent.worktreePath);
			const branchAlreadyExists = await branchExists(
				deps,
				intent.repositoryDir,
				intent.attachedBranch
			);
			if (existingRecord === undefined && (pathAlreadyExists || branchAlreadyExists)) {
				throw new Error(
					'deterministic worktree path or branch already exists with no recoverable worktree'
				);
			}
			if (existingRecord === undefined) {
				const addArgs = [
					'worktree',
					'add',
					'-b',
					intent.attachedBranch,
					intent.worktreePath,
					intent.baseRevision
				] as const;
				const addResult = await deps.runGit(intent.repositoryDir, addArgs, {
					stdoutBytes: MAX_GIT_PROTOCOL_BYTES,
					stderrBytes: MAX_GIT_ERROR_BYTES
				});
				if (!addResult.success) {
					const recovered = (await listWorktrees(deps, intent.repositoryDir)).find(
						(record) => record.path === intent.worktreePath
					);
					if (recovered === undefined) throw gitFailure(addArgs, addResult);
				}
			}

			await requireStableCentralRevision(
				deps,
				creationSnapshot.canonicalDir,
				creationSnapshot.headSha
			);
			const observed = await requireExactWorktree(deps, intent);
			const claim: SupersAgentWorktreeClaim = SupersAgentWorktreeClaimSchema.parse({
				...intent,
				headSha: observed.headSha,
				stateHash: observed.stateHash
			});
			createdHandles.push(
				await context.writeResource('supers-agent-worktree-claim', claimName, claim)
			);
			return { resource: claim, dataHandles: createdHandles };
		},

		async verifySupersAgentWorktreeUnchanged(argsInput, context) {
			const args = VerifySupersAgentWorktreeUnchangedArgsSchema.parse(argsInput);
			const claimName = `supers-agent-worktree-claim-${args.claimId}`;
			const claim = await readParsedResource(context, claimName, SupersAgentWorktreeClaimSchema);
			if (claim === null) {
				throw new Error(`worktree claim is missing: ${args.claimId}`);
			}
			await requireValidClaimIdentity(claim, deps);
			const receiptId = await createSupersAgentStableIdentityHash({
				schemaVersion: 1,
				claimId: claim.claimId,
				invocationId: claim.invocationId,
				headSha: claim.headSha,
				stateHash: claim.stateHash
			});
			const receiptName = `supers-agent-worktree-unchanged-${receiptId}`;
			const existingReceipt = await readParsedResource(
				context,
				receiptName,
				SupersAgentWorktreeUnchangedReceiptSchema
			);
			if (existingReceipt !== null) {
				requireExactResource(
					SupersAgentWorktreeUnchangedReceiptSchema,
					existingReceipt,
					expectedUnchangedReceipt(claim, receiptId, existingReceipt.verifiedAt),
					'worktree unchanged receipt'
				);
				return { resource: existingReceipt, dataHandles: [] };
			}

			const invocation = await readBoundFinalInvocation(context, claim);
			if (invocation === null) {
				throw new Error(`CLI-agent invocation resource is missing: invocation-${claim.invocationId}`);
			}
			if (!invocation.success || invocation.exitCode !== 0 || invocation.timedOut) {
				throw new Error('CLI-agent invocation did not finish successfully');
			}
			await requireExactWorktree(deps, claim, claim.stateHash);
			const receipt = expectedUnchangedReceipt(claim, receiptId, deps.now().toISOString());
			const handle = await context.writeResource(
				'supers-agent-worktree-unchanged',
				receiptName,
				receipt
			);
			return { resource: receipt, dataHandles: [handle] };
		},

		async verifySupersAgentWorktreeCommit(argsInput, context) {
			const args = VerifySupersAgentWorktreeCommitArgsSchema.parse(argsInput);
			if (args.invocationResourceName !== `invocation-${args.invocationId}`) {
				throw new Error('CLI-agent invocation resource name is not caller-owned');
			}
			const claim = await readParsedResource(
				context,
				`supers-agent-worktree-claim-${args.claimId}`,
				SupersAgentWorktreeClaimSchema
			);
			if (claim === null) {
				throw new Error(`worktree claim is missing: ${args.claimId}`);
			}
			await requireValidClaimIdentity(claim, deps);
			if (
				claim.claimId !== args.claimId ||
				claim.invocationId !== args.invocationId ||
				claim.baseRevision !== args.expectedBaseRevision ||
				JSON.stringify(args.expectedRepositoryExpectation) !==
					JSON.stringify({
						attachedBranch: claim.attachedBranch,
						headSha: claim.headSha,
						stateHash: claim.stateHash
					})
			) {
				throw new Error('commit verification arguments do not match the exact worktree claim');
			}
			if (args.objectiveProofNomination !== undefined) {
				requireObjectiveTestPath(args.objectiveProofNomination.testPath);
			}
			const receiptId = await createSupersAgentStableIdentityHash({
				schemaVersion: 1,
				...args
			});
			const receiptName = `supers-agent-worktree-commit-${receiptId}`;
			const existingReceipt = await readParsedResource(
				context,
				receiptName,
				SupersAgentWorktreeCommitReceiptSchema
			);
			if (existingReceipt !== null) {
				const existingBase: Record<string, unknown> = { ...existingReceipt };
				delete existingBase.fingerprint;
				if (existingReceipt.fingerprint !== (await createSupersAgentStableIdentityHash(existingBase))) {
					throw new Error('worktree commit receipt fingerprint mismatch');
				}
				const expectedExisting = {
					...existingReceipt,
					receiptId,
					claimId: claim.claimId,
					invocationModelId: args.invocationModelId,
					invocationResourceName: args.invocationResourceName,
					invocationId: args.invocationId,
					provider: args.expectedProvider,
					model: args.expectedModel,
					actor: args.expectedActor,
					promptDigest: args.expectedPromptDigest,
					purpose: claim.purpose,
					workItem: claim.workItem,
					worktreePath: claim.worktreePath,
					attachedBranch: claim.attachedBranch,
					baseRevision: args.expectedBaseRevision,
					commitRevision: args.expectedCommitRevision,
					...(args.objectiveProofNomination === undefined
						? {}
						: { objectiveProofNomination: args.objectiveProofNomination })
				};
				requireExactResource(
					SupersAgentWorktreeCommitReceiptSchema,
					existingReceipt,
					expectedExisting,
					'worktree commit receipt'
				);
				return { resource: existingReceipt, dataHandles: [] };
			}

			const invocationRaw = await context.readResource(args.invocationResourceName);
			if (invocationRaw === null) {
				throw new Error(`CLI-agent invocation resource is missing: ${args.invocationResourceName}`);
			}
			const invocation = CommittedInvocationResultSchema.parse(invocationRaw);
			if (
				invocation.invocationId !== args.invocationId ||
				invocation.provider !== args.expectedProvider ||
				invocation.model !== args.expectedModel ||
				invocation.promptHash !== args.expectedPromptDigest ||
				invocation.cwd !== claim.worktreePath ||
				!invocation.success ||
				invocation.exitCode !== 0 ||
				invocation.timedOut
			) {
				throw new Error('CLI-agent invocation does not match commit verification authority');
			}
			for (const [key, value] of Object.entries(claim.expectedInvocationTags)) {
				if ((invocation.tags ?? {})[key] !== value) {
					throw new Error(`CLI-agent invocation tag mismatch for ${key}`);
				}
			}
			const launchRaw = await context.readResource(`launch-claim-${args.invocationId}`);
			if (launchRaw === null) {
				throw new Error(`CLI-agent launch claim is missing: launch-claim-${args.invocationId}`);
			}
			const launch = CommittedInvocationLaunchSchema.parse(launchRaw);
			if (
				launch.invocationId !== args.invocationId ||
				launch.provider !== args.expectedProvider ||
				launch.model !== args.expectedModel ||
				launch.toolProfile !== args.expectedActor ||
				launch.promptHash !== args.expectedPromptDigest ||
				launch.definition.id !== args.invocationModelId ||
				launch.cwd !== claim.worktreePath ||
				JSON.stringify(launch.repositoryExpectation) !==
					JSON.stringify(args.expectedRepositoryExpectation)
			) {
				throw new Error('CLI-agent launch claim does not match commit verification authority');
			}
			for (const [key, value] of Object.entries(claim.expectedInvocationTags)) {
				if (launch.tags[key] !== value) {
					throw new Error(`CLI-agent launch claim tag mismatch for ${key}`);
				}
			}
			const evidence = await collectCommittedWorktreeEvidence(deps, claim, args);
			await requireCentralContainsRevision(
				deps,
				claim.repositoryDir,
				args.expectedBaseRevision
			);
			const finalEvidence = await collectCommittedWorktreeEvidence(deps, claim, args);
			if (JSON.stringify(finalEvidence) !== JSON.stringify(evidence)) {
				throw new Error('committed worktree evidence changed during verification');
			}
			const receipt: SupersAgentWorktreeCommitReceipt = {
				schemaVersion: 1,
				receiptId,
				claimId: claim.claimId,
				invocationModelId: args.invocationModelId,
				invocationResourceName: args.invocationResourceName,
				invocationId: args.invocationId,
				provider: args.expectedProvider,
				model: args.expectedModel,
				actor: args.expectedActor,
				promptDigest: args.expectedPromptDigest,
				purpose: claim.purpose,
				workItem: claim.workItem,
				worktreePath: claim.worktreePath,
				attachedBranch: claim.attachedBranch,
				baseRevision: args.expectedBaseRevision,
				commitRevision: args.expectedCommitRevision,
				...finalEvidence,
				...(args.objectiveProofNomination === undefined
					? {}
					: { objectiveProofNomination: args.objectiveProofNomination }),
				verifiedAt: deps.now().toISOString(),
				fingerprint: ''
			};
			const receiptBase: Record<string, unknown> = { ...receipt };
			delete receiptBase.fingerprint;
			receipt.fingerprint = await createSupersAgentStableIdentityHash(receiptBase);
			await requireCommittedCheckoutIdentity(deps, claim, args.expectedCommitRevision);
			const handle = await context.writeResource(
				'supers-agent-worktree-commit',
				receiptName,
				receipt
			);
			return { resource: receipt, dataHandles: [handle] };
		},

		async verifySupersAgentIntegration(argsInput, context) {
			const args = VerifySupersAgentIntegrationArgsSchema.parse(argsInput);
			if (
				args.commitReceiptName !==
				`supers-agent-worktree-commit-${args.expectedCommitReceiptId}`
			) {
				throw new Error('integration commit receipt name mismatch');
			}
			const commitReceipt = await readParsedResource(
				context,
				args.commitReceiptName,
				SupersAgentWorktreeCommitReceiptSchema
			);
			if (commitReceipt === null) throw new Error('integration commit receipt is missing');
			const recomputedCommitFingerprint = await createSupersAgentStableIdentityHash(
				withoutFingerprint(commitReceipt as unknown as Record<string, unknown>)
			);
			if (
				commitReceipt.receiptId !== args.expectedCommitReceiptId ||
				commitReceipt.fingerprint !== args.expectedCommitReceiptFingerprint ||
				commitReceipt.fingerprint !== recomputedCommitFingerprint ||
				args.rootEpicId !== args.activeTaskId ||
				commitReceipt.workItem !== args.activeTaskId ||
				commitReceipt.baseRevision !== args.expectedPreRevision
			) {
				throw new Error('integration commit receipt authority mismatch');
			}
			const cherryPick = await readExternalParsedResource(
				context,
				'@swamp/git',
				args.integrationGitModelId,
				args.cherryPickResourceName,
				GitCherryPickResultSchema
			);
			if (
				cherryPick.conflict ||
				cherryPick.aborted === true ||
				cherryPick.commits.length !== 1 ||
				cherryPick.commits[0] !== commitReceipt.commitRevision
			) {
				throw new Error('official Git cherry-pick receipt does not bind the exact child commit');
			}
			const cherryPickDigest = await createSupersAgentStableIdentityHash(cherryPick);
			const resourceSuffix = `${commitReceipt.workItem}-${args.expectedPostRevision}`;
			const intentName = `supers-agent-integration-intent-${resourceSuffix}`;
			const preparedAt = deps.now().toISOString();
			const proposedIntent: SupersAgentIntegrationIntent = {
				schemaVersion: 1,
				workItem: commitReceipt.workItem,
				commitReceiptName: args.commitReceiptName,
				commitReceiptId: commitReceipt.receiptId,
				commitReceiptFingerprint: commitReceipt.fingerprint,
				integrationGitModelId: args.integrationGitModelId,
				cherryPickResourceName: args.cherryPickResourceName,
				cherryPickDigest,
				rootEpicId: args.rootEpicId,
				activeTaskId: args.activeTaskId,
				expectedPreRevision: args.expectedPreRevision,
				expectedPostRevision: args.expectedPostRevision,
				preparedAt,
				fingerprint: ''
			};
			proposedIntent.fingerprint = await createSupersAgentStableIdentityHash(
				withoutFingerprint(proposedIntent as unknown as Record<string, unknown>)
			);
			const existingIntent = await readParsedResource(
				context,
				intentName,
				SupersAgentIntegrationIntentSchema
			);
			const intent = existingIntent ?? proposedIntent;
			if (existingIntent !== null) {
				const expectedExisting = {
					...proposedIntent,
					preparedAt: existingIntent.preparedAt,
					fingerprint: existingIntent.fingerprint
				};
				expectedExisting.fingerprint = await createSupersAgentStableIdentityHash(
					withoutFingerprint(expectedExisting as unknown as Record<string, unknown>)
				);
				requireExactResource(
					SupersAgentIntegrationIntentSchema,
					existingIntent,
					expectedExisting,
					'integration intent'
				);
			} else {
				await context.writeResource('supers-agent-integration-intent', intentName, intent);
			}

			await requireStableCentralRevision(
				deps,
				context.repoDir,
				args.expectedPostRevision
			);
			const parentFields = (
				await requiredGitOutput(
					deps,
					context.repoDir,
					['rev-list', '--parents', '-n', '1', args.expectedPostRevision],
					MAX_GIT_PROTOCOL_BYTES
				)
			).trim().split(' ');
			if (parentFields.length !== 2 || !SHA40_PATTERN.test(parentFields[1])) {
				throw new Error('integrated revision is not one exact single-parent serialized result');
			}
			const targetBaselineRevision = parentFields[1];
			const treeListing = await requiredGitBytes(
				deps,
				context.repoDir,
				['ls-tree', '--full-tree', '-r', '-z', args.expectedPostRevision],
				MAX_TREE_LISTING_BYTES
			);
			const integratedTreeFingerprint = await rawSha256(treeListing);
			const nameStatus = await requiredGitOutput(
				deps,
				context.repoDir,
				[
					'diff',
					'--name-status',
					'-z',
					targetBaselineRevision,
					args.expectedPostRevision,
					'--'
				],
				MAX_NAME_STATUS_BYTES
			);
			const fields = nameStatus.split('\0').filter(Boolean);
			if (fields.length === 0 || fields.length % 2 !== 0 || fields.length / 2 > MAX_CHANGED_PATHS) {
				throw new Error('integrated revision has invalid changed-path evidence');
			}
			const changedPaths: string[] = [];
			for (let index = 0; index < fields.length; index += 2) {
				if (fields[index] !== 'A' && fields[index] !== 'M') {
					throw new Error(`unsupported integrated path status: ${fields[index]}`);
				}
				requireSafeRepositoryPath(fields[index + 1]);
				changedPaths.push(fields[index + 1]);
			}
			changedPaths.sort();
			if (
				JSON.stringify(changedPaths) !== JSON.stringify(commitReceipt.changedPaths) ||
				(await createSupersAgentStableIdentityHash({ changedPaths })) !== commitReceipt.changedPathsDigest
			) {
				throw new Error('integrated changed paths differ from the verified child receipt');
			}
			const integratedDiff = await requiredGitBytes(
				deps,
				context.repoDir,
				[
					'diff',
					'--binary',
					'--full-index',
					targetBaselineRevision,
					args.expectedPostRevision,
					'--'
				],
				MAX_BINARY_DIFF_BYTES
			);
			const patchDigest = await rawSha256(integratedDiff);
			if (patchDigest !== commitReceipt.diffDigest) {
				throw new Error('integrated patch digest differs from the verified child receipt');
			}
			await requireStableCentralRevision(
				deps,
				context.repoDir,
				args.expectedPostRevision
			);

			const manifestName = `supers-agent-integration-handoff-${resourceSuffix}`;
			const manifest: SupersAgentIntegrationHandoffManifest = {
				schemaVersion: 1,
				authority: 'supers-agent-worktree-integration-v1',
				workItem: commitReceipt.workItem,
				rootEpicId: args.rootEpicId,
				activeTaskId: args.activeTaskId,
				commitReceiptName: args.commitReceiptName,
				commitReceiptId: commitReceipt.receiptId,
				commitReceiptFingerprint: commitReceipt.fingerprint,
				...(commitReceipt.objectiveProofNomination === undefined
					? {}
					: { objectiveProofNomination: commitReceipt.objectiveProofNomination }),
				baseRevision: args.expectedPreRevision,
				childCommitRevision: commitReceipt.commitRevision,
				integratedRevision: args.expectedPostRevision,
				changedPaths,
				patchDigest,
				integratedTreeFingerprint,
				verifiedAt: intent.preparedAt,
				fingerprint: ''
			};
			manifest.fingerprint = await createSupersAgentStableIdentityHash(
				withoutFingerprint(manifest as unknown as Record<string, unknown>)
			);
			const receiptBase = {
				schemaVersion: 1 as const,
				rootEpicId: args.rootEpicId,
				activeTaskId: args.activeTaskId,
				factoryName: 'supers-delivery',
				handoffManifestDigest: manifest.fingerprint,
				targetBaselineRevision,
				childRevisionEvidence: {
					status: 'verified' as const,
					childCommittedRevision: commitReceipt.commitRevision
				},
				disposition: 'integrated' as const,
				baseCommit: args.expectedPreRevision,
				patchDigest,
				changedPaths,
				integratedRevision: args.expectedPostRevision,
				integratedTreeFingerprint,
				rejectionReason: 'none' as const
			};
			const receiptId = await createSupersDeterministicContractHash(receiptBase);
			const receipt = await verifySupersFactoryIntegrationReceipt({
				...receiptBase,
				receiptId
			});
			const receiptName = `supers-agent-integration-${resourceSuffix}`;
			const existingManifest = await readParsedResource(
				context,
				manifestName,
				SupersAgentIntegrationHandoffManifestSchema
			);
			const existingReceipt = await readParsedResource(
				context,
				receiptName,
				SupersFactoryIntegrationReceiptSchema
			);
			if (existingReceipt !== null && existingManifest === null) {
				throw new Error('integration receipt exists without its handoff manifest');
			}
			if (existingManifest !== null) {
				requireExactResource(
					SupersAgentIntegrationHandoffManifestSchema,
					existingManifest,
					manifest,
					'integration handoff manifest'
				);
			}
			if (existingReceipt !== null) {
				requireExactResource(
					SupersFactoryIntegrationReceiptSchema,
					existingReceipt,
					receipt,
					'integration receipt'
				);
				return { resource: existingReceipt, dataHandles: [] };
			}
			const createdHandles: Array<{ name: string }> = [];
			if (existingManifest === null) {
				createdHandles.push(
					await context.writeResource(
						'supers-agent-integration-handoff',
						manifestName,
						manifest
					)
				);
			}
			createdHandles.push(
				await context.writeResource('supers-agent-integration', receiptName, receipt)
			);
			return { resource: receipt, dataHandles: createdHandles };
		},

		async removeSupersAgentWorktree(argsInput, context) {
			const args = RemoveSupersAgentWorktreeArgsSchema.parse(argsInput);
			const claim = await readParsedResource(
				context,
				`supers-agent-worktree-claim-${args.claimId}`,
				SupersAgentWorktreeClaimSchema
			);
			if (claim === null) {
				throw new Error(`worktree claim is missing: ${args.claimId}`);
			}
			await requireValidClaimIdentity(claim, deps);
			const authorization = args.authorization ?? { kind: 'unchanged' as const };
			let authorizationReceiptId: string;
			let committedAuthorization:
				| { receipt: SupersAgentWorktreeCommitReceipt; verifyArgs: VerifySupersAgentWorktreeCommitArgs }
				| null = null;
			let supersededAuthorization: SupersAgentSupersededWorktreeReceipt | null = null;
			if (authorization.kind === 'unchanged') {
				authorizationReceiptId = await createSupersAgentStableIdentityHash({
					schemaVersion: 1,
					claimId: claim.claimId,
					invocationId: claim.invocationId,
					headSha: claim.headSha,
					stateHash: claim.stateHash
				});
				const unchanged = await readParsedResource(
					context,
					`supers-agent-worktree-unchanged-${authorizationReceiptId}`,
					SupersAgentWorktreeUnchangedReceiptSchema
				);
				if (unchanged === null) {
					throw new Error('an exact unchanged receipt is required before worktree removal');
				}
				requireExactResource(
					SupersAgentWorktreeUnchangedReceiptSchema,
					unchanged,
					expectedUnchangedReceipt(claim, authorizationReceiptId, unchanged.verifiedAt),
					'worktree unchanged receipt'
				);
			} else if (authorization.kind === 'committed') {
				authorizationReceiptId = authorization.receiptId;
				if (authorization.receiptName !== `supers-agent-worktree-commit-${authorization.receiptId}`) {
					throw new Error('committed cleanup authorization resource name mismatch');
				}
				const committed = await readParsedResource(
					context,
					authorization.receiptName,
					SupersAgentWorktreeCommitReceiptSchema
				);
				if (committed === null) {
					throw new Error('exact committed worktree receipt is required before removal');
				}
				const committedBase: Record<string, unknown> = { ...committed };
				delete committedBase.fingerprint;
				if (
					committed.receiptId !== authorization.receiptId ||
					committed.fingerprint !== authorization.fingerprint ||
					committed.fingerprint !== (await createSupersAgentStableIdentityHash(committedBase)) ||
					committed.claimId !== claim.claimId ||
					committed.invocationId !== claim.invocationId ||
					committed.worktreePath !== claim.worktreePath ||
					committed.attachedBranch !== claim.attachedBranch ||
					committed.baseRevision !== claim.baseRevision
				) {
					throw new Error('committed cleanup authorization conflicts with the exact worktree claim');
				}
				committedAuthorization = {
					receipt: committed,
					verifyArgs: {
						claimId: claim.claimId,
						invocationModelId: committed.invocationModelId,
						invocationResourceName: committed.invocationResourceName,
						invocationId: committed.invocationId,
						expectedProvider: committed.provider,
						expectedModel: committed.model,
						expectedActor: committed.actor,
						expectedRepositoryExpectation: {
							attachedBranch: claim.attachedBranch,
							headSha: claim.headSha,
							stateHash: claim.stateHash
						},
						expectedPromptDigest: committed.promptDigest,
						expectedBaseRevision: committed.baseRevision,
						expectedCommitRevision: committed.commitRevision,
						...(committed.objectiveProofNomination === undefined
							? {}
							: { objectiveProofNomination: committed.objectiveProofNomination })
					}
				};
			} else {
				supersededAuthorization = await verifySupersededWorktreeCleanup(
					deps,
					context,
					claim,
					authorization.centralRevision
				);
				authorizationReceiptId = supersededAuthorization.fingerprint;
			}
			if (authorization.kind === 'unchanged') {
				const legacyReceiptId = await createSupersAgentStableIdentityHash({
					schemaVersion: 1,
					claimId: claim.claimId,
					unchangedReceiptId: authorizationReceiptId,
					worktreePath: claim.worktreePath
				});
				const legacyReceipt = await readParsedResource(
					context,
					`supers-agent-worktree-removal-${legacyReceiptId}`,
					SupersAgentWorktreeRemovalReceiptSchema
				);
				if (legacyReceipt !== null) {
					requireExactResource(
						SupersAgentWorktreeRemovalReceiptSchema,
						legacyReceipt,
						{
							schemaVersion: 1,
							claimId: claim.claimId,
							receiptId: legacyReceiptId,
							worktreePath: claim.worktreePath,
							attachedBranch: claim.attachedBranch,
							requestedAt: legacyReceipt.requestedAt,
							removed: true,
							removedAt: legacyReceipt.removedAt
						},
						'legacy worktree removal receipt'
					);
					return { resource: legacyReceipt, dataHandles: [] };
				}
			}
			const receiptId = await createSupersAgentStableIdentityHash({
				schemaVersion: 1,
				claimId: claim.claimId,
				authorizationKind: authorization.kind,
				authorizationReceiptId,
				worktreePath: claim.worktreePath
			});
			const receiptName = `supers-agent-worktree-removal-${receiptId}`;
			const existingReceipt = await readParsedResource(
				context,
				receiptName,
				SupersAgentWorktreeRemovalReceiptSchema
			);
			if (existingReceipt !== null) {
				const expectedExistingReceipt: SupersAgentWorktreeRemovalReceipt = {
					schemaVersion: 1,
					claimId: claim.claimId,
					receiptId,
					worktreePath: claim.worktreePath,
					attachedBranch: claim.attachedBranch,
					authorizationKind: authorization.kind,
					authorizationReceiptId,
					requestedAt: existingReceipt.requestedAt,
					removed: true,
					removedAt: existingReceipt.removedAt
				};
				requireExactResource(
					SupersAgentWorktreeRemovalReceiptSchema,
					existingReceipt,
					expectedExistingReceipt,
					'worktree removal receipt'
				);
				return { resource: existingReceipt, dataHandles: [] };
			}
			const intentName = `supers-agent-worktree-removal-intent-${receiptId}`;
			const proposedIntent: SupersAgentWorktreeRemovalIntent = {
				schemaVersion: 1,
				claimId: claim.claimId,
				receiptId,
				worktreePath: claim.worktreePath,
				attachedBranch: claim.attachedBranch,
				authorizationKind: authorization.kind,
				authorizationReceiptId,
				requestedAt: deps.now().toISOString()
			};
			const existingIntent = await readParsedResource(
				context,
				intentName,
				SupersAgentWorktreeRemovalIntentSchema
			);
			if (existingIntent !== null) {
				requireExactResource(
					SupersAgentWorktreeRemovalIntentSchema,
					existingIntent,
					{ ...proposedIntent, requestedAt: existingIntent.requestedAt },
					'worktree removal intent'
				);
			}

			const ownedRoot = parentDirectory(claim.worktreePath);
			const quarantinePath = `${ownedRoot === '/' ? '' : ownedRoot}/.supers-agent-quarantine-${receiptId}`;
			if (!isContainedPath(ownedRoot, quarantinePath)) {
				throw new Error('worktree quarantine path escapes its owned root');
			}
			const originalExists = await deps.pathExists(claim.worktreePath);
			const quarantineExists = await deps.pathExists(quarantinePath);
			const matchingRegistration = (await listWorktrees(deps, claim.repositoryDir)).find(
				(candidate) =>
					candidate.path === claim.worktreePath ||
					candidate.attachedBranch === claim.attachedBranch
			);
			if (existingIntent === null && !originalExists && supersededAuthorization === null) {
				throw new Error('cannot begin worktree removal because the claimed worktree is absent');
			}
			if (existingIntent === null && quarantineExists) {
				throw new Error('cannot begin worktree removal from an ambiguous quarantine state');
			}
			if (
				!originalExists &&
				matchingRegistration !== undefined &&
				supersededAuthorization !== null
			) {
				const expectedSupersededHead = supersededAuthorization.worktreeHead;
				const registrationMatchesOriginal =
					matchingRegistration.path === claim.worktreePath &&
					matchingRegistration.attachedBranch === claim.attachedBranch &&
					matchingRegistration.headSha === expectedSupersededHead;
				const registrationMatchesQuarantine =
					quarantineExists &&
					matchingRegistration.path === quarantinePath &&
					matchingRegistration.attachedBranch === claim.attachedBranch &&
					matchingRegistration.headSha === expectedSupersededHead;
				if (!registrationMatchesOriginal && !registrationMatchesQuarantine) {
					throw new Error('stale worktree registration conflicts with superseded cleanup evidence');
				}
			}
			if (originalExists && !quarantineExists) {
				if (committedAuthorization !== null) {
					const observed = await collectCommittedWorktreeEvidence(
						deps,
						claim,
						committedAuthorization.verifyArgs
					);
					const committed = committedAuthorization.receipt;
					if (
						observed.commitTree !== committed.commitTree ||
						observed.treeDigest !== committed.treeDigest ||
						observed.changedPathsDigest !== committed.changedPathsDigest ||
						observed.diffDigest !== committed.diffDigest ||
						JSON.stringify(observed.changedPaths) !== JSON.stringify(committed.changedPaths)
					) {
						throw new Error('committed worktree no longer matches its cleanup authorization');
					}
				} else if (supersededAuthorization !== null) {
					const observed = await observeClaimedWorktree(deps, claim);
					if (
						observed === null ||
						observed.presence !== 'present' ||
						observed.dirty ||
						observed.headSha !== supersededAuthorization.worktreeHead
					) {
						throw new Error('worktree changed after superseded cleanup verification');
					}
					await requireStableCentralRepository(
						deps,
						claim.repositoryDir,
						supersededAuthorization.centralRevision
					);
				} else {
					await requireExactWorktree(deps, claim, claim.stateHash);
				}
			}
			const intent = existingIntent ?? proposedIntent;
			if (existingIntent === null) {
				await context.writeResource('supers-agent-worktree-removal-intent', intentName, intent);
			}

			const removalAlreadyApplied =
				existingIntent !== null &&
				!originalExists &&
				!quarantineExists &&
				(supersededAuthorization === null || matchingRegistration === undefined);
			if (!removalAlreadyApplied) {
				if (!originalExists && !quarantineExists) {
					const removeMissingArgs = [
						'worktree',
						'remove',
						'--force',
						'--',
						claim.worktreePath
					] as const;
					const removeMissingResult = await deps.runGit(
						claim.repositoryDir,
						removeMissingArgs,
						{
							stdoutBytes: MAX_GIT_PROTOCOL_BYTES,
							stderrBytes: MAX_GIT_ERROR_BYTES
						}
					);
					if (!removeMissingResult.success) {
						throw gitFailure(removeMissingArgs, removeMissingResult);
					}
				} else {
					if (!quarantineExists) {
						await deps.rename(claim.worktreePath, quarantinePath);
					}
					if (!(await deps.pathExists(quarantinePath))) {
						throw new Error('exact worktree quarantine is absent after atomic rename');
					}
					const repairArgs = ['worktree', 'repair', quarantinePath] as const;
					const repairResult = await deps.runGit(claim.repositoryDir, repairArgs, {
						stdoutBytes: MAX_GIT_PROTOCOL_BYTES,
						stderrBytes: MAX_GIT_ERROR_BYTES
					});
					if (!repairResult.success) throw gitFailure(repairArgs, repairResult);
					const quarantineRecord = (await listWorktrees(deps, claim.repositoryDir)).find(
						(candidate) => candidate.path === quarantinePath
					);
					const expectedHead =
						committedAuthorization?.receipt.commitRevision ??
						supersededAuthorization?.worktreeHead ??
						claim.headSha;
					if (
						quarantineRecord === undefined ||
						quarantineRecord.attachedBranch !== claim.attachedBranch ||
						quarantineRecord.headSha !== expectedHead
					) {
						throw new Error('Git registration does not match the exact quarantined worktree');
					}
					const removeArgs = ['worktree', 'remove', '--', quarantinePath] as const;
					const removeResult = await deps.runGit(claim.repositoryDir, removeArgs, {
						stdoutBytes: MAX_GIT_PROTOCOL_BYTES,
						stderrBytes: MAX_GIT_ERROR_BYTES
					});
					if (!removeResult.success && (await deps.pathExists(quarantinePath))) {
						throw gitFailure(removeArgs, removeResult);
					}
				}
			}
			if (await deps.pathExists(quarantinePath)) {
				throw new Error('quarantined worktree still exists after exact removal');
			}
			const remaining = await listWorktrees(deps, claim.repositoryDir);
			if (
				remaining.some(
					(candidate) =>
						candidate.path === quarantinePath ||
						candidate.attachedBranch === claim.attachedBranch
				)
			) {
				throw new Error('worktree path or branch remains registered after removal');
			}
			const receipt: SupersAgentWorktreeRemovalReceipt = {
				...intent,
				removed: true,
				removedAt: deps.now().toISOString()
			};
			const handle = await context.writeResource(
				'supers-agent-worktree-removal',
				receiptName,
				receipt
			);
			return { resource: receipt, dataHandles: [handle] };
		},

		async reconcileSupersAgentWorktrees(argsInput, context) {
			const args = ReconcileSupersAgentWorktreesArgsSchema.parse(argsInput);
			const repositoryDir = await deps.realPath(context.repoDir);
			const centralRevision = (
				await requiredGitOutput(
					deps,
					repositoryDir,
					['rev-parse', '--verify', 'HEAD^{commit}'],
					MAX_GIT_PROTOCOL_BYTES
				)
			).trim();
			await requireStableCentralRepository(deps, repositoryDir, centralRevision);
			const reconciledAt = deps.now().toISOString();
			const reconciledAtMs = Date.parse(reconciledAt);
			const items: SupersAgentWorktreeReconciliationItem[] = [];

			for (const claimId of [...args.claimIds].sort()) {
				const claim = await readParsedResource(
					context,
					`supers-agent-worktree-claim-${claimId}`,
					SupersAgentWorktreeClaimSchema
				);
				if (claim === null) throw new Error(`worktree claim is missing: ${claimId}`);
				await requireValidClaimIdentity(claim, deps);
				const observed = await observeClaimedWorktree(deps, claim);
				const measurement =
					observed?.presence === 'present'
						? await deps.measureDirectory(claim.worktreePath)
						: { logicalBytes: 0, complete: true };
				const invocation =
					observed === null ? null : await readBoundFinalInvocation(context, claim);
				const invocationState = getSupersAgentInvocationState(invocation);
				const ageMs = Math.max(0, reconciledAtMs - Date.parse(claim.preparedAt));
				const itemBase = {
					claimId: claim.claimId,
					workItem: claim.workItem,
					invocationId: claim.invocationId,
					worktreePath: claim.worktreePath,
					attachedBranch: claim.attachedBranch,
					preparedAt: claim.preparedAt,
					ageMs,
					invocationState,
					...(observed === null ? {} : { observedHead: observed.headSha }),
					logicalBytes: measurement.logicalBytes,
					sizeComplete: measurement.complete
				};
				if (observed === null) {
					items.push({ ...itemBase, disposition: 'absent' });
					continue;
				}
				if (invocation === null && ageMs < ABANDONED_WORKTREE_MIN_AGE_MS) {
					items.push({ ...itemBase, disposition: 'preserved-active' });
					continue;
				}
				if (observed.dirty) {
					items.push({ ...itemBase, disposition: 'preserved-dirty' });
					continue;
				}
				const history = await classifySupersAgentCleanupHistory(
					deps,
					claim,
					observed.headSha,
					centralRevision
				);
				if (history === 'unique-commits') {
					items.push({ ...itemBase, disposition: 'preserved-unique-commits' });
					continue;
				}
				if (history === 'unsafe-history') {
					items.push({ ...itemBase, disposition: 'preserved-unsafe-history' });
					continue;
				}
				await operations.removeSupersAgentWorktree(
					{
						claimId: claim.claimId,
						authorization: { kind: 'superseded', centralRevision }
					},
					context
				);
				items.push({
					...itemBase,
					disposition: getRemovedWorktreeDisposition(observed, history)
				});
			}

			await requireStableCentralRepository(deps, repositoryDir, centralRevision);
			const receiptCore = {
				schemaVersion: 1 as const,
				repositoryDir,
				centralRevision,
				items,
				removedCount: items.filter((item) => item.disposition.startsWith('removed-')).length,
				preservedCount: items.filter((item) => item.disposition.startsWith('preserved-')).length,
				absentCount: items.filter((item) => item.disposition === 'absent').length,
				logicalBytesBefore: sumWorktreeLogicalBytes(items),
				reconciledAt
			};
			const reconciliationId = await createSupersAgentStableIdentityHash(receiptCore);
			const receiptBase = { ...receiptCore, reconciliationId };
			const receipt: SupersAgentWorktreeReconciliationReceipt = {
				...receiptBase,
				fingerprint: await createSupersAgentStableIdentityHash(receiptBase)
			};
			const handle = await context.writeResource(
				'supers-agent-worktree-reconciliation',
				'supers-agent-worktree-reconciliation-latest',
				receipt
			);
			return { resource: receipt, dataHandles: [handle] };
		}
	};
	return operations;
}

const GIT_PROCESS_GROUP_WRAPPER =
	'import os,sys; os.setsid(); os.execvp("git", ["git", *sys.argv[1:]])';

async function readBoundedStream(
	stream: ReadableStream<Uint8Array>,
	maxBytes: number,
	onOverflow: () => void,
	label: string
): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.length;
			if (total > maxBytes) {
				onOverflow();
				throw new Error(`${label} exceeds the ${maxBytes}-byte safety limit`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
}

export async function runBoundedSupersGitCommand(
	cwd: string,
	args: readonly string[],
	limits: SupersAgentGitOutputLimits
): Promise<SupersAgentGitResult> {
	const child = new Deno.Command('/usr/bin/python3', {
		cwd,
		args: ['-c', GIT_PROCESS_GROUP_WRAPPER, ...args],
		stdin: 'null',
		stdout: 'piped',
		stderr: 'piped'
	}).spawn();
	let killed = false;
	const killGroup = (): void => {
		if (killed) return;
		killed = true;
		try {
			Deno.kill(-child.pid, 'SIGKILL');
		} catch {
			try {
				child.kill('SIGKILL');
			} catch {
				// The bounded command may exit between observation and termination.
			}
		}
	};
	try {
		const [stdout, stderr, status] = await Promise.all([
			readBoundedStream(child.stdout, limits.stdoutBytes, killGroup, 'git stdout'),
			readBoundedStream(child.stderr, limits.stderrBytes, killGroup, 'git stderr'),
			child.status
		]);
		return { success: status.success, code: status.code, stdout, stderr };
	} catch (error) {
		killGroup();
		await child.status.catch(() => undefined);
		throw error;
	}
}

async function resolveSupersAgentWorktreeRoot(repositoryDir: string): Promise<string> {
	const temporaryRoot = await Deno.realPath(Deno.env.get('TMPDIR') ?? '/tmp');
	const repositoryPathHash = (await rawSha256(encoder.encode(repositoryDir))).slice(0, 12);
	const managedRoot = `${temporaryRoot}/supers-agent-worktrees/${baseName(repositoryDir)}-${repositoryPathHash}`;
	await Deno.mkdir(managedRoot, { recursive: true, mode: 0o700 });
	return await Deno.realPath(managedRoot);
}

async function measureSupersAgentDirectory(
	root: string
): Promise<{ logicalBytes: number; complete: boolean }> {
	const pending = [root];
	let logicalBytes = 0;
	let entryCount = 0;
	while (pending.length > 0) {
		const directory = pending.pop();
		if (directory === undefined) break;
		let entries: Deno.DirEntry[];
		try {
			entries = [];
			for await (const entry of Deno.readDir(directory)) entries.push(entry);
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) return { logicalBytes, complete: false };
			throw error;
		}
		for (const entry of entries) {
			entryCount += 1;
			if (entryCount > MAX_DIRECTORY_MEASUREMENT_ENTRIES) {
				return { logicalBytes, complete: false };
			}
			const path = `${directory}/${entry.name}`;
			let info: Deno.FileInfo;
			try {
				info = await Deno.lstat(path);
			} catch (error) {
				if (error instanceof Deno.errors.NotFound) return { logicalBytes, complete: false };
				throw error;
			}
			if (info.isSymlink) continue;
			if (info.isDirectory) {
				pending.push(path);
				continue;
			}
			if (!info.isFile) continue;
			logicalBytes += info.size;
			if (!Number.isSafeInteger(logicalBytes)) {
				throw new Error('agent worktree logical size exceeds the safe integer range');
			}
		}
	}
	return { logicalBytes, complete: true };
}

const defaultDependencies: SupersAgentWorktreeDependencies = {
	runGit: runBoundedSupersGitCommand,
	realPath: (path) => Deno.realPath(path),
	resolveWorktreeRoot: resolveSupersAgentWorktreeRoot,
	measureDirectory: measureSupersAgentDirectory,
	async pathExists(path) {
		try {
			await Deno.lstat(path);
			return true;
		} catch (error) {
			if (error instanceof Deno.errors.NotFound) return false;
			throw error;
		}
	},
	async fileInfo(path) {
		const info = await Deno.lstat(path);
		return { isFile: info.isFile, isSymlink: info.isSymlink, size: info.size };
	},
	readFile: (path) => Deno.readFile(path),
	rename: (from, to) => Deno.rename(from, to),
	now: () => new Date()
};

const operations = createSupersAgentWorktreeOperations(defaultDependencies);

// Swamp applies numeric garbageCollection per named artifact version history. Each
// invocation-keyed artifact below is immutable and written once, so retaining one
// infinite-lifetime version preserves every binding beyond CLI-agent's 30d records;
// old invocation IDs therefore remain permanently unavailable for reuse.
const IMMUTABLE_INVOCATION_RESOURCE_VERSIONS = 1;
const WORKTREE_RECONCILIATION_RESOURCE_VERSIONS = 32;

const CliAgentInjectedGlobalArgsSchema = z.object({
	defaultProvider: z.unknown(),
	defaultModel: z.unknown(),
	defaultToolProfile: z.unknown(),
	commandsDir: z.unknown(),
	commandSubdirs: z.unknown(),
	claudePath: z.unknown(),
	opencodePath: z.unknown(),
	ampPath: z.unknown(),
	geminiPath: z.unknown(),
	codexPath: z.unknown(),
	grokPath: z.unknown(),
	piPath: z.unknown(),
	idleTimeoutMs: z.unknown(),
	wallTimeoutMs: z.unknown(),
	maxRetries: z.unknown(),
	sandboxMode: z.unknown(),
	sandboxRequired: z.unknown(),
	sandboxNetwork: z.unknown(),
	sandboxCredentialAccess: z.unknown()
});

type CliAgentInjectedGlobalArgs = z.infer<typeof CliAgentInjectedGlobalArgsSchema>;

function stripCliAgentInjectedGlobals(
	args: Record<string, unknown> & CliAgentInjectedGlobalArgs
): Record<string, unknown> {
	const copy: Record<string, unknown> = { ...args };
	for (const key of Object.keys(CliAgentInjectedGlobalArgsSchema.shape)) {
		delete copy[key];
	}
	return copy;
}

export const extension = {
	type: '@mgreten/cli-agent',
	resources: {
		'supers-agent-worktree-binding': {
			description:
				'Invocation-keyed immutable binding that prevents one CLI-agent invocation from preparing multiple worktrees.',
			schema: SupersAgentWorktreeBindingSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-intent': {
			description:
				'Caller-owned, content-addressed intent written before isolated worktree creation.',
			schema: SupersAgentWorktreeIntentSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-claim': {
			description:
				'Exact repositoryExpectation-compatible identity of an isolated Supers agent worktree.',
			schema: SupersAgentWorktreeClaimSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-unchanged': {
			description:
				'Normalized proof that a successful CLI-agent invocation left its claimed worktree unchanged.',
			schema: SupersAgentWorktreeUnchangedReceiptSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-commit': {
			description:
				'Pre-integration proof of one exact clean committed agent worktree and its non-executable objective-test nomination.',
			schema: SupersAgentWorktreeCommitReceiptSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-integration-intent': {
			description:
				'Crash-recoverable authority binding an exact verified child commit to one official Git cherry-pick receipt.',
			schema: SupersAgentIntegrationIntentSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-integration-handoff': {
			description:
				'Deterministic handoff manifest derived from verified Git evidence without agent prose authority.',
			schema: SupersAgentIntegrationHandoffManifestSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-integration': {
			description:
				'Strict Factory-compatible receipt proving one serialized integration into the central checkout.',
			schema: SupersFactoryIntegrationReceiptSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-superseded': {
			description:
				'Immutable proof that a final agent worktree is unchanged or fully represented by the central revision.',
			schema: SupersAgentSupersededWorktreeReceiptSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-removal-intent': {
			description:
				'Crash-recoverable intent to remove only one exact verified Supers agent worktree.',
			schema: SupersAgentWorktreeRemovalIntentSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-removal': {
			description:
				'Replay-safe receipt proving the exact verified Supers agent worktree was removed.',
			schema: SupersAgentWorktreeRemovalReceiptSchema,
			lifetime: 'infinite',
			garbageCollection: IMMUTABLE_INVOCATION_RESOURCE_VERSIONS
		},
		'supers-agent-worktree-reconciliation': {
			description:
				'Bounded inventory and cleanup result for all requested Supers agent worktree claims.',
			schema: SupersAgentWorktreeReconciliationReceiptSchema,
			lifetime: 'infinite',
			garbageCollection: WORKTREE_RECONCILIATION_RESOURCE_VERSIONS
		}
	},
	methods: [
		{
			prepareSupersAgentWorktree: {
				description:
					'Prepare or recover one deterministic isolated worktree from a stable exact HEAD without reading unrelated working files.',
				arguments: PrepareSupersAgentWorktreeArgsSchema.extend(CliAgentInjectedGlobalArgsSchema.shape),
				execute: async (
					args: PrepareSupersAgentWorktreeArgs & z.infer<typeof CliAgentInjectedGlobalArgsSchema>,
					context: SupersAgentWorktreeMethodContext
				) => {
					const result = await operations.prepareSupersAgentWorktree(
						PrepareSupersAgentWorktreeArgsSchema.parse(stripCliAgentInjectedGlobals(args)),
						context
					);
					return { dataHandles: result.dataHandles };
				}
			}
		},
		{
			verifySupersAgentWorktreeUnchanged: {
				description:
					'Bind a successful exact CLI-agent invocation to an unchanged isolated worktree.',
				arguments: VerifySupersAgentWorktreeUnchangedArgsSchema.extend(CliAgentInjectedGlobalArgsSchema.shape),
				execute: async (
					args: VerifySupersAgentWorktreeUnchangedArgs & z.infer<typeof CliAgentInjectedGlobalArgsSchema>,
					context: SupersAgentWorktreeMethodContext
				) => {
					const result = await operations.verifySupersAgentWorktreeUnchanged(
						VerifySupersAgentWorktreeUnchangedArgsSchema.parse(stripCliAgentInjectedGlobals(args)),
						context
					);
					return { dataHandles: result.dataHandles };
				}
			}
		},
		{
			verifySupersAgentWorktreeCommit: {
				description:
					'Verify one exact clean committed agent worktree without integrating or executing nominated tests.',
				arguments: VerifySupersAgentWorktreeCommitArgsSchema.extend(CliAgentInjectedGlobalArgsSchema.shape),
				execute: async (
					args: VerifySupersAgentWorktreeCommitArgs & z.infer<typeof CliAgentInjectedGlobalArgsSchema>,
					context: SupersAgentWorktreeMethodContext
				) => {
					const result = await operations.verifySupersAgentWorktreeCommit(
						VerifySupersAgentWorktreeCommitArgsSchema.parse(stripCliAgentInjectedGlobals(args)),
						context
					);
					return { dataHandles: result.dataHandles };
				}
			}
		},
		{
			verifySupersAgentIntegration: {
				description:
					'Verify the exact serialized result of an official Git cherry-pick and persist Factory integration evidence.',
				arguments: VerifySupersAgentIntegrationArgsSchema.extend(CliAgentInjectedGlobalArgsSchema.shape),
				execute: async (
					args: VerifySupersAgentIntegrationArgs & z.infer<typeof CliAgentInjectedGlobalArgsSchema>,
					context: SupersAgentWorktreeMethodContext
				) => {
					const result = await operations.verifySupersAgentIntegration(
						VerifySupersAgentIntegrationArgsSchema.parse(stripCliAgentInjectedGlobals(args)),
						context
					);
					return { dataHandles: result.dataHandles };
				}
			}
		},
		{
			removeSupersAgentWorktree: {
				description:
					'Remove only an exactly authorized unchanged, committed, or superseded worktree and persist a replay-safe removal receipt.',
				arguments: RemoveSupersAgentWorktreeArgsSchema.extend(CliAgentInjectedGlobalArgsSchema.shape),
				execute: async (
					args: RemoveSupersAgentWorktreeArgs & z.infer<typeof CliAgentInjectedGlobalArgsSchema>,
					context: SupersAgentWorktreeMethodContext
				) => {
					const result = await operations.removeSupersAgentWorktree(
						RemoveSupersAgentWorktreeArgsSchema.parse(stripCliAgentInjectedGlobals(args)),
						context
					);
					return { dataHandles: result.dataHandles };
				}
			}
		},
		{
			reconcileSupersAgentWorktrees: {
				description:
					'Inventory requested worktree claims, remove only final safe leftovers, and preserve active, dirty, unique, or unsafe work.',
				arguments: ReconcileSupersAgentWorktreesArgsSchema.extend(
					CliAgentInjectedGlobalArgsSchema.shape
				),
				execute: async (
					args: ReconcileSupersAgentWorktreesArgs &
						z.infer<typeof CliAgentInjectedGlobalArgsSchema>,
					context: SupersAgentWorktreeMethodContext
				) => {
					const result = await operations.reconcileSupersAgentWorktrees(
						ReconcileSupersAgentWorktreesArgsSchema.parse(
							stripCliAgentInjectedGlobals(args)
						),
						context
					);
					return { dataHandles: result.dataHandles };
				}
			}
		}
	]
};
