import assert from 'node:assert/strict';

import {
	canonicalSentryJson,
	createSentrySha256
} from './sentry-issue-intake-adapter.ts';
import { createSupersDeterministicContractHash } from './supers-deterministic-factory-contract.ts';
import { model } from './repo-audit.ts';

const task = {
	schemaVersion: 1 as const,
	adapterVersion: '2026.08.20.1' as const,
	ownerToken: 'supers-delivery',
	id: 'task-1',
	parentId: 'epic-1',
	name: 'Route Swamp performance work',
	description:
		'Supers-Delivery-Domains: swamp-control-plane, performance\nSupers-Delivery-Benchmarks: benchmark:factory-route',
	priority: 1,
	completed: false,
	result: null,
	metadata: null,
	createdAt: '2026-08-25T10:00:00.000Z',
	updatedAt: '2026-08-25T11:00:00.000Z',
	startedAt: '2026-08-25T10:30:00.000Z',
	completedAt: null,
	blockedBy: [],
	blocks: [],
	children: []
};

type WorkDomainMethod = {
	execute: (
		args: Record<string, unknown>,
		context: Record<string, unknown>
	) => Promise<{ dataHandles: Array<{ name: string }> }>;
};

const method = model.methods['classify-work-domain-intent'] as unknown as WorkDomainMethod;
const migrationMethod = model.methods[
	'migrate-legacy-sentry-work-domain-intent'
] as unknown as WorkDomainMethod;

async function withSentryFingerprint<T extends Record<string, unknown>>(
	content: T
): Promise<T & { fingerprint: string }> {
	return {
		...content,
		fingerprint: await createSentrySha256(canonicalSentryJson(content))
	};
}

async function legacySentryMigrationFixture(): Promise<Record<string, unknown>> {
	const repairIdentityFingerprint = '2'.repeat(64);
	const repairIntentFingerprint = '3'.repeat(64);
	const exactMarker = `[supers-sentry-repair issue=7674018380 identity=${repairIdentityFingerprint}]`;
	const checkoutRevision = 'a'.repeat(40);
	const integratedRevision = 'c'.repeat(40);
	const evidence = await withSentryFingerprint({
		schemaVersion: 1,
		authority: 'sentry-issue-event-evidence-v1',
		advisorySeer: true,
		repairIntentName: `sentry-repair-intent-${repairIntentFingerprint}`,
		repairIntentFingerprint,
		repairIdentityFingerprint,
		queueSelectionName: 'sentry-repair-planning-queue-selection',
		queueSelectionFingerprint: '4'.repeat(64),
		sourceSnapshotFingerprint: '5'.repeat(64),
		sourceReconciliationFingerprint: '6'.repeat(64),
		sourceTriageFingerprint: '7'.repeat(64),
		issueId: '7674018380',
		shortId: 'SUPERS-1K',
		issueStatus: 'unresolved',
		eventId: '8'.repeat(32),
		eventOccurredAt: '2026-08-25T10:00:00.000Z',
		lastSeen: '2026-08-25T10:01:00.000Z',
		eventRelease: `supers@${checkoutRevision}`,
		culprit: 'GET <path>',
		localRoute: '/p/example',
		stackFrames: [],
		breadcrumbCategories: ['console'],
		seerRootCauses: [],
		seerPlanRunId: 1,
		seerPlanSummary: 'Guard the exact failing boundary.',
		seerPlanSteps: [
			{ title: 'Guard boundary', description: 'Add the smallest safe guard.' }
		],
		checkoutRevision,
		capturedAt: '2026-08-25T10:02:00.000Z'
	});
	const mapping = await withSentryFingerprint({
		schemaVersion: 2,
		status: 'created',
		taskStatus: 'started',
		issueId: evidence.issueId,
		shortId: evidence.shortId,
		taskId: 'task-1',
		creationIntentFingerprint: '9'.repeat(64),
		repairIdentityFingerprint,
		exactMarker,
		mappedAt: '2026-08-25T10:03:00.000Z'
	});
	const admission = await withSentryFingerprint({
		schemaVersion: 2,
		authority: 'sentry-evidence-machine-admission-v1',
		issueId: evidence.issueId,
		shortId: evidence.shortId,
		dexTaskId: 'task-1',
		repairIntentFingerprint,
		repairIdentityFingerprint,
		taskMappingFingerprint: mapping.fingerprint,
		checkoutRevision,
		admittedAt: '2026-08-25T10:04:00.000Z',
		preservesHumanAestheticGate: true
	});
	const integrationReceiptContent = {
		schemaVersion: 1,
		rootEpicId: 'task-1',
		activeTaskId: 'task-1',
		factoryName: 'supers-delivery',
		handoffManifestDigest: 'a'.repeat(64),
		targetBaselineRevision: checkoutRevision,
		disposition: 'integrated',
		childRevisionEvidence: {
			status: 'verified',
			childCommittedRevision: 'b'.repeat(40)
		},
		baseCommit: checkoutRevision,
		patchDigest: 'b'.repeat(64),
		changedPaths: ['src/lib/platform/preset-validation.ts'],
		integratedRevision,
		integratedTreeFingerprint: 'c'.repeat(64),
		rejectionReason: 'none'
	} as const;
	const integrationReceipt = {
		...integrationReceiptContent,
		receiptId: await createSupersDeterministicContractHash(
			integrationReceiptContent
		)
	};
	return {
		workItem: 'task-1',
		sourceModelName: 'supers-dex-task-tracker',
		sourceResourceName: 'dex-task-task-1',
		sourceWorkflowRunId: 'migration-workflow-run-1',
		task: {
			...task,
			parentId: null,
			name: 'Repair SUPERS-1K from Sentry evidence',
			description: `Repair the observed issue.\n\n${exactMarker}`
		},
		evidenceName: `sentry-issue-repair-evidence-${repairIdentityFingerprint}`,
		evidence,
		mappingName: `sentry-repair-task-mapping-${mapping.fingerprint}`,
		mapping,
		admissionName: `sentry-repair-delivery-admission-${admission.fingerprint}`,
		admission,
		factoryState: {
			started: true,
			workItem: 'task-1',
			definitionVersion: 36,
			status: 'active',
			stage: { id: 'verification', cycle: 1, terminal: false },
			dispatch: {
				cycle: 1,
				attempts: 1,
				limit: 1,
				required: true,
				executed: true
			}
		},
		legacyVerification: {
			schemaVersion: 2,
			workItem: 'task-1',
			integratedRevision,
			workflowRunId: 'legacy-verification-run-1',
			disposition: 'automatic-rework',
			objectiveFailureCodes: ['structural-failed'],
			stageCycle: 1
		},
		integrationReceipt
	};
}

