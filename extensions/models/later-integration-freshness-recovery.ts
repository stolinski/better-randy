import { z } from 'npm:zod@4.4.3';

import { compareCanonicalText } from '../../src/lib/utils/canonical-text-order.ts';
import {
	createSupersDeterministicContractHash,
	SupersFactoryIntegrationReceiptSchema,
	verifySupersFactoryIntegrationReceipt
} from './supers-deterministic-factory-contract.ts';

const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const ChangedPathSchema = z
	.string()
	.min(1)
	.max(512)
	.refine((path) => !path.startsWith('/') && !path.split('/').includes('..'));
const ChangedPathsSchema = z.array(ChangedPathSchema).min(1).max(200);

const PassingVerificationAuthoritySchema = z.strictObject({
	workItem: z.string().min(1).max(128),
	integratedRevision: GitRevisionSchema,
	treeFingerprint: Sha256Schema,
	changedPaths: ChangedPathsSchema,
	workflowRunId: z.string().min(1),
	disposition: z.literal('reconcile')
});

const LaterTerminalIntegrationCandidateSchema = z.strictObject({
	workItem: z.string().min(1).max(128),
	integrationReceipt: SupersFactoryIntegrationReceiptSchema,
	verification: PassingVerificationAuthoritySchema,
	factoryState: z.strictObject({
		workItem: z.string().min(1).max(128),
		stageId: z.literal('done'),
		status: z.literal('terminal'),
		definitionVersion: z.number().int().positive()
	}),
	trackerCompletion: z.strictObject({
		status: z.literal('succeeded'),
		runId: z.string().min(1),
		model: z.literal('supers-sentry-reproduction-transport'),
		method: z.literal('complete-machine-sentry'),
		outputId: z.string().min(1),
		taskId: z.string().min(1).max(128),
		commitKind: z.literal('commit')
	})
});

export const LaterIntegrationFreshnessRecoveryArgumentsSchema = z.strictObject({
	workItem: z.string().min(1).max(128),
	originalChangeImpact: z.strictObject({
		workItem: z.string().min(1).max(128),
		baselineHead: GitRevisionSchema,
		treeFingerprint: Sha256Schema,
		paths: ChangedPathsSchema
	}),
	originalIntegrationReceipt: SupersFactoryIntegrationReceiptSchema,
	currentVerification: PassingVerificationAuthoritySchema,
	laterCandidates: z.array(LaterTerminalIntegrationCandidateSchema).min(1).max(100)
});

export type LaterIntegrationFreshnessRecoveryArguments = z.infer<
	typeof LaterIntegrationFreshnessRecoveryArgumentsSchema
>;

export const LaterIntegrationGitEvidenceSchema = z.strictObject({
	currentTreeFingerprint: Sha256Schema,
	currentPathsClean: z.boolean(),
	originalIntegratedIsAncestorOfLaterBaseline: z.boolean(),
	laterBaselineIsAncestorOfLaterIntegrated: z.boolean(),
	laterIntegratedIsAncestorOfHead: z.boolean(),
	originalToLaterBaselineScopedPaths: z.array(ChangedPathSchema).max(200),
	laterReceiptChangedPaths: ChangedPathsSchema,
	laterScopedPaths: ChangedPathsSchema,
	originalToHeadScopedPaths: ChangedPathsSchema,
	laterIntegratedToHeadScopedPaths: z.array(ChangedPathSchema).max(200)
});

export type LaterIntegrationGitEvidence = z.infer<typeof LaterIntegrationGitEvidenceSchema>;

export type LaterIntegrationFreshnessInspector = (
	originalIntegratedRevision: string,
	originalPaths: readonly string[],
	candidate: z.infer<typeof LaterTerminalIntegrationCandidateSchema>
) => Promise<LaterIntegrationGitEvidence>;

const LaterIntegrationFreshnessRecoveryContentSchema = z.strictObject({
	schemaVersion: z.literal(1),
	authority: z.literal('terminal-later-integration'),
	workItem: z.string().min(1).max(128),
	originalIntegrationReceiptId: Sha256Schema,
	originalIntegratedRevision: GitRevisionSchema,
	previousFingerprint: Sha256Schema,
	currentFingerprint: Sha256Schema,
	paths: ChangedPathsSchema,
	currentVerificationWorkflowRunId: z.string().min(1),
	laterWorkItem: z.string().min(1).max(128),
	laterIntegrationReceiptId: Sha256Schema,
	laterTargetBaselineRevision: GitRevisionSchema,
	laterIntegratedRevision: GitRevisionSchema,
	laterVerificationWorkflowRunId: z.string().min(1),
	laterTrackerCompletionRunId: z.string().min(1),
	driftPaths: ChangedPathsSchema
});

export const LaterIntegrationFreshnessRecoverySchema =
	LaterIntegrationFreshnessRecoveryContentSchema.extend({
		receiptId: Sha256Schema
	});

export type LaterIntegrationFreshnessRecovery = z.infer<
	typeof LaterIntegrationFreshnessRecoverySchema
>;

function canonicalPaths(paths: readonly string[]): string[] {
	return [...new Set(paths)].sort(compareCanonicalText);
}

function equalPaths(left: readonly string[], right: readonly string[]): boolean {
	return JSON.stringify(canonicalPaths(left)) === JSON.stringify(canonicalPaths(right));
}

