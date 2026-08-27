import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
	coordinateFactoryPiDispatchWave,
	retryFactoryPiSubmission
} from './factory-pi-dispatch-coordinator.ts';
import {
	checkFactoryDispatchPrerequisites,
	consumePreparedFactoryPiDispatch,
	prepareValidatedFactoryPiDispatchWave,
	type FactoryDispatchIntent,
	type FactoryPrerequisiteCommandRunner
} from './factory-dispatch-prerequisites.ts';
import { createFactoryFleetWorkerOutputJsonSchema } from '../extensions/models/factory-fleet-worker-output-contract.ts';

const FACTORY = { id: '90fac686-c724-4aee-97c4-e31b9af4c5e2', name: 'supers-delivery' } as const;
const SUBMISSION_RECEIPT = {
	newlyConsumed: true,
	ordinal: 1,
	submissionAttemptReceiptDigest: 'a'.repeat(64)
} as const;

function lane(number: number): {
	intent: FactoryDispatchIntent;
	runner: FactoryPrerequisiteCommandRunner;
} {
	const rootEpicId = `epic-${number}`;
	const workItem = `task-${number}`;
	const piKey = `factory:${rootEpicId}:${workItem}`;
	const work = {
		mode: 'dispatch',
		skills: ['implementation'],
		systemPrompt: `Implement ${workItem}.`
	} as const;
	const intent: FactoryDispatchIntent = {
		sourceFactory: FACTORY,
		workItem,
		rootEpicId,
		activeTaskId: workItem,
		stage: 'implementation',
		invocation: {
			mode: 'dispatch',
			piKey,
			request: {
				agent: 'worker',
				task: work.systemPrompt,
				worktree: true,
				context: 'fork',
				skill: work.skills,
				outputSchema: createFactoryFleetWorkerOutputJsonSchema({
					rootEpicId,
					activeTaskId: workItem,
					workItem,
					piKey
				}),
				acceptance: false,
				async: true,
				artifacts: true
			}
		}
	};
	return {
		intent,
		runner: (command, args) => {
			if (command === 'swamp' && args[0] === 'data')
				return {
					status: 0,
					stderr: '',
					stdout: JSON.stringify([
						{
							attributes: {
								workItem,
								stage: { id: 'implementation', cycle: 1 },
								dispatch: { cycle: 1, attempts: 0 },
								work
							}
						}
					])
				};
			if (command === 'dex')
				return {
					status: 0,
					stderr: '',
					stdout: JSON.stringify({
						results: [
							{
								id: rootEpicId,
								parent_id: null,
								completed: false,
								started_at: null,
								blockedBy: []
							},
							{
								id: workItem,
								parent_id: rootEpicId,
								completed: false,
								started_at: '2026-08-17T00:00:00Z',
								blockedBy: []
							}
						]
					})
				};
			return { status: 0, stdout: command === 'pi' ? 'pi 1.0' : '', stderr: '' };
		}
	};
}

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
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => [key, canonicalize(entry)])
	);
}

function digest(value: unknown): string {
	return createHash('sha256')
		.update(typeof value === 'string' ? value : JSON.stringify(canonicalize(value)))
		.digest('hex');
}

function plans() {
	return [lane(2), lane(1)].map((item) => {
		const result = checkFactoryDispatchPrerequisites({
			intent: item.intent,
			runCommand: item.runner
		});
		if (!result.passed) throw new Error('fixture prerequisite failed');
		return result;
	});
}

function retryFixture() {
	const item = lane(1);
	const plan = checkFactoryDispatchPrerequisites({
		intent: item.intent,
		runCommand: item.runner
	});
	if (!plan.passed) throw new Error('fixture prerequisite failed');
	const prepared = prepareValidatedFactoryPiDispatchWave([plan]);
	const record = consumePreparedFactoryPiDispatch(prepared[0]!);
	const canonicalFrozenPiRequest = JSON.stringify(canonicalize(record.piRequest));
	const exactFrozenRequestDigest = digest(canonicalFrozenPiRequest);
	const piTaskDigest = digest(record.piRequest.task);
	const stored = {
		dispatchToken: '',
		profileModelName: 'project-delivery-profile',
		state: 'submission-retryable' as const,
		sourceFactoryId: record.request.sourceFactory.id,
		workItem: record.request.workItem,
		rootEpicId: record.request.rootEpicId,
		stage: record.request.stage,
		stageCycle: record.request.stageCycle,
		dispatchAttempt: record.request.expectedNextDispatchAttempt,
		exactFrozenRequestDigest,
		piTaskDigest,
		canonicalFrozenPiRequest
	};
	const dispatchToken = digest({
		sourceFactoryId: stored.sourceFactoryId,
		workItem: stored.workItem,
		stage: stored.stage,
		stageCycle: stored.stageCycle,
		dispatchAttempt: stored.dispatchAttempt,
		exactFrozenRequestDigest
	});
	return { record, dispatchToken, stored: { ...stored, dispatchToken } };
}

