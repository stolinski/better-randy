import { createHash } from 'node:crypto';

import {
	consumePreparedFactoryPiDispatch,
	prepareValidatedFactoryPiDispatchWave,
	type FactoryDispatchRequest,
	type FactoryPiAsyncRunRequest,
	type PreparedFactoryPiDispatch,
	type ValidatedFactoryDispatchPlan
} from './factory-dispatch-prerequisites.ts';

export interface FactoryPiReservationRequest {
	sourceFactoryId: string;
	workItem: string;
	rootEpicId: string;
	stage: string;
	stageCycle: number;
	dispatchAttempt: number;
	exactFrozenRequestDigest: string;
	piTaskDigest: string;
	piRequest: Readonly<FactoryPiAsyncRunRequest>;
	maximumTransportAttempts: number;
}

export interface FactoryPiStoredDispatchRequest {
	dispatchToken: string;
	profileModelName: string;
	state:
		| 'reserved'
		| 'dispatch-recorded'
		| 'submit-pending'
		| 'submitted'
		| 'execution-claimed'
		| 'handoff-ready'
		| 'completed'
		| 'submission-uncertain'
		| 'submission-retryable'
		| 'submission-parked'
		| 'execution-failed';
	sourceFactoryId: string;
	workItem: string;
	rootEpicId: string;
	stage: string;
	stageCycle: number;
	dispatchAttempt: number;
	exactFrozenRequestDigest: string;
	piTaskDigest: string;
	canonicalFrozenPiRequest: string;
}

export interface FactoryPiLaunchAcknowledgement {
	piRunId: string;
	asyncDir: string;
	mode: 'workflow';
}

export interface FactoryPiSubmissionAttemptReceipt {
	newlyConsumed: boolean;
	ordinal: number;
	submissionAttemptReceiptDigest: string;
}

export type FactoryPiDispatchOutcome =
	| Readonly<{ state: 'submitted'; dispatchToken: string; workItem: string; piRunId: string }>
	| Readonly<{
			state:
				| 'reservation-failed'
				| 'dispatch-failed'
				| 'submission-attempt-failed'
				| 'submission-reconciling';
			workItem: string;
			error: string;
			dispatchToken?: string;
	  }>;

function canonicalize(value: unknown): unknown {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)])
		);
	throw new TypeError(`Unsupported Pi request value: ${typeof value}`);
}
function digest(value: unknown): string {
	return createHash('sha256')
		.update(typeof value === 'string' ? value : JSON.stringify(canonicalize(value)))
		.digest('hex');
}
function parseCanonicalFactoryPiRequest(canonicalRequest: string): FactoryPiAsyncRunRequest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(canonicalRequest) as unknown;
	} catch {
		throw new Error('Stored Pi outbox request is not valid canonical JSON.');
	}
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed) ||
		JSON.stringify(canonicalize(parsed)) !== canonicalRequest
	)
		throw new Error('Stored Pi outbox request is not exact canonical JSON.');
	const request = parsed as Record<string, unknown>;
	const expectedFields = [
		'acceptance',
		'agent',
		'artifacts',
		'async',
		'context',
		'outputSchema',
		'skill',
		'task',
		'worktree'
	];
	if (
		JSON.stringify(Object.keys(request).sort()) !== JSON.stringify(expectedFields) ||
		request.agent !== 'worker' ||
		typeof request.task !== 'string' ||
		request.task.length === 0 ||
		request.worktree !== true ||
		request.context !== 'fork' ||
		!Array.isArray(request.skill) ||
		request.skill.length === 0 ||
		!request.skill.every((entry) => typeof entry === 'string' && entry.length > 0) ||
		request.outputSchema === null ||
		typeof request.outputSchema !== 'object' ||
		Array.isArray(request.outputSchema) ||
		request.acceptance !== false ||
		request.async !== true ||
		request.artifacts !== true
	)
		throw new Error('Stored Pi outbox request is not a valid frozen async worker request.');
	return request as unknown as FactoryPiAsyncRunRequest;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function reconcileAfterSubmissionError(
	dispatchToken: string,
	error: unknown,
	reconcile: (binding: Readonly<{ dispatchToken: string }>) => Promise<void>
): Promise<string> {
	const launchError = errorMessage(error);
	try {
		await reconcile({ dispatchToken });
		return launchError;
	} catch (reconciliationError) {
		return `${launchError}; reconciliation failed closed: ${errorMessage(reconciliationError)}`;
	}
}

