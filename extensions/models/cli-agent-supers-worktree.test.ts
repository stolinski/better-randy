import assert from 'node:assert/strict';

import {
	createSupersAgentRepositoryStateHash,
	createSupersAgentWorktreeOperations,
	runBoundedSupersGitCommand,
	extension,
	type PrepareSupersAgentWorktreeArgs,
	type SupersAgentGitResult,
	type VerifySupersAgentWorktreeCommitArgs,
	type SupersAgentWorktreeClaim,
	type SupersAgentWorktreeDependencies,
	type SupersAgentWorktreeMethodContext
} from './cli-agent-supers-worktree.ts';

const BASE_REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);
const COMMIT_REVISION = 'c'.repeat(40);
const COMMIT_TREE = 'd'.repeat(40);
const INTEGRATED_REVISION = 'f'.repeat(40);
const INTEGRATION_GIT_MODEL_ID = 'supers-integration-git-model';
const CHERRY_PICK_RESOURCE_NAME = 'cherry-pick-sentry-SUPERS-101';
const PROMPT_DIGEST = 'e'.repeat(64);
const INVOCATION_MODEL_ID = 'supers-delivery-coding-agent-model';
const TEST_PATH = 'extensions/models/sentry-fix.test.ts';
const NOW = new Date('2026-08-22T12:00:00.000Z');
const PREPARE_ARGS: PrepareSupersAgentWorktreeArgs = {
	invocationId: 'sentry-reproduction-SUPERS-101',
	baseRevision: BASE_REVISION,
	purpose: 'sentry-reproduction',
	workItem: 'SUPERS-101'
};

function gitResult(
	success: boolean,
	stdout: string | Uint8Array = '',
	stderr: string | Uint8Array = '',
	code = success ? 0 : 1
): SupersAgentGitResult {
	return {
		success,
		code,
		stdout: typeof stdout === 'string' ? new TextEncoder().encode(stdout) : stdout,
		stderr: typeof stderr === 'string' ? new TextEncoder().encode(stderr) : stderr
	};
}

class FakeWorktreeRepository implements SupersAgentWorktreeDependencies {
	centralDirty = false;
	centralIsLinkedWorktree = false;
	centralHeads: string[] = [];
	branchExists = false;
	conflictPathExists = false;
	worktreeExists = false;
	worktreeRegistered = false;
	worktreePath = '';
	worktreeBranch = '';
	worktreeHead = BASE_REVISION;
	worktreeDiff = '';
	worktreeDirty = false;
	baseIsAncestor = true;
	changedPathStatus = 'A';
	changedPath = TEST_PATH;
	changedPathMode = '100644';
	changedPathCount = 1;
	changedBlobSize = 128;
	treeListingBytes: Uint8Array | null = null;
	binaryDiffBytes: Uint8Array | null = null;
	mutateTreeOnSecondCollection = false;
	mutateStatusAfterEvidenceCollection = false;
	treeCollectionCount = 0;
	committedDiffCollectionCount = 0;
	untracked = new Map<string, Uint8Array>();
	untrackedInfo = new Map<
		string,
		{ isFile: boolean; isSymlink: boolean; size: number; canonicalPath?: string }
	>();
	loseAddAcknowledgement = false;
	loseRemoveAcknowledgement = false;
	registeredConflictPath: string | null = null;
	replacementOriginalPath: string | null = null;
	replaceOriginalAfterRename = false;
	integrationMode = false;
	integrationParent = BASE_REVISION;
	integrationTree = COMMIT_TREE;
	integrationNameStatus: string | null = null;
	integrationDiffBytes: Uint8Array | null = null;
	removedPaths: string[] = [];
	addCalls = 0;
	removeCalls = 0;
	renameCalls = 0;

	now(): Date {
		return NOW;
	}

	realPath(path: string): Promise<string> {
		const prefix = `${this.worktreePath}/`;
		const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
		return Promise.resolve(this.untrackedInfo.get(relative)?.canonicalPath ?? path);
	}

	pathExists(path: string): Promise<boolean> {
		if (path === '/repo') return Promise.resolve(true);
		if (path === this.worktreePath && this.worktreeExists) {
			return Promise.resolve(true);
		}
		if (path === this.replacementOriginalPath) return Promise.resolve(true);
		return Promise.resolve(this.conflictPathExists && path.includes('-supers-agent-'));
	}

	rename(from: string, to: string): Promise<void> {
		if (from !== this.worktreePath || !this.worktreeExists) {
			return Promise.reject(new Error(`unexpected rename source ${from}`));
		}
		this.renameCalls += 1;
		this.worktreePath = to;
		if (this.replaceOriginalAfterRename) this.replacementOriginalPath = from;
		return Promise.resolve();
	}

	fileInfo(path: string): Promise<{ isFile: boolean; isSymlink: boolean; size: number }> {
		const prefix = `${this.worktreePath}/`;
		const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
		const override = this.untrackedInfo.get(relative);
		if (override !== undefined) return Promise.resolve(override);
		const value = this.untracked.get(relative);
		if (value === undefined) throw new Deno.errors.NotFound(path);
		return Promise.resolve({ isFile: true, isSymlink: false, size: value.length });
	}

	readFile(path: string): Promise<Uint8Array> {
		const prefix = `${this.worktreePath}/`;
		const relative = path.startsWith(prefix) ? path.slice(prefix.length) : path;
		const value = this.untracked.get(relative);
		if (value === undefined) throw new Deno.errors.NotFound(path);
		return Promise.resolve(value);
	}

	runGit(cwd: string, args: readonly string[]): Promise<SupersAgentGitResult> {
		const command = args.join(' ');
		if (cwd === '/repo') {
			return Promise.resolve(this.runCentralGit(args, command));
		}
		if (cwd === this.worktreePath && this.worktreeExists) {
			return Promise.resolve(this.runWorktreeGit(command));
		}
		return Promise.resolve(gitResult(false, '', `unknown cwd ${cwd}`, 128));
	}

