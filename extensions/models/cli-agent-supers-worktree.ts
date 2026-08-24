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
		.strict()
]);

export const RemoveSupersAgentWorktreeArgsSchema = z
	.object({
		claimId: z.string().regex(SHA64_PATTERN),
		authorization: SupersAgentWorktreeRemovalAuthorizationSchema.optional()
	})
	.strict();
export type RemoveSupersAgentWorktreeArgs = z.infer<typeof RemoveSupersAgentWorktreeArgsSchema>;

export const SupersAgentWorktreeRemovalIntentSchema = z
	.object({
		schemaVersion: z.literal(1),
		claimId: z.string().regex(SHA64_PATTERN),
		receiptId: z.string().regex(SHA64_PATTERN),
		worktreePath: z.string().min(1),
		attachedBranch: z.string().min(1),
		authorizationKind: z.enum(['unchanged', 'committed']).optional(),
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

async function requireCleanStableCentralRepository(
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
	const firstHead = (
		await requiredGitOutput(
			deps,
			canonicalDir,
			['rev-parse', '--verify', 'HEAD^{commit}'],
			MAX_GIT_PROTOCOL_BYTES
		)
	).trim();
	if (firstHead !== baseRevision) {
		throw new Error(`central repository HEAD mismatch: expected ${baseRevision}, got ${firstHead}`);
	}
	const status = await requiredGitOutput(
		deps,
		canonicalDir,
		['status', '--porcelain=v1', '--untracked-files=all', '-z'],
		MAX_NAME_STATUS_BYTES
	);
	if (status.length !== 0) {
		throw new Error('central repository must be clean before preparing an agent worktree');
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

function parentDirectory(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash <= 0 ? '/' : path.slice(0, slash);
}

function baseName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1) || 'repository';
}

async function createBinding(
	args: PrepareSupersAgentWorktreeArgs,
	repositoryDir: string
): Promise<SupersAgentWorktreeBinding> {
	const claimId = await createSupersAgentStableIdentityHash({
		schemaVersion: 1,
		invocationId: args.invocationId,
		baseRevision: args.baseRevision,
		purpose: args.purpose,
		workItem: args.workItem,
		repositoryDir
	});
	const suffix = claimId.slice(0, 20);
	const parent = parentDirectory(repositoryDir);
	const siblingName = `${baseName(repositoryDir)}-supers-agent-${suffix}`;
	const worktreePath = parent === '/' ? `/${siblingName}` : `${parent}/${siblingName}`;
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

function createIntent(
	binding: SupersAgentWorktreeBinding,
	preparedAt: string
): SupersAgentWorktreeIntent {
	return { ...binding, preparedAt };
}

async function requireValidClaimIdentity(claim: SupersAgentWorktreeClaim): Promise<void> {
	const expectedIntent = createIntent(
		await createBinding(
			{
				invocationId: claim.invocationId,
				baseRevision: claim.baseRevision,
				purpose: claim.purpose,
				workItem: claim.workItem
			},
			claim.repositoryDir
		),
		claim.preparedAt
	);
	const claimIntent: Record<string, unknown> = { ...claim };
	delete claimIntent.headSha;
	delete claimIntent.stateHash;
	if (JSON.stringify(claimIntent) !== JSON.stringify(expectedIntent)) {
		throw new Error('worktree claim content does not match its content-addressed identity');
	}
	if (claim.headSha !== claim.baseRevision) {
		throw new Error('worktree claim HEAD is not its exact base revision');
	}
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
}

/** Dependency-injected implementation used by the extension and adversarial tests. */
export function createSupersAgentWorktreeOperations(
	deps: SupersAgentWorktreeDependencies
): SupersAgentWorktreeOperations {
	return {
		async prepareSupersAgentWorktree(argsInput, context) {
			const args = PrepareSupersAgentWorktreeArgsSchema.parse(argsInput);
			const canonicalRepositoryDir = await deps.realPath(context.repoDir);
			const proposedBinding = await createBinding(args, canonicalRepositoryDir);
			const bindingName = `supers-agent-worktree-binding-${args.invocationId}`;
			const existingBinding = await readParsedResource(
				context,
				bindingName,
				SupersAgentWorktreeBindingSchema
			);
			if (existingBinding !== null) {
				requireExactResource(
					SupersAgentWorktreeBindingSchema,
					existingBinding,
					proposedBinding,
					'worktree invocation binding'
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
				creationSnapshot = await requireCleanStableCentralRepository(
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
				await requireValidClaimIdentity(existingClaim);
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

			creationSnapshot ??= await requireCleanStableCentralRepository(
				deps,
				canonicalRepositoryDir,
				args.baseRevision
			);
			await requireCleanStableCentralRepository(
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

			await requireCleanStableCentralRepository(
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
			await requireValidClaimIdentity(claim);
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

			const invocationResource = `invocation-${claim.invocationId}`;
			const invocationRaw = await context.readResource(invocationResource);
			if (invocationRaw === null) {
				throw new Error(`CLI-agent invocation resource is missing: ${invocationResource}`);
			}
			const invocation = InvocationResultSchema.parse(invocationRaw);
			if (invocation.invocationId !== claim.invocationId) {
				throw new Error('CLI-agent invocation identity does not match the worktree claim');
			}
			if (!invocation.success || invocation.exitCode !== 0 || invocation.timedOut) {
				throw new Error('CLI-agent invocation did not finish successfully');
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
			const expectedRepository = {
				attachedBranch: claim.attachedBranch,
				headSha: claim.headSha,
				stateHash: claim.stateHash
			};
			if (
				launch.invocationId !== claim.invocationId ||
				launch.cwd !== claim.worktreePath ||
				launch.repositoryExpectation.attachedBranch !== expectedRepository.attachedBranch ||
				launch.repositoryExpectation.headSha !== expectedRepository.headSha ||
				launch.repositoryExpectation.stateHash !== expectedRepository.stateHash
			) {
				throw new Error('CLI-agent launch claim does not match the exact worktree expectation');
			}
			for (const [key, value] of Object.entries(claim.expectedInvocationTags)) {
				if (launch.tags[key] !== value) {
					throw new Error(`CLI-agent launch claim tag mismatch for ${key}`);
				}
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
			await requireValidClaimIdentity(claim);
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
			await requireCleanStableCentralRepository(
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

			await requireCleanStableCentralRepository(
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
			await requireCleanStableCentralRepository(
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
			await requireValidClaimIdentity(claim);
			const authorization = args.authorization ?? { kind: 'unchanged' as const };
			let authorizationReceiptId: string;
			let committedAuthorization:
				| { receipt: SupersAgentWorktreeCommitReceipt; verifyArgs: VerifySupersAgentWorktreeCommitArgs }
				| null = null;
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
			} else {
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
			if (existingIntent === null && !originalExists) {
				throw new Error('cannot begin worktree removal because the claimed worktree is absent');
			}
			if (existingIntent === null && quarantineExists) {
				throw new Error('cannot begin worktree removal from an ambiguous quarantine state');
			}
			if (originalExists && !quarantineExists) {
				if (committedAuthorization === null) {
					await requireExactWorktree(deps, claim, claim.stateHash);
				} else {
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
				}
			}
			const intent = existingIntent ?? proposedIntent;
			if (existingIntent === null) {
				await context.writeResource('supers-agent-worktree-removal-intent', intentName, intent);
			}

			const removalAlreadyApplied =
				existingIntent !== null && !originalExists && !quarantineExists;
			if (!removalAlreadyApplied) {
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
				const expectedHead = committedAuthorization?.receipt.commitRevision ?? claim.headSha;
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
		}
	};
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

const defaultDependencies: SupersAgentWorktreeDependencies = {
	runGit: runBoundedSupersGitCommand,
	realPath: (path) => Deno.realPath(path),
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
		}
	},
	methods: [
		{
			prepareSupersAgentWorktree: {
				description:
					'Prepare or recover one deterministic isolated worktree from a clean, stable exact HEAD.',
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
					'Remove only an exactly authorized unchanged or committed worktree and persist a replay-safe removal receipt.',
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
		}
	]
};
