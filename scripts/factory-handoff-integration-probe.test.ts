import assert from 'node:assert/strict';
import { join } from 'node:path';

import { createSupersIntegratedTreeFingerprint } from '../extensions/models/supers-deterministic-factory-contract.ts';
import {
	type FactoryHandoffGateInput,
	verifyFactoryHandoffIntegrationGate
} from './factory-handoff-integration-gate.ts';

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
	revision: string;
	patchPath: string;
	patchBytes: Uint8Array;
	changedPaths: string[];
	manifestBytes: Uint8Array;
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
	const structuredOutput = {
		rootEpicId,
		activeTaskId,
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
		residualRisks: []
	};
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
		revision,
		patchPath,
		patchBytes: patchResult.stdout,
		changedPaths,
		manifestBytes: encoder.encode(JSON.stringify(manifest))
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

Deno.test('pure handoff gate proves integration safety and closed rejections', async () => {
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
		const laneA = await laneEvidence(
			fixture.repository,
			fixture.root,
			fixture.baseRevision,
			laneARevision,
			'epic-a',
			'task-a',
			0
		);
		const laneB = await laneEvidence(
			fixture.repository,
			fixture.root,
			fixture.baseRevision,
			laneBRevision,
			'epic-b',
			'task-b',
			1
		);
		const conflictLane = await laneEvidence(
			fixture.repository,
			fixture.root,
			fixture.baseRevision,
			conflictRevision,
			'epic-conflict',
			'task-conflict',
			2
		);

		const validA = await gateInput(fixture.repository, fixture.root, fixture.baseRevision, laneA);
		assert.equal((await verifyFactoryHandoffIntegrationGate(validA)).disposition, 'accepted');

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
});
