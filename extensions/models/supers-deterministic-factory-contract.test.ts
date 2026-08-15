import assert from 'node:assert/strict';

import {
	createSupersDeterministicContractHash,
	createSupersIntegratedTreeFingerprint,
	SUPERS_DETERMINISTIC_RULE_INVENTORY,
	SupersAdvisoryVisualObservationSchema,
	SupersDeterministicRenderCheckSchema,
	type SupersDeterministicRenderFailureCode,
	SupersDeterministicRenderFailureCodeSchema,
	SupersFactoryEpicLaneLeaseSchema,
	SupersFactoryIntegrationReceiptSchema,
	SupersHumanAestheticDecisionSchema,
	SupersRenderMatrixCoordinateSchema,
	SupersRenderRegistrySnapshotSchema,
	verifySupersFactoryIntegrationReceipt,
	verifySupersFullRenderMatrixBundle,
	verifySupersHumanAestheticDecision,
	verifySupersRenderMatrixBundle
} from './supers-deterministic-factory-contract.ts';

const SHA = 'a'.repeat(64);
const SECOND_SHA = 'b'.repeat(64);
const GIT_REVISION = 'c'.repeat(40);
const READABLE_IDS = ['lower-third:kicker', 'lower-third:title'];

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

function evidence(): Record<string, unknown> {
	return {
		kind: 'dom',
		path: '.tmp-verification/lower-third.json',
		sha256: SHA,
		region: null
	};
}

async function coordinate(
	orientation: 'horizontal' | 'vertical'
): Promise<Record<string, unknown>> {
	const content = {
		schemaVersion: 1,
		sourceRevision: GIT_REVISION,
		engineFingerprint: SHA,
		presetSlug: 'lower-third',
		presetFingerprint: SHA,
		packId: 'syntax',
		packFingerprint: SECOND_SHA,
		orientation,
		frameRate: { num: 30, den: 1 },
		width: orientation === 'horizontal' ? 3840 : 2160,
		height: orientation === 'horizontal' ? 2160 : 3840,
		sample: {
			kind: 'checkpoint',
			sampleId: 'settled',
			frameIndex: 30,
			timestampMicroseconds: 1_000_000,
			auxiliaryFrameIndices: [30],
			stableGeometryCandidateIds: ['composition-root', 'overlay-root']
		}
	};
	return {
		...content,
		cellId: await createSupersDeterministicContractHash(content)
	};
}

