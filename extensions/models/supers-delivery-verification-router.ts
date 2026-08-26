import { z } from 'npm:zod@4.4.3';

import {
	createSupersDeterministicContractHash,
	SupersDeliveryVerificationRouteSchema,
	SupersHumanAestheticDecisionSchema,
	SupersRenderMatrixBundleSchema,
	SupersRenderMatrixManifestSchema,
	verifySupersHumanAestheticDecision,
	verifySupersRenderMatrixBundle
} from './supers-deterministic-factory-contract.ts';
import { VerificationFanoutReportSchema } from './repo-verification-fanout.ts';
import { SupersRenderMatrixRunSchema } from './supers-render-matrix-verification.ts';
import { compareCanonicalText } from '../../src/lib/utils/canonical-text-order.ts';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const DomainIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/);
const ResourceNameSchema = z.string().min(1).max(512);

const ChangeSurfaceSchema = z.strictObject({
	id: z.enum(['authoring-app', 'rendered-composition', 'export-pipeline', 'control-plane']),
	reasons: z.array(z.string().min(1)).min(1)
});

const HumanReviewRequirementSchema = z.strictObject({
	kind: z.enum(['authoring-app-visual', 'rendered-composition-aesthetic']),
	reasons: z.array(z.string().min(1)).min(1)
});

const ChangeImpactSchema = z.strictObject({
	resourceName: ResourceNameSchema,
	workItem: DomainIdSchema,
	treeFingerprint: Sha256Schema,
	workflowRunId: DomainIdSchema,
	paths: z.array(z.string().min(1)).min(1).max(200),
	classification: z.enum(['known', 'mixed', 'unknown']),
	unknownPaths: z.array(z.string().min(1)).max(200),
	intentRouteDigest: Sha256Schema,
	surfaces: z.array(ChangeSurfaceSchema).min(1).max(4),
	requiredHumanReviews: z.array(HumanReviewRequirementSchema).max(2)
});

const AutomatedLaneIdSchema = z.enum([
	'browser',
	'check',
	'unit',
	'preset-static',
	'layout-contract',
	'export-decode',
	'performance',
	'repository-infrastructure',
	'swamp-control-plane',
	'timing-coverage',
	'authoring-dependency-tracking',
	'inspector-editor-parity',
	'planning-discoverability'
]);
type DeterministicLaneId = z.infer<typeof AutomatedLaneIdSchema>;
const RequiredLaneIdSchema = z.enum([
	'policy-sweep',
	'check',
	'unit',
	'browser',
	'preset-static',
	'layout-contract',
	'render-matrix',
	'pack-matrix',
	'export-decode',
	'performance',
	'repository-infrastructure',
	'swamp-control-plane',
	'timing-coverage',
	'authoring-dependency-tracking',
	'inspector-editor-parity',
	'planning-discoverability',
	'unknown'
]);

const POLICY_SWEEP_WORKFLOW_ID = '5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a' as const;
const POLICY_SWEEP_WORKFLOW_NAME = 'policy-sweep' as const;
const POLICY_SWEEP_WORKFLOW_VERSION = 4 as const;
const SupersPolicyLifecycleIntegritySchema = z.strictObject({
	policyWorkflowIdentityBound: z.literal(true),
	policyWorkflowRunBound: z.literal(true),
	routingWorkflowRunBound: z.literal(true)
});
export const SupersPolicySweepExecutionSchema = z.strictObject({
	schemaVersion: z.literal(2),
	workItem: DomainIdSchema,
	routingWorkflowRunId: DomainIdSchema,
	policyWorkflowId: z.literal(POLICY_SWEEP_WORKFLOW_ID),
	policyWorkflowName: z.literal(POLICY_SWEEP_WORKFLOW_NAME),
	policyWorkflowVersion: z.literal(POLICY_SWEEP_WORKFLOW_VERSION),
	policyWorkflowRunId: DomainIdSchema,
	lifecycleIntegrity: SupersPolicyLifecycleIntegritySchema,
	executionDigest: Sha256Schema
});