	private runCentralGit(args: readonly string[], command: string): SupersAgentGitResult {
		if (command === 'rev-parse --show-toplevel') {
			return gitResult(true, '/repo\n');
		}
		if (command === 'rev-parse --path-format=absolute --git-dir') {
			return gitResult(
				true,
				this.centralIsLinkedWorktree ? '/primary/.git/worktrees/repo\n' : '/repo/.git\n'
			);
		}
		if (command === 'rev-parse --path-format=absolute --git-common-dir') {
			return gitResult(true, this.centralIsLinkedWorktree ? '/primary/.git\n' : '/repo/.git\n');
		}
		if (command === 'rev-parse --verify HEAD^{commit}') {
			return gitResult(true, `${this.centralHeads.shift() ?? BASE_REVISION}\n`);
		}
		if (command === 'status --porcelain=v1 --untracked-files=all -z') {
			return gitResult(true, this.centralDirty ? ' M tracked.ts\0' : '');
		}
		if (command === `rev-list --parents -n 1 ${INTEGRATED_REVISION}`) {
			return gitResult(true, `${INTEGRATED_REVISION} ${this.integrationParent}\n`);
		}
		if (command === `rev-parse --verify ${INTEGRATED_REVISION}^{tree}`) {
			return gitResult(true, `${this.integrationTree}\n`);
		}
		if (command === `ls-tree -r -z ${INTEGRATED_REVISION}`) {
			return gitResult(
				true,
				this.treeListingBytes ??
					new TextEncoder().encode(
						`${this.changedPathMode} blob ${OTHER_REVISION}\t${this.changedPath}\0`
					)
			);
		}
		if (
			command ===
			`diff --name-status -z ${BASE_REVISION} ${INTEGRATED_REVISION} --`
		) {
			return gitResult(
				true,
				this.integrationNameStatus ?? `${this.changedPathStatus}\0${this.changedPath}\0`
			);
		}
		if (
			command ===
			`diff --binary --full-index ${BASE_REVISION} ${INTEGRATED_REVISION} --`
		) {
			return gitResult(
				true,
				this.integrationDiffBytes ??
					new TextEncoder().encode(`diff --git a/${this.changedPath} b/${this.changedPath}\n`)
			);
		}
		if (command === 'worktree list --porcelain') {
			let output = `worktree /repo\nHEAD ${BASE_REVISION}\nbranch refs/heads/main\n\n`;
			if (this.worktreeRegistered) {
				output += `worktree ${
					this.registeredConflictPath ?? this.worktreePath
				}\nHEAD ${this.worktreeHead}\nbranch refs/heads/${this.worktreeBranch}\n\n`;
			}
			return gitResult(true, output);
		}
		if (command.startsWith('show-ref --verify --quiet refs/heads/')) {
			return gitResult(this.branchExists);
		}
		if (args[0] === 'worktree' && args[1] === 'add') {
			this.addCalls += 1;
			this.worktreeBranch = args[3];
			this.worktreePath = args[4];
			this.worktreeHead = args[5];
			this.worktreeExists = true;
			this.worktreeRegistered = true;
			this.branchExists = true;
			return this.loseAddAcknowledgement
				? gitResult(false, '', 'simulated lost acknowledgement', 128)
				: gitResult(true);
		}
		if (args[0] === 'worktree' && args[1] === 'repair') {
			return args[2] === this.worktreePath
				? gitResult(true)
				: gitResult(false, '', 'wrong repair path', 128);
		}
		if (args[0] === 'worktree' && args[1] === 'remove') {
			if (args[3] !== this.worktreePath) {
				return gitResult(false, '', 'wrong removal path', 128);
			}
			this.removeCalls += 1;
			this.removedPaths.push(args[3]);
			this.worktreeExists = false;
			this.worktreeRegistered = false;
			return this.loseRemoveAcknowledgement
				? gitResult(false, '', 'simulated lost acknowledgement', 128)
				: gitResult(true);
		}
		return gitResult(false, '', `unexpected central git command: ${command}`, 128);
	}

	private runWorktreeGit(command: string): SupersAgentGitResult {
		if (command === 'rev-parse --show-toplevel') {
			return gitResult(true, `${this.worktreePath}\n`);
		}
		if (command === 'symbolic-ref --quiet --short HEAD') {
			return gitResult(true, `${this.worktreeBranch}\n`);
		}
		if (command === 'rev-parse --verify HEAD^{commit}') {
			return gitResult(true, `${this.worktreeHead}\n`);
		}
		if (command === 'diff --binary --full-index HEAD --') {
			return gitResult(true, this.worktreeDiff);
		}
		if (command === 'ls-files --others --exclude-standard -z') {
			return gitResult(
				true,
				[...this.untracked.keys()].join('\0') + (this.untracked.size > 0 ? '\0' : '')
			);
		}
		if (command === 'status --porcelain=v1 --untracked-files=all -z') {
			return gitResult(true, this.worktreeDirty ? ' M tracked.ts\0' : '');
		}
		if (command === `merge-base --is-ancestor ${BASE_REVISION} ${COMMIT_REVISION}`) {
			return gitResult(this.baseIsAncestor);
		}
		if (
			command === `diff --name-status -z ${BASE_REVISION} ${COMMIT_REVISION} --`
		) {
			return gitResult(
				true,
				Array.from({ length: this.changedPathCount }, (_, index) =>
					`${this.changedPathStatus}\0${index === 0 ? this.changedPath : `src/generated-${index}.ts`}\0`
				).join('')
			);
		}
		if (
			command === `ls-tree -z ${COMMIT_REVISION} -- ${this.changedPath}`
		) {
			return gitResult(
				true,
				`${this.changedPathMode} ${this.changedPathMode === '160000' ? 'commit' : 'blob'} ${OTHER_REVISION}\t${this.changedPath}\0`
			);
		}
		if (command.startsWith(`cat-file -s ${COMMIT_REVISION}:`)) {
			return gitResult(true, `${this.changedBlobSize}\n`);
		}
		if (command === `rev-parse --verify ${COMMIT_REVISION}^{tree}`) {
			return gitResult(true, `${COMMIT_TREE}\n`);
		}
		if (command === `ls-tree -r -z ${COMMIT_REVISION}`) {
			this.treeCollectionCount += 1;
			if (this.mutateTreeOnSecondCollection && this.treeCollectionCount >= 2) {
				return gitResult(true, `100644 blob ${COMMIT_TREE}\tchanged-after-check.ts\0`);
			}
			return gitResult(
				true,
				this.treeListingBytes ??
					new TextEncoder().encode(
						`${this.changedPathMode} blob ${OTHER_REVISION}\t${this.changedPath}\0`
					)
			);
		}
		if (
			command === `diff --binary --full-index ${BASE_REVISION} ${COMMIT_REVISION} --`
		) {
			this.committedDiffCollectionCount += 1;
			if (
				this.mutateStatusAfterEvidenceCollection &&
				this.committedDiffCollectionCount >= 2
			) {
				this.worktreeDirty = true;
			}
			return gitResult(
				true,
				this.binaryDiffBytes ??
					new TextEncoder().encode(`diff --git a/${this.changedPath} b/${this.changedPath}\n`)
			);
		}
		return gitResult(false, '', `unexpected worktree git command: ${command}`, 128);
	}
}

function fixture(): {
	repository: FakeWorktreeRepository;
	context: SupersAgentWorktreeMethodContext;
	resources: Map<string, Record<string, unknown>>;
	externalResources: Map<string, Record<string, unknown>>;
	writes: string[];
} {
	const repository = new FakeWorktreeRepository();
	const resources = new Map<string, Record<string, unknown>>();
	const externalResources = new Map<string, Record<string, unknown>>();
	const writes: string[] = [];
	return {
		repository,
		resources,
		externalResources,
		writes,
		context: {
			repoDir: '/repo',
			dataRepository: {
				getContent: (type, modelId, name) => {
					const value = externalResources.get(`${String(type)}:${modelId}:${name}`);
					return Promise.resolve(
						value === undefined ? null : new TextEncoder().encode(JSON.stringify(value))
					);
				}
			},
			readResource: (name) => Promise.resolve(resources.get(name) ?? null),
			writeResource: (_spec, name, data) => {
				writes.push(name);
				resources.set(name, data);
				return Promise.resolve({ name });
			}
		}
	};
}