function passingMeasurement(
	code: SupersDeterministicRenderFailureCode,
	width: number,
	height: number
): Record<string, unknown> {
	switch (code) {
		case 'target-resolution-mismatch':
			return {
				actualWidth: width,
				actualHeight: height,
				activeFrameRate: { num: 30, den: 1 }
			};
		case 'font-not-ready':
			return { pendingFontCount: 0 };
		case 'title-safe-violation':
		case 'vertical-platform-safe-area-violation':
			return { affectedPixelCount: 0 };
		case 'readable-content-clipped':
			return {
				measurements: READABLE_IDS.map((readableId) => ({
					readableId,
					affectedPixelCount: 0
				}))
			};
		case 'readable-content-occluded':
			return {
				measurements: READABLE_IDS.map((readableId) => ({
					readableId,
					affectedPixelCount: 0,
					expectedTreatmentPixelCount: 20,
					visibleTreatmentPixelCount: 20,
					capture: {
						...captureBinding(),
						captureWidth: width,
						captureHeight: height
					}
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
					capture: {
						...captureBinding(),
						captureWidth: width,
						captureHeight: height
					}
				}))
			};
		case 'cap-height-below-floor':
			return {
				measurements: READABLE_IDS.map((readableId) => ({
					readableId,
					measuredPixels: width === 3840 ? 32 : 44,
					textRole: 'surface-body',
					orientation: width === 3840 ? 'horizontal' : 'vertical'
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
						readingId: 'post-mark:segment:0',
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

function evaluatedCheck(
	code: SupersDeterministicRenderFailureCode,
	width = 3840,
	height = 2160
): Record<string, unknown> {
	return {
		checkId: code,
		code,
		outcome: 'pass',
		measurement: passingMeasurement(code, width, height),
		evidence: [evidence()]
	};
}

function allChecks(width: number, height: number): Record<string, unknown>[] {
	return SupersDeterministicRenderFailureCodeSchema.options.map((code) =>
		evaluatedCheck(code, width, height)
	);
}

async function verifiedFixture(): Promise<{
	manifest: Record<string, unknown>;
	bundle: Record<string, unknown>;
}> {
	const coordinates = [await coordinate('horizontal'), await coordinate('vertical')];
	const manifestContent = {
		schemaVersion: 1,
		sourceRevision: GIT_REVISION,
		engineFingerprint: SHA,
		scope: 'full',
		presets: [
			{
				slug: 'lower-third',
				fingerprint: SHA,
				readingPlanDigest: SHA,
				readingPlanIds: ['post-mark:segment:0'],
				samples: [
					{
						kind: 'checkpoint',
						sampleId: 'settled',
						frameIndex: 30,
						timestampMicroseconds: 1_000_000,
						auxiliaryFrameIndices: [30],
						stableGeometryCandidateIds: ['composition-root', 'overlay-root']
					}
				]
			}
		],
		packs: [{ id: 'syntax', fingerprint: SECOND_SHA }],
		orientations: ['horizontal', 'vertical'],
		requiredCheckCodes: SupersDeterministicRenderFailureCodeSchema.options,
		coordinates
	};
	const manifestDigest = await createSupersDeterministicContractHash(manifestContent);
	const cells = coordinates.map((entry) => {
		const dimensions = entry as { width: number; height: number };
		return {
			schemaVersion: 1,
			coordinate: entry,
			outcome: 'pass',
			checks: allChecks(dimensions.width, dimensions.height)
		};
	});
	const bundleContent = {
		schemaVersion: 1,
		manifestDigest,
		sourceRevision: GIT_REVISION,
		cells,
		outcome: 'pass'
	};
	return {
		manifest: { ...manifestContent, manifestDigest },
		bundle: {
			...bundleContent,
			bundleDigest: await createSupersDeterministicContractHash(bundleContent)
		}
	};
}

Deno.test('epic lane contracts close integration states and released dispositions', () => {
	const lease = {
		schemaVersion: 1,
		leaseId: SHA,
		rootEpicId: 'factory-redesign',
		activeTaskId: 'typed-contracts',
		factoryName: 'supers-delivery',
		worktreePath: '/tmp/supers-factory-redesign',
		baseRevision: GIT_REVISION,
		sourceRevision: GIT_REVISION,
		treeFingerprint: SHA,
		state: 'leased',
		integration: null
	};
	assert.equal(SupersFactoryEpicLaneLeaseSchema.parse(lease).state, 'leased');
	assert.throws(() =>
		SupersFactoryEpicLaneLeaseSchema.parse({
			...lease,
			recommendation: 'merge-it'
		})
	);
	assert.throws(() =>
		SupersFactoryEpicLaneLeaseSchema.parse({
			...lease,
			state: 'released',
			integration: { disposition: 'integrated', integratedRevision: null }
		})
	);
	assert.throws(() =>
		SupersFactoryEpicLaneLeaseSchema.parse({
			...lease,
			state: 'released',
			integration: {
				disposition: 'abandoned',
				integratedRevision: GIT_REVISION
			}
		})
	);
});

Deno.test('Pi integration receipts bind exact handoff and target identities', async () => {
	const content = {
		schemaVersion: 1 as const,
		rootEpicId: 'factory-redesign',
		activeTaskId: 'typed-contracts',
		factoryName: 'supers-delivery',
		handoffManifestDigest: SHA,
		targetBaselineRevision: GIT_REVISION,
		childRevisionEvidence: {
			status: 'verified' as const,
			childCommittedRevision: 'd'.repeat(40)
		},
		disposition: 'integrated' as const,
		baseCommit: GIT_REVISION,
		patchDigest: SECOND_SHA,
		changedPaths: ['extensions/models/factory-contract.ts'],
		integratedRevision: 'e'.repeat(40),
		integratedTreeFingerprint: SHA,
		rejectionReason: 'none' as const
	};
	const receipt = {
		...content,
		receiptId: await createSupersDeterministicContractHash(content)
	};
	assert.equal((await verifySupersFactoryIntegrationReceipt(receipt)).disposition, 'integrated');
	await assert.rejects(() =>
		verifySupersFactoryIntegrationReceipt({
			...receipt,
			targetBaselineRevision: 'f'.repeat(40)
		})
	);
	assert.throws(() =>
		SupersFactoryIntegrationReceiptSchema.parse({
			...receipt,
			disposition: 'rejected',
			integratedRevision: 'e'.repeat(40),
			integratedTreeFingerprint: SHA,
			rejectionReason: 'patch-conflict'
		})
	);
	assert.throws(() =>
		SupersFactoryIntegrationReceiptSchema.parse({
			...receipt,
			changedPaths: ['z.ts', 'a.ts']
		})
	);
	assert.throws(() =>
		SupersFactoryIntegrationReceiptSchema.parse({
			...receipt,
			childRevisionEvidence: {
				status: 'not-provided',
				childCommittedRevision: null
			}
		})
	);
});

Deno.test('integrated tree fingerprint hashes exact NUL-delimited listing bytes', async () => {
	const listing = new TextEncoder().encode(
		'100644 blob 0123456789012345678901234567890123456789\ta.ts\0'
	);
	const directDigest = await crypto.subtle.digest('SHA-256', listing);
	const expected = [...new Uint8Array(directDigest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	assert.equal(await createSupersIntegratedTreeFingerprint(listing), expected);
	assert.notEqual(
		await createSupersIntegratedTreeFingerprint(new Uint8Array([...listing, '\n'.charCodeAt(0)])),
		expected
	);
});

Deno.test('rejected Pi handoffs do not claim unavailable integration facts', async () => {
	const content = {
		schemaVersion: 1 as const,
		rootEpicId: 'factory-redesign',
		activeTaskId: 'typed-contracts',
		factoryName: 'supers-delivery',
		handoffManifestDigest: SHA,
		targetBaselineRevision: GIT_REVISION,
		childRevisionEvidence: {
			status: 'not-provided' as const,
			childCommittedRevision: null
		},
		disposition: 'rejected' as const,
		baseCommit: GIT_REVISION,
		patchDigest: null,
		changedPaths: [],
		integratedRevision: null,
		integratedTreeFingerprint: null,
		rejectionReason: 'manifest-invalid' as const
	};
	const receipt = {
		...content,
		receiptId: await createSupersDeterministicContractHash(content)
	};
	assert.equal((await verifySupersFactoryIntegrationReceipt(receipt)).disposition, 'rejected');
});

Deno.test('render coordinates enforce native orientation resolution', async () => {
	const horizontal = await coordinate('horizontal');
	assert.equal(SupersRenderMatrixCoordinateSchema.parse(horizontal).width, 3840);
	assert.throws(() =>
		SupersRenderMatrixCoordinateSchema.parse({
			...horizontal,
			orientation: 'vertical'
		})
	);
	assert.throws(() =>
		SupersRenderMatrixCoordinateSchema.parse({
			...horizontal,
			sample: {
				...(horizontal.sample as Record<string, unknown>),
				timestampMicroseconds: 999_999
			}
		})
	);
});

Deno.test('evaluated outcomes derive from typed measurements only', () => {
	assert.equal(
		SupersDeterministicRenderCheckSchema.parse(evaluatedCheck('title-safe-violation')).outcome,
		'pass'
	);
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			checkId: 'title-safe-violation',
			code: 'title-safe-violation',
			outcome: 'fail',
			measurement: { opinion: 'looks bad' },
			evidence: [evidence()]
		})
	);
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			...evaluatedCheck('title-safe-violation'),
			outcome: 'fail'
		})
	);
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			...evaluatedCheck('contrast-below-floor'),
			measurement: {
				measurements: [
					{
						readableId: READABLE_IDS[0],
						measuredRatio: 1,
						textClass: 'body',
						treatmentSampleCount: 1,
						capture: captureBinding(),
						callerSelectedMinimum: 0
					}
				]
			}
		})
	);
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			checkId: 'target-resolution-mismatch',
			code: 'target-resolution-mismatch',
			outcome: 'not-applicable',
			reason: 'no-text',
			evidence: [evidence()]
		})
	);
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			checkId: 'reading-window-too-short',
			code: 'reading-window-too-short',
			outcome: 'not-applicable',
			reason: 'no-reading-content',
			evidence: [evidence()]
		})
	);
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			...evaluatedCheck('reading-window-too-short'),
			measurement: {
				readingPlanDigest: SHA,
				windows: [
					{
						readingId: 'post-mark:segment:0',
						kind: 'post-mark',
						wordCount: 2,
						startMilliseconds: 1_000,
						endMilliseconds: 1_900,
						requiredMilliseconds: 0
					}
				]
			}
		})
	);
});