/**
 * Reseal one stale scoped fingerprint only when one later terminal Factory integration
 * explains every changed byte on those paths and no later commit or dirty file changed them.
 */
export async function createLaterIntegrationFreshnessRecovery(
	rawArguments: LaterIntegrationFreshnessRecoveryArguments,
	inspectGit: LaterIntegrationFreshnessInspector
): Promise<LaterIntegrationFreshnessRecovery> {
	const args = LaterIntegrationFreshnessRecoveryArgumentsSchema.parse(rawArguments);
	const originalReceipt = await verifySupersFactoryIntegrationReceipt(
		args.originalIntegrationReceipt
	);
	const originalPaths = canonicalPaths(args.originalChangeImpact.paths);
	if (
		args.originalChangeImpact.workItem !== args.workItem ||
		originalReceipt.disposition !== 'integrated' ||
		originalReceipt.factoryName !== 'supers-delivery' ||
		originalReceipt.rootEpicId !== args.workItem ||
		originalReceipt.activeTaskId !== args.workItem ||
		originalReceipt.targetBaselineRevision !== args.originalChangeImpact.baselineHead
	) {
		throw new Error('Freshness recovery does not bind the original Factory integration');
	}
	if (!equalPaths(originalReceipt.changedPaths, originalPaths)) {
		throw new Error('Freshness recovery paths differ from the original integration receipt');
	}
	if (
		args.currentVerification.workItem !== args.workItem ||
		args.currentVerification.integratedRevision !== originalReceipt.integratedRevision ||
		!equalPaths(args.currentVerification.changedPaths, originalPaths)
	) {
		throw new Error('Freshness recovery does not bind the current passing verification route');
	}
	if (args.originalChangeImpact.treeFingerprint === args.currentVerification.treeFingerprint) {
		throw new Error('Freshness recovery requires an actual scoped fingerprint change');
	}

	const matchingCandidates: Array<{
		candidate: z.infer<typeof LaterTerminalIntegrationCandidateSchema>;
		receipt: z.infer<typeof SupersFactoryIntegrationReceiptSchema>;
		evidence: LaterIntegrationGitEvidence;
	}> = [];
	for (const candidate of args.laterCandidates) {
		const receipt = await verifySupersFactoryIntegrationReceipt(candidate.integrationReceipt);
		if (
			candidate.workItem === args.workItem ||
			receipt.disposition !== 'integrated' ||
			receipt.factoryName !== 'supers-delivery' ||
			receipt.rootEpicId !== candidate.workItem ||
			receipt.activeTaskId !== candidate.workItem ||
			candidate.verification.workItem !== candidate.workItem ||
			candidate.verification.integratedRevision !== receipt.integratedRevision ||
			!equalPaths(candidate.verification.changedPaths, receipt.changedPaths) ||
			candidate.factoryState.workItem !== candidate.workItem ||
			candidate.trackerCompletion.taskId !== candidate.workItem
		) {
			continue;
		}
		const evidence = LaterIntegrationGitEvidenceSchema.parse(
			await inspectGit(originalReceipt.integratedRevision, originalPaths, candidate)
		);
		if (
			!evidence.currentPathsClean ||
			evidence.currentTreeFingerprint !== args.currentVerification.treeFingerprint ||
			!evidence.originalIntegratedIsAncestorOfLaterBaseline ||
			!evidence.laterBaselineIsAncestorOfLaterIntegrated ||
			!evidence.laterIntegratedIsAncestorOfHead ||
			evidence.originalToLaterBaselineScopedPaths.length > 0 ||
			evidence.laterIntegratedToHeadScopedPaths.length > 0 ||
			!equalPaths(evidence.laterReceiptChangedPaths, receipt.changedPaths) ||
			!equalPaths(evidence.laterScopedPaths, evidence.originalToHeadScopedPaths) ||
			!evidence.originalToHeadScopedPaths.every((path) => receipt.changedPaths.includes(path))
		) {
			continue;
		}
		matchingCandidates.push({ candidate, receipt, evidence });
	}
	if (matchingCandidates.length !== 1) {
		throw new Error(
			`Freshness recovery requires exactly one terminal later integration; found ${matchingCandidates.length}`
		);
	}

	const [{ candidate, receipt, evidence }] = matchingCandidates;
	const content = LaterIntegrationFreshnessRecoveryContentSchema.parse({
		schemaVersion: 1,
		authority: 'terminal-later-integration',
		workItem: args.workItem,
		originalIntegrationReceiptId: originalReceipt.receiptId,
		originalIntegratedRevision: originalReceipt.integratedRevision,
		previousFingerprint: args.originalChangeImpact.treeFingerprint,
		currentFingerprint: args.currentVerification.treeFingerprint,
		paths: originalPaths,
		currentVerificationWorkflowRunId: args.currentVerification.workflowRunId,
		laterWorkItem: candidate.workItem,
		laterIntegrationReceiptId: receipt.receiptId,
		laterTargetBaselineRevision: receipt.targetBaselineRevision,
		laterIntegratedRevision: receipt.integratedRevision,
		laterVerificationWorkflowRunId: candidate.verification.workflowRunId,
		laterTrackerCompletionRunId: candidate.trackerCompletion.runId,
		driftPaths: canonicalPaths(evidence.originalToHeadScopedPaths)
	});
	return LaterIntegrationFreshnessRecoverySchema.parse({
		...content,
		receiptId: await createSupersDeterministicContractHash(content)
	});
}