export const RecordSupersPolicySweepExecutionArgumentsSchema = z.strictObject({
	schemaVersion: z.literal(2),
	workItem: DomainIdSchema,
	routingWorkflowRunId: DomainIdSchema,
	policyWorkflowId: z.literal(POLICY_SWEEP_WORKFLOW_ID),
	policyWorkflowName: z.literal(POLICY_SWEEP_WORKFLOW_NAME),
	policyWorkflowVersion: z.literal(POLICY_SWEEP_WORKFLOW_VERSION),
	policyWorkflowRunId: DomainIdSchema
});

export const NormalizeSupersDeliveryVerificationRouteArgumentsSchema = z.strictObject({
	schemaVersion: z.literal(1),
	workItem: DomainIdSchema,
	expectedWorkflowRunId: DomainIdSchema,
	expectedIntegratedRevision: z.string().regex(/^[0-9a-f]{40,64}$/),
	expectedIntegratedTreeFingerprint: Sha256Schema,
	expectedTreeFingerprint: Sha256Schema,
	changeImpact: ChangeImpactSchema,
	requiredLaneIds: z.array(RequiredLaneIdSchema).min(1).max(13),
	deterministicFanoutResourceName: ResourceNameSchema,
	deterministicFanoutWorkflowRunId: DomainIdSchema,
	deterministicFanout: VerificationFanoutReportSchema,
	policySweepResourceName: ResourceNameSchema,
	policySweepResourceWorkflowRunId: DomainIdSchema,
	policySweepExecution: SupersPolicySweepExecutionSchema,
	renderMatrixRunName: ResourceNameSchema,
	renderMatrixRunWorkflowRunId: DomainIdSchema,
	renderMatrixRun: SupersRenderMatrixRunSchema,
	renderMatrixManifestName: z.string(),
	renderMatrixManifestWorkflowRunId: z.string(),
	renderMatrixManifest: SupersRenderMatrixManifestSchema.nullable(),
	renderMatrixBundleName: z.string(),
	renderMatrixBundleWorkflowRunId: z.string(),
	renderMatrixBundle: SupersRenderMatrixBundleSchema.nullable()
});

const FactoryStateSchema = z.object({
	workItem: DomainIdSchema,
	stageId: z.literal('aesthetic-decision-binding'),
	cycles: z.record(z.string(), z.number().int().positive())
});

const FactoryApprovalSchema = z.strictObject({
	gateId: z.string().min(1),
	workItem: DomainIdSchema,
	decision: z.enum(['approved', 'rejected']),
	actor: z.string().min(1).max(256),
	note: z.string().max(4_000).optional(),
	stageId: z.string().min(1),
	cycle: z.number().int().positive(),
	decidedAt: z.string().datetime()
});

export const BindSupersHumanAestheticDecisionArgumentsSchema = z.strictObject({
	schemaVersion: z.literal(1),
	workItem: DomainIdSchema,
	factoryName: DomainIdSchema,
	factoryStateResourceName: ResourceNameSchema,
	factoryState: FactoryStateSchema,
	factoryApprovalResourceName: ResourceNameSchema,
	factoryApproval: FactoryApprovalSchema,
	verificationRouteResourceName: ResourceNameSchema,
	verificationRoute: SupersDeliveryVerificationRouteSchema,
	matrixBundleResourceName: ResourceNameSchema,
	matrixBundle: SupersRenderMatrixBundleSchema
});

type RouterContext = {
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>
	) => Promise<{ name: string }>;
	logger: { info: (message: string, properties?: Record<string, unknown>) => void };
};

