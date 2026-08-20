import assert from 'node:assert/strict';

import { classifyChangeImpact } from '../../scripts/change-impact-classifier.ts';
import { selectAffectedStaticPresetPackAxes } from '../../scripts/preset-validation-scope.ts';
import {
	createSupersDeterministicContractHash,
	SupersAdvisoryVisualObservationSchema,
	SupersDeliveryVerificationRouteSchema,
	type SupersDeterministicRenderFailureCode,
	SupersDeterministicRenderFailureCodeSchema
} from './supers-deterministic-factory-contract.ts';
import {
	bindSupersHumanAestheticDecision,
	normalizeSupersDeliveryVerificationRoute,
	recordSupersPolicySweepExecution
} from './supers-delivery-verification-router.ts';

const SHA = 'a'.repeat(64);
const SECOND_SHA = 'b'.repeat(64);
const REVISION = 'c'.repeat(40);
const RUN = 'workflow-run-1';

function policySweepArguments(
	cleanOverrides: Record<string, boolean> = {}
): Record<string, unknown> {
	const policyReceipt = (specName: string): Record<string, unknown> => ({
		modelName: 'repo-audit',
		specName,
		resourceName: `${specName}-latest`,
		workflowRunId: 'policy-run-1',
		content: { clean: cleanOverrides[specName] ?? true, audit: specName }
	});
	return {
		schemaVersion: 1,
		workItem: 'task-1',
		routingWorkflowRunId: RUN,
		policyWorkflowId: '5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a',
		policyWorkflowName: 'policy-sweep',
		policyWorkflowVersion: 2,
		policyWorkflowRunId: 'policy-run-1',
		policyReceipts: ['timing', 'tracking', 'parity', 'planning'].map(policyReceipt),
		corpusReceipt: {
			modelName: 'corpus-verify',
			specName: 'sweep',
			resourceName: 'sweep-latest',
			workflowRunId: 'policy-run-1',
			content: { clean: cleanOverrides.corpus ?? true, presets: 12 }
		}
	};
}

async function notApplicableArguments(
	fanoutPassed = true,
	policyCleanOverrides: Record<string, boolean> = {}
): Promise<Record<string, unknown>> {
	const result = {
		id: 'check' as const,
		status: fanoutPassed ? ('passed' as const) : ('failed' as const),
		command: 'pnpm run check',
		durationMs: 1,
		exitCode: fanoutPassed ? 0 : 1,
		outputTail: 'typed check'
	};
	const fanoutContent = {
		schemaVersion: 1 as const,
		workItem: 'task-1',
		expectedFingerprint: SHA,
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:00:01.000Z',
		executionMode: 'parallel' as const,
		results: [result],
		passed: fanoutPassed
	};
	const policySweepExecution = await recordSupersPolicySweepExecution(
		policySweepArguments(policyCleanOverrides)
	);
	return {
		schemaVersion: 1,
		workItem: 'task-1',
		expectedWorkflowRunId: RUN,
		expectedIntegratedRevision: REVISION,
		expectedIntegratedTreeFingerprint: SECOND_SHA,
		expectedTreeFingerprint: SHA,
		changeImpact: {
			resourceName: 'artifact-task-1-change-impact',
			workItem: 'task-1',
			treeFingerprint: SHA,
			workflowRunId: 'classification-run-1',
			surfaces: [{ id: 'authoring-app', reasons: ['authoring application behavior changed'] }],
			requiredHumanReviews: []
		},
		requiredLaneIds: ['policy-sweep', 'check'],
		deterministicFanoutResourceName: 'verification-fanout-canonical-hash',
		deterministicFanoutWorkflowRunId: RUN,
		deterministicFanout: {
			...fanoutContent,
			contentDigest: await createSupersDeterministicContractHash(fanoutContent)
		},
		policySweepResourceName: 'policy-sweep-execution-task-1-policy-run-1',
		policySweepResourceWorkflowRunId: 'policy-run-1',
		policySweepExecution,
		renderMatrixRunName: 'render-matrix-run-task-1',
		renderMatrixRunWorkflowRunId: RUN,
		renderMatrixRun: {
			schemaVersion: 1,
			status: 'not-applicable',
			scope: 'affected',
			workItem: 'task-1',
			sourceRevision: REVISION,
			expectedTreeFingerprint: SHA,
			changedPathsDigest: SECOND_SHA,
			reason: 'no-deliverable-render-impact',
			advisories: []
		},
		renderMatrixManifestName: '',
		renderMatrixManifestWorkflowRunId: '',
		renderMatrixManifest: null,
		renderMatrixBundleName: '',
		renderMatrixBundleWorkflowRunId: '',
		renderMatrixBundle: null
	};
}