describe('Factory Pi dispatch coordinator', () => {
	it('reserves the complete wave, then records and launches each root sequentially', async () => {
		const events: string[] = [];
		const outcomes = await coordinateFactoryPiDispatchWave({
			plans: plans(),
			reservePiDispatch: async (request) => {
				events.push(`reserve:${request.workItem}`);
				return {
					dispatchToken: request.workItem === 'task-1' ? '1'.repeat(64) : '2'.repeat(64),
					profileModelName: 'project-delivery-profile'
				};
			},
			recordDispatch: async (request, runId) => {
				assert.match(runId, /^[0-9a-f]{64}$/);
				events.push(`record:${request.workItem}`);
			},
			recordPiSubmissionAttempt: async ({ dispatchToken }) => {
				events.push(`submit-attempt:${dispatchToken === '1'.repeat(64) ? 'task-1' : 'task-2'}`);
				return SUBMISSION_RECEIPT;
			},
			launchPi: async (request) => {
				assert.match(
					request.task,
					/swamp model method run project-delivery-profile claim_pi_execution/
				);
				assert.doesNotMatch(request.task, /supers-delivery-profile/);
				assert.match(
					request.task,
					/SWAMP_REPO_DIR="\$\(dirname "\$\(git rev-parse --path-format=absolute --git-common-dir\)"\)"/
				);
				assert.match(request.task, /ownerPiRunId as piRunId/);
				const item = request.task.includes('task-1') ? 'task-1' : 'task-2';
				events.push(`launch:${item}`);
				return {
					piRunId: `run-${item}-0000`,
					asyncDir: `/tmp/run-${item}-0000`,
					mode: 'workflow' as const
				};
			},
			bindPiLaunch: async ({ piRunId }) => {
				events.push(`bind:${piRunId.includes('task-1') ? 'task-1' : 'task-2'}`);
			},
			reconcilePiDispatch: async () => {
				throw new Error('unexpected reconciliation');
			}
		});
		assert.deepEqual(events, [
			'reserve:task-1',
			'reserve:task-2',
			'record:task-1',
			'submit-attempt:task-1',
			'launch:task-1',
			'bind:task-1',
			'record:task-2',
			'submit-attempt:task-2',
			'launch:task-2',
			'bind:task-2'
		]);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['submitted', 'submitted']
		);
	});

	it('reconciles a rejected launch and still launches the unrelated root', async () => {
		const launched: string[] = [];
		const reconciled: string[] = [];
		const outcomes = await coordinateFactoryPiDispatchWave({
			plans: plans(),
			reservePiDispatch: async (request) => ({
				dispatchToken: (request.workItem === 'task-1' ? '1' : '2').repeat(64),
				profileModelName: 'project-delivery-profile'
			}),
			recordDispatch: async () => undefined,
			recordPiSubmissionAttempt: async () => SUBMISSION_RECEIPT,
			launchPi: async (request) => {
				const item = request.task.includes('task-1') ? 'task-1' : 'task-2';
				launched.push(item);
				if (item === 'task-1') throw new Error('transport rejected');
				return {
					piRunId: 'run-task-2-0000',
					asyncDir: '/tmp/run-task-2-0000',
					mode: 'workflow' as const
				};
			},
			bindPiLaunch: async () => undefined,
			reconcilePiDispatch: async ({ dispatchToken }) => {
				reconciled.push(dispatchToken);
			}
		});
		assert.deepEqual(launched, ['task-1', 'task-2']);
		assert.deepEqual(reconciled, ['1'.repeat(64)]);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['submission-reconciling', 'submitted']
		);
	});

	it('does not reconcile a submission-attempt recording failure and continues later roots', async () => {
		const launched: string[] = [];
		const reconciled: string[] = [];
		const outcomes = await coordinateFactoryPiDispatchWave({
			plans: plans(),
			reservePiDispatch: async (request) => ({
				dispatchToken: (request.workItem === 'task-1' ? '1' : '2').repeat(64),
				profileModelName: 'project-delivery-profile'
			}),
			recordDispatch: async () => undefined,
			recordPiSubmissionAttempt: async ({ dispatchToken }) => {
				if (dispatchToken === '1'.repeat(64)) throw new Error('attempt receipt write failed');
				return SUBMISSION_RECEIPT;
			},
			launchPi: async (request) => {
				const item = request.task.includes('task-1') ? 'task-1' : 'task-2';
				launched.push(item);
				return {
					piRunId: `run-${item}-0000`,
					asyncDir: `/tmp/run-${item}-0000`,
					mode: 'workflow' as const
				};
			},
			bindPiLaunch: async () => undefined,
			reconcilePiDispatch: async ({ dispatchToken }) => {
				reconciled.push(dispatchToken);
			}
		});
		assert.deepEqual(launched, ['task-2']);
		assert.deepEqual(reconciled, []);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['submission-attempt-failed', 'submitted']
		);
		const failed = outcomes[0]!;
		if (failed.state === 'submitted') throw new Error('first root unexpectedly submitted');
		assert.equal(failed.dispatchToken, '1'.repeat(64));
		assert.equal(failed.workItem, 'task-1');
		assert.match(failed.error, /attempt receipt write failed/);
	});

	it('keeps launching later roots when one relevant lifecycle cannot bind', async () => {
		const bound: string[] = [];
		const reconciled: string[] = [];
		const outcomes = await coordinateFactoryPiDispatchWave({
			plans: plans(),
			reservePiDispatch: async (request) => ({
				dispatchToken: (request.workItem === 'task-1' ? '1' : '2').repeat(64),
				profileModelName: 'project-delivery-profile'
			}),
			recordDispatch: async () => undefined,
			recordPiSubmissionAttempt: async () => SUBMISSION_RECEIPT,
			launchPi: async (request) => {
				const item = request.task.includes('task-1') ? 'task-1' : 'task-2';
				return {
					piRunId: `run-${item}-0000`,
					asyncDir: `/tmp/run-${item}-0000`,
					mode: 'workflow' as const
				};
			},
			bindPiLaunch: async ({ piRunId }) => {
				bound.push(piRunId);
				if (piRunId.includes('task-1')) throw new Error('malformed relevant lifecycle');
			},
			reconcilePiDispatch: async ({ dispatchToken }) => {
				reconciled.push(dispatchToken);
			}
		});
		assert.deepEqual(bound, ['run-task-1-0000', 'run-task-2-0000']);
		assert.deepEqual(reconciled, ['1'.repeat(64)]);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['submission-reconciling', 'submitted']
		);
	});

	it('replaying one uncertain submission attempt reconciles without a second physical launch', async () => {
		const fixture = retryFixture();
		const submissionAttemptId = 'b'.repeat(64);
		let recorded = false;
		let launches = 0;
		let reconciliations = 0;
		const retry = () =>
			retryFactoryPiSubmission({
				dispatchToken: fixture.dispatchToken,
				submissionAttemptId,
				getPiDispatchRequest: async () => fixture.stored,
				recordPiSubmissionAttempt: async () => {
					const newlyConsumed = !recorded;
					recorded = true;
					return {
						newlyConsumed,
						ordinal: 1,
						submissionAttemptReceiptDigest: 'c'.repeat(64)
					};
				},
				launchPi: async () => {
					launches += 1;
					throw new Error('acknowledgement lost');
				},
				bindPiLaunch: async () => {
					throw new Error('unreachable');
				},
				reconcilePiDispatch: async () => {
					reconciliations += 1;
				}
			});
		assert.equal((await retry()).state, 'submission-reconciling');
		assert.equal((await retry()).state, 'submission-reconciling');
		assert.equal(launches, 1);
		assert.equal(reconciliations, 2);
	});

	it('retry rejects a malicious self-consistent alternate request before recording or launching', async () => {
		const fixture = retryFixture();
		const alternateRequest = {
			...fixture.record.piRequest,
			task: 'Run a caller-substituted task.'
		};
		const canonicalAlternateRequest = JSON.stringify(canonicalize(alternateRequest));
		let attemptRecords = 0;
		let launches = 0;
		await assert.rejects(
			() =>
				retryFactoryPiSubmission({
					dispatchToken: fixture.dispatchToken,
					submissionAttemptId: 'b'.repeat(64),
					getPiDispatchRequest: async () => ({
						...fixture.stored,
						exactFrozenRequestDigest: digest(canonicalAlternateRequest),
						piTaskDigest: digest(alternateRequest.task),
						canonicalFrozenPiRequest: canonicalAlternateRequest
					}),
					recordPiSubmissionAttempt: async () => {
						attemptRecords += 1;
						return SUBMISSION_RECEIPT;
					},
					launchPi: async () => {
						launches += 1;
						throw new Error('unreachable');
					},
					bindPiLaunch: async () => undefined,
					reconcilePiDispatch: async () => undefined
				}),
			/content-addressed dispatch token/
		);
		assert.equal(attemptRecords, 0);
		assert.equal(launches, 0);
	});

	it('retry returns a typed attempt-recording error without reconciliation', async () => {
		const fixture = retryFixture();
		let reconciliations = 0;
		const outcome = await retryFactoryPiSubmission({
			dispatchToken: fixture.dispatchToken,
			submissionAttemptId: 'b'.repeat(64),
			getPiDispatchRequest: async () => fixture.stored,
			recordPiSubmissionAttempt: async () => {
				throw new Error('retry receipt unavailable');
			},
			launchPi: async () => {
				throw new Error('unreachable');
			},
			bindPiLaunch: async () => {
				throw new Error('unreachable');
			},
			reconcilePiDispatch: async () => {
				reconciliations += 1;
			}
		});
		assert.equal(outcome.state, 'submission-attempt-failed');
		assert.equal(reconciliations, 0);
		if (outcome.state === 'submitted') throw new Error('retry unexpectedly submitted');
		assert.match(outcome.error, /retry receipt unavailable/);
	});

	it('a fail-closed reconciliation error does not abort a later independent root', async () => {
		const launched: string[] = [];
		const outcomes = await coordinateFactoryPiDispatchWave({
			plans: plans(),
			reservePiDispatch: async (request) => ({
				dispatchToken: (request.workItem === 'task-1' ? '1' : '2').repeat(64),
				profileModelName: 'project-delivery-profile'
			}),
			recordDispatch: async () => undefined,
			recordPiSubmissionAttempt: async () => SUBMISSION_RECEIPT,
			launchPi: async (request) => {
				const item = request.task.includes('task-1') ? 'task-1' : 'task-2';
				launched.push(item);
				if (item === 'task-1') throw new Error('uncertain first root');
				return {
					piRunId: 'run-task-2-0000',
					asyncDir: '/tmp/run-task-2-0000',
					mode: 'workflow' as const
				};
			},
			bindPiLaunch: async () => undefined,
			reconcilePiDispatch: async () => {
				throw new Error('malformed candidate');
			}
		});
		assert.deepEqual(launched, ['task-1', 'task-2']);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['submission-reconciling', 'submitted']
		);
		const firstOutcome = outcomes[0]!;
		if (firstOutcome.state === 'submitted') throw new Error('first root unexpectedly submitted');
		assert.match(firstOutcome.error, /reconciliation failed closed/);
	});

	it('never records or launches a root whose durable reservation failed', async () => {
		const recorded: string[] = [];
		const launched: string[] = [];
		const outcomes = await coordinateFactoryPiDispatchWave({
			plans: plans(),
			reservePiDispatch: async (request) => {
				if (request.workItem === 'task-1') throw new Error('reservation unavailable');
				return { dispatchToken: '2'.repeat(64), profileModelName: 'project-delivery-profile' };
			},
			recordDispatch: async (request) => {
				recorded.push(request.workItem);
			},
			recordPiSubmissionAttempt: async () => SUBMISSION_RECEIPT,
			launchPi: async (request) => {
				launched.push(request.task);
				return {
					piRunId: 'run-task-2-0000',
					asyncDir: '/tmp/run-task-2-0000',
					mode: 'workflow' as const
				};
			},
			bindPiLaunch: async () => undefined,
			reconcilePiDispatch: async () => undefined
		});
		assert.deepEqual(recorded, ['task-2']);
		assert.equal(launched.length, 1);
		assert.deepEqual(
			outcomes.map((outcome) => outcome.state),
			['reservation-failed', 'submitted']
		);
	});
});
