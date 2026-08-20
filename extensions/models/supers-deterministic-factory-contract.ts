import { z } from 'npm:zod@4.4.3';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const REPOSITORY_PATH_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/;

const Sha256Schema = z.string().regex(SHA256_PATTERN);
const GitRevisionSchema = z.string().regex(GIT_REVISION_PATTERN);
const DomainIdSchema = z.string().regex(DOMAIN_ID_PATTERN);
const RepositoryPathSchema = z.string().min(1).max(1_000).regex(REPOSITORY_PATH_PATTERN);
const NonNegativeIntegerSchema = z.number().int().nonnegative();
const NonNegativeNumberSchema = z.number().finite().nonnegative();

const FactoryEpicLaneIdentityFields = {
	schemaVersion: z.literal(1),
	leaseId: Sha256Schema,
	rootEpicId: DomainIdSchema,
	activeTaskId: DomainIdSchema,
	factoryName: DomainIdSchema,
	worktreePath: z.string().min(1).max(2_000),
	baseRevision: GitRevisionSchema,
	sourceRevision: GitRevisionSchema,
	treeFingerprint: Sha256Schema
};

const QueuedIntegrationSchema = z.strictObject({
	targetRevision: GitRevisionSchema,
	candidateFingerprint: Sha256Schema
});

const ReleasedIntegrationSchema = z.discriminatedUnion('disposition', [
	z.strictObject({
		disposition: z.literal('integrated'),
		integratedRevision: GitRevisionSchema
	}),
	z.strictObject({
		disposition: z.literal('abandoned'),
		integratedRevision: z.null()
	})
]);

/**
 * One lease belongs to one root epic and one isolated worktree. Closed states
 * prevent prose or caller recommendations from granting integration authority.
 */
export const SupersFactoryEpicLaneLeaseSchema = z.discriminatedUnion('state', [
	z.strictObject({
		...FactoryEpicLaneIdentityFields,
		state: z.literal('leased'),
		integration: z.null()
	}),
	z.strictObject({
		...FactoryEpicLaneIdentityFields,
		state: z.literal('integration-queued'),
		integration: QueuedIntegrationSchema
	}),
	z.strictObject({
		...FactoryEpicLaneIdentityFields,
		state: z.literal('integrating'),
		integration: QueuedIntegrationSchema.extend({
			integrationAttemptId: Sha256Schema,
			integrationBaseRevision: GitRevisionSchema
		})
	}),
	z.strictObject({
		...FactoryEpicLaneIdentityFields,
		state: z.literal('released'),
		integration: ReleasedIntegrationSchema
	}),
	z.strictObject({
		...FactoryEpicLaneIdentityFields,
		state: z.literal('recovery-required'),
		integration: z.strictObject({
			reason: z.enum([
				'missing-worktree',
				'lease-conflict',
				'stale-source-revision',
				'integration-conflict'
			])
		})
	})
]);

export type SupersFactoryEpicLaneLease = z.infer<typeof SupersFactoryEpicLaneLeaseSchema>;

const UniqueChangedPathsSchema = z
	.array(RepositoryPathSchema)
	.max(2_000)
	.superRefine((paths, context) => {
		if (new Set(paths).size !== paths.length) {
			context.addIssue({
				code: 'custom',
				message: 'Changed paths must be unique'
			});
		}
		const sorted = [...paths].sort((left, right) => left.localeCompare(right));
		if (paths.some((path, index) => path !== sorted[index])) {
			context.addIssue({
				code: 'custom',
				message: 'Changed paths must be sorted'
			});
		}
	});

const VerifiedChildRevisionEvidenceSchema = z.strictObject({
	status: z.literal('verified'),
	childCommittedRevision: GitRevisionSchema
});

const ChildRevisionEvidenceSchema = z.discriminatedUnion('status', [
	VerifiedChildRevisionEvidenceSchema,
	z.strictObject({
		status: z.literal('not-provided'),
		childCommittedRevision: z.null()
	})
]);

const FactoryIntegrationReceiptIdentityFields = {
	schemaVersion: z.literal(1),
	receiptId: Sha256Schema,
	rootEpicId: DomainIdSchema,
	activeTaskId: DomainIdSchema,
	factoryName: DomainIdSchema,
	handoffManifestDigest: Sha256Schema,
	targetBaselineRevision: GitRevisionSchema
};

/**
 * Exact Pi handoff disposition recorded before Factory classification. Rejected
 * receipts keep unavailable Git/patch values null instead of inventing proof.
 */
export const SupersFactoryIntegrationReceiptSchema = z.discriminatedUnion('disposition', [
	z.strictObject({
		...FactoryIntegrationReceiptIdentityFields,
		disposition: z.literal('integrated'),
		childRevisionEvidence: VerifiedChildRevisionEvidenceSchema,
		baseCommit: GitRevisionSchema,
		patchDigest: Sha256Schema,
		changedPaths: UniqueChangedPathsSchema.min(1),
		integratedRevision: GitRevisionSchema,
		integratedTreeFingerprint: Sha256Schema,
		rejectionReason: z.literal('none')
	}),
	z.strictObject({
		...FactoryIntegrationReceiptIdentityFields,
		disposition: z.literal('rejected'),
		childRevisionEvidence: ChildRevisionEvidenceSchema,
		baseCommit: GitRevisionSchema.nullable(),
		patchDigest: Sha256Schema.nullable(),
		changedPaths: UniqueChangedPathsSchema,
		integratedRevision: z.null(),
		integratedTreeFingerprint: z.null(),
		rejectionReason: z.enum([
			'manifest-invalid',
			'stale-target-baseline',
			'patch-digest-mismatch',
			'child-revision-mismatch',
			'changed-path-mismatch',
			'patch-conflict'
		])
	})
]);

export type SupersFactoryIntegrationReceipt = z.infer<typeof SupersFactoryIntegrationReceiptSchema>;

export const SupersRenderOrientationSchema = z.enum(['horizontal', 'vertical']);

const SupersRenderSampleSharedFields = {
	sampleId: DomainIdSchema,
	frameIndex: NonNegativeIntegerSchema,
	timestampMicroseconds: NonNegativeIntegerSchema,
	auxiliaryFrameIndices: z.array(NonNegativeIntegerSchema).min(1),
	stableGeometryCandidateIds: z.array(DomainIdSchema).min(1)
};

export const SupersRenderSampleSchema = z
	.discriminatedUnion('kind', [
		z.strictObject({
			kind: z.literal('checkpoint'),
			...SupersRenderSampleSharedFields
		}),
		z.strictObject({
			kind: z.literal('transition-window'),
			transitionId: DomainIdSchema,
			...SupersRenderSampleSharedFields
		})
	])
	.superRefine((sample, context) => {
		if (
			new Set(sample.auxiliaryFrameIndices).size !== sample.auxiliaryFrameIndices.length ||
			sample.auxiliaryFrameIndices.some(
				(frameIndex, index) => index > 0 && frameIndex <= sample.auxiliaryFrameIndices[index - 1]
			)
		) {
			context.addIssue({
				code: 'custom',
				path: ['auxiliaryFrameIndices'],
				message: 'Auxiliary frame indices must be unique and ordered'
			});
		}
		if (!sample.auxiliaryFrameIndices.includes(sample.frameIndex)) {
			context.addIssue({
				code: 'custom',
				path: ['auxiliaryFrameIndices'],
				message: 'Auxiliary frame indices must include the primary frame'
			});
		}
		const sortedCandidateIds = [...sample.stableGeometryCandidateIds].sort((left, right) =>
			left.localeCompare(right)
		);
		if (
			new Set(sample.stableGeometryCandidateIds).size !==
				sample.stableGeometryCandidateIds.length ||
			sample.stableGeometryCandidateIds.some(
				(candidateId, index) => candidateId !== sortedCandidateIds[index]
			)
		) {
			context.addIssue({
				code: 'custom',
				path: ['stableGeometryCandidateIds'],
				message: 'Stable geometry candidates must be unique and ordered'
			});
		}
	});

const RenderMatrixCoordinateFields = {
	schemaVersion: z.literal(1),
	sourceRevision: GitRevisionSchema,
	engineFingerprint: Sha256Schema,
	presetSlug: DomainIdSchema,
	presetFingerprint: Sha256Schema,
	packId: DomainIdSchema,
	packFingerprint: Sha256Schema,
	orientation: SupersRenderOrientationSchema,
	frameRate: z.strictObject({
		num: z.number().int().positive(),
		den: z.number().int().positive()
	}),
	width: z.union([z.literal(3840), z.literal(2160)]),
	height: z.union([z.literal(2160), z.literal(3840)]),
	sample: SupersRenderSampleSchema
};

