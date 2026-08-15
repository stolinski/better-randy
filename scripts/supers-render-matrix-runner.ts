import { createHash } from 'node:crypto';

export const SUPERS_RENDER_MATRIX_GROUP_CONCURRENCY = 2;

export const SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES = [
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

export type SupersRenderMatrixCheckCode =
	(typeof SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES)[number];

export interface SupersRenderMatrixEvidenceReference {
	kind: 'static' | 'dom' | 'capture' | 'probe' | 'export';
	path: string;
	sha256: string;
	region: { x: number; y: number; width: number; height: number } | null;
}

export type SupersRenderMatrixCheckCandidate =
	| {
			code: SupersRenderMatrixCheckCode;
			measurement: unknown;
			evidence: readonly SupersRenderMatrixEvidenceReference[];
	  }
	| {
			code: SupersRenderMatrixCheckCode;
			outcome: 'unavailable';
			unavailableReason:
				| 'capture-failed'
				| 'probe-failed'
				| 'probe-zero-signal'
				| 'evidence-stale'
				| 'incomplete-readable-coverage'
				| 'authority-missing'
				| 'composited-mask-unavailable'
				| 'contrast-mask-unavailable'
				| 'reading-intent-unrepresented';
			evidence: readonly SupersRenderMatrixEvidenceReference[];
	  }
	| {
			code: SupersRenderMatrixCheckCode;
			outcome: 'not-applicable';
			reason:
				| 'no-text'
				| 'no-shadow'
				| 'no-tonal-region'
				| 'no-non-axis-edge'
				| 'no-transition-window'
				| 'no-reading-content';
			readingPlanDigest?: string;
			readingIds?: readonly [];
			evidence: readonly SupersRenderMatrixEvidenceReference[];
	  };

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

function measurementRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError('Render check measurement must be an object');
	}
	return value as Record<string, unknown>;
}

function measurementNumber(value: unknown, name: string): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new TypeError(`${name} must be a finite number`);
	}
	return value;
}

function measurementArray(value: unknown, name: string): readonly unknown[] {
	if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
	return value;
}