function unavailableCodeForBundleError(
	error: unknown
): z.infer<typeof SupersDeliveryVerificationRouteSchema>['unavailableEvidenceCodes'][number] {
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes('duplicate')) return 'duplicate-render-check';
	if (message.includes('extra')) return 'extra-render-cell';
	if (message.includes('cells must exactly') || message.includes('Rendered cells')) {
		return 'missing-render-cell';
	}
	if (message.includes('check') || message.includes('evidence is missing')) {
		return 'missing-render-check';
	}
	return 'stale-render-evidence';
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
	return [...new Set(values)].sort(compareCanonicalText);
}

function withoutExecutionDigest(
	execution: z.infer<typeof SupersPolicySweepExecutionSchema>
): Omit<z.infer<typeof SupersPolicySweepExecutionSchema>, 'executionDigest'> {
	return Object.fromEntries(
		Object.entries(execution).filter(([key]) => key !== 'executionDigest')
	) as Omit<z.infer<typeof SupersPolicySweepExecutionSchema>, 'executionDigest'>;
}

/** Bind one exact lifecycle policy workflow identity and its current execution. */
export async function recordSupersPolicySweepExecution(
	rawArgs: unknown
): Promise<z.infer<typeof SupersPolicySweepExecutionSchema>> {
	const args = RecordSupersPolicySweepExecutionArgumentsSchema.parse(rawArgs);
	const content = {
		schemaVersion: 2 as const,
		workItem: args.workItem,
		routingWorkflowRunId: args.routingWorkflowRunId,
		policyWorkflowId: args.policyWorkflowId,
		policyWorkflowName: args.policyWorkflowName,
		policyWorkflowVersion: args.policyWorkflowVersion,
		policyWorkflowRunId: args.policyWorkflowRunId,
		lifecycleIntegrity: {
			policyWorkflowIdentityBound: true as const,
			policyWorkflowRunBound: true as const,
			routingWorkflowRunBound: true as const
		}
	};
	return SupersPolicySweepExecutionSchema.parse({
		...content,
		executionDigest: await createSupersDeterministicContractHash(content)
	});
}