const READABLE_IDS = ['preset-1:title'];

function captureBinding(): Record<string, unknown> {
	return {
		frameIndex: 30,
		timestampMicroseconds: 1_000_000,
		region: { x: 100, y: 100, width: 400, height: 120 },
		captureWidth: 3840,
		captureHeight: 2160,
		backgroundSha256: SHA,
		treatmentSha256: SECOND_SHA,
		authoritativeMaskSha256: SHA
	};
}

function passingMeasurement(code: SupersDeterministicRenderFailureCode): Record<string, unknown> {
	switch (code) {
		case 'target-resolution-mismatch':
			return {
				actualWidth: 3840,
				actualHeight: 2160,
				activeFrameRate: { num: 30, den: 1 }
			};
		case 'font-not-ready':
			return { pendingFontCount: 0 };
		case 'title-safe-violation':
		case 'vertical-platform-safe-area-violation':
			return { affectedPixelCount: 0 };
		case 'readable-content-clipped':
			return {
				measurements: READABLE_IDS.map((readableId) => ({ readableId, affectedPixelCount: 0 }))
			};
		case 'readable-content-occluded':
			return {
				measurements: READABLE_IDS.map((readableId) => ({
					readableId,
					affectedPixelCount: 0,
					expectedTreatmentPixelCount: 20,
					visibleTreatmentPixelCount: 20,
					capture: captureBinding()
				}))
			};
		case 'readable-content-coverage':
			return {
				expectedReadableIdentities: READABLE_IDS,
				discoveredReadableIdentities: READABLE_IDS
			};
		case 'contrast-below-floor':
			return {
				measurements: READABLE_IDS.map((readableId) => ({
					readableId,
					measuredRatio: 4.5,
					textClass: 'body',
					treatmentSampleCount: 10,
					capture: captureBinding()
				}))
			};
		case 'cap-height-below-floor':
			return {
				measurements: READABLE_IDS.map((readableId) => ({
					readableId,
					measuredPixels: 32,
					textRole: 'surface-body',
					orientation: 'horizontal'
				}))
			};
		case 'output-class-mismatch':
			return { expectedClass: 'transparent', actualClass: 'transparent' };
		case 'text-edge-softness':
			return { normalizedMaximumStep: 0.3, transitionCount: 1 };
		case 'shadow-banding':
			return {
				expectedShadowIds: ['shadow:card:box-shadow:0'],
				shadows: [
					{
						shadowId: 'shadow:card:box-shadow:0',
						bandCount: 0,
						maximumAlphaStep: 0.3,
						transitionSpanPixels: 8,
						transitionSampleCount: 10
					}
				]
			};
		case 'tonal-banding':
			return { bandCount: 0 };
		case 'edge-aliasing':
			return { hardStairstepCount: 0, transitionSampleCount: 10 };
		case 'reading-window-too-short':
			return {
				readingPlanDigest: SHA,
				windows: [
					{
						readingId: 'reading-1',
						kind: 'post-mark',
						wordCount: 2,
						startMilliseconds: 1_000,
						endMilliseconds: 1_900
					}
				]
			};
		case 'visibility-discontinuity':
			return { measuredDipRatio: 0.25, orderedFrameCount: 3 };
		case 'layout-instability':
			return { maximumElementDeltaPixels: 0 };
		case 'nondeterministic-replay':
			return { changedPixelRatio: 0 };
	}
}

function allPassingChecks(): Record<string, unknown>[] {
	return SupersDeterministicRenderFailureCodeSchema.options.map((code) => ({
		checkId: code,
		code,
		outcome: 'pass',
		measurement: passingMeasurement(code),
		evidence: [{ kind: 'capture', path: 'evidence/frame.png', sha256: SHA, region: null }]
	}));
}