/** Derive every closed verdict from objective measurements using the canonical thresholds. */
export function deriveSupersRenderMatrixCheckOutcome(
	code: SupersRenderMatrixCheckCode,
	measurement: unknown
): 'pass' | 'fail' {
	const value = measurementRecord(measurement);
	switch (code) {
		case 'target-resolution-mismatch': {
			const width = measurementNumber(value.actualWidth, 'actualWidth');
			const height = measurementNumber(value.actualHeight, 'actualHeight');
			return [2160, 3840].includes(width) && [2160, 3840].includes(height) && width !== height
				? 'pass'
				: 'fail';
		}
		case 'font-not-ready':
			return measurementNumber(value.pendingFontCount, 'pendingFontCount') === 0 ? 'pass' : 'fail';
		case 'title-safe-violation':
		case 'vertical-platform-safe-area-violation':
			return measurementNumber(value.affectedPixelCount, 'affectedPixelCount') === 0
				? 'pass'
				: 'fail';
		case 'readable-content-clipped':
		case 'readable-content-occluded':
			return measurementArray(value.measurements, 'measurements').every(
				(entry) =>
					measurementNumber(measurementRecord(entry).affectedPixelCount, 'affectedPixelCount') === 0
			)
				? 'pass'
				: 'fail';
		case 'readable-content-coverage': {
			const expected = measurementArray(
				value.expectedReadableIdentities,
				'expectedReadableIdentities'
			).map(String);
			const discovered = measurementArray(
				value.discoveredReadableIdentities,
				'discoveredReadableIdentities'
			).map(String);
			return expected.length === discovered.length &&
				expected.every((identity) => discovered.includes(identity))
				? 'pass'
				: 'fail';
		}
		case 'contrast-below-floor':
			return measurementArray(value.measurements, 'measurements').every((entry) => {
				const item = measurementRecord(entry);
				const floor = item.textClass === 'large' ? 3 : 4.5;
				return (
					measurementNumber(item.treatmentSampleCount, 'treatmentSampleCount') > 0 &&
					measurementNumber(item.measuredRatio, 'measuredRatio') >= floor
				);
			})
				? 'pass'
				: 'fail';
		case 'cap-height-below-floor':
			return measurementArray(value.measurements, 'measurements').every((entry) => {
				const item = measurementRecord(entry);
				const role = item.textRole as keyof typeof CAP_HEIGHT_FLOORS;
				const orientation = item.orientation as 'horizontal' | 'vertical';
				const floor = CAP_HEIGHT_FLOORS[role]?.[orientation];
				return (
					floor !== undefined && measurementNumber(item.measuredPixels, 'measuredPixels') >= floor
				);
			})
				? 'pass'
				: 'fail';
		case 'output-class-mismatch':
			return value.actualClass === value.expectedClass ? 'pass' : 'fail';
		case 'text-edge-softness':
			return measurementNumber(value.normalizedMaximumStep, 'normalizedMaximumStep') >= 0.3 &&
				measurementNumber(value.transitionCount, 'transitionCount') > 0
				? 'pass'
				: 'fail';
		case 'shadow-banding':
			return measurementArray(value.shadows, 'shadows').every((entry) => {
				const shadow = measurementRecord(entry);
				return (
					measurementNumber(shadow.transitionSampleCount, 'transitionSampleCount') > 0 &&
					measurementNumber(shadow.transitionSpanPixels, 'transitionSpanPixels') > 0 &&
					measurementNumber(shadow.bandCount, 'bandCount') === 0 &&
					measurementNumber(shadow.maximumAlphaStep, 'maximumAlphaStep') <= 0.3
				);
			})
				? 'pass'
				: 'fail';
		case 'tonal-banding':
			return measurementNumber(value.bandCount, 'bandCount') === 0 ? 'pass' : 'fail';
		case 'edge-aliasing':
			return measurementNumber(value.transitionSampleCount, 'transitionSampleCount') > 0 &&
				measurementNumber(value.hardStairstepCount, 'hardStairstepCount') === 0
				? 'pass'
				: 'fail';
		case 'reading-window-too-short':
			return measurementArray(value.windows, 'windows').every((entry) => {
				const window = measurementRecord(entry);
				const available =
					measurementNumber(window.endMilliseconds, 'endMilliseconds') -
					measurementNumber(window.startMilliseconds, 'startMilliseconds');
				if (window.kind === 'speech-caption') return available >= 1_000 && available <= 7_000;
				const words = measurementNumber(window.wordCount, 'wordCount');
				const required = (words * 60 * 1_000 * (window.kind === 'post-mark' ? 1.5 : 2)) / 200;
				return available >= required;
			})
				? 'pass'
				: 'fail';
		case 'visibility-discontinuity':
			return measurementNumber(value.measuredDipRatio, 'measuredDipRatio') <= 0.25
				? 'pass'
				: 'fail';
		case 'layout-instability':
			return measurementNumber(value.maximumElementDeltaPixels, 'maximumElementDeltaPixels') === 0
				? 'pass'
				: 'fail';
		case 'nondeterministic-replay':
			return measurementNumber(value.changedPixelRatio, 'changedPixelRatio') === 0
				? 'pass'
				: 'fail';
	}
}

/** Normalize a complete cell; a missing check fails closed as unavailable. */
export function buildSupersRenderMatrixCellVerdict(
	coordinate: Record<string, unknown>,
	candidates: readonly SupersRenderMatrixCheckCandidate[],
	fallbackEvidence: SupersRenderMatrixEvidenceReference
): Record<string, unknown> {
	const byCode = new Map<SupersRenderMatrixCheckCode, SupersRenderMatrixCheckCandidate>();
	for (const candidate of candidates) {
		if (byCode.has(candidate.code))
			throw new TypeError(`Duplicate check candidate: ${candidate.code}`);
		byCode.set(candidate.code, candidate);
	}
	const checks = SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES.map((code) => {
		const candidate = byCode.get(code);
		if (!candidate) {
			return {
				checkId: code,
				code,
				outcome: 'unavailable',
				unavailableReason: 'probe-failed',
				evidence: [fallbackEvidence]
			};
		}
		if ('measurement' in candidate) {
			return {
				checkId: code,
				code,
				outcome: deriveSupersRenderMatrixCheckOutcome(code, candidate.measurement),
				measurement: candidate.measurement,
				evidence: [...candidate.evidence]
			};
		}
		return {
			...candidate,
			checkId: code,
			evidence: [...candidate.evidence]
		};
	});
	return {
		schemaVersion: 1,
		coordinate,
		outcome: checks.some((check) => check.outcome === 'fail')
			? 'fail'
			: checks.some((check) => check.outcome === 'unavailable')
				? 'unavailable'
				: 'pass',
		checks
	};
}