/** Derive the only Delivery route from correlated deterministic resources. */
export async function normalizeSupersDeliveryVerificationRoute(
	rawArgs: unknown
): Promise<z.infer<typeof SupersDeliveryVerificationRouteSchema>> {
	const args = NormalizeSupersDeliveryVerificationRouteArgumentsSchema.parse(rawArgs);
	const correlated = [args.deterministicFanoutWorkflowRunId, args.renderMatrixRunWorkflowRunId];
	const { contentDigest: claimedFanoutDigest, ...fanoutContent } = args.deterministicFanout;
	const verifiedFanoutDigest = await createSupersDeterministicContractHash(fanoutContent);
	const verifiedPolicyExecutionDigest = await createSupersDeterministicContractHash(
		withoutExecutionDigest(args.policySweepExecution)
	);
	if (
		args.changeImpact.workItem !== args.workItem ||
		args.deterministicFanout.workItem !== args.workItem ||
		args.renderMatrixRun.workItem !== args.workItem ||
		args.policySweepExecution.workItem !== args.workItem ||
		args.renderMatrixRun.sourceRevision !== args.expectedIntegratedRevision ||
		correlated.some((runId) => runId !== args.expectedWorkflowRunId) ||
		args.policySweepExecution.routingWorkflowRunId !== args.expectedWorkflowRunId ||
		args.policySweepResourceWorkflowRunId !== args.policySweepExecution.policyWorkflowRunId ||
		args.policySweepResourceName !==
			`policy-sweep-execution-${args.workItem}-${args.policySweepExecution.policyWorkflowRunId}` ||
		args.changeImpact.treeFingerprint !== args.expectedTreeFingerprint ||
		args.deterministicFanout.expectedFingerprint !== args.expectedTreeFingerprint ||
		args.deterministicFanout.changeImpactResourceName !== args.changeImpact.resourceName ||
		args.deterministicFanout.intentRouteDigest !== args.changeImpact.intentRouteDigest ||
		JSON.stringify(args.deterministicFanout.changedPaths) !==
			JSON.stringify(args.changeImpact.paths) ||
		args.renderMatrixRun.expectedTreeFingerprint !== args.expectedTreeFingerprint ||
		verifiedFanoutDigest !== claimedFanoutDigest ||
		verifiedPolicyExecutionDigest !== args.policySweepExecution.executionDigest
	) {
		throw new TypeError('Delivery verification resources are stale or not workflow-correlated');
	}

	const renderMatrixRunDigest = await createSupersDeterministicContractHash(args.renderMatrixRun);
	const completedRun = args.renderMatrixRun.status === 'completed' ? args.renderMatrixRun : null;
	const routeIdentity = {
		schemaVersion: 3 as const,
		workItem: args.workItem,
		integratedRevision: args.expectedIntegratedRevision,
		integratedTreeFingerprint: args.expectedIntegratedTreeFingerprint,
		treeFingerprint: args.expectedTreeFingerprint,
		changeImpactResourceName: args.changeImpact.resourceName,
		changedPaths: args.changeImpact.paths,
		deterministicFanoutResourceName: args.deterministicFanoutResourceName,
		deterministicFanoutContentDigest: claimedFanoutDigest,
		deterministicFanoutWorkflowRunId: args.deterministicFanoutWorkflowRunId,
		policySweepResourceName: args.policySweepResourceName,
		policySweepWorkflowId: args.policySweepExecution.policyWorkflowId,
		policySweepWorkflowName: args.policySweepExecution.policyWorkflowName,
		policySweepWorkflowVersion: args.policySweepExecution.policyWorkflowVersion,
		policySweepWorkflowRunId: args.policySweepExecution.policyWorkflowRunId,
		policySweepExecutionDigest: args.policySweepExecution.executionDigest,
		policySweepLifecycleIntegrity: args.policySweepExecution.lifecycleIntegrity,
		renderMatrixRunName: args.renderMatrixRunName,
		renderMatrixManifestName: args.renderMatrixManifestName,
		renderMatrixBundleName: args.renderMatrixBundleName,
		renderMatrixManifestDigest: completedRun?.manifestDigest ?? '',
		renderMatrixBundleDigest: completedRun?.bundleDigest ?? '',
		renderMatrixRunDigest,
		renderEvidenceArchiveDigest: completedRun?.evidenceArchiveDigest ?? '',
		workflowRunId: args.expectedWorkflowRunId,
		advisories: args.renderMatrixRun.advisories
	};
	const unavailable = new Set<
		z.infer<typeof SupersDeliveryVerificationRouteSchema>['unavailableEvidenceCodes'][number]
	>();
	const requiredHumanReviewKinds = sortedUnique(
		args.changeImpact.requiredHumanReviews.map((review) => review.kind)
	);
	const surfaceIds = sortedUnique(args.changeImpact.surfaces.map((surface) => surface.id));
	const uniqueRequiredLaneIds = sortedUnique(args.requiredLaneIds);
	if (
		requiredHumanReviewKinds.length !== args.changeImpact.requiredHumanReviews.length ||
		surfaceIds.length !== args.changeImpact.surfaces.length
	) {
		throw new TypeError('Change impact surfaces and human reviews must be unique');
	}
	if (uniqueRequiredLaneIds.length !== args.requiredLaneIds.length) {
		throw new TypeError('Required verification lanes must be unique');
	}
	const requiresAppVisualReview = requiredHumanReviewKinds.includes('authoring-app-visual');
	const requiresRenderedCompositionReview = requiredHumanReviewKinds.includes(
		'rendered-composition-aesthetic'
	);
	const hasRenderedCompositionSurface = surfaceIds.includes('rendered-composition');
	const hasLayoutContractLane = uniqueRequiredLaneIds.includes('layout-contract');
	if (requiresAppVisualReview && !surfaceIds.includes('authoring-app')) {
		throw new TypeError('Human review requirement does not match its change surface');
	}
	if (requiresRenderedCompositionReview && !hasRenderedCompositionSurface) {
		throw new TypeError('Rendered aesthetic review requires rendered-composition impact');
	}
	if (hasRenderedCompositionSurface && !hasLayoutContractLane) {
		throw new TypeError('Rendered composition impact requires the Layout Contract lane');
	}
	if (requiresAppVisualReview) unavailable.add('missing-app-visual-evidence');
	if (requiresRenderedCompositionReview) {
		unavailable.add('missing-rendered-aesthetic-evidence');
	}
	if (args.changeImpact.classification === 'unknown' || uniqueRequiredLaneIds.includes('unknown')) {
		unavailable.add('unknown-change-domain');
	}
	const common = { ...routeIdentity, requiredHumanReviewKinds };
	const requiredDeterministicLaneIds = sortedUnique(
		args.requiredLaneIds.filter(
			(lane): lane is DeterministicLaneId => AutomatedLaneIdSchema.safeParse(lane).success
		)
	);
	const resultLaneIds = sortedUnique(args.deterministicFanout.results.map((result) => result.id));
	const fanoutIsComplete =
		resultLaneIds.length === args.deterministicFanout.results.length &&
		JSON.stringify(requiredDeterministicLaneIds) === JSON.stringify(resultLaneIds) &&
		args.deterministicFanout.passed ===
			args.deterministicFanout.results.every((result) => result.status === 'passed');
	if (!fanoutIsComplete) unavailable.add('incomplete-deterministic-fanout');
	if (requiredDeterministicLaneIds.some((lane) => !resultLaneIds.includes(lane))) {
		unavailable.add('unexecuted-required-lane');
	}
	if (!uniqueRequiredLaneIds.includes('policy-sweep')) unavailable.add('unexecuted-required-lane');
	const deterministicFailureCodes = fanoutIsComplete
		? args.deterministicFanout.results
				.filter((result) => result.status === 'failed')
				.map((result) => {
					const failureCodes = {
						browser: 'browser-failed',
						check: 'check-failed',
						unit: 'unit-failed',
						'preset-static': 'preset-static-failed',
						'layout-contract': 'layout-contract-failed',
						'export-decode': 'export-decode-failed',
						performance: 'performance-failed',
						'repository-infrastructure': 'repository-infrastructure-failed',
						'swamp-control-plane': 'swamp-control-plane-failed',
						'timing-coverage': 'timing-coverage-failed',
						'authoring-dependency-tracking': 'authoring-dependency-tracking-failed',
						'inspector-editor-parity': 'inspector-editor-parity-failed',
						'planning-discoverability': 'planning-discoverability-failed'
					} as const;
					return failureCodes[result.id];
				})
		: [];
	if (fanoutIsComplete) {
		for (const result of args.deterministicFanout.results) {
			if (result.status === 'unavailable' && result.unavailableReason !== null) {
				unavailable.add(result.unavailableReason);
			}
		}
	}
	const closedFailureCodes = sortedUnique(deterministicFailureCodes);

	if (args.renderMatrixRun.status === 'not-applicable') {
		const uncoveredLanes = uniqueRequiredLaneIds.filter(
			(lane) => lane === 'render-matrix' || lane === 'pack-matrix'
		);
		if (uncoveredLanes.length > 0) unavailable.add('unexecuted-required-lane');
		if (args.renderMatrixManifest !== null || args.renderMatrixBundle !== null) {
			throw new TypeError('Not-applicable rendering cannot include a manifest or bundle');
		}
		return SupersDeliveryVerificationRouteSchema.parse({
			...common,
			disposition:
				unavailable.size > 0
					? 'evidence-unavailable'
					: closedFailureCodes.length > 0
						? 'automatic-rework'
						: 'reconcile',
			objectiveFailureCodes: closedFailureCodes,
			unavailableEvidenceCodes: sortedUnique([...unavailable])
		});
	}

	// The affected selector may conservatively capture a full render matrix for app-only paths.
	// Extra render evidence cannot create a human review requirement the trusted classifier omitted.
	if (!requiresRenderedCompositionReview) {
		return SupersDeliveryVerificationRouteSchema.parse({
			...common,
			disposition:
				unavailable.size > 0
					? 'evidence-unavailable'
					: closedFailureCodes.length > 0
						? 'automatic-rework'
						: 'reconcile',
			objectiveFailureCodes: closedFailureCodes,
			unavailableEvidenceCodes: sortedUnique([...unavailable])
		});
	}

	if (args.renderMatrixManifest === null) unavailable.add('missing-render-manifest');
	if (args.renderMatrixBundle === null) unavailable.add('missing-render-bundle');
	if (
		args.renderMatrixManifestWorkflowRunId !== args.expectedWorkflowRunId ||
		args.renderMatrixBundleWorkflowRunId !== args.expectedWorkflowRunId
	)
		unavailable.add('stale-render-evidence');

	let verifiedBundle: z.infer<typeof SupersRenderMatrixBundleSchema> | null = null;
	if (args.renderMatrixManifest !== null && args.renderMatrixBundle !== null) {
		try {
			verifiedBundle = await verifySupersRenderMatrixBundle(
				args.renderMatrixManifest,
				args.renderMatrixBundle
			);
		} catch (error) {
			unavailable.add(unavailableCodeForBundleError(error));
		}
	}
	if (verifiedBundle !== null && args.renderMatrixManifest !== null) {
		const cells = verifiedBundle.cells;
		const expectedCounts = {
			presets: args.renderMatrixManifest.presets.length,
			packs: args.renderMatrixManifest.packs.length,
			orientations: args.renderMatrixManifest.orientations.length,
			samples: args.renderMatrixManifest.presets.reduce(
				(total, preset) => total + preset.samples.length,
				0
			),
			cells: cells.length,
			passed: cells.filter((cell) => cell.outcome === 'pass').length,
			failed: cells.filter((cell) => cell.outcome === 'fail').length,
			unavailable: cells.filter((cell) => cell.outcome === 'unavailable').length
		};
		const runIsCorrelated =
			args.renderMatrixRun.status === 'completed' &&
			args.renderMatrixRun.manifestDigest === args.renderMatrixManifest.manifestDigest &&
			args.renderMatrixRun.bundleDigest === verifiedBundle.bundleDigest &&
			args.renderMatrixRun.manifestName === args.renderMatrixManifestName &&
			args.renderMatrixRun.bundleName === args.renderMatrixBundleName &&
			verifiedBundle.sourceRevision === args.expectedIntegratedRevision &&
			args.renderMatrixRun.outcome === verifiedBundle.outcome &&
			JSON.stringify(args.renderMatrixRun.counts) === JSON.stringify(expectedCounts);
		if (!runIsCorrelated) {
			unavailable.add('stale-render-evidence');
			verifiedBundle = null;
		}
	}

	const checks = verifiedBundle?.cells.flatMap((cell) => cell.checks) ?? [];
	const objectiveFailureCodes = sortedUnique([
		...closedFailureCodes,
		...checks.filter((check) => check.outcome === 'fail').map((check) => check.code)
	]);
	for (const check of checks) {
		if (check.outcome === 'unavailable') unavailable.add(check.unavailableReason);
	}
	const unavailableEvidenceCodes = sortedUnique([...unavailable]);
	const disposition =
		unavailableEvidenceCodes.length > 0
			? 'evidence-unavailable'
			: objectiveFailureCodes.length > 0
				? 'automatic-rework'
				: 'await-human-aesthetic';
	return SupersDeliveryVerificationRouteSchema.parse({
		...common,
		disposition,
		objectiveFailureCodes,
		unavailableEvidenceCodes
	});
}