async function minimalBundle(): Promise<Record<string, unknown>> {
	const coordinateContent = {
		schemaVersion: 1 as const,
		sourceRevision: REVISION,
		engineFingerprint: SHA,
		presetSlug: 'preset-1',
		presetFingerprint: SHA,
		packId: 'pack-1',
		packFingerprint: SHA,
		orientation: 'horizontal' as const,
		frameRate: { num: 30, den: 1 },
		width: 3840 as const,
		height: 2160 as const,
		sample: {
			kind: 'checkpoint' as const,
			sampleId: 'sample-1',
			frameIndex: 30,
			timestampMicroseconds: 1_000_000,
			auxiliaryFrameIndices: [30],
			stableGeometryCandidateIds: ['candidate-1']
		}
	};
	const coordinate = {
		...coordinateContent,
		cellId: await createSupersDeterministicContractHash(coordinateContent)
	};
	const content = {
		schemaVersion: 1 as const,
		manifestDigest: SHA,
		sourceRevision: REVISION,
		cells: [
			{
				schemaVersion: 1 as const,
				coordinate,
				outcome: 'pass' as const,
				checks: allPassingChecks()
			}
		],
		outcome: 'pass' as const
	};
	return { ...content, bundleDigest: await createSupersDeterministicContractHash(content) };
}

async function passingRenderEvidence(): Promise<{
	manifest: Record<string, unknown>;
	bundle: Record<string, unknown>;
}> {
	const seedBundle = await minimalBundle();
	const cells = seedBundle.cells as Array<Record<string, unknown>>;
	const coordinate = cells[0].coordinate as Record<string, unknown>;
	const sample = coordinate.sample as Record<string, unknown>;
	const manifestContent = {
		schemaVersion: 1 as const,
		sourceRevision: REVISION,
		engineFingerprint: SHA,
		scope: 'affected' as const,
		presets: [
			{
				slug: 'preset-1',
				fingerprint: SHA,
				readingPlanDigest: SHA,
				readingPlanIds: ['reading-1'],
				samples: [sample]
			}
		],
		packs: [{ id: 'pack-1', fingerprint: SHA }],
		orientations: ['horizontal' as const],
		requiredCheckCodes: [...SupersDeterministicRenderFailureCodeSchema.options],
		coordinates: [coordinate]
	};
	const manifestDigest = await createSupersDeterministicContractHash(manifestContent);
	const bundleContent = {
		schemaVersion: 1 as const,
		manifestDigest,
		sourceRevision: REVISION,
		cells,
		outcome: 'pass' as const
	};
	return {
		manifest: {
			...manifestContent,
			manifestDigest
		},
		bundle: {
			...bundleContent,
			bundleDigest: await createSupersDeterministicContractHash(bundleContent)
		}
	};
}

async function withCompletedPassingRender(
	args: Record<string, unknown>
): Promise<Record<string, unknown>> {
	const { manifest, bundle } = await passingRenderEvidence();
	args.renderMatrixRun = {
		schemaVersion: 1,
		status: 'completed',
		scope: 'affected',
		workItem: 'task-1',
		sourceRevision: REVISION,
		expectedTreeFingerprint: SHA,
		registrySnapshotName: 'registry-task-1',
		registrySnapshotDigest: SHA,
		manifestName: 'manifest-task-1',
		manifestDigest: manifest.manifestDigest,
		bundleName: 'bundle-task-1',
		bundleDigest: bundle.bundleDigest,
		evidenceArchiveName: 'evidence-task-1',
		evidenceArchiveDigest: SECOND_SHA,
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:00:01.000Z',
		executionMode: 'bounded-internal-fanout',
		freshness: { localBefore: SHA, servedBefore: SHA, servedAfter: SHA, localAfter: SHA },
		counts: {
			presets: 1,
			packs: 1,
			orientations: 1,
			samples: 1,
			cells: 1,
			passed: 1,
			failed: 0,
			unavailable: 0
		},
		outcome: 'pass',
		advisories: []
	};
	args.renderMatrixManifestName = 'manifest-task-1';
	args.renderMatrixManifestWorkflowRunId = RUN;
	args.renderMatrixManifest = manifest;
	args.renderMatrixBundleName = 'bundle-task-1';
	args.renderMatrixBundleWorkflowRunId = RUN;
	args.renderMatrixBundle = bundle;
	return args;
}

