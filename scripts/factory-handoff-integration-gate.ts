import { z } from 'npm:zod@4.4.3';

import {
	PiDispatchOutboxSchema,
	PiHandoffAcceptanceSchema,
	piHandoffAcceptanceName
} from '../extensions/models/factory-pi-dispatch-outbox.ts';
import {
	createFactoryFleetWorkerOutputJsonSchema,
	factoryFleetChangedPathsAreAllowed,
	factoryFleetChangedPathsAreSorted,
	type FactoryFleetWorkerIdentity,
	type FactoryFleetWorkerOutput
} from '../extensions/models/factory-fleet-worker-output-contract.ts';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const SUPERS_DELIVERY_FACTORY_ID = '90fac686-c724-4aee-97c4-e31b9af4c5e2';

/** Derive the integration parser from the exact lane-bound Pi JSON Schema. */
export function createFactoryFleetWorkerOutputSchema(
	identity: FactoryFleetWorkerIdentity
): z.ZodType<FactoryFleetWorkerOutput> {
	const jsonSchema = createFactoryFleetWorkerOutputJsonSchema(identity);
	const schema = z
		.fromJSONSchema(jsonSchema as Parameters<typeof z.fromJSONSchema>[0])
		.superRefine((value, context) => {
			if (
				typeof value === 'object' &&
				value !== null &&
				'changedPaths' in value &&
				Array.isArray(value.changedPaths) &&
				value.changedPaths.every((path) => typeof path === 'string')
			) {
				if (!factoryFleetChangedPathsAreSorted(value.changedPaths)) {
					context.addIssue({
						code: 'custom',
						path: ['changedPaths'],
						message: 'Changed paths must be sorted and unique'
					});
				}
				if (!factoryFleetChangedPathsAreAllowed(value.changedPaths)) {
					context.addIssue({
						code: 'custom',
						path: ['changedPaths'],
						message: 'Changed paths include a protected Factory path'
					});
				}
			}
		});
	return schema as z.ZodType<FactoryFleetWorkerOutput>;
}

/** Validate a concrete child result with the parser derived from its approved Pi schema. */
export function validateFactoryFleetWorkerOutputAgainstApprovedPiSchema(
	value: unknown,
	identity: FactoryFleetWorkerIdentity
): FactoryFleetWorkerOutput {
	createFactoryFleetWorkerOutputSchema(identity).parse(value);
	return value as FactoryFleetWorkerOutput;
}

const HandoffPatchSchema = z.strictObject({
	path: z.string().min(1),
	branch: z.string().min(1),
	changed: z.boolean(),
	diffStat: z.string(),
	filesChanged: z.number().int().nonnegative(),
	insertions: z.number().int().nonnegative(),
	deletions: z.number().int().nonnegative(),
	error: z.string().optional()
});

const HandoffChildEnvelopeSchema = z.strictObject({
	index: z.number().int().nonnegative(),
	taskIndex: z.number().int().nonnegative(),
	agent: z.string().min(1),
	status: z.enum(['completed', 'failed', 'paused', 'stopped', 'detached']),
	summary: z.string(),
	outputPath: z.string().optional(),
	structuredOutput: z.unknown(),
	structuredOutputPath: z.string().optional(),
	sessionPath: z.string().optional(),
	patch: HandoffPatchSchema
});

const HandoffCleanupTaskSchema = z.strictObject({
	index: z.number().int().nonnegative(),
	path: z.string().min(1),
	branch: z.string().min(1),
	worktreeRemoved: z.boolean(),
	branchRemoved: z.boolean(),
	preserved: z.boolean().optional(),
	reason: z.string().optional(),
	errors: z.array(z.string()).optional()
});

const PiHandoffManifestEnvelopeSchema = z.strictObject({
	version: z.literal(1),
	runId: z.string().min(1),
	mode: z.enum(['parallel', 'chain']),
	source: z.enum(['foreground', 'async']),
	cwd: z.string().min(1),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
	groups: z
		.array(
			z.strictObject({
				stepIndex: z.number().int().nonnegative(),
				baseCommit: z.string().regex(GIT_REVISION_PATTERN),
				repoRoot: z.string().min(1),
				children: z.array(HandoffChildEnvelopeSchema).min(1),
				cleanup: z.strictObject({
					state: z.enum(['complete', 'partial']),
					tasks: z.array(HandoffCleanupTaskSchema),
					pruned: z.boolean(),
					errors: z.array(z.string()).optional()
				})
			})
		)
		.min(1)
});

