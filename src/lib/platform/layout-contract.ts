import { z } from 'zod';

/**
 * Numeric, capture-free verification contract for one exact composition frame.
 *
 * Layout Contract evidence contains geometry, typography, timing, and identity
 * facts only. It never contains PNG bytes, data URLs, or screenshot paths.
 */

export const LAYOUT_CONTRACT_CHECK_CODES = [
	'native-target-size',
	'font-readiness',
	'readable-identity-coverage',
	'title-safe-area',
	'vertical-platform-safe-area',
	'readable-clipping',
	'cap-height-floor',
	'reading-window',
	'deterministic-geometry',
	'layout-stability'
] as const;

export const LayoutContractCheckCodeSchema = z.enum(LAYOUT_CONTRACT_CHECK_CODES);
export type LayoutContractCheckCode = z.infer<typeof LayoutContractCheckCodeSchema>;

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const DomainIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,255}$/);
const NonNegativeFiniteSchema = z.number().finite().nonnegative();
const NonNegativeIntegerSchema = z.number().int().nonnegative();

export const LayoutContractRectSchema = z.strictObject({
	x: z.number().finite(),
	y: z.number().finite(),
	width: NonNegativeFiniteSchema,
	height: NonNegativeFiniteSchema
});
export type LayoutContractRect = z.infer<typeof LayoutContractRectSchema>;

export const LayoutContractCoordinateSchema = z
	.strictObject({
		presetSlug: DomainIdSchema,
		packId: DomainIdSchema,
		orientation: z.enum(['horizontal', 'vertical']),
		frameIndex: NonNegativeIntegerSchema,
		timestampMicroseconds: NonNegativeIntegerSchema,
		width: z.number().int().positive(),
		height: z.number().int().positive()
	})
	.superRefine((coordinate, context) => {
		const expected =
			coordinate.orientation === 'horizontal'
				? { width: 3840, height: 2160 }
				: { width: 2160, height: 3840 };
		if (coordinate.width !== expected.width || coordinate.height !== expected.height) {
			context.addIssue({
				code: 'custom',
				message: `Native target must be ${expected.width}x${expected.height}`
			});
		}
	});
export type LayoutContractCoordinate = z.infer<typeof LayoutContractCoordinateSchema>;

export const LayoutContractTextRoleSchema = z.enum([
	'overlay-display',
	'overlay-primary',
	'overlay-secondary',
	'overlay-corner-primary',
	'overlay-corner-secondary',
	'overlay-cinematic-primary',
	'overlay-cinematic-secondary',
	'overlay-source-citation',
	'surface-display',
	'surface-title',
	'surface-body',
	'surface-body-focal',
	'surface-label',
	'found-document-body',
	'found-document-title',
	'found-document-metadata',
	'diagram-headline',
	'diagram-caption',
	'diagram-stat-value',
	'caption-social'
]);
export type LayoutContractTextRole = z.infer<typeof LayoutContractTextRoleSchema>;

export const LayoutContractReadableEvidenceSchema = z.strictObject({
	id: DomainIdSchema,
	textRole: LayoutContractTextRoleSchema,
	rect: LayoutContractRectSchema,
	clipRect: LayoutContractRectSchema,
	measuredCapHeightPixels: NonNegativeFiniteSchema,
	clippedPixelCount: NonNegativeIntegerSchema
});
export type LayoutContractReadableEvidence = z.infer<typeof LayoutContractReadableEvidenceSchema>;

export const LayoutContractReadingWindowSchema = z.strictObject({
	readingId: DomainIdSchema,
	kind: z.enum(['post-mark', 'overlay', 'speech-caption']),
	wordCount: NonNegativeIntegerSchema,
	startMilliseconds: NonNegativeFiniteSchema,
	endMilliseconds: NonNegativeFiniteSchema,
	requiredMilliseconds: NonNegativeFiniteSchema
});
export type LayoutContractReadingWindow = z.infer<typeof LayoutContractReadingWindowSchema>;