const DETERMINISTIC_LANE_IDS = new Set(['browser', 'check', 'unit', 'structural']);

async function productionImpactArguments(path: string): Promise<Record<string, unknown>> {
	const impact = classifyChangeImpact([path]);
	const axes = selectAffectedStaticPresetPackAxes(
		{
			presets: [{ slug: 'lower-third', pipelineReferences: [], presetDependencies: [] }],
			packs: [{ id: 'syntax' }]
		},
		impact.paths
	);
	assert.ok(axes.length > 0, `Expected the production affected selector to capture ${path}`);

	const args = await notApplicableArguments();
	args.changeImpact = {
		resourceName: 'artifact-task-1-change-impact',
		workItem: 'task-1',
		treeFingerprint: SHA,
		workflowRunId: 'classification-run-1',
		surfaces: impact.surfaces,
		requiredHumanReviews: impact.requiredHumanReviews
	};
	args.requiredLaneIds = impact.lanes.map((lane) => lane.id);
	const deterministicLanes = impact.lanes
		.map((lane) => lane.id)
		.filter((lane) => DETERMINISTIC_LANE_IDS.has(lane));
	const fanoutContent = {
		schemaVersion: 1 as const,
		workItem: 'task-1',
		expectedFingerprint: SHA,
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:00:01.000Z',
		executionMode: 'parallel' as const,
		results: deterministicLanes.map((id) => ({
			id,
			status: 'passed' as const,
			command: `pnpm ${id}`,
			durationMs: 1,
			exitCode: 0,
			outputTail: `${id} passed`
		})),
		passed: true
	};
	args.deterministicFanout = {
		...fanoutContent,
		contentDigest: await createSupersDeterministicContractHash(fanoutContent)
	};
	return await withCompletedPassingRender(args);
}

Deno.test('not-applicable rendering preserves verified deterministic outcomes', async () => {
	const route = await normalizeSupersDeliveryVerificationRoute(await notApplicableArguments());
	assert.equal(route.disposition, 'reconcile');
	assert.deepEqual(route.objectiveFailureCodes, []);
	assert.deepEqual(route.unavailableEvidenceCodes, []);

	const failed = await normalizeSupersDeliveryVerificationRoute(
		await notApplicableArguments(false)
	);
	assert.equal(failed.disposition, 'automatic-rework');
	assert.deepEqual(failed.objectiveFailureCodes, ['check-failed']);

	const incompleteArguments = await notApplicableArguments();
	incompleteArguments.requiredLaneIds = ['policy-sweep', 'check', 'unit'];
	const unavailable = await normalizeSupersDeliveryVerificationRoute(incompleteArguments);
	assert.equal(unavailable.disposition, 'evidence-unavailable');
	assert.deepEqual(unavailable.objectiveFailureCodes, []);
	assert.deepEqual(unavailable.unavailableEvidenceCodes, [
		'incomplete-deterministic-fanout',
		'unexecuted-required-lane'
	]);

	const uncoveredArguments = await notApplicableArguments();
	uncoveredArguments.requiredLaneIds = ['policy-sweep', 'check', 'export-decode'];
	const uncovered = await normalizeSupersDeliveryVerificationRoute(uncoveredArguments);
	assert.equal(uncovered.disposition, 'evidence-unavailable');
	assert.deepEqual(uncovered.unavailableEvidenceCodes, ['unexecuted-required-lane']);
});