export type FactoryHandoffGateRejectionReason =
	| 'manifest-invalid'
	| 'execution-claim-mismatch'
	| 'stale-target-baseline'
	| 'patch-digest-mismatch'
	| 'child-revision-mismatch'
	| 'changed-path-mismatch'
	| 'protected-path'
	| 'patch-conflict';

export type FactoryHandoffGateInput = {
	manifestBytes: Uint8Array;
	patchBytes: Uint8Array;
	expectedManifestDigest: string;
	expectedPatchDigest: string;
	expectedRootEpicId: string;
	expectedActiveTaskId: string;
	expectedWorkItem: string;
	expectedPiKey: string;
	readTrustedCurrentDispatchAuthority: () => Promise<unknown>;
	readTrustedHandoffAcceptance: (resourceName: string) => Promise<unknown>;
	targetBaselineRevision: string;
	currentTargetRevision: string;
	targetClean: boolean;
	baseIsAncestorOfTarget: boolean;
	childRevisionExists: boolean;
	verifiedChildRevision: string;
	childDiffBytes: Uint8Array;
	patchChangedPaths: string[];
	patchApplies: boolean;
};

export type FactoryHandoffGateResult =
	| {
			disposition: 'accepted';
			baseCommit: string;
			childCommittedRevision: string;
			changedPaths: string[];
			handoffManifestDigest: string;
			patchDigest: string;
	  }
	| {
			disposition: 'rejected';
			rejectionReason: FactoryHandoffGateRejectionReason;
	  };

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
async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256Text(value: string): Promise<string> {
	return sha256Hex(new TextEncoder().encode(value));
}

const TrustedCurrentDispatchAuthoritySchema = z.strictObject({
	outbox: PiDispatchOutboxSchema,
	factoryStatus: z
		.object({
			sourceFactoryId: z.string().uuid(),
			workItem: z.string().min(1),
			stage: z.object({ id: z.string().min(1), cycle: z.number().int().positive() }),
			dispatch: z.object({ attempts: z.number().int().positive() })
		})
		.passthrough()
});

function rejected(rejectionReason: FactoryHandoffGateRejectionReason): FactoryHandoffGateResult {
	return { disposition: 'rejected', rejectionReason };
}

/**
 * Pure fail-closed decision seam. Callers derive Git facts without mutating the
 * target, then this function binds them to the durable Pi manifest and patch.
 */