/** Exact identity of one deterministic render-matrix sample. */
export const SupersRenderMatrixCoordinateSchema = z
	.strictObject({
		...RenderMatrixCoordinateFields,
		cellId: Sha256Schema
	})
	.superRefine((coordinate, context) => {
		const expected =
			coordinate.orientation === 'horizontal'
				? { width: 3840, height: 2160 }
				: { width: 2160, height: 3840 };
		if (coordinate.width !== expected.width || coordinate.height !== expected.height) {
			context.addIssue({
				code: 'custom',
				path: ['width'],
				message: `${coordinate.orientation} renders must be ${expected.width}x${expected.height}`
			});
		}
		const expectedTimestampMicroseconds = Math.round(
			(coordinate.sample.frameIndex * coordinate.frameRate.den * 1_000_000) /
				coordinate.frameRate.num
		);
		if (coordinate.sample.timestampMicroseconds !== expectedTimestampMicroseconds) {
			context.addIssue({
				code: 'custom',
				path: ['sample', 'timestampMicroseconds'],
				message: 'Sample timestamp must be derived exactly from frame index and frame rate'
			});
		}
	});

export type SupersRenderMatrixCoordinate = z.infer<typeof SupersRenderMatrixCoordinateSchema>;

const DETERMINISTIC_RENDER_FAILURE_CODES = [
	'target-resolution-mismatch',
	'font-not-ready',
	'title-safe-violation',
	'vertical-platform-safe-area-violation',
	'readable-content-clipped',
	'readable-content-occluded',
	'readable-content-coverage',
	'contrast-below-floor',
	'cap-height-below-floor',
	'output-class-mismatch',
	'text-edge-softness',
	'shadow-banding',
	'tonal-banding',
	'edge-aliasing',
	'reading-window-too-short',
	'visibility-discontinuity',
	'layout-instability',
	'nondeterministic-replay'
] as const;

/** Closed codes are the only cell-level facts allowed to authorize rework. */
export const SupersDeterministicRenderFailureCodeSchema = z.enum(
	DETERMINISTIC_RENDER_FAILURE_CODES
);

export type SupersDeterministicRenderFailureCode = z.infer<
	typeof SupersDeterministicRenderFailureCodeSchema
>;

export const SupersDeliveryObjectiveFailureCodeSchema = z.union([
	SupersDeterministicRenderFailureCodeSchema,
	z.enum([
		'browser-failed',
		'check-failed',
		'unit-failed',
		'structural-failed',
		'timing-policy-failed',
		'tracking-policy-failed',
		'parity-policy-failed',
		'planning-policy-failed',
		'corpus-failed'
	])
]);

const EvidenceReferenceSchema = z.strictObject({
	kind: z.enum(['static', 'dom', 'capture', 'probe', 'export']),
	path: RepositoryPathSchema,
	sha256: Sha256Schema,
	region: z
		.strictObject({
			x: NonNegativeIntegerSchema,
			y: NonNegativeIntegerSchema,
			width: z.number().int().positive(),
			height: z.number().int().positive()
		})
		.nullable()
});

const EvaluatedCheckFields = {
	checkId: DomainIdSchema,
	outcome: z.enum(['pass', 'fail']),
	evidence: z.array(EvidenceReferenceSchema).min(1)
};

const AffectedPixelMeasurementSchema = z.strictObject({
	affectedPixelCount: NonNegativeIntegerSchema
});
const ReadableAffectedPixelMeasurementSchema = z.strictObject({
	measurements: z
		.array(
			z.strictObject({
				readableId: DomainIdSchema,
				affectedPixelCount: NonNegativeIntegerSchema
			})
		)
		.min(1)
});
const ExactReadableCaptureBindingSchema = z.strictObject({
	frameIndex: NonNegativeIntegerSchema,
	timestampMicroseconds: NonNegativeIntegerSchema,
	region: z.strictObject({
		x: NonNegativeIntegerSchema,
		y: NonNegativeIntegerSchema,
		width: z.number().int().positive(),
		height: z.number().int().positive()
	}),
	captureWidth: z.number().int().positive(),
	captureHeight: z.number().int().positive(),
	backgroundSha256: Sha256Schema,
	treatmentSha256: Sha256Schema,
	authoritativeMaskSha256: Sha256Schema
});
const BandCountMeasurementSchema = z.strictObject({
	bandCount: NonNegativeNumberSchema
});