Deno.test(
	'production impact routing separates app, render, export, and mixed changes',
	async () => {
		const cases = [
			{
				path: 'src/lib/platform/user-composition-store.ts',
				disposition: 'reconcile',
				unavailable: []
			},
			{
				path: 'src/lib/platform/RootInspector.svelte',
				disposition: 'evidence-unavailable',
				unavailable: ['missing-app-visual-evidence']
			},
			{
				path: 'src/lib/platform/inspector.css',
				disposition: 'evidence-unavailable',
				unavailable: ['missing-app-visual-evidence']
			},
			{
				path: 'src/lib/presets/lower-third.json',
				disposition: 'await-human-aesthetic',
				unavailable: []
			},
			{
				path: 'src/lib/platform/composition-export-controller.ts',
				disposition: 'evidence-unavailable',
				unavailable: ['unexecuted-required-lane']
			},
			{
				path: 'src/lib/platform/Workspace.svelte',
				disposition: 'evidence-unavailable',
				unavailable: ['missing-app-visual-evidence']
			}
		] as const;

		for (const expected of cases) {
			const route = await normalizeSupersDeliveryVerificationRoute(
				await productionImpactArguments(expected.path)
			);
			assert.equal(route.disposition, expected.disposition, expected.path);
			assert.deepEqual(route.unavailableEvidenceCodes, expected.unavailable, expected.path);
		}
	}
);

Deno.test('app visual review fails closed until trusted app evidence exists', async () => {
	const args = await notApplicableArguments();
	(args.changeImpact as Record<string, unknown>).requiredHumanReviews = [
		{
			kind: 'authoring-app-visual',
			reasons: ['authoring application markup changed']
		}
	];
	const route = await normalizeSupersDeliveryVerificationRoute(args);
	assert.equal(route.disposition, 'evidence-unavailable');
	assert.deepEqual(route.objectiveFailureCodes, []);
	assert.deepEqual(route.unavailableEvidenceCodes, ['missing-app-visual-evidence']);
});

Deno.test('human review requirements must match unique classified surfaces and lanes', async () => {
	const mismatched = await notApplicableArguments();
	(mismatched.changeImpact as Record<string, unknown>).surfaces = [
		{ id: 'control-plane', reasons: ['policy changed'] }
	];
	(mismatched.changeImpact as Record<string, unknown>).requiredHumanReviews = [
		{ kind: 'authoring-app-visual', reasons: ['markup changed'] }
	];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(mismatched),
		/does not match its change surface/
	);

	const duplicatedSurface = await notApplicableArguments();
	(duplicatedSurface.changeImpact as Record<string, unknown>).surfaces = [
		{ id: 'authoring-app', reasons: ['behavior changed'] },
		{ id: 'authoring-app', reasons: ['presentation changed'] }
	];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(duplicatedSurface),
		/must be unique/
	);

	const duplicatedReview = await notApplicableArguments();
	(duplicatedReview.changeImpact as Record<string, unknown>).requiredHumanReviews = [
		{ kind: 'authoring-app-visual', reasons: ['markup changed'] },
		{ kind: 'authoring-app-visual', reasons: ['styles changed'] }
	];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(duplicatedReview),
		/must be unique/
	);

	const duplicatedLane = await notApplicableArguments();
	duplicatedLane.requiredLaneIds = ['policy-sweep', 'check', 'check'];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(duplicatedLane),
		/lanes must be unique/
	);
});

Deno.test('rendered composition impact requires its review and render lane', async () => {
	const missingReview = await notApplicableArguments();
	(missingReview.changeImpact as Record<string, unknown>).surfaces = [
		{ id: 'rendered-composition', reasons: ['composition pixels changed'] }
	];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(missingReview),
		/Rendered composition impact requires/
	);

	const missingLane = await notApplicableArguments();
	(missingLane.changeImpact as Record<string, unknown>).surfaces = [
		{ id: 'rendered-composition', reasons: ['composition pixels changed'] }
	];
	(missingLane.changeImpact as Record<string, unknown>).requiredHumanReviews = [
		{ kind: 'rendered-composition-aesthetic', reasons: ['composition pixels changed'] }
	];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(missingLane),
		/Rendered composition impact requires/
	);

	const reviewWithoutSurface = await notApplicableArguments();
	(reviewWithoutSurface.changeImpact as Record<string, unknown>).requiredHumanReviews = [
		{ kind: 'rendered-composition-aesthetic', reasons: ['composition pixels changed'] }
	];
	reviewWithoutSurface.requiredLaneIds = ['policy-sweep', 'check', 'render-matrix'];
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(reviewWithoutSurface),
		/Rendered composition impact requires/
	);
});