/** Bind an exact current-cycle Factory approval to an exact verified render bundle. */
export async function bindSupersHumanAestheticDecision(
	rawArgs: unknown
): Promise<z.infer<typeof SupersHumanAestheticDecisionSchema>> {
	const args = BindSupersHumanAestheticDecisionArgumentsSchema.parse(rawArgs);
	const approvalCycle = args.factoryState.cycles['aesthetic-approval'];
	if (
		args.factoryState.workItem !== args.workItem ||
		args.factoryApproval.gateId !== 'aesthetic-acceptance' ||
		args.factoryApproval.workItem !== args.workItem ||
		args.factoryApproval.stageId !== 'aesthetic-approval' ||
		approvalCycle === undefined ||
		args.factoryApproval.cycle !== approvalCycle ||
		args.verificationRoute.workItem !== args.workItem ||
		args.verificationRoute.disposition !== 'await-human-aesthetic' ||
		args.verificationRoute.integratedRevision !== args.matrixBundle.sourceRevision ||
		args.matrixBundleResourceName !== args.verificationRoute.renderMatrixBundleName ||
		args.verificationRoute.renderMatrixManifestDigest !== args.matrixBundle.manifestDigest ||
		args.verificationRoute.renderMatrixBundleDigest !== args.matrixBundle.bundleDigest
	) {
		throw new TypeError('Factory approval does not authorize this aesthetic decision');
	}
	const bundleContent = Object.fromEntries(
		Object.entries(args.matrixBundle).filter(([key]) => key !== 'bundleDigest')
	);
	if (
		(await createSupersDeterministicContractHash(bundleContent)) !== args.matrixBundle.bundleDigest
	) {
		throw new TypeError('Human aesthetic decision bundle digest mismatch');
	}
	const approvalReceiptId = await createSupersDeterministicContractHash(args.factoryApproval);
	const decisionWithoutId = {
		schemaVersion: 2 as const,
		workItem: args.workItem,
		factoryName: args.factoryName,
		gateId: 'aesthetic-acceptance' as const,
		stageId: 'aesthetic-approval' as const,
		cycle: args.factoryApproval.cycle,
		verificationRouteResourceName: args.verificationRouteResourceName,
		matrixBundleResourceName: args.matrixBundleResourceName,
		factoryStateResourceName: args.factoryStateResourceName,
		factoryApprovalResourceName: args.factoryApprovalResourceName,
		integratedRevision: args.verificationRoute.integratedRevision,
		integratedTreeFingerprint: args.verificationRoute.integratedTreeFingerprint,
		treeFingerprint: args.verificationRoute.treeFingerprint,
		deterministicFanoutResourceName: args.verificationRoute.deterministicFanoutResourceName,
		deterministicFanoutContentDigest: args.verificationRoute.deterministicFanoutContentDigest,
		deterministicFanoutWorkflowRunId: args.verificationRoute.deterministicFanoutWorkflowRunId,
		policySweepResourceName: args.verificationRoute.policySweepResourceName,
		policySweepWorkflowId: args.verificationRoute.policySweepWorkflowId,
		policySweepWorkflowName: args.verificationRoute.policySweepWorkflowName,
		policySweepWorkflowVersion: args.verificationRoute.policySweepWorkflowVersion,
		policySweepWorkflowRunId: args.verificationRoute.policySweepWorkflowRunId,
		policySweepExecutionDigest: args.verificationRoute.policySweepExecutionDigest,
		policySweepLifecycleIntegrity: args.verificationRoute.policySweepLifecycleIntegrity,
		renderMatrixRunName: args.verificationRoute.renderMatrixRunName,
		renderMatrixManifestName: args.verificationRoute.renderMatrixManifestName,
		renderMatrixBundleName: args.verificationRoute.renderMatrixBundleName,
		verificationWorkflowRunId: args.verificationRoute.workflowRunId,
		renderMatrixManifestDigest: args.verificationRoute.renderMatrixManifestDigest,
		renderMatrixBundleDigest: args.verificationRoute.renderMatrixBundleDigest,
		renderMatrixRunDigest: args.verificationRoute.renderMatrixRunDigest,
		renderEvidenceArchiveDigest: args.verificationRoute.renderEvidenceArchiveDigest,
		approvalReceiptId,
		approvalIdentity: args.factoryApproval.actor,
		decision:
			args.factoryApproval.decision === 'approved' ? ('accept' as const) : ('reject' as const),
		note: args.factoryApproval.note ?? ''
	};
	const decision = SupersHumanAestheticDecisionSchema.parse({
		...decisionWithoutId,
		decisionId: await createSupersDeterministicContractHash(decisionWithoutId)
	});
	await verifySupersHumanAestheticDecision(decision, args.matrixBundle, args.factoryApproval);
	return decision;
}

