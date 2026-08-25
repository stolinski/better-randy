import assert from 'node:assert/strict';

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