function recordSuccessfulInvocation(
	resources: Map<string, Record<string, unknown>>,
	claim: SupersAgentWorktreeClaim,
	overrides: Record<string, unknown> = {}
): void {
	resources.set(`invocation-${claim.invocationId}`, {
		invocationId: claim.invocationId,
		provider: 'pi',
		model: 'openai-codex/gpt-5.6-sol',
		promptHash: PROMPT_DIGEST,
		cwd: claim.worktreePath,
		exitCode: 0,
		success: true,
		timedOut: false,
		tags: claim.expectedInvocationTags,
		parsedResponse: { outcome: 'untrusted-agent-claim' },
		...overrides
	});
	resources.set(`launch-claim-${claim.invocationId}`, {
		operation: 'invokeAndParse',
		invocationId: claim.invocationId,
		provider: 'pi',
		model: 'openai-codex/gpt-5.6-sol',
		promptHash: PROMPT_DIGEST,
		definition: { id: INVOCATION_MODEL_ID },
		toolProfile: 'actor',
		cwd: claim.worktreePath,
		repositoryExpectation: {
			attachedBranch: claim.attachedBranch,
			headSha: claim.headSha,
			stateHash: claim.stateHash
		},
		tags: claim.expectedInvocationTags
	});
}

function commitVerificationArgs(
	claim: SupersAgentWorktreeClaim,
	overrides: Partial<VerifySupersAgentWorktreeCommitArgs> = {}
): VerifySupersAgentWorktreeCommitArgs {
	return {
		claimId: claim.claimId,
		invocationModelId: INVOCATION_MODEL_ID,
		invocationResourceName: `invocation-${claim.invocationId}`,
		invocationId: claim.invocationId,
		expectedProvider: 'pi',
		expectedModel: 'openai-codex/gpt-5.6-sol',
		expectedActor: 'actor',
		expectedRepositoryExpectation: {
			attachedBranch: claim.attachedBranch,
			headSha: claim.headSha,
			stateHash: claim.stateHash
		},
		expectedPromptDigest: PROMPT_DIGEST,
		expectedBaseRevision: claim.baseRevision,
		expectedCommitRevision: COMMIT_REVISION,
		objectiveProofNomination: {
			runner: 'deno-exact-v1',
			testPath: TEST_PATH,
			exactTestName: `Sentry ${claim.workItem} ${claim.claimId}`
		},
		...overrides
	};
}

async function integrationFixture() {
	const fixtureValue = fixture();
	const { repository, context, resources, externalResources } = fixtureValue;
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (
		await operations.prepareSupersAgentWorktree(
			{
				...PREPARE_ARGS,
				invocationId: 'sentry-integration-supers-101',
				workItem: 'supers-101'
			},
			context
		)
	).resource;
	repository.worktreeHead = COMMIT_REVISION;
	recordSuccessfulInvocation(resources, claim);
	const commitReceipt = (
		await operations.verifySupersAgentWorktreeCommit(commitVerificationArgs(claim), context)
	).resource;
	externalResources.set(
		`@swamp/git:${INTEGRATION_GIT_MODEL_ID}:${CHERRY_PICK_RESOURCE_NAME}`,
		{
			commits: [COMMIT_REVISION],
			conflict: false,
			raw: 'applied exact child commit'
		}
	);
	repository.centralHeads = [
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION
	];
	const args = {
		commitReceiptName: `supers-agent-worktree-commit-${commitReceipt.receiptId}`,
		expectedCommitReceiptId: commitReceipt.receiptId,
		expectedCommitReceiptFingerprint: commitReceipt.fingerprint,
		integrationGitModelId: INTEGRATION_GIT_MODEL_ID,
		cherryPickResourceName: CHERRY_PICK_RESOURCE_NAME,
		rootEpicId: 'supers-101',
		activeTaskId: 'supers-101',
		expectedPreRevision: BASE_REVISION,
		expectedPostRevision: INTEGRATED_REVISION
	};
	return { ...fixtureValue, operations, commitReceipt, args };
}

Deno.test('invocation authority resources retain one immutable infinite-lifetime version', () => {
	for (const resource of Object.values(extension.resources)) {
		assert.equal(resource.lifetime, 'infinite');
		assert.equal(resource.garbageCollection, 1);
	}
});

Deno.test('clean exact HEAD prepares, verifies, and removes an isolated worktree', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;

	assert.equal(claim.headSha, BASE_REVISION);
	assert.equal(claim.worktreePath.startsWith('/repo-supers-agent-'), true);
	assert.equal(claim.attachedBranch.startsWith('supers-agent/sentry-reproduction/'), true);
	assert.equal(repository.addCalls, 1);
	recordSuccessfulInvocation(resources, claim);

	const unchanged = (
		await operations.verifySupersAgentWorktreeUnchanged(
			{
				claimId: claim.claimId
			},
			context
		)
	).resource;
	assert.equal(unchanged.stateHash, claim.stateHash);
	const removed = (await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context))
		.resource;
	assert.equal(removed.removed, true);
	assert.equal(repository.removeCalls, 1);
	assert.equal(repository.worktreeExists, false);
});

Deno.test('committed worktree verification persists objective pre-integration evidence and replays exactly', async () => {
	const { repository, context, resources, writes } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	repository.worktreeHead = COMMIT_REVISION;
	recordSuccessfulInvocation(resources, claim);
	const args = commitVerificationArgs(claim);

	const first = (await operations.verifySupersAgentWorktreeCommit(args, context)).resource;
	assert.equal(first.baseRevision, BASE_REVISION);
	assert.equal(first.commitRevision, COMMIT_REVISION);
	assert.equal(first.commitTree, COMMIT_TREE);
	assert.deepEqual(first.changedPaths, [TEST_PATH]);
	assert.equal(first.objectiveProofNomination.testPath, TEST_PATH);
	assert.equal('command' in first.objectiveProofNomination, false);
	assert.equal('exitCode' in first.objectiveProofNomination, false);
	const writesAfterFirst = writes.length;
	resources.delete(`invocation-${claim.invocationId}`);
	resources.delete(`launch-claim-${claim.invocationId}`);
	const replay = (await operations.verifySupersAgentWorktreeCommit(args, context)).resource;
	assert.deepEqual(replay, first);
	assert.equal(writes.length, writesAfterFirst);
});

Deno.test('committed worktree verification hashes raw bytes and detects verification races', async () => {
	const digests: string[] = [];
	for (const byte of [0xff, 0xfe]) {
		const { repository, context, resources } = fixture();
		const operations = createSupersAgentWorktreeOperations(repository);
		const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
		repository.worktreeHead = COMMIT_REVISION;
		repository.treeListingBytes = new Uint8Array([byte]);
		recordSuccessfulInvocation(resources, claim);
		digests.push((await operations.verifySupersAgentWorktreeCommit(commitVerificationArgs(claim), context)).resource.treeDigest);
	}
	assert.notEqual(digests[0], digests[1], 'distinct invalid UTF-8 byte sequences must retain distinct digests');

	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	repository.worktreeHead = COMMIT_REVISION;
	repository.mutateTreeOnSecondCollection = true;
	recordSuccessfulInvocation(resources, claim);
	await assert.rejects(
		() => operations.verifySupersAgentWorktreeCommit(commitVerificationArgs(claim), context),
		/evidence changed during verification/
	);
});