Deno.test('failed policy and corpus receipts produce bound automatic rework routes', async () => {
	const failedPolicy = await normalizeSupersDeliveryVerificationRoute(
		await notApplicableArguments(true, { timing: false })
	);
	assert.equal(failedPolicy.disposition, 'automatic-rework');
	assert.deepEqual(failedPolicy.objectiveFailureCodes, ['timing-policy-failed']);
	assert.equal(failedPolicy.policySweepWorkflowRunId, 'policy-run-1');
	assert.match(failedPolicy.policySweepExecutionDigest, /^[0-9a-f]{64}$/);

	const failedCorpus = await normalizeSupersDeliveryVerificationRoute(
		await notApplicableArguments(true, { corpus: false })
	);
	assert.equal(failedCorpus.disposition, 'automatic-rework');
	assert.deepEqual(failedCorpus.objectiveFailureCodes, ['corpus-failed']);
	assert.equal(failedCorpus.corpusReceipt.resourceName, 'sweep-latest');
});

Deno.test('a completed render matrix cannot cover a missing required browser receipt', async () => {
	const args = await notApplicableArguments();
	(args.changeImpact as Record<string, unknown>).surfaces = [
		{ id: 'rendered-composition', reasons: ['composition pixels changed'] }
	];
	(args.changeImpact as Record<string, unknown>).requiredHumanReviews = [
		{ kind: 'rendered-composition-aesthetic', reasons: ['composition pixels changed'] }
	];
	args.requiredLaneIds = ['policy-sweep', 'check', 'browser', 'render-matrix'];
	args.renderMatrixRun = {
		schemaVersion: 1,
		status: 'completed',
		scope: 'affected',
		workItem: 'task-1',
		sourceRevision: REVISION,
		expectedTreeFingerprint: SHA,
		registrySnapshotName: 'registry-task-1',
		registrySnapshotDigest: SHA,
		manifestName: 'manifest-task-1',
		manifestDigest: SHA,
		bundleName: 'bundle-task-1',
		bundleDigest: SHA,
		evidenceArchiveName: 'evidence-task-1',
		evidenceArchiveDigest: SECOND_SHA,
		startedAt: '2026-08-16T12:00:00.000Z',
		completedAt: '2026-08-16T12:00:01.000Z',
		executionMode: 'bounded-internal-fanout',
		freshness: { localBefore: SHA, servedBefore: SHA, servedAfter: SHA, localAfter: SHA },
		counts: {
			presets: 1,
			packs: 1,
			orientations: 2,
			samples: 1,
			cells: 2,
			passed: 2,
			failed: 0,
			unavailable: 0
		},
		outcome: 'pass',
		advisories: []
	};
	args.renderMatrixManifestName = 'manifest-task-1';
	args.renderMatrixManifestWorkflowRunId = RUN;
	args.renderMatrixBundleName = 'bundle-task-1';
	args.renderMatrixBundleWorkflowRunId = RUN;
	const route = await normalizeSupersDeliveryVerificationRoute(args);
	assert.equal(route.disposition, 'evidence-unavailable');
	assert.ok(route.unavailableEvidenceCodes.includes('unexecuted-required-lane'));
});

Deno.test('stale or directly substituted evidence cannot acquire routing authority', async () => {
	const staleMatrixRun = await notApplicableArguments();
	staleMatrixRun.renderMatrixRunWorkflowRunId = 'other-run';
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(staleMatrixRun),
		/workflow-correlated/
	);
	const staleRevision = await notApplicableArguments();
	staleRevision.expectedIntegratedRevision = 'd'.repeat(40);
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(staleRevision),
		/stale or not workflow-correlated/
	);
	const digestMismatch = await notApplicableArguments();
	(digestMismatch.deterministicFanout as Record<string, unknown>).contentDigest = SECOND_SHA;
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(digestMismatch),
		/stale or not workflow-correlated/
	);
	const stalePolicySet = await notApplicableArguments();
	const staleExecution: Record<string, unknown> = {
		...(stalePolicySet.policySweepExecution as Record<string, unknown>),
		routingWorkflowRunId: 'other-routing-run'
	};
	staleExecution.executionDigest = await createSupersDeterministicContractHash(
		Object.fromEntries(Object.entries(staleExecution).filter(([key]) => key !== 'executionDigest'))
	);
	stalePolicySet.policySweepExecution = staleExecution;
	await assert.rejects(
		() => normalizeSupersDeliveryVerificationRoute(stalePolicySet),
		/stale or not workflow-correlated/
	);
	const substitutedPolicyName = policySweepArguments();
	(
		(substitutedPolicyName.policyReceipts as Array<Record<string, unknown>>)[0] as Record<
			string,
			unknown
		>
	).resourceName = 'timing-clean-copy';
	await assert.rejects(
		() => recordSupersPolicySweepExecution(substitutedPolicyName),
		/name or workflow run was substituted/
	);
	const substitutedCorpusName = policySweepArguments();
	(substitutedCorpusName.corpusReceipt as Record<string, unknown>).resourceName =
		'sweep-clean-copy';
	await assert.rejects(
		() => recordSupersPolicySweepExecution(substitutedCorpusName),
		/name or workflow run was substituted/
	);
	const reconcileRoute = await normalizeSupersDeliveryVerificationRoute(
		await notApplicableArguments()
	);
	assert.throws(
		() =>
			SupersDeliveryVerificationRouteSchema.parse({
				...reconcileRoute,
				disposition: 'automatic-rework',
				objectiveFailureCodes: []
			}),
		/Automatic rework/
	);
});