/** Add only the code-owned transport token and admission command to an already frozen semantic task. */
export function createFactoryPiTransportRequest(
	request: Readonly<FactoryPiAsyncRunRequest>,
	profileModelName: string,
	dispatchToken: string,
	piTaskDigest: string,
	submissionAttempt: Readonly<{
		submissionAttemptId: string;
		ordinal: number;
		receiptDigest: string;
	}>
): Readonly<FactoryPiAsyncRunRequest> {
	if (!/^[a-z][a-z0-9_-]*$/.test(profileModelName))
		throw new Error('Profile model name is invalid for the Pi claim command.');
	return Object.freeze({
		...request,
		task: [
			`SUPERS_FACTORY_DISPATCH_TOKEN=${dispatchToken}`,
			`SUPERS_FACTORY_TASK_DIGEST=${piTaskDigest}`,
			`SUPERS_FACTORY_SUBMISSION_ATTEMPT_ID=${submissionAttempt.submissionAttemptId}`,
			`SUPERS_FACTORY_SUBMISSION_ATTEMPT_ORDINAL=${submissionAttempt.ordinal}`,
			`SUPERS_FACTORY_SUBMISSION_ATTEMPT_RECEIPT=${submissionAttempt.receiptDigest}`,
			'Before reading or editing repository files, claim this execution with:',
			`swamp model method run ${profileModelName} claim_pi_execution --input '{"dispatchToken":"${dispatchToken}","piRunId":"'"$PI_SUBAGENT_RUN_ID"'"}' --json`,
			'If the claim is not granted, stop without editing. Preserve the returned claim nonce in the structured handoff.',
			request.task
		].join('\n\n')
	});
}

/**
 * Validate the whole wave, reserve every root without Factory accounting, then
 * submit top-level async Pi runs one at a time. The only operation between each
 * successful record_dispatch and its Pi launch is local immutable request construction.
 */