Deno.test('repo audit stores schema-validated additive pre-implementation routing', async () => {
	const writes: Array<{ specName: string; name: string; data: Record<string, unknown> }> = [];
	const result = await method.execute(
		{
			workItem: 'task-1',
			sourceModelName: 'supers-dex-task-tracker',
			sourceResourceName: 'task-snapshot-1',
			sourceWorkflowRunId: 'preflight-run-1',
			task
		},
		{
			repoDir: '/repo',
			globalArgs: {},
			logger: { info: () => undefined },
			readResource: () => Promise.resolve(null),
			writeResource: (specName: string, name: string, data: Record<string, unknown>) => {
				writes.push({ specName, name, data });
				return Promise.resolve({ name });
			}
		}
	);
	assert.equal(result.dataHandles.length, 1);
	assert.equal(writes[0].specName, 'work-domain-route');
	assert.equal(writes[0].data.schemaVersion, 2);
	assert.equal(writes[0].data.workItem, 'task-1');
	assert.equal(writes[0].data.routingAuthority, 'human-task-intent-additive');
	assert.match(String(writes[0].data.routeDigest), /^[0-9a-f]{64}$/);
	assert.deepEqual((writes[0].data.intent as Record<string, unknown>).declaredDomains, [
		'performance',
		'swamp-control-plane'
	]);
	assert.deepEqual((writes[0].data.intent as Record<string, unknown>).benchmarkScripts, [
		'benchmark:factory-route'
	]);
});

Deno.test('repo audit routes ordinary canonical task wording without directives', async () => {
	const writes: Array<{ data: Record<string, unknown> }> = [];
	await method.execute(
		{
			workItem: 'task-1',
			sourceModelName: 'supers-dex-task-tracker',
			sourceResourceName: 'task-snapshot-1',
			sourceWorkflowRunId: 'preflight-run-1',
			task: {
				...task,
				name: 'fix canvas inspector selection',
				description: '',
				metadata: null
			}
		},
		{
			repoDir: '/repo',
			globalArgs: {},
			logger: { info: () => undefined },
			readResource: () => Promise.resolve(null),
			writeResource: (_specName: string, _name: string, data: Record<string, unknown>) => {
				writes.push({ data });
				return Promise.resolve({ name: 'work-domain-route-task-1' });
			}
		}
	);
	const intent = writes[0].data.intent as Record<string, unknown>;
	assert.deepEqual(intent.declaredDomains, ['authoring-app']);
	assert.deepEqual(intent.selectedSkills, [
		'implementation',
		'svelte-code-writer',
		'svelte-core-bestpractices'
	]);
});