interface SupersTextEdgeProbeOutput {
	max_step_normalized: number;
	transition_count: number;
}

interface SupersShadowBandingProbeOutput {
	shadowId: string;
	band_count: number;
	max_relative_step: number;
	transition_span_px: number | null;
	transition_sample_count: number;
}

interface SupersEdgeAliasingProbeOutput {
	hard_stairsteps: number;
	transition_sample_count: number;
}

/** Convert a valid text-edge probe with no measurable transition into retained unavailable evidence. */
export function createSupersTextEdgeProbeCandidate(
	probe: SupersTextEdgeProbeOutput,
	evidence: readonly SupersRenderMatrixEvidenceReference[]
): SupersRenderMatrixCheckCandidate {
	return probe.transition_count <= 0
		? {
				code: 'text-edge-softness',
				outcome: 'unavailable',
				unavailableReason: 'probe-zero-signal',
				evidence
			}
		: {
				code: 'text-edge-softness',
				measurement: {
					normalizedMaximumStep: probe.max_step_normalized,
					transitionCount: probe.transition_count
				},
				evidence
			};
}

/** Convert valid shadow probes with no measurable falloff into retained unavailable evidence. */
export function createSupersShadowBandingProbeCandidate(
	expectedShadowIds: readonly string[],
	probes: readonly SupersShadowBandingProbeOutput[],
	evidence: readonly SupersRenderMatrixEvidenceReference[]
): SupersRenderMatrixCheckCandidate {
	return probes.some(
		(probe) =>
			probe.transition_sample_count <= 0 ||
			probe.transition_span_px === null ||
			probe.transition_span_px <= 0
	)
		? {
				code: 'shadow-banding',
				outcome: 'unavailable',
				unavailableReason: 'probe-zero-signal',
				evidence
			}
		: {
				code: 'shadow-banding',
				measurement: {
					expectedShadowIds: [...expectedShadowIds],
					shadows: probes.map((probe) => ({
						shadowId: probe.shadowId,
						bandCount: probe.band_count,
						maximumAlphaStep: probe.max_relative_step,
						transitionSpanPixels: probe.transition_span_px,
						transitionSampleCount: probe.transition_sample_count
					}))
				},
				evidence
			};
}

/** Convert a valid edge-AA probe with no measurable edge into retained unavailable evidence. */
export function createSupersEdgeAliasingProbeCandidate(
	probe: SupersEdgeAliasingProbeOutput,
	evidence: readonly SupersRenderMatrixEvidenceReference[]
): SupersRenderMatrixCheckCandidate {
	return probe.transition_sample_count <= 0
		? {
				code: 'edge-aliasing',
				outcome: 'unavailable',
				unavailableReason: 'probe-zero-signal',
				evidence
			}
		: {
				code: 'edge-aliasing',
				measurement: {
					hardStairstepCount: probe.hard_stairsteps,
					transitionSampleCount: probe.transition_sample_count
				},
				evidence
			};
}

export interface SupersRenderMatrixCoordinateLike {
	cellId: string;
	presetSlug: string;
	packId: string;
	orientation: 'horizontal' | 'vertical';
	[key: string]: unknown;
}

export interface SupersRenderMatrixGroup {
	groupId: string;
	presetSlug: string;
	packId: string;
	orientation: 'horizontal' | 'vertical';
	coordinates: SupersRenderMatrixCoordinateLike[];
}

export interface SupersRenderEvidenceIndexEntry {
	path: string;
	sha256: string;
	bytes: number;
}