export async function coordinateFactoryPiDispatchWave(input: {
	plans: readonly ValidatedFactoryDispatchPlan[];
	maximumTransportAttempts?: number;
	reservePiDispatch: (
		request: Readonly<FactoryPiReservationRequest>
	) => Promise<{ dispatchToken: string; profileModelName: string }>;
	recordDispatch: (
		request: Readonly<FactoryDispatchRequest>,
		dispatchRunId: string
	) => Promise<void>;
	recordPiSubmissionAttempt: (
		binding: Readonly<{ dispatchToken: string; submissionAttemptId: string }>
	) => Promise<FactoryPiSubmissionAttemptReceipt>;
	launchPi: (
		request: Readonly<FactoryPiAsyncRunRequest>
	) => Promise<FactoryPiLaunchAcknowledgement>;
	bindPiLaunch: (binding: Readonly<{ dispatchToken: string; piRunId: string }>) => Promise<void>;
	reconcilePiDispatch: (binding: Readonly<{ dispatchToken: string }>) => Promise<void>;
}): Promise<readonly FactoryPiDispatchOutcome[]> {
	const prepared = prepareValidatedFactoryPiDispatchWave(input.plans);
	const records = prepared.map((entry) => consumePreparedFactoryPiDispatch(entry));
	const reservations: Array<{
		record: (typeof records)[number];
		dispatchToken: string;
		profileModelName: string;
		requestDigest: string;
		taskDigest: string;
	} | null> = [];
	const outcomes: FactoryPiDispatchOutcome[] = [];

	for (const record of records) {
		const requestDigest = digest(record.piRequest);
		const taskDigest = digest(record.piRequest.task);
		try {
			const reserved = await input.reservePiDispatch({
				sourceFactoryId: record.request.sourceFactory.id,
				workItem: record.request.workItem,
				rootEpicId: record.request.rootEpicId,
				stage: record.request.stage,
				stageCycle: record.request.stageCycle,
				dispatchAttempt: record.request.expectedNextDispatchAttempt,
				exactFrozenRequestDigest: requestDigest,
				piTaskDigest: taskDigest,
				piRequest: record.piRequest,
				maximumTransportAttempts: input.maximumTransportAttempts ?? 3
			});
			reservations.push({
				record,
				dispatchToken: reserved.dispatchToken,
				profileModelName: reserved.profileModelName,
				requestDigest,
				taskDigest
			});
		} catch (error) {
			reservations.push(null);
			outcomes.push({
				state: 'reservation-failed',
				workItem: record.request.workItem,
				error: errorMessage(error)
			});
		}
	}

	for (const reservation of reservations) {
		if (reservation === null) continue;
		const { record, dispatchToken, profileModelName, requestDigest, taskDigest } = reservation;
		try {
			record.refresh();
			await input.recordDispatch(record.request, requestDigest);
		} catch (error) {
			outcomes.push({
				state: 'dispatch-failed',
				dispatchToken,
				workItem: record.request.workItem,
				error: errorMessage(error)
			});
			continue;
		}
		const submissionAttemptId = digest({
			dispatchToken,
			exactFrozenRequestDigest: requestDigest,
			submissionSequence: 1
		});
		let submission: FactoryPiSubmissionAttemptReceipt;
		try {
			submission = await input.recordPiSubmissionAttempt({
				dispatchToken,
				submissionAttemptId
			});
		} catch (error) {
			outcomes.push({
				state: 'submission-attempt-failed',
				dispatchToken,
				workItem: record.request.workItem,
				error: errorMessage(error)
			});
			continue;
		}
		try {
			if (!submission.newlyConsumed)
				throw new Error(
					`Pi submission attempt ${submission.ordinal} was already consumed; reconciliation owns recovery.`
				);
			const acknowledgement = await input.launchPi(
				createFactoryPiTransportRequest(
					record.piRequest,
					profileModelName,
					dispatchToken,
					taskDigest,
					{
						submissionAttemptId,
						ordinal: submission.ordinal,
						receiptDigest: submission.submissionAttemptReceiptDigest
					}
				)
			);
			if (
				!acknowledgement.piRunId ||
				!acknowledgement.asyncDir ||
				acknowledgement.mode !== 'workflow'
			)
				throw new Error(
					'Pi normalized workflow launch acknowledgement is missing durable run identity.'
				);
			await input.bindPiLaunch({ dispatchToken, piRunId: acknowledgement.piRunId });
			outcomes.push({
				state: 'submitted',
				dispatchToken,
				workItem: record.request.workItem,
				piRunId: acknowledgement.piRunId
			});
		} catch (error) {
			const reconciledError = await reconcileAfterSubmissionError(
				dispatchToken,
				error,
				input.reconcilePiDispatch
			);
			outcomes.push({
				state: 'submission-reconciling',
				dispatchToken,
				workItem: record.request.workItem,
				error: reconciledError
			});
		}
	}
	return Object.freeze(outcomes);
}