Deno.test('every implemented threshold is closed and measurement-derived', () => {
	for (const code of SupersDeterministicRenderFailureCodeSchema.options) {
		assert.equal(
			SupersDeterministicRenderCheckSchema.parse(evaluatedCheck(code)).outcome,
			'pass',
			code
		);
		assert.throws(
			() =>
				SupersDeterministicRenderCheckSchema.parse({
					...evaluatedCheck(code),
					measurement: {
						...passingMeasurement(code, 3840, 2160),
						callerSelectedMinimum: 0
					}
				}),
			code
		);
	}

	const failingMeasurements: Partial<
		Record<SupersDeterministicRenderFailureCode, Record<string, unknown>>
	> = {
		'font-not-ready': { pendingFontCount: 1 },
		'title-safe-violation': { affectedPixelCount: 1 },
		'vertical-platform-safe-area-violation': { affectedPixelCount: 1 },
		'readable-content-clipped': {
			measurements: READABLE_IDS.map((readableId) => ({
				readableId,
				affectedPixelCount: 1
			}))
		},
		'readable-content-occluded': {
			measurements: READABLE_IDS.map((readableId) => ({
				readableId,
				affectedPixelCount: 1,
				expectedTreatmentPixelCount: 20,
				visibleTreatmentPixelCount: 19,
				capture: captureBinding()
			}))
		},
		'contrast-below-floor': {
			measurements: READABLE_IDS.map((readableId) => ({
				readableId,
				measuredRatio: 4.499,
				textClass: 'body',
				treatmentSampleCount: 10,
				capture: captureBinding()
			}))
		},
		'cap-height-below-floor': {
			measurements: READABLE_IDS.map((readableId) => ({
				readableId,
				measuredPixels: 43.999,
				textRole: 'surface-body',
				orientation: 'vertical'
			}))
		},
		'output-class-mismatch': {
			expectedClass: 'transparent',
			actualClass: 'opaque'
		},
		'text-edge-softness': {
			normalizedMaximumStep: 0.299,
			transitionCount: 1
		},
		'shadow-banding': {
			expectedShadowIds: ['shadow:card:box-shadow:0'],
			shadows: [
				{
					shadowId: 'shadow:card:box-shadow:0',
					bandCount: 0,
					maximumAlphaStep: 0.301,
					transitionSpanPixels: 8,
					transitionSampleCount: 10
				}
			]
		},
		'tonal-banding': { bandCount: 1 },
		'edge-aliasing': { hardStairstepCount: 1, transitionSampleCount: 10 },
		'reading-window-too-short': {
			readingPlanDigest: SHA,
			windows: [
				{
					readingId: 'post-mark:segment:0',
					kind: 'post-mark',
					wordCount: 2,
					startMilliseconds: 1_000,
					endMilliseconds: 1_899.999
				}
			]
		},
		'visibility-discontinuity': {
			measuredDipRatio: 0.251,
			orderedFrameCount: 3
		},
		'layout-instability': { maximumElementDeltaPixels: 0.001 },
		'nondeterministic-replay': { changedPixelRatio: 0.000_001 }
	};

	for (const [code, measurement] of Object.entries(failingMeasurements)) {
		assert.equal(
			SupersDeterministicRenderCheckSchema.parse({
				...evaluatedCheck(code as SupersDeterministicRenderFailureCode),
				outcome: 'fail',
				measurement
			}).outcome,
			'fail',
			code
		);
	}
});