const EvaluatedRenderCheckSchema = z.union([
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('target-resolution-mismatch'),
		measurement: z.strictObject({
			actualWidth: NonNegativeIntegerSchema,
			actualHeight: NonNegativeIntegerSchema,
			activeFrameRate: z.strictObject({
				num: z.number().int().positive(),
				den: z.number().int().positive()
			})
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('font-not-ready'),
		measurement: z.strictObject({ pendingFontCount: NonNegativeIntegerSchema })
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('title-safe-violation'),
		measurement: AffectedPixelMeasurementSchema
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('vertical-platform-safe-area-violation'),
		measurement: AffectedPixelMeasurementSchema
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('readable-content-clipped'),
		measurement: ReadableAffectedPixelMeasurementSchema
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('readable-content-occluded'),
		measurement: z.strictObject({
			measurements: z
				.array(
					z.strictObject({
						readableId: DomainIdSchema,
						affectedPixelCount: NonNegativeIntegerSchema,
						expectedTreatmentPixelCount: z.number().int().positive(),
						visibleTreatmentPixelCount: NonNegativeIntegerSchema,
						capture: ExactReadableCaptureBindingSchema
					})
				)
				.min(1)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('readable-content-coverage'),
		measurement: z.strictObject({
			expectedReadableIdentities: z.array(DomainIdSchema),
			discoveredReadableIdentities: z.array(DomainIdSchema)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('contrast-below-floor'),
		measurement: z.strictObject({
			measurements: z
				.array(
					z.strictObject({
						readableId: DomainIdSchema,
						measuredRatio: NonNegativeNumberSchema,
						textClass: z.enum(['body', 'large']),
						treatmentSampleCount: z.number().int().positive(),
						capture: ExactReadableCaptureBindingSchema
					})
				)
				.min(1)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('cap-height-below-floor'),
		measurement: z.strictObject({
			measurements: z
				.array(
					z.strictObject({
						readableId: DomainIdSchema,
						measuredPixels: NonNegativeNumberSchema,
						textRole: z.enum([
							'overlay-display',
							'overlay-primary',
							'overlay-secondary',
							'overlay-corner-primary',
							'overlay-corner-secondary',
							'surface-display',
							'surface-title',
							'surface-body',
							'surface-body-focal',
							'surface-label',
							'found-document-body',
							'found-document-metadata',
							'diagram-headline',
							'diagram-caption',
							'diagram-stat-value',
							'caption-social'
						]),
						orientation: SupersRenderOrientationSchema
					})
				)
				.min(1)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('output-class-mismatch'),
		measurement: z.strictObject({
			expectedClass: z.enum(['transparent', 'opaque']),
			actualClass: z.enum(['transparent', 'opaque', 'mixed'])
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('text-edge-softness'),
		measurement: z.strictObject({
			normalizedMaximumStep: NonNegativeNumberSchema,
			transitionCount: z.number().int().positive()
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('shadow-banding'),
		measurement: z.strictObject({
			expectedShadowIds: z.array(DomainIdSchema).min(1),
			shadows: z
				.array(
					z.strictObject({
						shadowId: DomainIdSchema,
						bandCount: NonNegativeNumberSchema,
						maximumAlphaStep: NonNegativeNumberSchema,
						transitionSpanPixels: z.number().positive(),
						transitionSampleCount: z.number().int().positive()
					})
				)
				.min(1)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('tonal-banding'),
		measurement: BandCountMeasurementSchema
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('edge-aliasing'),
		measurement: z.strictObject({
			hardStairstepCount: NonNegativeIntegerSchema,
			transitionSampleCount: z.number().int().positive()
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('reading-window-too-short'),
		measurement: z.strictObject({
			readingPlanDigest: Sha256Schema,
			windows: z
				.array(
					z.strictObject({
						readingId: DomainIdSchema,
						kind: z.enum(['post-mark', 'overlay', 'speech-caption']),
						wordCount: z.number().int().positive(),
						startMilliseconds: NonNegativeNumberSchema,
						endMilliseconds: NonNegativeNumberSchema
					})
				)
				.min(1)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('visibility-discontinuity'),
		measurement: z.strictObject({
			measuredDipRatio: NonNegativeNumberSchema,
			orderedFrameCount: z.number().int().min(3)
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('layout-instability'),
		measurement: z.strictObject({
			maximumElementDeltaPixels: NonNegativeNumberSchema
		})
	}),
	z.strictObject({
		...EvaluatedCheckFields,
		code: z.literal('nondeterministic-replay'),
		measurement: z.strictObject({
			changedPixelRatio: NonNegativeNumberSchema
		})
	})
]);

const UnavailableRenderCheckSchema = z.strictObject({
	checkId: DomainIdSchema,
	code: SupersDeterministicRenderFailureCodeSchema,
	outcome: z.literal('unavailable'),
	unavailableReason: z.enum([
		'capture-failed',
		'probe-failed',
		'probe-zero-signal',
		'evidence-stale',
		'incomplete-readable-coverage',
		'authority-missing',
		'composited-mask-unavailable',
		'contrast-mask-unavailable',
		'reading-intent-unrepresented'
	]),
	evidence: z.array(EvidenceReferenceSchema).min(1)
});

const NotApplicableCheckFields = {
	checkId: DomainIdSchema,
	outcome: z.literal('not-applicable'),
	evidence: z.array(EvidenceReferenceSchema).min(1)
};
const NotApplicableRenderCheckSchema = z.union([
	z.strictObject({
		...NotApplicableCheckFields,
		code: z.enum([
			'title-safe-violation',
			'vertical-platform-safe-area-violation',
			'readable-content-clipped',
			'readable-content-occluded',
			'contrast-below-floor',
			'cap-height-below-floor',
			'text-edge-softness'
		]),
		reason: z.literal('no-text')
	}),
	z.strictObject({
		...NotApplicableCheckFields,
		code: z.literal('shadow-banding'),
		reason: z.literal('no-shadow')
	}),
	z.strictObject({
		...NotApplicableCheckFields,
		code: z.literal('tonal-banding'),
		reason: z.literal('no-tonal-region')
	}),
	z.strictObject({
		...NotApplicableCheckFields,
		code: z.literal('edge-aliasing'),
		reason: z.literal('no-non-axis-edge')
	}),
	z.strictObject({
		...NotApplicableCheckFields,
		code: z.literal('visibility-discontinuity'),
		reason: z.literal('no-transition-window')
	}),
	z.strictObject({
		...NotApplicableCheckFields,
		code: z.literal('reading-window-too-short'),
		reason: z.literal('no-reading-content'),
		readingPlanDigest: Sha256Schema,
		readingIds: z.tuple([])
	})
]);

const IMPLEMENTED_FAILURE_CODES = new Set<SupersDeterministicRenderFailureCode>(
	DETERMINISTIC_RENDER_FAILURE_CODES
);

const CAP_HEIGHT_FLOORS = {
	'overlay-display': { horizontal: 140, vertical: 180 },
	'overlay-primary': { horizontal: 96, vertical: 120 },
	'overlay-secondary': { horizontal: 80, vertical: 96 },
	'overlay-corner-primary': { horizontal: 56, vertical: 72 },
	'overlay-corner-secondary': { horizontal: 32, vertical: 44 },
	'surface-display': { horizontal: 320, vertical: 400 },
	'surface-title': { horizontal: 60, vertical: 76 },
	'surface-body': { horizontal: 32, vertical: 44 },
	'surface-body-focal': { horizontal: 32, vertical: 44 },
	'surface-label': { horizontal: 24, vertical: 32 },
	'found-document-body': { horizontal: 30, vertical: 40 },
	'found-document-metadata': { horizontal: 18, vertical: 24 },
	'diagram-headline': { horizontal: 60, vertical: 76 },
	'diagram-caption': { horizontal: 24, vertical: 32 },
	'diagram-stat-value': { horizontal: 60, vertical: 76 },
	'caption-social': { horizontal: 72, vertical: 80 }
} as const;

function deriveReadingWindow(window: {
	kind: 'post-mark' | 'overlay' | 'speech-caption';
	wordCount: number;
	startMilliseconds: number;
	endMilliseconds: number;
}): { availableMilliseconds: number; requiredMilliseconds: number } | null {
	const availableMilliseconds = window.endMilliseconds - window.startMilliseconds;
	if (availableMilliseconds < 0) return null;
	if (window.kind === 'speech-caption') {
		return availableMilliseconds >= 1_000 && availableMilliseconds <= 7_000
			? { availableMilliseconds, requiredMilliseconds: availableMilliseconds }
			: null;
	}
	const readMilliseconds = (window.wordCount * 60 * 1_000) / 200;
	return {
		availableMilliseconds,
		requiredMilliseconds: readMilliseconds * (window.kind === 'post-mark' ? 1.5 : 2)
	};
}

function expectedEvaluatedOutcome(
	check: z.infer<typeof EvaluatedRenderCheckSchema>
): 'pass' | 'fail' {
	switch (check.code) {
		case 'target-resolution-mismatch':
			return [3840, 2160].includes(check.measurement.actualWidth) &&
				[3840, 2160].includes(check.measurement.actualHeight) &&
				check.measurement.actualWidth !== check.measurement.actualHeight
				? 'pass'
				: 'fail';
		case 'font-not-ready':
			return check.measurement.pendingFontCount === 0 ? 'pass' : 'fail';
		case 'title-safe-violation':
		case 'vertical-platform-safe-area-violation':
			return check.measurement.affectedPixelCount === 0 ? 'pass' : 'fail';
		case 'readable-content-clipped':
		case 'readable-content-occluded':
			return check.measurement.measurements.every((entry) => entry.affectedPixelCount === 0)
				? 'pass'
				: 'fail';
		case 'readable-content-coverage':
			return 'pass';
		case 'contrast-below-floor':
			return check.measurement.measurements.every(
				(entry) =>
					entry.treatmentSampleCount > 0 &&
					entry.measuredRatio >= (entry.textClass === 'large' ? 3 : 4.5)
			)
				? 'pass'
				: 'fail';
		case 'cap-height-below-floor':
			return check.measurement.measurements.every(
				(entry) => entry.measuredPixels >= CAP_HEIGHT_FLOORS[entry.textRole][entry.orientation]
			)
				? 'pass'
				: 'fail';
		case 'output-class-mismatch':
			return check.measurement.actualClass === check.measurement.expectedClass ? 'pass' : 'fail';
		case 'text-edge-softness':
			return check.measurement.normalizedMaximumStep >= 0.3 && check.measurement.transitionCount > 0
				? 'pass'
				: 'fail';
		case 'shadow-banding':
			return check.measurement.shadows.every(
				(shadow) =>
					shadow.transitionSampleCount > 0 &&
					shadow.transitionSpanPixels > 0 &&
					shadow.bandCount === 0 &&
					shadow.maximumAlphaStep <= 0.3
			)
				? 'pass'
				: 'fail';
		case 'tonal-banding':
			return check.measurement.bandCount === 0 ? 'pass' : 'fail';
		case 'edge-aliasing':
			return check.measurement.transitionSampleCount > 0 &&
				check.measurement.hardStairstepCount === 0
				? 'pass'
				: 'fail';
		case 'reading-window-too-short':
			return check.measurement.windows.every((window) => {
				const readingWindow = deriveReadingWindow(window);
				return (
					readingWindow !== null &&
					readingWindow.availableMilliseconds >= readingWindow.requiredMilliseconds
				);
			})
				? 'pass'
				: 'fail';
		case 'visibility-discontinuity':
			return check.measurement.measuredDipRatio <= 0.25 ? 'pass' : 'fail';
		case 'layout-instability':
			return check.measurement.maximumElementDeltaPixels === 0 ? 'pass' : 'fail';
		case 'nondeterministic-replay':
			return check.measurement.changedPixelRatio === 0 ? 'pass' : 'fail';
	}
}

export const SupersDeterministicRenderCheckSchema = z
	.union([EvaluatedRenderCheckSchema, UnavailableRenderCheckSchema, NotApplicableRenderCheckSchema])
	.superRefine((check, context) => {
		if (check.outcome === 'pass' || check.outcome === 'fail') {
			if (check.code === 'readable-content-coverage') {
				const expected = [...check.measurement.expectedReadableIdentities].sort();
				const discovered = [...check.measurement.discoveredReadableIdentities].sort();
				if (
					new Set(expected).size !== expected.length ||
					new Set(discovered).size !== discovered.length ||
					expected.join('\n') !== discovered.join('\n')
				) {
					context.addIssue({
						code: 'custom',
						path: ['outcome'],
						message: 'Incomplete readable identity coverage must be unavailable, never pass or fail'
					});
				}
			}
			if (
				check.code === 'readable-content-clipped' ||
				check.code === 'readable-content-occluded' ||
				check.code === 'contrast-below-floor' ||
				check.code === 'cap-height-below-floor'
			) {
				const ids = check.measurement.measurements.map((entry) => entry.readableId);
				if (new Set(ids).size !== ids.length) {
					context.addIssue({
						code: 'custom',
						path: ['measurement', 'measurements'],
						message: 'Per-readable evidence identities must be unique'
					});
				}
			}
			if (check.code === 'shadow-banding') {
				const expected = [...check.measurement.expectedShadowIds].sort();
				const measured = check.measurement.shadows.map((shadow) => shadow.shadowId).sort();
				if (
					new Set(expected).size !== expected.length ||
					new Set(measured).size !== measured.length ||
					expected.join('\n') !== measured.join('\n')
				) {
					context.addIssue({
						code: 'custom',
						path: ['measurement', 'shadows'],
						message: 'Every parsed shadow identity must have one bound measurement'
					});
				}
			}
			if (check.code === 'reading-window-too-short') {
				const readingIds = check.measurement.windows.map((window) => window.readingId);
				if (new Set(readingIds).size !== readingIds.length) {
					context.addIssue({
						code: 'custom',
						path: ['measurement', 'windows'],
						message: 'Reading plan identities must be unique'
					});
				}
			}
			if (
				check.code === 'readable-content-occluded' &&
				check.measurement.measurements.some(
					(entry) =>
						entry.visibleTreatmentPixelCount > entry.expectedTreatmentPixelCount ||
						entry.affectedPixelCount !==
							entry.expectedTreatmentPixelCount - entry.visibleTreatmentPixelCount
				)
			) {
				context.addIssue({
					code: 'custom',
					path: ['measurement', 'measurements'],
					message: 'Occlusion counts must derive exactly from composited masks'
				});
			}
			if (!IMPLEMENTED_FAILURE_CODES.has(check.code)) {
				context.addIssue({
					code: 'custom',
					path: ['outcome'],
					message: `${check.code} is not fully deterministic and must be unavailable or not-applicable`
				});
			}
			const expected = expectedEvaluatedOutcome(check);
			if (check.outcome !== expected) {
				context.addIssue({
					code: 'custom',
					path: ['outcome'],
					message: `Check outcome must be derived from its measurement (${expected})`
				});
			}
		}
	});

export type SupersDeterministicRenderCheck = z.infer<typeof SupersDeterministicRenderCheckSchema>;

export const SupersRenderMatrixCellVerdictSchema = z
	.strictObject({
		schemaVersion: z.literal(1),
		coordinate: SupersRenderMatrixCoordinateSchema,
		outcome: z.enum(['pass', 'fail', 'unavailable']),
		checks: z.array(SupersDeterministicRenderCheckSchema).min(1)
	})
	.superRefine((cell, context) => {
		const identities = cell.checks.map((check) => `${check.checkId}:${check.code}`);
		if (new Set(identities).size !== identities.length) {
			context.addIssue({
				code: 'custom',
				path: ['checks'],
				message: 'Cell checks must have unique checkId/code identities'
			});
		}
		const derivedOutcome = cell.checks.some((check) => check.outcome === 'fail')
			? 'fail'
			: cell.checks.some((check) => check.outcome === 'unavailable')
				? 'unavailable'
				: 'pass';
		if (cell.outcome !== derivedOutcome) {
			context.addIssue({
				code: 'custom',
				path: ['outcome'],
				message: `Cell outcome must be derived from checks (${derivedOutcome})`
			});
		}
	});

export type SupersRenderMatrixCellVerdict = z.infer<typeof SupersRenderMatrixCellVerdictSchema>;

/** Subjective observations are retained for human triage only. */
export const SupersAdvisoryVisualObservationSchema = z.strictObject({
	schemaVersion: z.literal(1),
	observationId: Sha256Schema,
	cellId: Sha256Schema,
	category: z.enum(['composition', 'hierarchy', 'motion-taste', 'pack-grammar', 'finish']),
	summary: z.string().min(1).max(4_000),
	evidence: z.array(EvidenceReferenceSchema).min(1),
	blocking: z.literal(false),
	routingAuthority: z.literal('none')
});

export type SupersAdvisoryVisualObservation = z.infer<typeof SupersAdvisoryVisualObservationSchema>;

export const SupersDeliveryUnavailableEvidenceCodeSchema = z.enum([
	'capture-failed',
	'probe-failed',
	'probe-zero-signal',
	'evidence-stale',
	'incomplete-readable-coverage',
	'authority-missing',
	'composited-mask-unavailable',
	'contrast-mask-unavailable',
	'reading-intent-unrepresented',
	'missing-render-manifest',
	'missing-render-bundle',
	'missing-render-cell',
	'duplicate-render-cell',
	'extra-render-cell',
	'missing-render-check',
	'duplicate-render-check',
	'stale-render-evidence',
	'incomplete-deterministic-fanout',
	'unexecuted-required-lane',
	'missing-app-visual-evidence'
]);

/** Exact immutable identity of one canonical verification resource. */
export const SupersVerificationReceiptIdentitySchema = z.strictObject({
	modelName: DomainIdSchema,
	specName: DomainIdSchema,
	resourceName: z.string().min(1),
	workflowRunId: DomainIdSchema,
	contentDigest: Sha256Schema
});

export type SupersVerificationReceiptIdentity = z.infer<
	typeof SupersVerificationReceiptIdentitySchema
>;

const DeliveryVerificationRouteFields = {
	schemaVersion: z.literal(2),
	workItem: DomainIdSchema,
	integratedRevision: GitRevisionSchema,
	integratedTreeFingerprint: Sha256Schema,
	treeFingerprint: Sha256Schema,
	changeImpactResourceName: z.string().min(1),
	deterministicFanoutResourceName: z.string().min(1),
	deterministicFanoutContentDigest: Sha256Schema,
	deterministicFanoutWorkflowRunId: DomainIdSchema,
	policySweepResourceName: z.string().min(1),
	policySweepWorkflowId: z.literal('5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a'),
	policySweepWorkflowName: z.literal('policy-sweep'),
	policySweepWorkflowVersion: z.literal(2),
	policySweepWorkflowRunId: DomainIdSchema,
	policySweepExecutionDigest: Sha256Schema,
	policyReceipts: z.array(SupersVerificationReceiptIdentitySchema).length(4),
	corpusReceipt: SupersVerificationReceiptIdentitySchema,
	renderMatrixRunName: z.string().min(1),
	renderMatrixManifestName: z.string(),
	renderMatrixBundleName: z.string(),
	renderMatrixManifestDigest: z.union([Sha256Schema, z.literal('')]),
	renderMatrixBundleDigest: z.union([Sha256Schema, z.literal('')]),
	renderMatrixRunDigest: Sha256Schema,
	renderEvidenceArchiveDigest: z.union([Sha256Schema, z.literal('')]),
	workflowRunId: DomainIdSchema,
	requiredHumanReviewKinds: z.array(
		z.enum(['authoring-app-visual', 'rendered-composition-aesthetic'])
	),
	objectiveFailureCodes: z.array(SupersDeliveryObjectiveFailureCodeSchema),
	unavailableEvidenceCodes: z.array(SupersDeliveryUnavailableEvidenceCodeSchema),
	advisories: z.array(SupersAdvisoryVisualObservationSchema)
};

/** A model-derived Delivery route. No caller-selected status or recommendation is accepted. */
export const SupersDeliveryVerificationRouteSchema = z
	.discriminatedUnion('disposition', [
		z.strictObject({
			...DeliveryVerificationRouteFields,
			disposition: z.literal('automatic-rework')
		}),
		z.strictObject({
			...DeliveryVerificationRouteFields,
			disposition: z.literal('evidence-unavailable')
		}),
		z.strictObject({
			...DeliveryVerificationRouteFields,
			disposition: z.literal('await-human-aesthetic')
		}),
		z.strictObject({
			...DeliveryVerificationRouteFields,
			disposition: z.literal('reconcile')
		})
	])
	.superRefine((route, context) => {
		const expectedPolicyReceipts = [
			'repo-audit:parity:parity-latest',
			'repo-audit:planning:planning-latest',
			'repo-audit:timing:timing-latest',
			'repo-audit:tracking:tracking-latest'
		];
		const policyReceiptKeys = route.policyReceipts.map(
			(receipt) => `${receipt.modelName}:${receipt.specName}:${receipt.resourceName}`
		);
		if (JSON.stringify(policyReceiptKeys) !== JSON.stringify(expectedPolicyReceipts)) {
			context.addIssue({
				code: 'custom',
				message: 'Policy receipts must be the canonical ordered Supers policy set'
			});
		}
		if (
			route.corpusReceipt.modelName !== 'corpus-verify' ||
			route.corpusReceipt.specName !== 'sweep' ||
			route.corpusReceipt.resourceName !== 'sweep-latest'
		) {
			context.addIssue({
				code: 'custom',
				message: 'Corpus receipt must identify the canonical corpus sweep'
			});
		}
		const policyWorkflowRunIds = new Set([
			...route.policyReceipts.map((receipt) => receipt.workflowRunId),
			route.corpusReceipt.workflowRunId
		]);
		if (
			policyWorkflowRunIds.size !== 1 ||
			!policyWorkflowRunIds.has(route.policySweepWorkflowRunId)
		) {
			context.addIssue({
				code: 'custom',
				message: 'Policy and corpus receipts must originate from the bound policy workflow run'
			});
		}
		if (route.deterministicFanoutWorkflowRunId !== route.workflowRunId) {
			context.addIssue({
				code: 'custom',
				message: 'Deterministic fanout must originate from the routing workflow run'
			});
		}
		const uniqueReviews = new Set(route.requiredHumanReviewKinds);
		const uniqueFailures = new Set(route.objectiveFailureCodes);
		const uniqueUnavailable = new Set(route.unavailableEvidenceCodes);
		if (
			uniqueReviews.size !== route.requiredHumanReviewKinds.length ||
			uniqueFailures.size !== route.objectiveFailureCodes.length ||
			uniqueUnavailable.size !== route.unavailableEvidenceCodes.length
		) {
			context.addIssue({
				code: 'custom',
				message: 'Delivery route reviews and codes must be unique'
			});
		}
		const sortedReviews = [...route.requiredHumanReviewKinds].sort((left, right) =>
			left.localeCompare(right)
		);
		if (route.requiredHumanReviewKinds.some((review, index) => review !== sortedReviews[index])) {
			context.addIssue({
				code: 'custom',
				message: 'Delivery route reviews must use canonical order'
			});
		}
		const sortedFailures = [...route.objectiveFailureCodes].sort((left, right) =>
			left.localeCompare(right)
		);
		const sortedUnavailable = [...route.unavailableEvidenceCodes].sort((left, right) =>
			left.localeCompare(right)
		);
		if (
			route.objectiveFailureCodes.some((code, index) => code !== sortedFailures[index]) ||
			route.unavailableEvidenceCodes.some((code, index) => code !== sortedUnavailable[index])
		) {
			context.addIssue({
				code: 'custom',
				message: 'Delivery route codes must use canonical order'
			});
		}
		if (
			route.disposition === 'automatic-rework' &&
			(route.objectiveFailureCodes.length === 0 || route.unavailableEvidenceCodes.length !== 0)
		) {
			context.addIssue({
				code: 'custom',
				message: 'Automatic rework requires complete closed objective failure evidence'
			});
		}
		if (
			route.disposition === 'evidence-unavailable' &&
			route.unavailableEvidenceCodes.length === 0
		) {
			context.addIssue({
				code: 'custom',
				message: 'Unavailable routing requires an unavailable evidence code'
			});
		}
		if (
			(route.disposition === 'await-human-aesthetic' || route.disposition === 'reconcile') &&
			(route.objectiveFailureCodes.length !== 0 || route.unavailableEvidenceCodes.length !== 0)
		) {
			context.addIssue({
				code: 'custom',
				message: 'Passing routes cannot contain failure or unavailable codes'
			});
		}
		const hasRenderFailure = route.objectiveFailureCodes.some(
			(code) => SupersDeterministicRenderFailureCodeSchema.safeParse(code).success
		);
		if (
			(route.disposition === 'automatic-rework' && hasRenderFailure) ||
			route.disposition === 'await-human-aesthetic'
		) {
			for (const [field, digest] of [
				['manifest', route.renderMatrixManifestDigest],
				['bundle', route.renderMatrixBundleDigest],
				['evidence archive', route.renderEvidenceArchiveDigest]
			] as const) {
				if (!SHA256_PATTERN.test(digest)) {
					context.addIssue({
						code: 'custom',
						message: `Measured render routing requires an exact ${field} digest`
					});
				}
			}
		}
		const requiresRenderedReview = route.requiredHumanReviewKinds.includes(
			'rendered-composition-aesthetic'
		);
		if (route.disposition === 'await-human-aesthetic' && !requiresRenderedReview) {
			context.addIssue({
				code: 'custom',
				message: 'Aesthetic routing requires a rendered-composition review'
			});
		}
		if (route.disposition === 'reconcile' && route.requiredHumanReviewKinds.length > 0) {
			context.addIssue({
				code: 'custom',
				message: 'Reconciliation cannot skip a required human review'
			});
		}
	});

export type SupersDeliveryVerificationRoute = z.infer<typeof SupersDeliveryVerificationRouteSchema>;

const HumanAestheticDecisionContentFields = {
	schemaVersion: z.literal(1),
	workItem: DomainIdSchema,
	factoryName: DomainIdSchema,
	gateId: z.literal('aesthetic-acceptance'),
	stageId: z.literal('aesthetic-approval'),
	cycle: z.number().int().positive(),
	verificationRouteResourceName: z.string().min(1),
	matrixBundleResourceName: z.string().min(1),
	factoryStateResourceName: z.string().min(1),
	factoryApprovalResourceName: z.string().min(1),
	integratedRevision: GitRevisionSchema,
	integratedTreeFingerprint: Sha256Schema,
	treeFingerprint: Sha256Schema,
	deterministicFanoutResourceName: z.string().min(1),
	deterministicFanoutContentDigest: Sha256Schema,
	deterministicFanoutWorkflowRunId: DomainIdSchema,
	policySweepResourceName: z.string().min(1),
	policySweepWorkflowId: z.literal('5eb573fe-76e7-4b59-8ff6-bfccc0ec3b7a'),
	policySweepWorkflowName: z.literal('policy-sweep'),
	policySweepWorkflowVersion: z.literal(2),
	policySweepWorkflowRunId: DomainIdSchema,
	policySweepExecutionDigest: Sha256Schema,
	policyReceipts: z.array(SupersVerificationReceiptIdentitySchema).length(4),
	corpusReceipt: SupersVerificationReceiptIdentitySchema,
	renderMatrixRunName: z.string().min(1),
	renderMatrixManifestName: z.string().min(1),
	renderMatrixBundleName: z.string().min(1),
	verificationWorkflowRunId: DomainIdSchema,
	renderMatrixManifestDigest: Sha256Schema,
	renderMatrixBundleDigest: Sha256Schema,
	renderMatrixRunDigest: Sha256Schema,
	renderEvidenceArchiveDigest: Sha256Schema,
	approvalReceiptId: Sha256Schema,
	approvalIdentity: z.string().min(1).max(256),
	decision: z.enum(['accept', 'reject']),
	note: z.string().max(4_000)
};

/** Content-addressed decision derived only at the trusted Factory approval boundary. */
export const SupersHumanAestheticDecisionSchema = z.strictObject({
	...HumanAestheticDecisionContentFields,
	decisionId: Sha256Schema
});

export type SupersHumanAestheticDecision = z.infer<typeof SupersHumanAestheticDecisionSchema>;

/** Verify both content hashes and exact evidence binding after loading trusted resources. */
export async function verifySupersHumanAestheticDecision(
	rawDecision: unknown,
	verifiedBundle: SupersRenderMatrixBundle,
	rawApproval: unknown
): Promise<SupersHumanAestheticDecision> {
	const decision = SupersHumanAestheticDecisionSchema.parse(rawDecision);
	if (decision.renderMatrixBundleDigest !== verifiedBundle.bundleDigest) {
		throw new TypeError('Human aesthetic decision targets a different render matrix bundle');
	}
	const approvalReceiptId = await createSupersDeterministicContractHash(rawApproval);
	if (decision.approvalReceiptId !== approvalReceiptId) {
		throw new TypeError('Human aesthetic approval receipt digest mismatch');
	}
	const expectedDecisionId = await createSupersDeterministicContractHash(
		withoutProperty(decision, 'decisionId')
	);
	if (decision.decisionId !== expectedDecisionId) {
		throw new TypeError('Human aesthetic decision digest mismatch');
	}
	return decision;
}

const MatrixPresetSchema = z.strictObject({
	slug: DomainIdSchema,
	fingerprint: Sha256Schema,
	readingPlanDigest: Sha256Schema,
	readingPlanIds: z.array(DomainIdSchema),
	samples: z.array(SupersRenderSampleSchema).min(1)
});

const RenderRegistryPresetSchema = z.strictObject({
	slug: DomainIdSchema,
	presetFingerprint: Sha256Schema,
	readingPlanDigest: Sha256Schema,
	readingPlanIds: z.array(DomainIdSchema),
	samples: z.array(SupersRenderSampleSchema).min(1)
});

const RenderRegistryPackSchema = z.strictObject({
	id: DomainIdSchema,
	packFingerprint: Sha256Schema
});

const RenderRegistrySnapshotContentSchema = z.strictObject({
	schemaVersion: z.literal(1),
	sourceRevision: GitRevisionSchema,
	engineFingerprint: Sha256Schema,
	deliverablePresets: z.array(RenderRegistryPresetSchema).min(1),
	packs: z.array(RenderRegistryPackSchema).min(1),
	orientations: z.tuple([z.literal('horizontal'), z.literal('vertical')])
});

/** Immutable, independently collected identity of the live deliverable render axes. */
export const SupersRenderRegistrySnapshotSchema = z
	.strictObject({
		...RenderRegistrySnapshotContentSchema.shape,
		snapshotDigest: Sha256Schema
	})
	.superRefine((snapshot, context) => {
		for (const [path, values] of [
			[['deliverablePresets'], snapshot.deliverablePresets.map((entry) => entry.slug)],
			[['packs'], snapshot.packs.map((entry) => entry.id)]
		] as const) {
			if (new Set(values).size !== values.length) {
				context.addIssue({
					code: 'custom',
					path: [...path],
					message: 'Registry identities must be unique'
				});
			}
			const sorted = [...values].sort((left, right) => left.localeCompare(right));
			if (values.some((value, index) => value !== sorted[index])) {
				context.addIssue({
					code: 'custom',
					path: [...path],
					message: 'Registry identities must use canonical order'
				});
			}
		}
		for (const [index, preset] of snapshot.deliverablePresets.entries()) {
			if (new Set(preset.readingPlanIds).size !== preset.readingPlanIds.length) {
				context.addIssue({
					code: 'custom',
					path: ['deliverablePresets', index, 'readingPlanIds'],
					message: 'Reading plan identities must be unique'
				});
			}
			const sampleIds = preset.samples.map((sample) => sample.sampleId);
			if (new Set(sampleIds).size !== sampleIds.length) {
				context.addIssue({
					code: 'custom',
					path: ['deliverablePresets', index, 'samples'],
					message: 'Render sample identities must be unique'
				});
			}
		}
	});

export type SupersRenderRegistrySnapshot = z.infer<typeof SupersRenderRegistrySnapshotSchema>;
const MatrixPackSchema = z.strictObject({
	id: DomainIdSchema,
	fingerprint: Sha256Schema
});

const RenderMatrixManifestContentSchema = z.strictObject({
	schemaVersion: z.literal(1),
	sourceRevision: GitRevisionSchema,
	engineFingerprint: Sha256Schema,
	scope: z.enum(['affected', 'full']),
	presets: z.array(MatrixPresetSchema).min(1),
	packs: z.array(MatrixPackSchema).min(1),
	orientations: z.array(SupersRenderOrientationSchema).min(1),
	requiredCheckCodes: z.array(SupersDeterministicRenderFailureCodeSchema).min(1),
	coordinates: z.array(SupersRenderMatrixCoordinateSchema).min(1)
});

export const SupersRenderMatrixManifestSchema = z.strictObject({
	...RenderMatrixManifestContentSchema.shape,
	manifestDigest: Sha256Schema
});

export type SupersRenderMatrixManifest = z.infer<typeof SupersRenderMatrixManifestSchema>;

export const SupersRenderMatrixBundleSchema = z.strictObject({
	schemaVersion: z.literal(1),
	bundleDigest: Sha256Schema,
	manifestDigest: Sha256Schema,
	sourceRevision: GitRevisionSchema,
	cells: z.array(SupersRenderMatrixCellVerdictSchema).min(1),
	outcome: z.enum(['pass', 'fail', 'unavailable'])
});

export type SupersRenderMatrixBundle = z.infer<typeof SupersRenderMatrixBundleSchema>;

type CanonicalJson =
	| null
	| boolean
	| number
	| string
	| CanonicalJson[]
	| {
			[key: string]: CanonicalJson;
	  };

function canonicalize(value: unknown): CanonicalJson {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			throw new TypeError('Canonical JSON needs finite numbers');
		}
		return value;
	}
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, canonicalize(entry)])
		);
	}
	throw new TypeError(`Unsupported canonical JSON value: ${typeof value}`);
}

/**
 * SHA-256 of raw `git ls-tree -r -z --full-tree <revision>` stdout bytes,
 * without text decoding or newline/path normalization.
 */
export async function createSupersIntegratedTreeFingerprint(
	canonicalTreeListing: Uint8Array
): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(canonicalTreeListing));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Create the canonical digest used by coordinates, manifests, and bundles. */
export async function createSupersDeterministicContractHash(value: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function withoutProperty<T extends Record<string, unknown>>(
	value: T,
	property: keyof T
): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).filter(([key]) => key !== property));
}

/** Parse and content-address a Pi handoff/integration receipt by canonical digest. */
export async function verifySupersFactoryIntegrationReceipt(
	rawReceipt: unknown
): Promise<SupersFactoryIntegrationReceipt> {
	const receipt = SupersFactoryIntegrationReceiptSchema.parse(rawReceipt);
	const expectedReceiptId = await createSupersDeterministicContractHash(
		withoutProperty(receipt, 'receiptId')
	);
	if (receipt.receiptId !== expectedReceiptId) {
		throw new TypeError('Factory integration receipt digest mismatch');
	}
	return receipt;
}

async function verifyCoordinateIdentity(coordinate: SupersRenderMatrixCoordinate): Promise<void> {
	const expected = await createSupersDeterministicContractHash(
		withoutProperty(coordinate, 'cellId')
	);
	if (coordinate.cellId !== expected) {
		throw new TypeError('Render matrix cellId does not match its coordinate');
	}
}

function matrixAxisKey(
	presetSlug: string,
	packId: string,
	orientation: 'horizontal' | 'vertical',
	sample: z.infer<typeof SupersRenderSampleSchema>
): string {
	return JSON.stringify(canonicalize({ presetSlug, packId, orientation, sample }));
}

function expectedFullCoordinates(manifest: SupersRenderMatrixManifest): string[] {
	const ids: string[] = [];
	for (const preset of manifest.presets) {
		for (const pack of manifest.packs) {
			for (const orientation of manifest.orientations) {
				for (const sample of preset.samples) {
					ids.push(matrixAxisKey(preset.slug, pack.id, orientation, sample));
				}
			}
		}
	}
	return ids.sort();
}

function actualCoordinateAxes(coordinates: readonly SupersRenderMatrixCoordinate[]): string[] {
	return coordinates
		.map((coordinate) =>
			matrixAxisKey(
				coordinate.presetSlug,
				coordinate.packId,
				coordinate.orientation,
				coordinate.sample
			)
		)
		.sort();
}

type EvaluatedRenderCheck = z.infer<typeof EvaluatedRenderCheckSchema>;

function findEvaluatedRenderCheck<Code extends EvaluatedRenderCheck['code']>(
	checks: readonly SupersDeterministicRenderCheck[],
	code: Code
): Extract<EvaluatedRenderCheck, { code: Code }> | undefined {
	return checks.find(
		(check) => check.code === code && (check.outcome === 'pass' || check.outcome === 'fail')
	) as Extract<EvaluatedRenderCheck, { code: Code }> | undefined;
}

/**
 * Verify the independently generated manifest, exact matrix, normalized
 * outcomes, and every content-bound digest before a Factory may route on it.
 */
export async function verifySupersRenderMatrixBundle(
	rawManifest: unknown,
	rawBundle: unknown
): Promise<SupersRenderMatrixBundle> {
	const manifest = SupersRenderMatrixManifestSchema.parse(rawManifest);
	const bundle = SupersRenderMatrixBundleSchema.parse(rawBundle);
	const manifestDigest = await createSupersDeterministicContractHash(
		withoutProperty(manifest, 'manifestDigest')
	);
	if (manifest.manifestDigest !== manifestDigest || bundle.manifestDigest !== manifestDigest) {
		throw new TypeError('Render matrix manifest digest mismatch');
	}
	if (bundle.sourceRevision !== manifest.sourceRevision) {
		throw new TypeError('Render matrix source revision mismatch');
	}
	const registeredCodes = [...DETERMINISTIC_RENDER_FAILURE_CODES].sort();
	const requiredCodes = [...new Set(manifest.requiredCheckCodes)].sort();
	if (requiredCodes.join('\n') !== registeredCodes.join('\n')) {
		throw new TypeError('Manifest must require every registered deterministic check');
	}
	if (manifest.scope === 'full') {
		const orientations = [...new Set(manifest.orientations)].sort();
		if (orientations.join('\n') !== 'horizontal\nvertical') {
			throw new TypeError('Full matrix must include horizontal and vertical');
		}
		if (
			expectedFullCoordinates(manifest).join('\n') !==
			actualCoordinateAxes(manifest.coordinates).join('\n')
		) {
			throw new TypeError('Full matrix coordinates do not equal the declared cross-product');
		}
	}
	for (const coordinate of manifest.coordinates) {
		await verifyCoordinateIdentity(coordinate);
		if (
			coordinate.sourceRevision !== manifest.sourceRevision ||
			coordinate.engineFingerprint !== manifest.engineFingerprint
		) {
			throw new TypeError('Matrix coordinate provenance is stale or mixed');
		}
		const preset = manifest.presets.find((entry) => entry.slug === coordinate.presetSlug);
		const pack = manifest.packs.find((entry) => entry.id === coordinate.packId);
		if (
			preset?.fingerprint !== coordinate.presetFingerprint ||
			pack?.fingerprint !== coordinate.packFingerprint
		) {
			throw new TypeError('Matrix coordinate Preset or Pack fingerprint mismatch');
		}
	}
	const expectedCellIds = manifest.coordinates.map((coordinate) => coordinate.cellId).sort();
	const actualCellIds = bundle.cells.map((cell) => cell.coordinate.cellId).sort();
	if (
		new Set(expectedCellIds).size !== expectedCellIds.length ||
		new Set(actualCellIds).size !== actualCellIds.length ||
		expectedCellIds.join('\n') !== actualCellIds.join('\n')
	) {
		throw new TypeError('Rendered cells must exactly equal unique manifest cells');
	}
	for (const cell of bundle.cells) {
		await verifyCoordinateIdentity(cell.coordinate);
		const cellCodes = cell.checks.map((check) => check.code).sort();
		if (
			new Set(cellCodes).size !== cellCodes.length ||
			cellCodes.join('\n') !== requiredCodes.join('\n')
		) {
			throw new TypeError('Every cell must record every required check exactly once');
		}
		const preset = manifest.presets.find((entry) => entry.slug === cell.coordinate.presetSlug);
		const readingCheck = cell.checks.find((check) => check.code === 'reading-window-too-short');
		const readingPlanDigest =
			readingCheck?.outcome === 'not-applicable' && readingCheck.code === 'reading-window-too-short'
				? readingCheck.readingPlanDigest
				: readingCheck?.code === 'reading-window-too-short' &&
					  readingCheck.outcome !== 'unavailable'
					? readingCheck.measurement.readingPlanDigest
					: null;
		if (
			!preset ||
			(readingCheck?.outcome !== 'unavailable' && readingPlanDigest !== preset.readingPlanDigest)
		) {
			throw new TypeError('Reading evidence must bind to the Preset-derived manifest plan digest');
		}
		if (
			readingCheck?.code === 'reading-window-too-short' &&
			readingCheck.outcome !== 'unavailable'
		) {
			const measuredReadingIds =
				readingCheck.outcome === 'not-applicable'
					? readingCheck.readingIds
					: readingCheck.measurement.windows.map((window) => window.readingId);
			const expectedReadingIds = [...preset.readingPlanIds].sort();
			if (
				new Set(expectedReadingIds).size !== expectedReadingIds.length ||
				new Set(measuredReadingIds).size !== measuredReadingIds.length ||
				[...measuredReadingIds].sort().join('\n') !== expectedReadingIds.join('\n')
			) {
				throw new TypeError(
					'Reading evidence must cover exactly the Preset-derived plan identities'
				);
			}
		}
		const coverageCheck = cell.checks.find((check) => check.code === 'readable-content-coverage');
		const hasNoTextChecks = cell.checks.some(
			(check) => check.outcome === 'not-applicable' && check.reason === 'no-text'
		);
		if (
			hasNoTextChecks &&
			(!coverageCheck ||
				coverageCheck.code !== 'readable-content-coverage' ||
				coverageCheck.outcome !== 'pass' ||
				coverageCheck.measurement.expectedReadableIdentities.length !== 0)
		) {
			throw new TypeError(
				'No-text checks require schema/renderer coverage proving zero expected readable identities'
			);
		}
		if (coverageCheck?.code === 'readable-content-coverage' && coverageCheck.outcome === 'pass') {
			const expectedReadableIds = [...coverageCheck.measurement.expectedReadableIdentities].sort();
			for (const code of [
				'readable-content-clipped',
				'readable-content-occluded',
				'contrast-below-floor',
				'cap-height-below-floor'
			] as const) {
				const evidenceCheck = cell.checks.find((check) => check.code === code);
				if (!evidenceCheck) {
					throw new TypeError(`${code} evidence is missing`);
				}
				if (expectedReadableIds.length === 0) {
					if (evidenceCheck.outcome !== 'not-applicable' || evidenceCheck.reason !== 'no-text') {
						throw new TypeError(`${code} must be no-text only for an empty typed identity set`);
					}
					continue;
				}
				if (evidenceCheck.outcome === 'not-applicable') {
					throw new TypeError(
						`${code} must cover exactly every expected readable identity or be unavailable`
					);
				}
				if (evidenceCheck.outcome === 'unavailable') continue;
				const evaluatedEvidence = findEvaluatedRenderCheck(cell.checks, code);
				if (
					!evaluatedEvidence ||
					evaluatedEvidence.measurement.measurements
						.map((entry) => entry.readableId)
						.sort()
						.join('\n') !== expectedReadableIds.join('\n')
				) {
					throw new TypeError(
						`${code} must cover exactly every expected readable identity or be unavailable`
					);
				}
				const captureMeasurements =
					code === 'readable-content-occluded'
						? findEvaluatedRenderCheck(cell.checks, 'readable-content-occluded')?.measurement
								.measurements
						: code === 'contrast-below-floor'
							? findEvaluatedRenderCheck(cell.checks, 'contrast-below-floor')?.measurement
									.measurements
							: undefined;
				if (
					captureMeasurements?.some(
						(entry) =>
							entry.capture.frameIndex !== cell.coordinate.sample.frameIndex ||
							entry.capture.timestampMicroseconds !==
								cell.coordinate.sample.timestampMicroseconds ||
							entry.capture.captureWidth !== cell.coordinate.width ||
							entry.capture.captureHeight !== cell.coordinate.height
					)
				) {
					throw new TypeError(`${code} captures must bind to the exact cell frame and dimensions`);
				}
			}
		}
		const resolutionCheck = cell.checks.find(
			(check) => check.code === 'target-resolution-mismatch'
		);
		if (!resolutionCheck || resolutionCheck.code !== 'target-resolution-mismatch') {
			throw new TypeError('Target resolution check is missing');
		}
		if (resolutionCheck.outcome === 'pass' || resolutionCheck.outcome === 'fail') {
			if (
				resolutionCheck.measurement.actualWidth !== cell.coordinate.width ||
				resolutionCheck.measurement.actualHeight !== cell.coordinate.height ||
				resolutionCheck.measurement.activeFrameRate.num !== cell.coordinate.frameRate.num ||
				resolutionCheck.measurement.activeFrameRate.den !== cell.coordinate.frameRate.den
			) {
				throw new TypeError(
					'Target resolution or active frame rate measurement contradicts its coordinate'
				);
			}
		} else if (resolutionCheck.outcome !== 'unavailable') {
			throw new TypeError('Target resolution must be measured or explicitly unavailable');
		}
	}
	const derivedOutcome = bundle.cells.some((cell) => cell.outcome === 'fail')
		? 'fail'
		: bundle.cells.some((cell) => cell.outcome === 'unavailable')
			? 'unavailable'
			: 'pass';
	if (bundle.outcome !== derivedOutcome) {
		throw new TypeError(`Bundle outcome must be derived from cells (${derivedOutcome})`);
	}
	const bundleDigest = await createSupersDeterministicContractHash(
		withoutProperty(bundle, 'bundleDigest')
	);
	if (bundle.bundleDigest !== bundleDigest) {
		throw new TypeError('Render matrix bundle digest mismatch');
	}
	return bundle;
}

function registrySnapshotManifestProjection(snapshot: SupersRenderRegistrySnapshot): {
	presets: SupersRenderMatrixManifest['presets'];
	packs: SupersRenderMatrixManifest['packs'];
	orientations: SupersRenderMatrixManifest['orientations'];
} {
	return {
		presets: snapshot.deliverablePresets.map((preset) => ({
			slug: preset.slug,
			fingerprint: preset.presetFingerprint,
			readingPlanDigest: preset.readingPlanDigest,
			readingPlanIds: preset.readingPlanIds,
			samples: preset.samples
		})),
		packs: snapshot.packs.map((pack) => ({ id: pack.id, fingerprint: pack.packFingerprint })),
		orientations: [...snapshot.orientations]
	};
}

/**
 * Certify a full bundle against an independent snapshot of the live registries.
 * This prevents a self-consistent manifest from silently omitting a deliverable
 * Preset, Pack, orientation, or deterministic sample.
 */
export async function verifySupersFullRenderMatrixBundle(
	rawSnapshot: unknown,
	rawManifest: unknown,
	rawBundle: unknown
): Promise<SupersRenderMatrixBundle> {
	const snapshot = SupersRenderRegistrySnapshotSchema.parse(rawSnapshot);
	const manifest = SupersRenderMatrixManifestSchema.parse(rawManifest);
	if (manifest.scope !== 'full') {
		throw new TypeError('Live registry snapshots can certify full render matrices only');
	}
	const expectedSnapshotDigest = await createSupersDeterministicContractHash(
		withoutProperty(snapshot, 'snapshotDigest')
	);
	if (snapshot.snapshotDigest !== expectedSnapshotDigest) {
		throw new TypeError('Render registry snapshot digest mismatch');
	}
	if (
		snapshot.sourceRevision !== manifest.sourceRevision ||
		snapshot.engineFingerprint !== manifest.engineFingerprint
	) {
		throw new TypeError('Render registry snapshot provenance is stale or mixed');
	}
	const projection = registrySnapshotManifestProjection(snapshot);
	if (
		JSON.stringify(canonicalize(projection.presets)) !==
		JSON.stringify(canonicalize(manifest.presets))
	) {
		throw new TypeError('Full matrix Presets do not exactly equal the live registry snapshot');
	}
	if (
		JSON.stringify(canonicalize(projection.packs)) !== JSON.stringify(canonicalize(manifest.packs))
	) {
		throw new TypeError('Full matrix Packs do not exactly equal the live registry snapshot');
	}
	if (
		JSON.stringify(canonicalize(projection.orientations)) !==
		JSON.stringify(canonicalize(manifest.orientations))
	) {
		throw new TypeError('Full matrix orientations do not exactly equal the live registry snapshot');
	}
	const expectedAxes = expectedFullCoordinates(manifest);
	if (new Set(expectedAxes).size !== expectedAxes.length) {
		throw new TypeError('Live registry snapshot derives duplicate render coordinates');
	}
	return verifySupersRenderMatrixBundle(manifest, rawBundle);
}

export type SupersDeterministicRuleInventoryEntry = {
	code: SupersDeterministicRenderFailureCode;
	owner: string;
	implementation: 'existing' | 'partial' | 'gap';
	evidenceKind: 'static' | 'dom' | 'pixel' | 'temporal' | 'replay';
	notes: string;
};

/** Closed inventory consumed by deterministic render-matrix producers. */
export const SUPERS_DETERMINISTIC_RULE_INVENTORY: readonly SupersDeterministicRuleInventoryEntry[] =
	[
		{
			code: 'target-resolution-mismatch',
			owner: 'scripts/probe-dimensions.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes: 'Backing store and native target dimensions.'
		},
		{
			code: 'font-not-ready',
			owner: 'document.fonts',
			implementation: 'existing',
			evidenceKind: 'dom',
			notes: 'FontFaceSet readiness and unresolved-face count precede text probes.'
		},
		{
			code: 'title-safe-violation',
			owner: 'src/lib/platform/preset-rubric.ts',
			implementation: 'existing',
			evidenceKind: 'dom',
			notes: 'Readable bounds against G2.'
		},
		{
			code: 'vertical-platform-safe-area-violation',
			owner: 'src/lib/platform/preset-rubric.ts',
			implementation: 'existing',
			evidenceKind: 'dom',
			notes: 'Readable regions intersect the closed vertical forbidden bands.'
		},
		{
			code: 'readable-content-clipped',
			owner: 'src/lib/platform/runtime-audit.ts',
			implementation: 'existing',
			evidenceKind: 'dom',
			notes: 'Readable regions are compared with frame and clipping ancestors.'
		},
		{
			code: 'readable-content-occluded',
			owner: 'src/lib/utils/deterministic-render-measurements.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes:
				'Exact-coordinate expected and visible treatment masks derive occluded pixels; absent masks are unavailable.'
		},
		{
			code: 'readable-content-coverage',
			owner: 'src/lib/platform/runtime-audit.ts',
			implementation: 'existing',
			evidenceKind: 'dom',
			notes: 'Every visible schema-rendered text node must belong to one typed readable region.'
		},
		{
			code: 'contrast-below-floor',
			owner: 'scripts/probe-local-contrast.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes: 'Same-coordinate glyph, stroke, and shadow treatment pixels use closed text floors.'
		},
		{
			code: 'cap-height-below-floor',
			owner: 'src/lib/platform/runtime-audit.ts',
			implementation: 'existing',
			evidenceKind: 'dom',
			notes: 'Role and orientation select closed G4 floors; ceilings stay advisory.'
		},
		{
			code: 'output-class-mismatch',
			owner: 'scripts/_probe-output-class.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes:
				'Canvas backing-store PNG edge alpha is compared with the declared class; encoded output requires the separate export-decode lane.'
		},
		{
			code: 'text-edge-softness',
			owner: 'scripts/probe-text-edge.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes: 'The stable region manifest selects the smallest readable region.'
		},
		{
			code: 'shadow-banding',
			owner: 'scripts/probe-banding.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes: 'Declared shadow regions enforce zero bands and the hard-rim ceiling.'
		},
		{
			code: 'tonal-banding',
			owner: 'scripts/probe-banding.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes: 'The stable region manifest selects the largest tonal region.'
		},
		{
			code: 'edge-aliasing',
			owner: 'scripts/probe-edge-aa.ts',
			implementation: 'existing',
			evidenceKind: 'pixel',
			notes: 'The stable region manifest selects the longest non-axis edge.'
		},
		{
			code: 'reading-window-too-short',
			owner: 'extensions/models/supers-deterministic-factory-contract.ts',
			implementation: 'existing',
			evidenceKind: 'static',
			notes:
				'Typed marked, overlay, or speech content and authored boundaries derive both available and required milliseconds.'
		},
		{
			code: 'visibility-discontinuity',
			owner: 'scripts/probe-temporal-energy.ts',
			implementation: 'existing',
			evidenceKind: 'temporal',
			notes: 'Stable focal regions require three or more exact ordered frames.'
		},
		{
			code: 'layout-instability',
			owner: 'src/lib/utils/deterministic-render-measurements.ts',
			implementation: 'existing',
			evidenceKind: 'temporal',
			notes: 'Explicit stable windows require exact element geometry.'
		},
		{
			code: 'nondeterministic-replay',
			owner: 'scripts/probe-render-replay.ts',
			implementation: 'existing',
			evidenceKind: 'replay',
			notes: 'Identical coordinates require a zero changed-pixel ratio.'
		}
	];
