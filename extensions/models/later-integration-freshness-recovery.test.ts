import assert from 'node:assert/strict';

import {
	createLaterIntegrationFreshnessRecovery,
	type LaterIntegrationFreshnessRecoveryArguments,
	type LaterIntegrationGitEvidence
} from './later-integration-freshness-recovery.ts';
import { createSupersDeterministicContractHash } from './supers-deterministic-factory-contract.ts';

const originalBaseline = '1'.repeat(40);
const originalIntegrated = '2'.repeat(40);
const laterBaseline = '3'.repeat(40);
const laterIntegrated = '4'.repeat(40);
const path = 'src/routes/api/user-compositions/user-compositions.test.ts';
const previousFingerprint = 'a'.repeat(64);
const currentFingerprint = 'b'.repeat(64);

async function integrationReceipt(
	workItem: string,
	targetBaselineRevision: string,
	integratedRevision: string,
	changedPaths: string[]
): Promise<LaterIntegrationFreshnessRecoveryArguments['originalIntegrationReceipt']> {
	const content = {
		schemaVersion: 1 as const,
		rootEpicId: workItem,
		activeTaskId: workItem,
		factoryName: 'supers-delivery' as const,
		handoffManifestDigest: 'c'.repeat(64),
		targetBaselineRevision,
		disposition: 'integrated' as const,
		childRevisionEvidence: {
			status: 'verified' as const,
			childCommittedRevision: '5'.repeat(40)
		},
		baseCommit: targetBaselineRevision,
		patchDigest: 'd'.repeat(64),
		changedPaths,
		integratedRevision,
		integratedTreeFingerprint: 'e'.repeat(64),
		rejectionReason: 'none' as const
	};
	return {
		...content,
		receiptId: await createSupersDeterministicContractHash(content)
	};
}

async function recoveryArguments(): Promise<LaterIntegrationFreshnessRecoveryArguments> {
	const originalIntegrationReceipt = await integrationReceipt(
		'original-task',
		originalBaseline,
		originalIntegrated,
		[path]
	);
	const laterIntegrationReceipt = await integrationReceipt(
		'later-task',
		laterBaseline,
		laterIntegrated,
		['src/routes/api/user-compositions/[slug]/+server.ts', path]
	);
	return {
		workItem: 'original-task',
		originalChangeImpact: {
			workItem: 'original-task',
			baselineHead: originalBaseline,
			treeFingerprint: previousFingerprint,
			paths: [path]
		},
		originalIntegrationReceipt,
		currentVerification: {
			workItem: 'original-task',
			integratedRevision: originalIntegrated,
			treeFingerprint: currentFingerprint,
			changedPaths: [path],
			workflowRunId: 'current-verification-run',
			disposition: 'reconcile'
		},
		laterCandidates: [
			{
				workItem: 'later-task',
				integrationReceipt: laterIntegrationReceipt,
				verification: {
					workItem: 'later-task',
					integratedRevision: laterIntegrated,
					treeFingerprint: 'f'.repeat(64),
					changedPaths: ['src/routes/api/user-compositions/[slug]/+server.ts', path],
					workflowRunId: 'later-verification-run',
					disposition: 'reconcile'
				},
				factoryState: {
					workItem: 'later-task',
					stageId: 'done',
					status: 'terminal',
					definitionVersion: 38
				},
				trackerCompletion: {
					status: 'succeeded',
					runId: 'later-completion-run',
					model: 'supers-sentry-reproduction-transport',
					method: 'complete-machine-sentry',
					outputId: 'later-completion-output',
					taskId: 'later-task',
					commitKind: 'commit'
				}
			}
		]
	};
}

function validGitEvidence(): LaterIntegrationGitEvidence {
	return {
		currentTreeFingerprint: currentFingerprint,
		currentPathsClean: true,
		originalIntegratedIsAncestorOfLaterBaseline: true,
		laterBaselineIsAncestorOfLaterIntegrated: true,
		laterIntegratedIsAncestorOfHead: true,
		originalToLaterBaselineScopedPaths: [],
		laterReceiptChangedPaths: ['src/routes/api/user-compositions/[slug]/+server.ts', path],
		laterScopedPaths: [path],
		originalToHeadScopedPaths: [path],
		laterIntegratedToHeadScopedPaths: []
	};
}

Deno.test('freshness recovery binds one exact later terminal integration', async () => {
	const args = await recoveryArguments();
	const recovery = await createLaterIntegrationFreshnessRecovery(args, async () =>
		validGitEvidence()
	);
	assert.equal(recovery.authority, 'terminal-later-integration');
	assert.equal(recovery.workItem, 'original-task');
	assert.equal(recovery.previousFingerprint, previousFingerprint);
	assert.equal(recovery.currentFingerprint, currentFingerprint);
	assert.equal(recovery.laterWorkItem, 'later-task');
	assert.equal(
		recovery.laterIntegrationReceiptId,
		args.laterCandidates[0].integrationReceipt.receiptId
	);
	assert.deepEqual(recovery.driftPaths, [path]);
	assert.match(recovery.receiptId, /^[0-9a-f]{64}$/);
});

Deno.test('freshness recovery rejects dirty or post-integration path tampering', async () => {
	for (const evidence of [
		{ ...validGitEvidence(), currentPathsClean: false },
		{ ...validGitEvidence(), laterIntegratedToHeadScopedPaths: [path] },
		{ ...validGitEvidence(), originalToLaterBaselineScopedPaths: [path] }
	]) {
		await assert.rejects(
			async () =>
				await createLaterIntegrationFreshnessRecovery(
					await recoveryArguments(),
					async () => evidence
				),
			/exactly one terminal later integration; found 0/
		);
	}
});

Deno.test('freshness recovery rejects ambiguous later terminal integrations', async () => {
	const args = await recoveryArguments();
	const secondReceipt = await integrationReceipt(
		'second-later-task',
		laterBaseline,
		laterIntegrated,
		['src/routes/api/user-compositions/[slug]/+server.ts', path]
	);
	args.laterCandidates.push({
		...args.laterCandidates[0],
		workItem: 'second-later-task',
		integrationReceipt: secondReceipt,
		verification: {
			...args.laterCandidates[0].verification,
			workItem: 'second-later-task'
		},
		factoryState: {
			...args.laterCandidates[0].factoryState,
			workItem: 'second-later-task'
		},
		trackerCompletion: {
			...args.laterCandidates[0].trackerCompletion,
			taskId: 'second-later-task'
		}
	});
	await assert.rejects(
		() => createLaterIntegrationFreshnessRecovery(args, async () => validGitEvidence()),
		/exactly one terminal later integration; found 2/
	);
});