export const LayoutContractFrameEvidenceSchema = z.strictObject({
	schemaVersion: z.literal(1),
	coordinate: LayoutContractCoordinateSchema,
	pendingFontCount: NonNegativeIntegerSchema,
	readableCoverage: z.strictObject({
		authority: z.enum(['schema-renderer', 'unavailable']),
		expectedReadableIdentities: z.array(DomainIdSchema),
		discoveredReadableIdentities: z.array(DomainIdSchema),
		missingReadableIdentities: z.array(DomainIdSchema),
		extraReadableIdentities: z.array(DomainIdSchema),
		duplicateReadableIdentityCount: NonNegativeIntegerSchema,
		unclaimedVisibleTextCount: NonNegativeIntegerSchema,
		unclaimedVisibleTextOwners: z.array(z.string().min(1)),
		complete: z.boolean(),
		unavailableReason: z.string().min(1).nullable()
	}),
	readables: z.array(LayoutContractReadableEvidenceSchema),
	readingPlan: z.discriminatedUnion('status', [
		z.strictObject({
			status: z.literal('available'),
			windows: z.array(LayoutContractReadingWindowSchema)
		}),
		z.strictObject({
			status: z.literal('unavailable'),
			reason: z.string().min(1)
		})
	]),
	measurements: z.strictObject({
		titleSafeAreaAffectedPixels: NonNegativeIntegerSchema,
		verticalPlatformSafeAreaAffectedPixels: NonNegativeIntegerSchema
	}),
	canonicalGeometryDigest: Sha256Schema,
	replayGeometryDigest: Sha256Schema,
	stableGeometryCandidateCount: NonNegativeIntegerSchema,
	maximumElementDeltaPixels: NonNegativeFiniteSchema
});
export type LayoutContractFrameEvidence = z.infer<typeof LayoutContractFrameEvidenceSchema>;

export const LayoutContractCheckResultSchema = z.strictObject({
	code: LayoutContractCheckCodeSchema,
	outcome: z.enum(['pass', 'fail', 'unavailable', 'not-applicable']),
	details: z.string().min(1)
});
export type LayoutContractCheckResult = z.infer<typeof LayoutContractCheckResultSchema>;

export const LayoutContractFrameResultSchema = z.strictObject({
	schemaVersion: z.literal(1),
	coordinate: LayoutContractCoordinateSchema,
	checks: z.array(LayoutContractCheckResultSchema).length(LAYOUT_CONTRACT_CHECK_CODES.length),
	passed: z.boolean()
});
export type LayoutContractFrameResult = z.infer<typeof LayoutContractFrameResultSchema>;

const CAP_HEIGHT_FLOORS: Record<LayoutContractTextRole, { horizontal: number; vertical: number }> =
	{
		'overlay-display': { horizontal: 140, vertical: 180 },
		'overlay-primary': { horizontal: 96, vertical: 120 },
		'overlay-secondary': { horizontal: 80, vertical: 96 },
		'overlay-corner-primary': { horizontal: 56, vertical: 72 },
		'overlay-corner-secondary': { horizontal: 32, vertical: 44 },
		'overlay-cinematic-primary': { horizontal: 64, vertical: 84 },
		'overlay-cinematic-secondary': { horizontal: 36, vertical: 48 },
		'overlay-source-citation': { horizontal: 48, vertical: 56 },
		'surface-display': { horizontal: 320, vertical: 400 },
		'surface-title': { horizontal: 60, vertical: 76 },
		'surface-body': { horizontal: 32, vertical: 44 },
		'surface-body-focal': { horizontal: 32, vertical: 44 },
		'surface-label': { horizontal: 24, vertical: 32 },
		'found-document-body': { horizontal: 30, vertical: 40 },
		'found-document-title': { horizontal: 40, vertical: 44 },
		'found-document-metadata': { horizontal: 18, vertical: 24 },
		'diagram-headline': { horizontal: 60, vertical: 76 },
		'diagram-caption': { horizontal: 24, vertical: 32 },
		'diagram-stat-value': { horizontal: 60, vertical: 76 },
		'caption-social': { horizontal: 72, vertical: 80 }
	};