Deno.test('signal-dependent checks reject empty regions and coverage fails unavailable', () => {
	for (const [code, measurement] of [
		['text-edge-softness', { normalizedMaximumStep: 0, transitionCount: 0 }],
		['edge-aliasing', { hardStairstepCount: 0, transitionSampleCount: 0 }],
		[
			'shadow-banding',
			{
				expectedShadowIds: ['shadow:card:box-shadow:0'],
				shadows: [
					{
						shadowId: 'shadow:card:box-shadow:0',
						bandCount: 0,
						maximumAlphaStep: 0,
						transitionSpanPixels: 0,
						transitionSampleCount: 0
					}
				]
			}
		],
		[
			'contrast-below-floor',
			{
				measurements: [
					{
						readableId: READABLE_IDS[0],
						measuredRatio: 21,
						textClass: 'body',
						treatmentSampleCount: 0,
						capture: captureBinding()
					}
				]
			}
		]
	] as const) {
		assert.throws(() =>
			SupersDeterministicRenderCheckSchema.parse({
				...evaluatedCheck(code),
				measurement
			})
		);
	}
	assert.throws(() =>
		SupersDeterministicRenderCheckSchema.parse({
			...evaluatedCheck('readable-content-coverage'),
			outcome: 'fail',
			measurement: {
				expectedReadableIdentities: READABLE_IDS,
				discoveredReadableIdentities: [READABLE_IDS[0]]
			}
		})
	);
	assert.equal(
		SupersDeterministicRenderCheckSchema.parse({
			checkId: 'readable-content-coverage',
			code: 'readable-content-coverage',
			outcome: 'unavailable',
			unavailableReason: 'incomplete-readable-coverage',
			evidence: [evidence()]
		}).outcome,
		'unavailable'
	);
	for (const code of ['text-edge-softness', 'shadow-banding', 'edge-aliasing'] as const) {
		const check = SupersDeterministicRenderCheckSchema.parse({
			checkId: code,
			code,
			outcome: 'unavailable',
			unavailableReason: 'probe-zero-signal',
			evidence: [evidence()]
		});
		assert.equal(check.outcome, 'unavailable');
		assert.equal(check.evidence.length, 1);
	}
});