async function executeRecordPolicySweep(
	rawArgs: unknown,
	context: RouterContext
): Promise<{ dataHandles: Array<{ name: string }> }> {
	const execution = await recordSupersPolicySweepExecution(rawArgs);
	const handle = await context.writeResource(
		'policy-sweep-execution',
		`policy-sweep-execution-${execution.workItem}-${execution.policyWorkflowRunId}`,
		execution
	);
	context.logger.info('Bound canonical policy sweep execution', {
		policyWorkflowRunId: execution.policyWorkflowRunId
	});
	return { dataHandles: [handle] };
}

async function executeNormalize(
	rawArgs: unknown,
	context: RouterContext
): Promise<{ dataHandles: Array<{ name: string }> }> {
	const route = await normalizeSupersDeliveryVerificationRoute(rawArgs);
	const handle = await context.writeResource(
		'delivery-verification-route',
		`delivery-verification-route-${route.workItem}-${route.workflowRunId}`,
		route
	);
	context.logger.info('Normalized deterministic Delivery verification route', {
		disposition: route.disposition
	});
	return { dataHandles: [handle] };
}

async function executeBind(
	rawArgs: unknown,
	context: RouterContext
): Promise<{ dataHandles: Array<{ name: string }> }> {
	const decision = await bindSupersHumanAestheticDecision(rawArgs);
	const handle = await context.writeResource(
		'human-aesthetic-decision',
		`human-aesthetic-decision-${decision.workItem}-${decision.decisionId}`,
		decision
	);
	context.logger.info('Bound trusted human aesthetic decision', { decision: decision.decision });
	return { dataHandles: [handle] };
}