function check(
	code: LayoutContractCheckCode,
	outcome: LayoutContractCheckResult['outcome'],
	details: string
): LayoutContractCheckResult {
	return LayoutContractCheckResultSchema.parse({ code, outcome, details });
}

function readingWindowPasses(window: LayoutContractReadingWindow): boolean {
	const available = window.endMilliseconds - window.startMilliseconds;
	return window.kind === 'speech-caption'
		? available >= 1_000 && available <= 7_000
		: available >= window.requiredMilliseconds;
}

function readingWindowsPass(windows: readonly LayoutContractReadingWindow[]): boolean {
	return windows.every(readingWindowPasses);
}

function rectOutside(
	readable: LayoutContractReadableEvidence,
	bounds: LayoutContractRect
): boolean {
	return (
		readable.rect.x < bounds.x ||
		readable.rect.y < bounds.y ||
		readable.rect.x + readable.rect.width > bounds.x + bounds.width ||
		readable.rect.y + readable.rect.height > bounds.y + bounds.height
	);
}

function readableRectLabel(entry: LayoutContractReadableEvidence): string {
	return `${entry.id}@${entry.rect.x},${entry.rect.y},${entry.rect.width},${entry.rect.height}`;
}

function titleSafeViolationIds(evidence: LayoutContractFrameEvidence): string[] {
	const { width, height } = evidence.coordinate;
	const bounds = { x: width * 0.05, y: height * 0.05, width: width * 0.9, height: height * 0.9 };
	return evidence.readables.filter((entry) => rectOutside(entry, bounds)).map(readableRectLabel);
}

function verticalPlatformViolationIds(evidence: LayoutContractFrameEvidence): string[] {
	const { width, height } = evidence.coordinate;
	const top = Math.floor(height * 0.06);
	const bottom = Math.ceil(height * 0.84);
	const bounds = { x: 0, y: top, width: Math.ceil(width * 0.91), height: bottom - top };
	return evidence.readables.filter((entry) => rectOutside(entry, bounds)).map(readableRectLabel);
}