Deno.test('committed worktree verification performs a final clean identity check before persistence', async () => {
	const { repository, context, resources, writes } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	repository.worktreeHead = COMMIT_REVISION;
	repository.mutateStatusAfterEvidenceCollection = true;
	recordSuccessfulInvocation(resources, claim);
	await assert.rejects(
		() => operations.verifySupersAgentWorktreeCommit(commitVerificationArgs(claim), context),
		/changed after evidence collection/
	);
	assert.equal(writes.some((name) => name.startsWith('supers-agent-worktree-commit-')), false);
});

Deno.test('bounded Git runner terminates oversized output before retaining the producer output', async () => {
	await assert.rejects(
		async () =>
			runBoundedSupersGitCommand(
				await Deno.realPath('.'),
				['show', 'HEAD:extensions/models/cli-agent-supers-worktree.ts'],
				{ stdoutBytes: 128, stderrBytes: 1024 }
			),
		/git stdout exceeds the 128-byte safety limit/
	);
});

Deno.test('committed worktree verification enforces changed-content resource bounds', async () => {
	const cases: Array<{ configure: (repository: FakeWorktreeRepository) => void; expected: RegExp }> = [
		{ configure: (repository) => { repository.changedPathCount = 257; }, expected: /256-path safety limit/ },
		{ configure: (repository) => { repository.changedBlobSize = 8 * 1024 * 1024 + 1; }, expected: /changed path exceeds/ },
		{ configure: (repository) => { repository.treeListingBytes = new Uint8Array(8 * 1024 * 1024 + 1); }, expected: /ls-tree output exceeds/ },
		{ configure: (repository) => { repository.binaryDiffBytes = new Uint8Array(32 * 1024 * 1024 + 1); }, expected: /diff output exceeds/ }
	];
	for (const testCase of cases) {
		const { repository, context, resources } = fixture();
		const operations = createSupersAgentWorktreeOperations(repository);
		const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
		repository.worktreeHead = COMMIT_REVISION;
		testCase.configure(repository);
		recordSuccessfulInvocation(resources, claim);
		await assert.rejects(
			() => operations.verifySupersAgentWorktreeCommit(commitVerificationArgs(claim), context),
			testCase.expected
		);
	}
});

Deno.test('committed worktree verification rejects dirty, non-descendant, unsafe, and non-regular changes', async () => {
	const cases: Array<{
		configure: (repository: FakeWorktreeRepository) => void;
		expected: RegExp;
	}> = [
		{
			configure: (repository) => {
				repository.worktreeDirty = true;
			},
			expected: /must be clean/
		},
		{
			configure: (repository) => {
				repository.baseIsAncestor = false;
			},
			expected: /base is not an ancestor/
		},
		{
			configure: (repository) => {
				repository.changedPath = '../escape.test.ts';
			},
			expected: /unsafe changed repository path/
		},
		{
			configure: (repository) => {
				repository.changedPathMode = '120000';
			},
			expected: /not an exact regular Git blob/
		},
		{
			configure: (repository) => {
				repository.changedPathMode = '160000';
			},
			expected: /not an exact regular Git blob/
		}
	];
	for (const testCase of cases) {
		const { repository, context, resources } = fixture();
		const operations = createSupersAgentWorktreeOperations(repository);
		const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
		repository.worktreeHead = COMMIT_REVISION;
		recordSuccessfulInvocation(resources, claim);
		testCase.configure(repository);
		const args = commitVerificationArgs(claim, {
			objectiveProofNomination: {
				runner: 'deno-exact-v1',
				testPath: repository.changedPath,
				exactTestName: `Sentry SUPERS-101 ${claim.claimId}`
			}
		});
		await assert.rejects(
			() => operations.verifySupersAgentWorktreeCommit(args, context),
			testCase.expected
		);
	}
});

Deno.test('committed worktree verification binds claim, invocation, prompt, model, and central base', async () => {
	const cases: Array<{
		configure?: (
			repository: FakeWorktreeRepository,
			resources: Map<string, Record<string, unknown>>,
			claim: SupersAgentWorktreeClaim
		) => void;
		overrides?: (claim: SupersAgentWorktreeClaim) => Partial<VerifySupersAgentWorktreeCommitArgs>;
		expected: RegExp;
	}> = [
		{
			overrides: () => ({ claimId: 'f'.repeat(64) }),
			expected: /worktree claim is missing/
		},
		{
			overrides: () => ({ expectedCommitRevision: OTHER_REVISION }),
			expected: /committed branch or revision/
		},
		{
			overrides: () => ({ expectedBaseRevision: OTHER_REVISION }),
			expected: /do not match the exact worktree claim/
		},
		{
			overrides: () => ({ expectedPromptDigest: 'f'.repeat(64) }),
			expected: /invocation does not match/
		},
		{
			overrides: () => ({ expectedModel: 'wrong/model' }),
			expected: /invocation does not match/
		},
		{
			overrides: () => ({ invocationModelId: 'wrong-model-instance' }),
			expected: /launch claim does not match/
		},
		{
			configure: (_repository, resources, claim) => {
				const invocation = resources.get(`invocation-${claim.invocationId}`)!;
				invocation.invocationId = 'different-invocation';
			},
			expected: /invocation does not match/
		},
		{
			configure: (repository) => {
				repository.centralDirty = true;
			},
			expected: /central repository must be clean/
		},
		{
			configure: (repository) => {
				repository.centralHeads = [OTHER_REVISION];
			},
			expected: /central repository HEAD mismatch/
		}
	];
	for (const testCase of cases) {
		const { repository, context, resources } = fixture();
		const operations = createSupersAgentWorktreeOperations(repository);
		const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
		repository.worktreeHead = COMMIT_REVISION;
		recordSuccessfulInvocation(resources, claim);
		testCase.configure?.(repository, resources, claim);
		await assert.rejects(
			() =>
				operations.verifySupersAgentWorktreeCommit(
					commitVerificationArgs(claim, testCase.overrides?.(claim)),
					context
				),
			testCase.expected
		);
	}
});

Deno.test('committed worktree verification rejects a conflicting durable receipt', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	repository.worktreeHead = COMMIT_REVISION;
	recordSuccessfulInvocation(resources, claim);
	const args = commitVerificationArgs(claim);
	const receipt = (await operations.verifySupersAgentWorktreeCommit(args, context)).resource;
	resources.set(`supers-agent-worktree-commit-${receipt.receiptId}`, {
		...receipt,
		model: 'forged/model'
	});
	await assert.rejects(
		() => operations.verifySupersAgentWorktreeCommit(args, context),
		/fingerprint mismatch/
	);
});