Deno.test('repo audit matches domain terms only in the canonical task name', async () => {
	const writes: Array<{ data: Record<string, unknown> }> = [];
	await method.execute(
		{
			workItem: 'task-1',
			sourceModelName: 'supers-dex-task-tracker',
			sourceResourceName: 'task-snapshot-1',
			sourceWorkflowRunId: 'preflight-run-1',
			task: {
				...task,
				name: 'Route Supers Factory verification by change domain',
				description:
					'Swamp-only: no lower-third Preset, Pack, browser, canvas inspector selection, render, export, or benchmark performance checks.',
				metadata: null
			}
		},
		{
			repoDir: '/repo',
			globalArgs: {},
			logger: { info: () => undefined },
			readResource: () => Promise.resolve(null),
			writeResource: (_specName: string, _name: string, data: Record<string, unknown>) => {
				writes.push({ data });
				return Promise.resolve({ name: 'work-domain-route-task-1' });
			}
		}
	);
	const intent = writes[0].data.intent as Record<string, unknown>;
	assert.deepEqual(intent.declaredDomains, ['swamp-control-plane']);
});

Deno.test(
	'repo audit rejects task snapshots outside the exact Supers Delivery work item',
	async () => {
		for (const changedTask of [
			{ ...task, id: 'other-task' },
			{ ...task, ownerToken: 'other-owner' }
		]) {
			await assert.rejects(
				() =>
					method.execute(
						{
							workItem: 'task-1',
							sourceModelName: 'supers-dex-task-tracker',
							sourceResourceName: 'task-snapshot-1',
							sourceWorkflowRunId: 'preflight-run-1',
							task: changedTask
						},
						{
							repoDir: '/repo',
							globalArgs: {},
							logger: { info: () => undefined },
							readResource: () => Promise.resolve(null),
							writeResource: () => Promise.resolve({ name: 'unreachable' })
						}
					),
				/exact Supers Delivery task snapshot/
			);
		}
	}
);

Deno.test('repo audit records explicit provenance for an admitted legacy Sentry route migration', async () => {
	const writes: Array<{ specName: string; data: Record<string, unknown> }> = [];
	const args = await legacySentryMigrationFixture();
	const result = await migrationMethod.execute(args, {
		repoDir: '/repo',
		globalArgs: {},
		logger: { info: () => undefined },
		readResource: () => Promise.resolve(null),
		writeResource: (
			specName: string,
			name: string,
			data: Record<string, unknown>
		) => {
			writes.push({ specName, data });
			return Promise.resolve({ name });
		}
	});
	assert.equal(result.dataHandles.length, 1);
	assert.equal(writes[0].specName, 'work-domain-route');
	assert.equal(writes[0].data.schemaVersion, 3);
	assert.equal(
		writes[0].data.routingAuthority,
		'legacy-sentry-admission-migration'
	);
	const migration = writes[0].data.migration as Record<string, unknown>;
	assert.equal(migration.factoryStage, 'verification');
	assert.equal(
		migration.admissionFingerprint,
		(args.admission as Record<string, unknown>).fingerprint
	);
	assert.match(String(writes[0].data.routeDigest), /^[0-9a-f]{64}$/);
});

Deno.test('repo audit legacy Sentry route migration fails closed on conflicting or existing provenance', async () => {
	const args = await legacySentryMigrationFixture();
	const admission = args.admission as Record<string, unknown>;
	const { fingerprint: _fingerprint, ...admissionContent } = admission;
	const conflictingAdmission = await withSentryFingerprint({
		...admissionContent,
		dexTaskId: 'other-task'
	});
	await assert.rejects(
		() =>
			migrationMethod.execute(
				{
					...args,
					admissionName: `sentry-repair-delivery-admission-${conflictingAdmission.fingerprint}`,
					admission: conflictingAdmission
				},
				{
					repoDir: '/repo',
					globalArgs: {},
					logger: { info: () => undefined },
					readResource: () => Promise.resolve(null),
					writeResource: () => Promise.resolve({ name: 'unreachable' })
				}
			),
		/does not bind one exact admitted repair/
	);
	await assert.rejects(
		() =>
			migrationMethod.execute(args, {
				repoDir: '/repo',
				globalArgs: {},
				logger: { info: () => undefined },
				readResource: () => Promise.resolve({ schemaVersion: 2 }),
				writeResource: () => Promise.resolve({ name: 'unreachable' })
			}),
		/refuses to overwrite/
	);
});