export const model = {
	type: '@supers/delivery-verification-router',
	version: '2026.08.25.2',
	globalArguments: z.strictObject({}),
	resources: {
		'policy-sweep-execution': {
			description: 'Canonical lifecycle workflow identity bound to one exact current execution',
			schema: SupersPolicySweepExecutionSchema,
			lifetime: 'infinite',
			garbageCollection: 40
		},
		'delivery-verification-route': {
			description: 'Correlated model-derived objective Delivery routing authority',
			schema: SupersDeliveryVerificationRouteSchema,
			lifetime: 'infinite',
			garbageCollection: 40
		},
		'human-aesthetic-decision': {
			description: 'Exact evidence-bound Factory human aesthetic decision',
			schema: SupersHumanAestheticDecisionSchema,
			lifetime: 'infinite',
			garbageCollection: 40
		}
	},
	methods: {
		'record-policy-sweep-execution': {
			description: 'Bind the canonical lifecycle workflow and current run identities',
			arguments: RecordSupersPolicySweepExecutionArgumentsSchema,
			execute: executeRecordPolicySweep
		},
		'normalize-verification-route': {
			description: 'Derive routing from complete correlated deterministic evidence',
			arguments: NormalizeSupersDeliveryVerificationRouteArgumentsSchema,
			execute: executeNormalize
		},
		'bind-human-aesthetic-decision': {
			description: 'Bind the trusted current-cycle Factory approval to exact render evidence',
			arguments: BindSupersHumanAestheticDecisionArgumentsSchema,
			execute: executeBind
		}
	}
};