Deno.test('serialized integration verification persists a strict Factory receipt and replays exactly', async () => {
	const { repository, context, resources, writes, operations, commitReceipt, args } =
		await integrationFixture();
	const writeStart = writes.length;
	const first = (await operations.verifySupersAgentIntegration(args, context)).resource;
	assert.equal(first.disposition, 'integrated');
	assert.equal(first.baseCommit, BASE_REVISION);
	assert.equal(first.integratedRevision, INTEGRATED_REVISION);
	assert.equal(first.patchDigest, commitReceipt.diffDigest);
	assert.equal(first.integratedTreeFingerprint, commitReceipt.treeDigest);
	assert.deepEqual(first.changedPaths, [TEST_PATH]);
	assert.equal(writes.length - writeStart, 3);

	repository.centralHeads = [
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION
	];
	const replay = (await operations.verifySupersAgentIntegration(args, context)).resource;
	assert.deepEqual(replay, first);
	assert.equal(writes.length - writeStart, 3);

	const integrationName = `supers-agent-integration-supers-101-${INTEGRATED_REVISION}`;
	resources.delete(integrationName);
	repository.centralHeads = [
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION
	];
	const recovered = (await operations.verifySupersAgentIntegration(args, context)).resource;
	assert.deepEqual(recovered, first);
	assert.equal(writes.filter((name) => name === integrationName).length, 2);
});

Deno.test('serialized integration verification rejects dirty or drifted central state', async () => {
	{
		const { repository, context, operations, args } = await integrationFixture();
		repository.centralDirty = true;
		await assert.rejects(
			() => operations.verifySupersAgentIntegration(args, context),
			/central repository must be clean/
		);
	}
	{
		const { repository, context, operations, args } = await integrationFixture();
		repository.centralHeads = [OTHER_REVISION];
		await assert.rejects(
			() => operations.verifySupersAgentIntegration(args, context),
			/central repository HEAD mismatch/
		);
	}
});

Deno.test('serialized integration verification rejects wrong parent, tree, paths, and diff', async () => {
	for (const scenario of ['parent', 'tree', 'paths', 'diff'] as const) {
		const { repository, context, operations, args } = await integrationFixture();
		if (scenario === 'parent') repository.integrationParent = OTHER_REVISION;
		if (scenario === 'tree') repository.integrationTree = OTHER_REVISION;
		if (scenario === 'paths') repository.integrationNameStatus = `A\0other.test.ts\0`;
		if (scenario === 'diff') repository.integrationDiffBytes = new TextEncoder().encode('wrong');
		await assert.rejects(() => operations.verifySupersAgentIntegration(args, context));
	}
});

Deno.test('serialized integration verification rejects forged commit and cherry-pick evidence', async () => {
	{
		const { repository, context, resources, operations, args } = await integrationFixture();
		const forged = { ...resources.get(args.commitReceiptName)!, treeDigest: '0'.repeat(64) };
		resources.set(args.commitReceiptName, forged);
		repository.centralHeads = [
			INTEGRATED_REVISION,
			INTEGRATED_REVISION,
			INTEGRATED_REVISION,
			INTEGRATED_REVISION
		];
		await assert.rejects(
			() => operations.verifySupersAgentIntegration(args, context),
			/integration commit receipt authority mismatch/
		);
	}
	for (const cherryPick of [
		{ commits: [COMMIT_REVISION, OTHER_REVISION], conflict: false, raw: 'extra' },
		{ commits: [OTHER_REVISION], conflict: false, raw: 'wrong' },
		{ commits: [COMMIT_REVISION], conflict: true, conflictFiles: [TEST_PATH], raw: 'conflict' },
		{ commits: [COMMIT_REVISION], conflict: false, aborted: true, raw: 'aborted' }
	]) {
		const { repository, context, externalResources, operations, args } =
			await integrationFixture();
		externalResources.set(
			`@swamp/git:${INTEGRATION_GIT_MODEL_ID}:${CHERRY_PICK_RESOURCE_NAME}`,
			cherryPick
		);
		repository.centralHeads = [
			INTEGRATED_REVISION,
			INTEGRATED_REVISION,
			INTEGRATED_REVISION,
			INTEGRATED_REVISION
		];
		await assert.rejects(
			() => operations.verifySupersAgentIntegration(args, context),
			/official Git cherry-pick receipt/
		);
	}
});

Deno.test('serialized integration replay rejects a conflicting durable receipt', async () => {
	const { repository, context, resources, operations, args } = await integrationFixture();
	await operations.verifySupersAgentIntegration(args, context);
	const name = `supers-agent-integration-supers-101-${INTEGRATED_REVISION}`;
	resources.set(name, { ...resources.get(name)!, patchDigest: '0'.repeat(64) });
	repository.centralHeads = [
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION,
		INTEGRATED_REVISION
	];
	await assert.rejects(
		() => operations.verifySupersAgentIntegration(args, context),
		/integration receipt conflicts/
	);
});

Deno.test('dirty central checkout is rejected before an intent or git worktree add', async () => {
	const { repository, context, resources } = fixture();
	repository.centralDirty = true;
	const operations = createSupersAgentWorktreeOperations(repository);

	await assert.rejects(
		() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, context),
		/central repository must be clean/
	);
	assert.equal(resources.size, 0);
	assert.equal(repository.addCalls, 0);
});

Deno.test('a linked worktree cannot act as the primary repository authority', async () => {
	const { repository, context, resources } = fixture();
	repository.centralIsLinkedWorktree = true;
	const operations = createSupersAgentWorktreeOperations(repository);

	await assert.rejects(
		() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, context),
		/must be the primary worktree/
	);
	assert.equal(resources.size, 0);
	assert.equal(repository.addCalls, 0);
});

Deno.test(
	'central revision races fail closed before and during worktree creation',
	async (test) => {
		await test.step('initial preflight race', async () => {
			const { repository, context } = fixture();
			repository.centralHeads = [BASE_REVISION, OTHER_REVISION];
			const operations = createSupersAgentWorktreeOperations(repository);

			await assert.rejects(
				() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, context),
				/HEAD changed during worktree preflight/
			);
			assert.equal(repository.addCalls, 0);
		});

		await test.step('revision moves while git worktree add runs', async () => {
			const { repository, context, resources } = fixture();
			repository.centralHeads = [
				BASE_REVISION,
				BASE_REVISION,
				BASE_REVISION,
				BASE_REVISION,
				BASE_REVISION,
				OTHER_REVISION
			];
			const operations = createSupersAgentWorktreeOperations(repository);

			await assert.rejects(
				() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, context),
				/HEAD changed during worktree preflight/
			);
			assert.equal(repository.addCalls, 1);
			assert.equal(
				[...resources.keys()].some((name) => name.startsWith('supers-agent-worktree-claim-')),
				false
			);
		});
	}
);