Deno.test(
	'mixed measured failure and unavailable evidence cannot authorize automatic rework',
	async () => {
		const common = await normalizeSupersDeliveryVerificationRoute(await notApplicableArguments());
		const automatic = SupersDeliveryVerificationRouteSchema.parse({
			...common,
			disposition: 'automatic-rework',
			renderMatrixManifestDigest: SHA,
			renderMatrixBundleDigest: SHA,
			renderEvidenceArchiveDigest: SHA,
			objectiveFailureCodes: ['font-not-ready'],
			unavailableEvidenceCodes: []
		});
		assert.equal(automatic.disposition, 'automatic-rework');
		assert.throws(
			() =>
				SupersDeliveryVerificationRouteSchema.parse({
					...common,
					disposition: 'automatic-rework',
					renderMatrixManifestDigest: SHA,
					renderMatrixBundleDigest: SHA,
					renderEvidenceArchiveDigest: SHA,
					objectiveFailureCodes: ['font-not-ready'],
					unavailableEvidenceCodes: ['probe-zero-signal']
				}),
			/Automatic rework/
		);
		const unavailable = SupersDeliveryVerificationRouteSchema.parse({
			...common,
			disposition: 'evidence-unavailable',
			objectiveFailureCodes: ['font-not-ready'],
			unavailableEvidenceCodes: ['probe-zero-signal']
		});
		assert.equal(unavailable.disposition, 'evidence-unavailable');
	}
);

Deno.test(
	'advisories cannot block, recommend, decide, mutate, or alter objective routing',
	async () => {
		const advisory = {
			schemaVersion: 1,
			observationId: SHA,
			cellId: SHA,
			category: 'finish',
			summary: 'Advisory only.',
			evidence: [{ kind: 'capture', path: 'frame.png', sha256: SHA, region: null }],
			blocking: false,
			routingAuthority: 'none'
		};
		assert.throws(() =>
			SupersAdvisoryVisualObservationSchema.parse({ ...advisory, blocking: true })
		);
		assert.throws(() =>
			SupersAdvisoryVisualObservationSchema.parse({ ...advisory, routingAuthority: 'rework' })
		);
		for (const authorityClaim of [
			{ recommendation: 'revise' },
			{ decision: 'reject' },
			{ mutation: 'delete-brief' },
			{ approval: true }
		]) {
			assert.throws(() =>
				SupersAdvisoryVisualObservationSchema.parse({ ...advisory, ...authorityClaim })
			);
		}
		assert.equal(
			(await normalizeSupersDeliveryVerificationRoute(await notApplicableArguments())).disposition,
			'reconcile'
		);
	}
);