export interface SupersRenderMatrixGroupResult<Cell> {
	groupId: string;
	cells: Cell[];
	evidence: SupersRenderEvidenceIndexEntry[];
	startedAt: string;
	completedAt: string;
}

function groupIdentity(coordinate: SupersRenderMatrixCoordinateLike): string {
	return `${coordinate.presetSlug}\0${coordinate.packId}\0${coordinate.orientation}`;
}

export function groupSupersRenderMatrixCoordinates(
	coordinates: readonly SupersRenderMatrixCoordinateLike[]
): SupersRenderMatrixGroup[] {
	const groups = new Map<string, SupersRenderMatrixGroup>();
	for (const coordinate of coordinates) {
		const identity = groupIdentity(coordinate);
		const group = groups.get(identity) ?? {
			groupId: createHash('sha256').update(identity).digest('hex'),
			presetSlug: coordinate.presetSlug,
			packId: coordinate.packId,
			orientation: coordinate.orientation,
			coordinates: []
		};
		group.coordinates.push(coordinate);
		groups.set(identity, group);
	}
	return [...groups.values()]
		.map((group) => ({
			...group,
			coordinates: [...group.coordinates].sort((left, right) =>
				left.cellId.localeCompare(right.cellId)
			)
		}))
		.sort((left, right) => left.groupId.localeCompare(right.groupId));
}

/** One method-owned bounded worker pool; failures are values so every group is retained. */
export async function runBoundedSupersRenderMatrixFanout<Cell>(input: {
	groups: readonly SupersRenderMatrixGroup[];
	executeGroup: (group: SupersRenderMatrixGroup) => Promise<SupersRenderMatrixGroupResult<Cell>>;
	onGroupFailure: (
		group: SupersRenderMatrixGroup,
		error: unknown,
		startedAt: string,
		completedAt: string
	) => SupersRenderMatrixGroupResult<Cell> | Promise<SupersRenderMatrixGroupResult<Cell>>;
	concurrency?: number;
}): Promise<SupersRenderMatrixGroupResult<Cell>[]> {
	const concurrency = input.concurrency ?? SUPERS_RENDER_MATRIX_GROUP_CONCURRENCY;
	if (!Number.isInteger(concurrency) || concurrency < 1)
		throw new TypeError('Fan-out concurrency must be positive');
	const results = new Array<SupersRenderMatrixGroupResult<Cell>>(input.groups.length);
	let cursor = 0;
	async function worker(): Promise<void> {
		while (cursor < input.groups.length) {
			const index = cursor;
			cursor += 1;
			const group = input.groups[index];
			const startedAt = new Date().toISOString();
			try {
				results[index] = await input.executeGroup(group);
			} catch (error) {
				results[index] = await input.onGroupFailure(
					group,
					error,
					startedAt,
					new Date().toISOString()
				);
			}
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, input.groups.length) }, () => worker())
	);
	return results;
}

/** Reject missing, duplicate, extra, or hash-mismatched archive evidence. */
export function verifySupersRenderEvidenceIndex(input: {
	referencedEvidence: readonly { path: string; sha256: string }[];
	index: readonly SupersRenderEvidenceIndexEntry[];
}): void {
	const indexed = new Map<string, SupersRenderEvidenceIndexEntry>();
	for (const entry of input.index) {
		if (indexed.has(entry.path))
			throw new TypeError(`Duplicate evidence index path: ${entry.path}`);
		indexed.set(entry.path, entry);
	}
	const referenced = new Map<string, string>();
	for (const entry of input.referencedEvidence) {
		if (referenced.has(entry.path))
			throw new TypeError(`Duplicate evidence reference: ${entry.path}`);
		referenced.set(entry.path, entry.sha256);
	}
	if (indexed.size !== referenced.size)
		throw new TypeError('Evidence index contains missing or extra files');
	for (const [path, sha256] of referenced) {
		const entry = indexed.get(path);
		if (!entry || entry.sha256 !== sha256 || entry.bytes < 0) {
			throw new TypeError(`Evidence index digest mismatch: ${path}`);
		}
	}
}