Deno.test(
	'lost git worktree add acknowledgement recovers the exact registered worktree',
	async () => {
		const { repository, context } = fixture();
		repository.loseAddAcknowledgement = true;
		const operations = createSupersAgentWorktreeOperations(repository);

		const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
		assert.equal(claim.headSha, BASE_REVISION);
		assert.equal(repository.addCalls, 1);
		assert.equal(repository.worktreeRegistered, true);
	}
);

Deno.test('an exact registration owned by another model instance is not adopted', async () => {
	const first = fixture();
	const operations = createSupersAgentWorktreeOperations(first.repository);
	await operations.prepareSupersAgentWorktree(PREPARE_ARGS, first.context);
	const secondResources = new Map<string, Record<string, unknown>>();
	const secondContext: SupersAgentWorktreeMethodContext = {
		repoDir: '/repo',
		readResource: (name) => Promise.resolve(secondResources.get(name) ?? null),
		writeResource: (_spec, name, data) => {
			secondResources.set(name, data);
			return Promise.resolve({ name });
		}
	};

	await assert.rejects(
		() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, secondContext),
		/already registered without a prior preparation intent/
	);
	assert.equal(secondResources.size, 0);
	assert.equal(first.repository.addCalls, 1);
});

Deno.test('conflicting deterministic branch or path fails closed', async (test) => {
	await test.step('branch conflict', async () => {
		const { repository, context } = fixture();
		repository.branchExists = true;
		const operations = createSupersAgentWorktreeOperations(repository);
		await assert.rejects(
			() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, context),
			/path or branch already exists/
		);
	});

	await test.step('path conflict', async () => {
		const { repository, context } = fixture();
		repository.conflictPathExists = true;
		const operations = createSupersAgentWorktreeOperations(repository);
		await assert.rejects(
			() => operations.prepareSupersAgentWorktree(PREPARE_ARGS, context),
			/path or branch already exists/
		);
	});
});

Deno.test(
	'verification rejects missing, failed, wrong-cwd, wrong-tag, and unbound invocations',
	async (test) => {
		for (const scenario of [
			'missing',
			'failed',
			'wrong-cwd',
			'wrong-tag',
			'missing-launch'
		] as const) {
			await test.step(scenario, async () => {
				const { repository, context, resources } = fixture();
				const operations = createSupersAgentWorktreeOperations(repository);
				const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
				if (scenario === 'failed') {
					recordSuccessfulInvocation(resources, claim, {
						success: false,
						exitCode: 1
					});
				} else if (scenario === 'wrong-cwd') {
					recordSuccessfulInvocation(resources, claim, { cwd: '/repo' });
				} else if (scenario === 'wrong-tag') {
					recordSuccessfulInvocation(resources, claim, {
						tags: { supersAgentClaimId: 'wrong' }
					});
				} else if (scenario === 'missing-launch') {
					recordSuccessfulInvocation(resources, claim);
					resources.delete(`launch-claim-${claim.invocationId}`);
				}
				await assert.rejects(
					() =>
						operations.verifySupersAgentWorktreeUnchanged(
							{
								claimId: claim.claimId
							},
							context
						),
					scenario === 'missing'
						? /invocation resource is missing/
						: scenario === 'failed'
							? /did not finish successfully/
							: scenario === 'wrong-cwd'
								? /outside the claimed worktree/
								: scenario === 'wrong-tag'
									? /invocation tag mismatch/
									: /launch claim is missing/
				);
			});
		}
	}
);

Deno.test('verification rejects a modified worktree without trusting parsedResponse', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	recordSuccessfulInvocation(resources, claim);
	repository.worktreeDiff = 'diff --git a/file.ts b/file.ts\n';

	await assert.rejects(
		() => operations.verifySupersAgentWorktreeUnchanged({ claimId: claim.claimId }, context),
		/repository state changed/
	);
});

Deno.test('repository hashing remains byte-compatible for accepted regular files', async () => {
	const repository = new FakeWorktreeRepository();
	repository.worktreePath = '/worktree';
	repository.worktreeExists = true;
	repository.untracked.set('note.txt', new Uint8Array([0, 255, 10]));

	assert.equal(
		await createSupersAgentRepositoryStateHash(repository.worktreePath, repository),
		'd1d336d2fd1511671f99fc40320079eaf1693b74f3b333deb496101f9feb056d'
	);
});

Deno.test('repository hashing rejects unsafe untracked filesystem entries', async (test) => {
	async function rejectUntracked(
		configure: (repository: FakeWorktreeRepository) => void,
		expected: RegExp
	): Promise<void> {
		const { repository, context, resources } = fixture();
		const operations = createSupersAgentWorktreeOperations(repository);
		const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
		recordSuccessfulInvocation(resources, claim);
		configure(repository);
		await assert.rejects(
			() => operations.verifySupersAgentWorktreeUnchanged({ claimId: claim.claimId }, context),
			expected
		);
	}

	await test.step('symlink', async () => {
		await rejectUntracked((repository) => {
			repository.untracked.set('link', new Uint8Array());
			repository.untrackedInfo.set('link', { isFile: false, isSymlink: true, size: 4 });
		}, /untracked symlinks/);
	});
	await test.step('non-regular file', async () => {
		await rejectUntracked((repository) => {
			repository.untracked.set('pipe', new Uint8Array());
			repository.untrackedInfo.set('pipe', { isFile: false, isSymlink: false, size: 0 });
		}, /untracked non-regular files/);
	});
	await test.step('out-of-root realpath', async () => {
		await rejectUntracked((repository) => {
			repository.untracked.set('escaped.txt', new TextEncoder().encode('outside'));
			repository.untrackedInfo.set('escaped.txt', {
				isFile: true,
				isSymlink: false,
				size: 7,
				canonicalPath: '/outside/escaped.txt'
			});
		}, /resolves outside the repository/);
	});
	await test.step('oversized file', async () => {
		await rejectUntracked((repository) => {
			repository.untracked.set('large.bin', new Uint8Array());
			repository.untrackedInfo.set('large.bin', {
				isFile: true,
				isSymlink: false,
				size: 16 * 1024 * 1024 + 1
			});
		}, /file exceeds the repository evidence size limit/);
	});
	await test.step('oversized aggregate', async () => {
		await rejectUntracked((repository) => {
			for (let index = 0; index < 5; index += 1) {
				const path = `part-${index}.bin`;
				repository.untracked.set(path, new Uint8Array());
				repository.untrackedInfo.set(path, {
					isFile: true,
					isSymlink: false,
					size: 16 * 1024 * 1024
				});
			}
		}, /aggregate repository evidence size limit/);
	});
});

Deno.test(
	'prepare and unchanged verification replay without new writes after central HEAD moves',
	async () => {
		const { repository, context, resources, writes } = fixture();
		const operations = createSupersAgentWorktreeOperations(repository);
		const firstClaim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context))
			.resource;
		const writesAfterPrepare = writes.length;
		repository.centralHeads = [OTHER_REVISION];
		const replayedClaim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context))
			.resource;
		assert.deepEqual(replayedClaim, firstClaim);
		assert.equal(repository.addCalls, 1);
		assert.equal(writes.length, writesAfterPrepare);

		recordSuccessfulInvocation(resources, firstClaim);
		const firstReceipt = (
			await operations.verifySupersAgentWorktreeUnchanged(
				{
					claimId: firstClaim.claimId
				},
				context
			)
		).resource;
		const writesAfterVerification = writes.length;
		resources.delete(`invocation-${firstClaim.invocationId}`);
		const replayedReceipt = (
			await operations.verifySupersAgentWorktreeUnchanged(
				{
					claimId: firstClaim.claimId
				},
				context
			)
		).resource;
		assert.deepEqual(replayedReceipt, firstReceipt);
		assert.equal(writes.length, writesAfterVerification);
	}
);