/** Derive the complete closed objective verdict without inspecting captured pixels. */
export function evaluateLayoutContractFrame(input: unknown): LayoutContractFrameResult {
	const evidence = LayoutContractFrameEvidenceSchema.parse(input);
	const { coordinate } = evidence;
	const expectedSize =
		coordinate.orientation === 'horizontal'
			? { width: 3840, height: 2160 }
			: { width: 2160, height: 3840 };
	const coverageAvailable =
		evidence.readableCoverage.authority === 'schema-renderer' && evidence.readableCoverage.complete;
	const checks: LayoutContractCheckResult[] = [
		check(
			'native-target-size',
			coordinate.width === expectedSize.width && coordinate.height === expectedSize.height
				? 'pass'
				: 'fail',
			`${coordinate.width}x${coordinate.height}; expected ${expectedSize.width}x${expectedSize.height}`
		),
		check(
			'font-readiness',
			evidence.pendingFontCount === 0 ? 'pass' : 'fail',
			`${evidence.pendingFontCount} pending readable font(s)`
		),
		check(
			'readable-identity-coverage',
			coverageAvailable ? 'pass' : 'unavailable',
			coverageAvailable
				? `${evidence.readableCoverage.discoveredReadableIdentities.length} readable identities matched`
				: `${evidence.readableCoverage.unavailableReason ?? 'readable identity coverage unavailable'}; expected=${JSON.stringify(evidence.readableCoverage.expectedReadableIdentities)}; discovered=${JSON.stringify(evidence.readableCoverage.discoveredReadableIdentities)}; missing=${JSON.stringify(evidence.readableCoverage.missingReadableIdentities)}; extra=${JSON.stringify(evidence.readableCoverage.extraReadableIdentities)}; duplicates=${evidence.readableCoverage.duplicateReadableIdentityCount}; unclaimed=${evidence.readableCoverage.unclaimedVisibleTextCount}; owners=${JSON.stringify(evidence.readableCoverage.unclaimedVisibleTextOwners)}`
		)
	];
	checks.push(
		check(
			'title-safe-area',
			coverageAvailable
				? evidence.measurements.titleSafeAreaAffectedPixels === 0
					? 'pass'
					: 'fail'
				: 'unavailable',
			`${evidence.measurements.titleSafeAreaAffectedPixels} affected native pixel(s); ids=${JSON.stringify(titleSafeViolationIds(evidence))}`
		),
		check(
			'vertical-platform-safe-area',
			coordinate.orientation === 'horizontal'
				? 'not-applicable'
				: coverageAvailable
					? evidence.measurements.verticalPlatformSafeAreaAffectedPixels === 0
						? 'pass'
						: 'fail'
					: 'unavailable',
			coordinate.orientation === 'horizontal'
				? 'horizontal target has no vertical platform rail'
				: `${evidence.measurements.verticalPlatformSafeAreaAffectedPixels} affected native pixel(s); ids=${JSON.stringify(verticalPlatformViolationIds(evidence))}`
		),
		check(
			'readable-clipping',
			coverageAvailable
				? evidence.readables.every((entry) => entry.clippedPixelCount === 0)
					? 'pass'
					: 'fail'
				: 'unavailable',
			`${evidence.readables.filter((entry) => entry.clippedPixelCount > 0).length} clipped readable region(s); ids=${JSON.stringify(evidence.readables.filter((entry) => entry.clippedPixelCount > 0).map((entry) => `${entry.id}:${entry.clippedPixelCount}@${entry.rect.x},${entry.rect.y},${entry.rect.width},${entry.rect.height}|clip=${entry.clipRect.x},${entry.clipRect.y},${entry.clipRect.width},${entry.clipRect.height}`))}`
		),
		check(
			'cap-height-floor',
			coverageAvailable
				? evidence.readables.every(
						(entry) =>
							entry.measuredCapHeightPixels >=
							CAP_HEIGHT_FLOORS[entry.textRole][coordinate.orientation]
					)
					? 'pass'
					: 'fail'
				: 'unavailable',
			`${evidence.readables.filter((entry) => entry.measuredCapHeightPixels < CAP_HEIGHT_FLOORS[entry.textRole][coordinate.orientation]).length} undersized readable region(s); ids=${JSON.stringify(evidence.readables.filter((entry) => entry.measuredCapHeightPixels < CAP_HEIGHT_FLOORS[entry.textRole][coordinate.orientation]).map((entry) => `${entry.id}:${entry.measuredCapHeightPixels.toFixed(2)}<${CAP_HEIGHT_FLOORS[entry.textRole][coordinate.orientation]}`))}`
		),
		check(
			'reading-window',
			evidence.readingPlan.status === 'unavailable'
				? 'unavailable'
				: readingWindowsPass(evidence.readingPlan.windows)
					? 'pass'
					: 'fail',
			evidence.readingPlan.status === 'unavailable'
				? evidence.readingPlan.reason
				: `${evidence.readingPlan.windows.length} reading window(s); failures=${JSON.stringify(evidence.readingPlan.windows.filter((window) => !readingWindowPasses(window)).map((window) => `${window.readingId}:${(window.endMilliseconds - window.startMilliseconds).toFixed(0)}<${window.requiredMilliseconds.toFixed(0)}`))}`
		),
		check(
			'deterministic-geometry',
			evidence.canonicalGeometryDigest === evidence.replayGeometryDigest ? 'pass' : 'fail',
			`canonical ${evidence.canonicalGeometryDigest}; replay ${evidence.replayGeometryDigest}`
		),
		check(
			'layout-stability',
			evidence.stableGeometryCandidateCount === 0
				? 'not-applicable'
				: evidence.maximumElementDeltaPixels === 0
					? 'pass'
					: 'fail',
			evidence.stableGeometryCandidateCount === 0
				? 'sample declares no stable geometry candidates'
				: `maximum element delta ${evidence.maximumElementDeltaPixels}px`
		)
	);
	return LayoutContractFrameResultSchema.parse({
		schemaVersion: 1,
		coordinate,
		checks,
		passed: checks.every(
			(result) => result.outcome === 'pass' || result.outcome === 'not-applicable'
		)
	});
}