Deno.test(
	'human aesthetic decisions bind exact gate, cycle, work item, tree, and bundle',
	async () => {
		const bundle = await minimalBundle();
		const route = SupersDeliveryVerificationRouteSchema.parse({
			schemaVersion: 2,
			disposition: 'await-human-aesthetic',
			workItem: 'task-1',
			integratedRevision: REVISION,
			integratedTreeFingerprint: SECOND_SHA,
			treeFingerprint: SHA,
			changeImpactResourceName: 'artifact-task-1-change-impact',
			deterministicFanoutResourceName: 'verification-fanout-canonical-hash',
			deterministicFanoutContentDigest: SHA,
			deterministicFanoutWorkflowRunId: RUN,
			policySweepResourceName: 'policy-sweep-execution-task-1-policy-run-1',
			policySweepWorkflowId: '5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a',
			policySweepWorkflowName: 'policy-sweep',
			policySweepWorkflowVersion: 2,
			policySweepWorkflowRunId: 'policy-run-1',
			policySweepExecutionDigest: SHA,
			policyReceipts: ['parity', 'planning', 'timing', 'tracking'].map((specName) => ({
				modelName: 'repo-audit',
				specName,
				resourceName: `${specName}-latest`,
				workflowRunId: 'policy-run-1',
				contentDigest: SHA
			})),
			corpusReceipt: {
				modelName: 'corpus-verify',
				specName: 'sweep',
				resourceName: 'sweep-latest',
				workflowRunId: 'policy-run-1',
				contentDigest: SHA
			},
			renderMatrixRunName: 'render-matrix-run-task-1',
			renderMatrixManifestName: 'manifest-task-1',
			renderMatrixBundleName: 'bundle-task-1',
			renderMatrixManifestDigest: SHA,
			renderMatrixBundleDigest: bundle.bundleDigest,
			renderMatrixRunDigest: SHA,
			renderEvidenceArchiveDigest: SECOND_SHA,
			workflowRunId: RUN,
			requiredHumanReviewKinds: ['rendered-composition-aesthetic'],
			objectiveFailureCodes: [],
			unavailableEvidenceCodes: [],
			advisories: []
		});
		const args = {
			schemaVersion: 1,
			workItem: 'task-1',
			factoryName: 'supers-delivery',
			factoryStateResourceName: 'state-task-1',
			factoryState: {
				workItem: 'task-1',
				stageId: 'aesthetic-decision-binding',
				cycles: { 'aesthetic-approval': 2 }
			},
			factoryApprovalResourceName: 'approval-task-1-aesthetic-acceptance',
			factoryApproval: {
				gateId: 'aesthetic-acceptance',
				workItem: 'task-1',
				decision: 'approved',
				actor: 'human-reviewer',
				stageId: 'aesthetic-approval',
				cycle: 2,
				decidedAt: '2026-08-16T12:00:00.000Z'
			},
			verificationRouteResourceName: 'route-task-1',
			verificationRoute: route,
			matrixBundleResourceName: 'bundle-task-1',
			matrixBundle: bundle
		};
		const decision = await bindSupersHumanAestheticDecision(args);
		assert.equal(decision.decision, 'accept');
		assert.equal(decision.renderMatrixBundleDigest, bundle.bundleDigest);
		assert.equal(decision.deterministicFanoutResourceName, 'verification-fanout-canonical-hash');
		assert.equal(decision.policySweepWorkflowRunId, 'policy-run-1');
		assert.equal(decision.policySweepExecutionDigest, SHA);
		assert.equal(decision.corpusReceipt.resourceName, 'sweep-latest');
		assert.equal(decision.renderMatrixRunName, 'render-matrix-run-task-1');
		assert.equal(decision.verificationWorkflowRunId, RUN);
		assert.equal(decision.integratedRevision, REVISION);
		assert.equal(decision.integratedTreeFingerprint, SECOND_SHA);
		assert.equal(decision.renderMatrixManifestDigest, SHA);
		assert.equal(decision.renderEvidenceArchiveDigest, SECOND_SHA);
		await assert.rejects(
			() =>
				bindSupersHumanAestheticDecision({
					...args,
					factoryApproval: { ...args.factoryApproval, cycle: 1 }
				}),
			/does not authorize/
		);
		await assert.rejects(
			() =>
				bindSupersHumanAestheticDecision({
					...args,
					verificationRoute: { ...route, renderMatrixBundleDigest: SECOND_SHA }
				}),
			/does not authorize/
		);
		await assert.rejects(
			() =>
				bindSupersHumanAestheticDecision({
					...args,
					matrixBundleResourceName: 'stale-bundle-name'
				}),
			/does not authorize/
		);
	}
);