Deno.test('an invocation identity cannot bind a second worktree preparation', async () => {
	const { repository, context, writes } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context);
	const writesAfterPrepare = writes.length;
	repository.centralHeads = [OTHER_REVISION];

	await assert.rejects(
		() =>
			operations.prepareSupersAgentWorktree({ ...PREPARE_ARGS, workItem: 'SUPERS-OTHER' }, context),
		/worktree invocation binding conflicts/
	);
	assert.equal(repository.addCalls, 1);
	assert.equal(writes.length, writesAfterPrepare);
});

Deno.test('an exact intent recovers a claim after central HEAD advances', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const firstClaim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	resources.delete(`supers-agent-worktree-claim-${firstClaim.claimId}`);
	repository.centralHeads = [OTHER_REVISION];

	const recovered = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	assert.deepEqual(recovered, firstClaim);
	assert.equal(repository.addCalls, 1);
});

Deno.test('committed cleanup requires and binds the exact verified receipt', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	repository.worktreeHead = COMMIT_REVISION;
	recordSuccessfulInvocation(resources, claim);
	const committed = (
		await operations.verifySupersAgentWorktreeCommit(commitVerificationArgs(claim), context)
	).resource;
	const authorization = {
		kind: 'committed' as const,
		receiptName: `supers-agent-worktree-commit-${committed.receiptId}`,
		receiptId: committed.receiptId,
		fingerprint: committed.fingerprint
	};
	await assert.rejects(
		() => operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context),
		/exact unchanged receipt/
	);
	await assert.rejects(
		() =>
			operations.removeSupersAgentWorktree(
				{ claimId: claim.claimId, authorization: { ...authorization, fingerprint: 'f'.repeat(64) } },
				context
			),
		/authorization conflicts/
	);
	await assert.rejects(
		() =>
			operations.removeSupersAgentWorktree(
				{ claimId: claim.claimId, authorization: { ...authorization, receiptName: 'wrong-receipt' } },
				context
			),
		/resource name mismatch/
	);
	const removed = (
		await operations.removeSupersAgentWorktree({ claimId: claim.claimId, authorization }, context)
	).resource;
	assert.equal(removed.authorizationKind, 'committed');
	assert.equal(removed.authorizationReceiptId, committed.receiptId);
	assert.equal(repository.removeCalls, 1);
});

Deno.test('cleanup quarantines the validated path and preserves a racing replacement', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	const originalPath = claim.worktreePath;
	recordSuccessfulInvocation(resources, claim);
	await operations.verifySupersAgentWorktreeUnchanged({ claimId: claim.claimId }, context);
	repository.replaceOriginalAfterRename = true;
	await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context);
	assert.equal(repository.renameCalls, 1);
	assert.equal(repository.removedPaths.length, 1);
	assert.match(repository.removedPaths[0], /^\/\.supers-agent-quarantine-/);
	assert.notEqual(repository.removedPaths[0], originalPath);
	assert.equal(await repository.pathExists(originalPath), true);
});

Deno.test('cleanup replay does not issue a second removal or resource write', async () => {
	const { repository, context, resources, writes } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	recordSuccessfulInvocation(resources, claim);
	await operations.verifySupersAgentWorktreeUnchanged(
		{
			claimId: claim.claimId
		},
		context
	);

	const first = (await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context))
		.resource;
	const writesAfterRemoval = writes.length;
	const replay = (await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context))
		.resource;
	assert.deepEqual(replay, first);
	assert.equal(repository.removeCalls, 1);
	assert.equal(writes.length, writesAfterRemoval);
});

Deno.test('cleanup rejects an already-absent worktree on its first attempt', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	recordSuccessfulInvocation(resources, claim);
	await operations.verifySupersAgentWorktreeUnchanged(
		{
			claimId: claim.claimId
		},
		context
	);
	repository.worktreeExists = false;
	repository.worktreeRegistered = false;

	await assert.rejects(
		() => operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context),
		/claimed worktree is absent/
	);
	assert.equal(
		[...resources.keys()].some((name) => name.startsWith('supers-agent-worktree-removal-intent-')),
		false
	);
});

Deno.test('cleanup recovers a lost remove acknowledgement from its exact intent', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	recordSuccessfulInvocation(resources, claim);
	await operations.verifySupersAgentWorktreeUnchanged(
		{
			claimId: claim.claimId
		},
		context
	);
	repository.loseRemoveAcknowledgement = true;

	const first = (await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context))
		.resource;
	resources.delete(`supers-agent-worktree-removal-${first.receiptId}`);
	const recovered = (
		await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context)
	).resource;
	assert.equal(recovered.removed, true);
	assert.equal(repository.removeCalls, 1);
});

Deno.test('cleanup recovery rejects a branch registered to a conflicting path', async () => {
	const { repository, context, resources } = fixture();
	const operations = createSupersAgentWorktreeOperations(repository);
	const claim = (await operations.prepareSupersAgentWorktree(PREPARE_ARGS, context)).resource;
	recordSuccessfulInvocation(resources, claim);
	await operations.verifySupersAgentWorktreeUnchanged(
		{
			claimId: claim.claimId
		},
		context
	);
	const removed = (await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context))
		.resource;
	resources.delete(`supers-agent-worktree-removal-${removed.receiptId}`);
	repository.worktreeRegistered = true;
	repository.registeredConflictPath = '/another-worktree';
	repository.worktreeBranch = claim.attachedBranch;
	repository.worktreeHead = claim.headSha;

	await assert.rejects(
		() => operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context),
		/worktree path or branch remains registered after removal/
	);
});

async function runRealGit(cwd: string, args: readonly string[]): Promise<SupersAgentGitResult> {
	const output = await new Deno.Command('git', {
		cwd,
		args: [...args],
		stdout: 'piped',
		stderr: 'piped'
	}).output();
	return {
		success: output.success,
		code: output.code,
		stdout: output.stdout,
		stderr: output.stderr
	};
}

async function requireRealGit(cwd: string, args: readonly string[]): Promise<string> {
	const result = await runRealGit(cwd, args);
	assert.equal(
		result.success,
		true,
		new TextDecoder().decode(result.stderr) || `git ${args.join(' ')} failed`
	);
	return new TextDecoder().decode(result.stdout).trim();
}

