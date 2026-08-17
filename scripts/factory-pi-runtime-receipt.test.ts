import { assertEquals } from 'jsr:@std/assert@1.0.19';
import { ensureDir } from 'jsr:@std/fs@1.0.21';
import { join } from 'jsr:@std/path@1.1.4';

import {
	createFactoryPiTransportTask,
	PiDispatchOutboxSchema
} from '../extensions/models/factory-pi-dispatch-outbox.ts';
import { createFactoryFleetWorkerOutputJsonSchema } from '../extensions/models/factory-fleet-worker-output-contract.ts';

function canonicalize(value: unknown): unknown {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		typeof value === 'number'
	)
		return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, canonicalize(entry)])
	);
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

async function sha256(value: string): Promise<string> {
	const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

type RuntimeReceiptFixture = {
	root: string;
	repoDir: string;
	asyncRoot: string;
	sessionRoot: string;
	outboxFile: string;
	runId: string;
	timestamp: string;
};

async function createRuntimeReceiptFixture(): Promise<RuntimeReceiptFixture> {
	const root = await Deno.makeTempDir({ prefix: 'factory-pi-runtime-cli-' });
	const repoDir = join(root, 'repo');
	const asyncRoot = join(root, 'async');
	const sessionRoot = join(root, 'sessions');
	const runId = 'run-cli-smoke-0001';
	const childRunId = `${runId}-child`;
	const runRoot = join(asyncRoot, runId);
	const sessionFile = join(sessionRoot, `${runId}.jsonl`);
	const schemaFile = join(sessionRoot, 'structured-output', childRunId, 'schema.json');
	const handoffFile = join(sessionRoot, 'handoffs', `${childRunId}.json`);
	await ensureDir(repoDir);
	await ensureDir(runRoot);
	await ensureDir(join(sessionRoot, 'structured-output', childRunId));
	await ensureDir(join(sessionRoot, 'handoffs'));

	const sourceFactoryId = '90fac686-c724-4aee-97c4-e31b9af4c5e2';
	const profileModelName = 'project-delivery-profile';
	const task = 'Implement task-1.';
	const outputSchema = createFactoryFleetWorkerOutputJsonSchema({
		rootEpicId: 'epic-1',
		activeTaskId: 'task-1',
		workItem: 'task-1',
		piKey: 'factory:epic-1:task-1'
	});
	const request = {
		agent: 'worker' as const,
		task,
		worktree: true as const,
		context: 'fork' as const,
		skill: ['implementation'],
		outputSchema,
		acceptance: false as const,
		async: true as const,
		artifacts: true as const
	};
	const exactFrozenRequestDigest = await sha256(canonicalJson(request));
	const piTaskDigest = await sha256(task);
	const dispatchToken = await sha256('fixture-dispatch-token');
	const submissionAttemptId = await sha256('fixture-submission-attempt');
	const submissionAttemptReceiptDigest = await sha256(
		canonicalJson({
			dispatchToken,
			submissionAttemptId,
			ordinal: 1,
			exactFrozenRequestDigest
		})
	);
	const timestamp = '2026-08-17T00:00:00.000Z';
	const outbox = PiDispatchOutboxSchema.parse({
		schemaVersion: 1,
		sourceFactoryId,
		workItem: 'task-1',
		rootEpicId: 'epic-1',
		stage: 'implementation',
		stageCycle: 1,
		dispatchAttempt: 1,
		exactFrozenRequestDigest,
		piTaskDigest,
		profileModelName,
		failureAuthorizerWorkflow: 'project-failure-authorizer',
		dispatchToken,
		state: 'submit-pending',
		canonicalFrozenPiRequest: canonicalJson(request),
		transportAttempts: 1,
		submissionAttemptReceipts: [
			{
				ordinal: 1,
				submissionAttemptId,
				receiptDigest: submissionAttemptReceiptDigest,
				recordedAt: timestamp
			}
		],
		maximumTransportAttempts: 3,
		reservedAt: timestamp,
		updatedAt: timestamp,
		piRequest: request
	});
	const transportTask = createFactoryPiTransportTask(
		task,
		profileModelName,
		dispatchToken,
		piTaskDigest,
		{
			submissionAttemptId,
			ordinal: 1,
			receiptDigest: submissionAttemptReceiptDigest
		}
	);
	await Deno.writeTextFile(
		sessionFile,
		JSON.stringify({
			type: 'message',
			message: {
				role: 'user',
				content: [{ type: 'text', text: `Task: ${transportTask}` }]
			}
		})
	);
	await Deno.writeTextFile(schemaFile, JSON.stringify(outputSchema));

	const fixtureText = await Deno.readTextFile(
		join(Deno.cwd(), 'fixtures/pi-workflow-lifecycle/completed-run.json')
	);
	const fixture = JSON.parse(
		fixtureText
			.replaceAll('OUTER_RUN_ID', runId)
			.replaceAll('CHILD_RUN_ID', childRunId)
			.replaceAll('REPO_DIR', repoDir)
			.replaceAll('SESSION_FILE', sessionFile)
			.replaceAll('SCHEMA_FILE', schemaFile)
			.replaceAll('HANDOFF_FILE', handoffFile)
			.replaceAll('PATCH_FILE', join(runRoot, 'task-0-worker.patch'))
	) as { status: unknown; handoff: unknown };
	await Deno.writeTextFile(join(runRoot, 'status.json'), JSON.stringify(fixture.status));
	await Deno.writeTextFile(handoffFile, JSON.stringify(fixture.handoff));
	const outboxFile = join(root, 'outbox.json');
	await Deno.writeTextFile(outboxFile, JSON.stringify(outbox));
	return { root, repoDir, asyncRoot, sessionRoot, outboxFile, runId, timestamp };
}

async function executeRuntimeReceiptCli(
	fixture: RuntimeReceiptFixture,
	piRunId?: string
): Promise<Deno.CommandOutput> {
	return new Deno.Command(join(Deno.cwd(), 'scripts/factory-pi-runtime-receipt.ts'), {
		args: [
			'--outbox',
			fixture.outboxFile,
			'--repo',
			fixture.repoDir,
			...(piRunId ? ['--pi-run-id', piRunId] : []),
			'--pi-async-root',
			fixture.asyncRoot,
			'--pi-session-root',
			fixture.sessionRoot
		],
		cwd: Deno.cwd(),
		stdout: 'piped',
		stderr: 'piped'
	}).output();
}

Deno.test(
	'factory Pi runtime receipt executable verifies the canonical completed-run fixture',
	async () => {
		const fixture = await createRuntimeReceiptFixture();
		try {
			const result = await executeRuntimeReceiptCli(fixture, fixture.runId);
			assertEquals(
				{ code: result.code, stderr: new TextDecoder().decode(result.stderr) },
				{ code: 0, stderr: '' }
			);
			const inspection = JSON.parse(new TextDecoder().decode(result.stdout)) as {
				available: boolean;
				receipts: Array<{ piRunId: string; contractState: string }>;
				relevantArtifactInvalid: boolean;
			};
			assertEquals(inspection.available, true);
			assertEquals(inspection.relevantArtifactInvalid, false);
			assertEquals(
				inspection.receipts.map(({ piRunId, contractState }) => ({ piRunId, contractState })),
				[{ piRunId: fixture.runId, contractState: 'verified' }]
			);
		} finally {
			await Deno.remove(fixture.root, { recursive: true });
		}
	}
);

Deno.test(
	'factory Pi runtime receipt executable fails closed for one valid receipt plus a relevant malformed candidate',
	async () => {
		const fixture = await createRuntimeReceiptFixture();
		try {
			const malformedRunId = 'run-cli-malformed-0002';
			const malformedRunRoot = join(fixture.asyncRoot, malformedRunId);
			await ensureDir(malformedRunRoot);
			await Deno.writeTextFile(
				join(malformedRunRoot, 'run-fanout-budget.json'),
				JSON.stringify({
					version: 1,
					rootRunId: malformedRunId,
					createdAt: Date.parse(fixture.timestamp)
				})
			);
			await Deno.writeTextFile(join(malformedRunRoot, 'status.json'), '{malformed');

			const result = await executeRuntimeReceiptCli(fixture);
			assertEquals(
				{ code: result.code, stderr: new TextDecoder().decode(result.stderr) },
				{ code: 2, stderr: '' }
			);
			const inspection = JSON.parse(new TextDecoder().decode(result.stdout)) as {
				available: boolean;
				receipts: Array<{ piRunId: string; contractState: string }>;
				relevantArtifactInvalid: boolean;
			};
			assertEquals(inspection.available, true);
			assertEquals(inspection.relevantArtifactInvalid, true);
			assertEquals(
				inspection.receipts.map(({ piRunId, contractState }) => ({ piRunId, contractState })),
				[{ piRunId: fixture.runId, contractState: 'verified' }]
			);
		} finally {
			await Deno.remove(fixture.root, { recursive: true });
		}
	}
);
