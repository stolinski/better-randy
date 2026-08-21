import assert from 'node:assert/strict';

import {
	createSupersAgentWorktreeOperations,
	type PrepareSupersAgentWorktreeArgs,
	type SupersAgentGitResult,
	type SupersAgentWorktreeClaim,
	type SupersAgentWorktreeDependencies,
	type SupersAgentWorktreeMethodContext
} from './cli-agent-supers-worktree.ts';

const BASE_REVISION = 'a'.repeat(40);
const OTHER_REVISION = 'b'.repeat(40);
const NOW = new Date('2026-08-22T12:00:00.000Z');
const PREPARE_ARGS: PrepareSupersAgentWorktreeArgs = {
	invocationId: 'sentry-reproduction-SUPERS-101',
	baseRevision: BASE_REVISION,
	purpose: 'sentry-reproduction',
	workItem: 'SUPERS-101'
};

function gitResult(
	success: boolean,
	stdout = '',
	stderr = '',
	code = success ? 0 : 1
): SupersAgentGitResult {
	return {
		success,
		code,
		stdout: new TextEncoder().encode(stdout),
		stderr: new TextEncoder().encode(stderr)
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
	untracked = new Map<string, Uint8Array>();
	loseAddAcknowledgement = false;
	loseRemoveAcknowledgement = false;
	registeredConflictPath: string | null = null;
	addCalls = 0;
	removeCalls = 0;

	now(): Date {
		return NOW;
	}

	realPath(path: string): Promise<string> {
		return Promise.resolve(path);
	}

	pathExists(path: string): Promise<boolean> {
		if (path === '/repo') return Promise.resolve(true);
		if (path === this.worktreePath && this.worktreeExists) {
			return Promise.resolve(true);
		}
		return Promise.resolve(this.conflictPathExists && path.includes('-supers-agent-'));
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
		if (args[0] === 'worktree' && args[1] === 'remove') {
			this.removeCalls += 1;
			this.worktreeExists = false;
			this.worktreeRegistered = false;
			return this.loseRemoveAcknowledgement
				? gitResult(false, '', 'simulated lost acknowledgement', 128)
				: gitResult(true);
		}
		if (command === 'worktree prune') {
			if (!this.worktreeExists && this.registeredConflictPath === null) {
				this.worktreeRegistered = false;
			}
			return gitResult(true);
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
		return gitResult(false, '', `unexpected worktree git command: ${command}`, 128);
	}
}

function fixture(): {
	repository: FakeWorktreeRepository;
	context: SupersAgentWorktreeMethodContext;
	resources: Map<string, Record<string, unknown>>;
	writes: string[];
} {
	const repository = new FakeWorktreeRepository();
	const resources = new Map<string, Record<string, unknown>>();
	const writes: string[] = [];
	return {
		repository,
		resources,
		writes,
		context: {
			repoDir: '/repo',
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
		cwd: claim.worktreePath,
		repositoryExpectation: {
			attachedBranch: claim.attachedBranch,
			headSha: claim.headSha,
			stateHash: claim.stateHash
		},
		tags: claim.expectedInvocationTags
	});
}

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
		/conflicting worktree path or branch registration/
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
		const repositoryDir = `${tempRoot}/primary`;
		const linkedDir = `${tempRoot}/linked`;
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
				readFile: (path) => Deno.readFile(path),
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