Deno.test(
	'real Git prepares, registers, verifies, removes, and rejects a linked authority',
	async () => {
		const tempRoot = await Deno.makeTempDir({ prefix: 'supers-agent-worktree-' });
		const canonicalTempRoot = await Deno.realPath(tempRoot);
		const repositoryDir = `${canonicalTempRoot}/primary`;
		const linkedDir = `${canonicalTempRoot}/linked`;
		const unrelatedStaleDir = `${canonicalTempRoot}/unrelated-stale`;
		await Deno.mkdir(repositoryDir);
		try {
			await requireRealGit(repositoryDir, ['init', '-b', 'main']);
			await Deno.writeTextFile(`${repositoryDir}/tracked.txt`, 'initial\n');
			await requireRealGit(repositoryDir, ['add', 'tracked.txt']);
			await requireRealGit(repositoryDir, [
				'-c',
				'user.name=Supers Test',
				'-c',
				'user.email=supers@example.invalid',
				'commit',
				'-m',
				'initial'
			]);
			const baseRevision = await requireRealGit(repositoryDir, ['rev-parse', 'HEAD']);
			const resources = new Map<string, Record<string, unknown>>();
			const context: SupersAgentWorktreeMethodContext = {
				repoDir: await Deno.realPath(repositoryDir),
				readResource: (name) => Promise.resolve(resources.get(name) ?? null),
				writeResource: (_spec, name, data) => {
					resources.set(name, data);
					return Promise.resolve({ name });
				}
			};
			const realDependencies: SupersAgentWorktreeDependencies = {
				runGit: runRealGit,
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
				now: () => NOW
			};
			const operations = createSupersAgentWorktreeOperations(realDependencies);
			const claim = (
				await operations.prepareSupersAgentWorktree(
					{
						invocationId: 'real-git-reproduction-SUPERS-101',
						baseRevision,
						purpose: 'sentry-reproduction',
						workItem: 'SUPERS-101'
					},
					context
				)
			).resource;
			assert.equal(await Deno.realPath(claim.worktreePath), claim.worktreePath);
			const registered = await requireRealGit(context.repoDir, ['worktree', 'list', '--porcelain']);
			assert.equal(registered.includes(`worktree ${claim.worktreePath}`), true);

			const foreignResources = new Map<string, Record<string, unknown>>();
			const foreignContext: SupersAgentWorktreeMethodContext = {
				...context,
				readResource: (name) => Promise.resolve(foreignResources.get(name) ?? null),
				writeResource: (_spec, name, data) => {
					foreignResources.set(name, data);
					return Promise.resolve({ name });
				}
			};
			await assert.rejects(
				() =>
					operations.prepareSupersAgentWorktree(
						{
							invocationId: claim.invocationId,
							baseRevision,
							purpose: claim.purpose,
							workItem: claim.workItem
						},
						foreignContext
					),
				/already registered without a prior preparation intent/
			);
			assert.equal(foreignResources.size, 0);

			await requireRealGit(context.repoDir, [
				'worktree',
				'add',
				'-b',
				'unrelated-stale',
				unrelatedStaleDir
			]);
			await Deno.remove(unrelatedStaleDir, { recursive: true });

			recordSuccessfulInvocation(resources, claim);
			await operations.verifySupersAgentWorktreeUnchanged(
				{
					claimId: claim.claimId
				},
				context
			);
			await operations.removeSupersAgentWorktree({ claimId: claim.claimId }, context);
			await assert.rejects(() => Deno.realPath(claim.worktreePath), Deno.errors.NotFound);
			const afterRemoval = await requireRealGit(context.repoDir, [
				'worktree',
				'list',
				'--porcelain'
			]);
			assert.equal(afterRemoval.includes(claim.worktreePath), false);
			assert.equal(afterRemoval.includes(`branch refs/heads/${claim.attachedBranch}`), false);
			assert.equal(
				afterRemoval.includes(`worktree ${unrelatedStaleDir}`),
				true,
				'exact cleanup must not prune an unrelated stale registration'
			);

			const committedClaim = (
				await operations.prepareSupersAgentWorktree(
					{
						invocationId: 'real-git-delivery-coding-SUPERS-101',
						baseRevision,
						purpose: 'delivery-coding',
						workItem: 'SUPERS-101'
					},
					context
				)
			).resource;
			await Deno.mkdir(`${committedClaim.worktreePath}/extensions/models`, { recursive: true });
			await Deno.writeTextFile(
				`${committedClaim.worktreePath}/${TEST_PATH}`,
				"Deno.test('proof', () => {});\n"
			);
			await requireRealGit(committedClaim.worktreePath, ['add', TEST_PATH]);
			await requireRealGit(committedClaim.worktreePath, [
				'-c',
				'user.name=Supers Test',
				'-c',
				'user.email=supers@example.invalid',
				'commit',
				'-m',
				'add objective proof'
			]);
			const commitRevision = await requireRealGit(committedClaim.worktreePath, [
				'rev-parse',
				'HEAD'
			]);
			recordSuccessfulInvocation(resources, committedClaim);
			const committedArgs = commitVerificationArgs(committedClaim, {
				expectedBaseRevision: baseRevision,
				expectedCommitRevision: commitRevision
			});
			await Deno.writeTextFile(
				`${committedClaim.worktreePath}/${TEST_PATH}`,
				"Deno.test('dirty', () => {});\n"
			);
			await assert.rejects(
				() => operations.verifySupersAgentWorktreeCommit(committedArgs, context),
				/must be clean/
			);
			await requireRealGit(committedClaim.worktreePath, ['checkout', '--', TEST_PATH]);

			await Deno.writeTextFile(`${repositoryDir}/tracked.txt`, 'central dirty\n');
			await assert.rejects(
				() => operations.verifySupersAgentWorktreeCommit(committedArgs, context),
				/central repository must be clean/
			);
			await requireRealGit(repositoryDir, ['checkout', '--', 'tracked.txt']);

			const committedReceipt = (
				await operations.verifySupersAgentWorktreeCommit(committedArgs, context)
			).resource;
			assert.equal(committedReceipt.commitRevision, commitRevision);
			assert.deepEqual(committedReceipt.changedPaths, [TEST_PATH]);
			await operations.removeSupersAgentWorktree(
				{
					claimId: committedClaim.claimId,
					authorization: {
						kind: 'committed',
						receiptName: `supers-agent-worktree-commit-${committedReceipt.receiptId}`,
						receiptId: committedReceipt.receiptId,
						fingerprint: committedReceipt.fingerprint
					}
				},
				context
			);
			await assert.rejects(() => Deno.realPath(committedClaim.worktreePath), Deno.errors.NotFound);

			await requireRealGit(context.repoDir, [
				'worktree',
				'add',
				'-b',
				'linked-authority',
				linkedDir
			]);
			const linkedContext = {
				...context,
				repoDir: await Deno.realPath(linkedDir)
			};
			await assert.rejects(
				() =>
					operations.prepareSupersAgentWorktree(
						{
							invocationId: 'real-git-linked-authority',
							baseRevision,
							purpose: 'sentry-reproduction',
							workItem: 'SUPERS-101'
						},
						linkedContext
					),
				/must be the primary worktree/
			);
		} finally {
			await Deno.remove(tempRoot, { recursive: true });
		}
	}
);