/** Re-deliver only the canonical model-owned request under the existing Factory attempt. */
export async function retryFactoryPiSubmission(input: {
	dispatchToken: string;
	submissionAttemptId: string;
	getPiDispatchRequest: (
		binding: Readonly<{ dispatchToken: string }>
	) => Promise<FactoryPiStoredDispatchRequest>;
	recordPiSubmissionAttempt: (
		binding: Readonly<{ dispatchToken: string; submissionAttemptId: string }>
	) => Promise<FactoryPiSubmissionAttemptReceipt>;
	launchPi: (
		request: Readonly<FactoryPiAsyncRunRequest>
	) => Promise<FactoryPiLaunchAcknowledgement>;
	bindPiLaunch: (binding: Readonly<{ dispatchToken: string; piRunId: string }>) => Promise<void>;
	reconcilePiDispatch: (binding: Readonly<{ dispatchToken: string }>) => Promise<void>;
}): Promise<FactoryPiDispatchOutcome> {
	if (!/^[0-9a-f]{64}$/.test(input.dispatchToken))
		throw new Error('Pi dispatch token must be lowercase SHA-256.');
	if (!/^[0-9a-f]{64}$/.test(input.submissionAttemptId))
		throw new Error('Pi submission attempt identity must be lowercase SHA-256.');
	const stored = await input.getPiDispatchRequest({ dispatchToken: input.dispatchToken });
	if (stored.dispatchToken !== input.dispatchToken)
		throw new Error('Stored Pi outbox request returned a different dispatch token.');
	if (stored.state !== 'submission-retryable')
		throw new Error(`Pi submission retry is not allowed from ${stored.state}.`);
	const piRequest = parseCanonicalFactoryPiRequest(stored.canonicalFrozenPiRequest);
	const requestDigest = digest(stored.canonicalFrozenPiRequest);
	const taskDigest = digest(piRequest.task);
	if (requestDigest !== stored.exactFrozenRequestDigest || taskDigest !== stored.piTaskDigest)
		throw new Error('Stored Pi outbox request failed its content digests.');
	const recomputedDispatchToken = digest({
		sourceFactoryId: stored.sourceFactoryId,
		workItem: stored.workItem,
		stage: stored.stage,
		stageCycle: stored.stageCycle,
		dispatchAttempt: stored.dispatchAttempt,
		exactFrozenRequestDigest: requestDigest
	});
	if (recomputedDispatchToken !== input.dispatchToken)
		throw new Error('Stored Pi outbox request failed its content-addressed dispatch token.');
	let submission: FactoryPiSubmissionAttemptReceipt;
	try {
		submission = await input.recordPiSubmissionAttempt({
			dispatchToken: input.dispatchToken,
			submissionAttemptId: input.submissionAttemptId
		});
	} catch (error) {
		return {
			state: 'submission-attempt-failed',
			dispatchToken: input.dispatchToken,
			workItem: stored.workItem,
			error: errorMessage(error)
		};
	}
	try {
		if (!submission.newlyConsumed)
			throw new Error(
				`Pi submission attempt ${submission.ordinal} was already consumed; reconciliation owns recovery.`
			);
		const acknowledgement = await input.launchPi(
			createFactoryPiTransportRequest(
				piRequest,
				stored.profileModelName,
				input.dispatchToken,
				taskDigest,
				{
					submissionAttemptId: input.submissionAttemptId,
					ordinal: submission.ordinal,
					receiptDigest: submission.submissionAttemptReceiptDigest
				}
			)
		);
		if (
			!acknowledgement.piRunId ||
			!acknowledgement.asyncDir ||
			acknowledgement.mode !== 'workflow'
		)
			throw new Error(
				'Pi normalized workflow launch acknowledgement is missing durable run identity.'
			);
		await input.bindPiLaunch({
			dispatchToken: input.dispatchToken,
			piRunId: acknowledgement.piRunId
		});
		return {
			state: 'submitted',
			dispatchToken: input.dispatchToken,
			workItem: stored.workItem,
			piRunId: acknowledgement.piRunId
		};
	} catch (error) {
		const reconciledError = await reconcileAfterSubmissionError(
			input.dispatchToken,
			error,
			input.reconcilePiDispatch
		);
		return {
			state: 'submission-reconciling',
			dispatchToken: input.dispatchToken,
			workItem: stored.workItem,
			error: reconciledError
		};
	}
}

export type { PreparedFactoryPiDispatch };