Deno.test('verified full matrix binds every axis, check, revision, and digest', async () => {
	const fixture = await verifiedFixture();
	const verified = await verifySupersRenderMatrixBundle(fixture.manifest, fixture.bundle);
	assert.equal(verified.cells.length, 2);

	const missingCellBundle = structuredClone(fixture.bundle);
	(missingCellBundle.cells as unknown[]).pop();
	await assert.rejects(() => verifySupersRenderMatrixBundle(fixture.manifest, missingCellBundle));

	const missingCheckBundle = structuredClone(fixture.bundle);
	const firstCell = (missingCheckBundle.cells as Array<{ checks: unknown[] }>)[0];
	firstCell.checks.pop();
	await assert.rejects(() => verifySupersRenderMatrixBundle(fixture.manifest, missingCheckBundle));

	const tamperedCoordinateBundle = structuredClone(fixture.bundle);
	const coordinate = (
		tamperedCoordinateBundle.cells as Array<{
			coordinate: { packFingerprint: string };
		}>
	)[0].coordinate;
	coordinate.packFingerprint = SHA;
	await assert.rejects(() =>
		verifySupersRenderMatrixBundle(fixture.manifest, tamperedCoordinateBundle)
	);

	const relaxedThresholdBundle = structuredClone(fixture.bundle);
	const contrast = (
		relaxedThresholdBundle.cells as Array<{
			checks: Array<Record<string, unknown>>;
		}>
	)[0].checks.find((entry) => entry.code === 'contrast-below-floor');
	assert.ok(contrast);
	contrast.measurement = {
		measurements: [
			{
				readableId: READABLE_IDS[0],
				measuredRatio: 1,
				textClass: 'body',
				treatmentSampleCount: 1,
				capture: captureBinding(),
				callerSelectedMinimum: 0
			}
		]
	};
	await assert.rejects(() =>
		verifySupersRenderMatrixBundle(fixture.manifest, relaxedThresholdBundle)
	);
});