export async function verifyFactoryHandoffIntegrationGate(
	input: FactoryHandoffGateInput
): Promise<FactoryHandoffGateResult> {
	if (!SHA256_PATTERN.test(input.expectedManifestDigest)) {
		return rejected('manifest-invalid');
	}
	const manifestDigest = await sha256Hex(input.manifestBytes);
	if (manifestDigest !== input.expectedManifestDigest) {
		return rejected('manifest-invalid');
	}

	let rawManifest: unknown;
	try {
		rawManifest = JSON.parse(new TextDecoder().decode(input.manifestBytes));
	} catch {
		return rejected('manifest-invalid');
	}
	if (
		input.expectedWorkItem !== input.expectedActiveTaskId ||
		input.expectedPiKey !== `factory:${input.expectedRootEpicId}:${input.expectedActiveTaskId}`
	) {
		return rejected('manifest-invalid');
	}
	const parsedManifest = PiHandoffManifestEnvelopeSchema.safeParse(rawManifest);
	if (!parsedManifest.success) return rejected('manifest-invalid');
	const workerOutputSchema = createFactoryFleetWorkerOutputSchema({
		rootEpicId: input.expectedRootEpicId,
		activeTaskId: input.expectedActiveTaskId,
		workItem: input.expectedWorkItem,
		piKey: input.expectedPiKey
	});
	const matches = parsedManifest.data.groups.flatMap((group) =>
		group.children.flatMap((child) => {
			const structuredOutput = workerOutputSchema.safeParse(child.structuredOutput);
			return structuredOutput.success
				? [{ group, child, structuredOutput: structuredOutput.data }]
				: [];
		})
	);
	if (matches.length !== 1) return rejected('manifest-invalid');
	const [{ group, child, structuredOutput }] = matches;
	let handoffAcceptance: z.infer<typeof PiHandoffAcceptanceSchema>;
	try {
		const authority = TrustedCurrentDispatchAuthoritySchema.parse(
			await input.readTrustedCurrentDispatchAuthority()
		);
		const outbox = authority.outbox;
		const status = authority.factoryStatus;
		if (
			outbox.state !== 'handoff-ready' ||
			outbox.sourceFactoryId !== SUPERS_DELIVERY_FACTORY_ID ||
			status.sourceFactoryId !== outbox.sourceFactoryId ||
			status.workItem !== outbox.workItem ||
			status.stage.id !== outbox.stage ||
			status.stage.cycle !== outbox.stageCycle ||
			status.dispatch.attempts !== outbox.dispatchAttempt ||
			outbox.workItem !== input.expectedWorkItem ||
			outbox.rootEpicId !== input.expectedRootEpicId ||
			outbox.dispatchToken !== structuredOutput.dispatchToken ||
			outbox.piRunId !== structuredOutput.piRunId ||
			outbox.claimNonceDigest !== (await sha256Text(structuredOutput.claimNonce)) ||
			outbox.handoffDigest !== manifestDigest ||
			!outbox.launchContractVerified ||
			!outbox.launchContractDigest
		) {
			return rejected('execution-claim-mismatch');
		}
		const resourceName = piHandoffAcceptanceName(outbox.dispatchToken);
		handoffAcceptance = PiHandoffAcceptanceSchema.parse(
			await input.readTrustedHandoffAcceptance(resourceName)
		);
		const { receiptDigest, ...receiptBody } = handoffAcceptance;
		if (
			handoffAcceptance.resourceName !== resourceName ||
			receiptDigest !== (await sha256Text(JSON.stringify(canonicalize(receiptBody)))) ||
			handoffAcceptance.sourceFactoryId !== outbox.sourceFactoryId ||
			handoffAcceptance.workItem !== outbox.workItem ||
			handoffAcceptance.rootEpicId !== outbox.rootEpicId ||
			handoffAcceptance.stage !== outbox.stage ||
			handoffAcceptance.stageCycle !== outbox.stageCycle ||
			handoffAcceptance.dispatchAttempt !== outbox.dispatchAttempt ||
			handoffAcceptance.dispatchToken !== outbox.dispatchToken ||
			handoffAcceptance.piRunId !== outbox.piRunId ||
			handoffAcceptance.claimNonceDigest !== outbox.claimNonceDigest ||
			handoffAcceptance.handoffDigest !== outbox.handoffDigest ||
			handoffAcceptance.launchContractDigest !== outbox.launchContractDigest ||
			handoffAcceptance.runtimeRequestDigest !== outbox.runtimeRequestDigest ||
			handoffAcceptance.piRuntimeReceiptDigest !== outbox.piRuntimeReceiptDigest
		) {
			return rejected('execution-claim-mismatch');
		}
	} catch {
		return rejected('execution-claim-mismatch');
	}
	if (
		child.status !== 'completed' ||
		!child.patch.changed ||
		child.patch.error !== undefined ||
		group.baseCommit !== structuredOutput.baseCommit
	) {
		return rejected('manifest-invalid');
	}

	const patchDigest = await sha256Hex(input.patchBytes);
	if (
		!SHA256_PATTERN.test(input.expectedPatchDigest) ||
		patchDigest !== input.expectedPatchDigest
	) {
		return rejected('patch-digest-mismatch');
	}
	if (
		!input.targetClean ||
		input.currentTargetRevision !== input.targetBaselineRevision ||
		!input.baseIsAncestorOfTarget
	) {
		return rejected('stale-target-baseline');
	}
	if (
		!input.childRevisionExists ||
		input.verifiedChildRevision !== structuredOutput.childCommittedRevision ||
		(await sha256Hex(input.childDiffBytes)) !== patchDigest
	) {
		return rejected('child-revision-mismatch');
	}
	if (!factoryFleetChangedPathsAreAllowed(input.patchChangedPaths)) {
		return rejected('protected-path');
	}
	const parsedPatchOutput = createFactoryFleetWorkerOutputSchema({
		rootEpicId: input.expectedRootEpicId,
		activeTaskId: input.expectedActiveTaskId,
		workItem: input.expectedWorkItem,
		piKey: input.expectedPiKey
	}).safeParse({ ...structuredOutput, changedPaths: input.patchChangedPaths });
	if (
		!parsedPatchOutput.success ||
		parsedPatchOutput.data.changedPaths.length !== structuredOutput.changedPaths.length ||
		parsedPatchOutput.data.changedPaths.some(
			(path, index) => path !== structuredOutput.changedPaths[index]
		)
	) {
		return rejected('changed-path-mismatch');
	}
	if (!input.patchApplies) return rejected('patch-conflict');

	return {
		disposition: 'accepted',
		baseCommit: group.baseCommit,
		childCommittedRevision: structuredOutput.childCommittedRevision,
		changedPaths: parsedPatchOutput.data.changedPaths,
		handoffManifestDigest: manifestDigest,
		patchDigest
	};
}