Deno.test(
	'full matrix snapshot rejects stale, missing, duplicate, and extra live axes',
	async () => {
		const fixture = await verifiedFixture();
		const manifest = fixture.manifest as {
			presets: Array<{
				slug: string;
				fingerprint: string;
				readingPlanDigest: string;
				readingPlanIds: string[];
				samples: Record<string, unknown>[];
			}>;
			packs: Array<{ id: string; fingerprint: string }>;
		};
		const snapshotContent = {
			schemaVersion: 1,
			sourceRevision: GIT_REVISION,
			engineFingerprint: SHA,
			deliverablePresets: manifest.presets.map((preset) => ({
				slug: preset.slug,
				presetFingerprint: preset.fingerprint,
				readingPlanDigest: preset.readingPlanDigest,
				readingPlanIds: preset.readingPlanIds,
				samples: preset.samples
			})),
			packs: manifest.packs.map((pack) => ({ id: pack.id, packFingerprint: pack.fingerprint })),
			orientations: ['horizontal', 'vertical'] as const
		};
		const snapshot = {
			...snapshotContent,
			snapshotDigest: await createSupersDeterministicContractHash(snapshotContent)
		};
		assert.equal(SupersRenderRegistrySnapshotSchema.parse(snapshot).deliverablePresets.length, 1);
		assert.equal(
			(await verifySupersFullRenderMatrixBundle(snapshot, fixture.manifest, fixture.bundle)).cells
				.length,
			2
		);

		for (const mutate of [
			(value: typeof snapshot) => ({ ...value, sourceRevision: 'd'.repeat(40) }),
			(value: typeof snapshot) => ({ ...value, deliverablePresets: [] }),
			(value: typeof snapshot) => ({
				...value,
				deliverablePresets: [...value.deliverablePresets, value.deliverablePresets[0]]
			}),
			(value: typeof snapshot) => ({
				...value,
				packs: [...value.packs, { id: 'extra-pack', packFingerprint: SHA }]
			})
		]) {
			await assert.rejects(() =>
				verifySupersFullRenderMatrixBundle(mutate(snapshot), fixture.manifest, fixture.bundle)
			);
		}
	}
);

Deno.test('full matrix compares complete transition sample identities', async () => {
	const fixture = await verifiedFixture();
	const manifest = structuredClone(fixture.manifest) as {
		manifestDigest: string;
		presets: Array<{ samples: Array<Record<string, unknown>> }>;
		coordinates: Array<Record<string, unknown>>;
	};
	const bundle = structuredClone(fixture.bundle) as {
		bundleDigest: string;
		manifestDigest: string;
		cells: Array<{ coordinate: Record<string, unknown> }>;
	};
	const declaredSample = {
		kind: 'transition-window',
		transitionId: 'declared-transition',
		sampleId: 'transition-frame',
		frameIndex: 30,
		timestampMicroseconds: 1_000_000,
		auxiliaryFrameIndices: [29, 30, 31],
		stableGeometryCandidateIds: ['composition-root', 'overlay-root']
	};
	const renderedSample = {
		...declaredSample,
		transitionId: 'different-transition'
	};
	manifest.presets[0].samples = [declaredSample];
	for (const [index, entry] of manifest.coordinates.entries()) {
		const { cellId: previousCellId, ...coordinateContent } = entry;
		void previousCellId;
		const content = { ...coordinateContent, sample: renderedSample };
		const updated = {
			...content,
			cellId: await createSupersDeterministicContractHash(content)
		};
		manifest.coordinates[index] = updated;
		bundle.cells[index].coordinate = updated;
	}
	const { manifestDigest: previousManifestDigest, ...manifestContent } = manifest;
	void previousManifestDigest;
	manifest.manifestDigest = await createSupersDeterministicContractHash(manifestContent);
	bundle.manifestDigest = manifest.manifestDigest;
	const { bundleDigest: previousBundleDigest, ...bundleContent } = bundle;
	void previousBundleDigest;
	bundle.bundleDigest = await createSupersDeterministicContractHash(bundleContent);
	await assert.rejects(() => verifySupersRenderMatrixBundle(manifest, bundle));
});

Deno.test('advisory observations have no blocking or routing authority', () => {
	const observation = SupersAdvisoryVisualObservationSchema.parse({
		schemaVersion: 1,
		observationId: SHA,
		cellId: SHA,
		category: 'pack-grammar',
		summary: 'The composition may not feel native to this Pack.',
		evidence: [evidence()],
		blocking: false,
		routingAuthority: 'none'
	});
	assert.equal(observation.routingAuthority, 'none');
	assert.throws(() =>
		SupersAdvisoryVisualObservationSchema.parse({
			...observation,
			recommendation: 'revise'
		})
	);
});

Deno.test('human decisions require a trusted approval receipt bound to evidence', async () => {
	const fixture = await verifiedFixture();
	const bundle = await verifySupersRenderMatrixBundle(fixture.manifest, fixture.bundle);
	const decision = SupersHumanAestheticDecisionSchema.parse({
		schemaVersion: 1,
		decisionId: SHA,
		evidenceBundleDigest: bundle.bundleDigest,
		approvalReceiptId: SHA,
		authenticatedActorId: 'scott',
		decision: 'reject',
		note: 'The motion hierarchy still needs work.'
	});
	assert.equal(verifySupersHumanAestheticDecision(decision, bundle).authenticatedActorId, 'scott');
	assert.throws(() =>
		SupersHumanAestheticDecisionSchema.parse({
			...decision,
			authority: 'human-aesthetic'
		})
	);
	assert.throws(() =>
		verifySupersHumanAestheticDecision({ ...decision, evidenceBundleDigest: SECOND_SHA }, bundle)
	);
});

Deno.test('every failure code has one canonical implementation inventory entry', () => {
	const codes = SupersDeterministicRenderFailureCodeSchema.options;
	const inventoryCodes = SUPERS_DETERMINISTIC_RULE_INVENTORY.map((entry) => entry.code);
	assert.deepEqual([...inventoryCodes].sort(), [...codes].sort());
	assert.equal(new Set(inventoryCodes).size, inventoryCodes.length);
	assert.equal(
		SUPERS_DETERMINISTIC_RULE_INVENTORY.every((entry) => entry.implementation === 'existing'),
		true
	);
});
