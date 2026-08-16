import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildSupersRenderMatrixCellVerdict,
	captureSupersAuxiliaryFrameSequence,
	createSupersEdgeAliasingProbeCandidate,
	createSupersShadowBandingProbeCandidate,
	createSupersTextEdgeProbeCandidate,
	groupSupersRenderMatrixCoordinates,
	runBoundedSupersRenderMatrixFanout,
	SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES,
	type SupersRenderMatrixCheckCandidate,
	type SupersRenderMatrixEvidenceReference,
	verifySupersRenderEvidenceIndex
} from './supers-render-matrix-runner.ts';

function coordinate(cellId: string, presetSlug: string, packId = 'syntax') {
	return { cellId, presetSlug, packId, orientation: 'horizontal' as const };
}

test('runner groups samples by Preset, Pack, and orientation', () => {
	const groups = groupSupersRenderMatrixCoordinates([
		coordinate('b', 'alpha'),
		coordinate('a', 'alpha'),
		coordinate('c', 'beta')
	]);
	assert.equal(groups.length, 2);
	assert.deepEqual(
		groups.find((group) => group.presetSlug === 'alpha')?.coordinates.map((entry) => entry.cellId),
		['a', 'b']
	);
});

test('auxiliary sequence reuses the primary capture without changing sample identities', async () => {
	const primaryFrame = { captureId: 'primary' };
	const capturedFrameIndices: number[] = [];
	const captures = await captureSupersAuxiliaryFrameSequence({
		primaryFrameIndex: 30,
		primaryFrame,
		auxiliaryFrameIndices: [29, 30, 31],
		captureFrame: async (frameIndex) => {
			capturedFrameIndices.push(frameIndex);
			return { captureId: `captured-${frameIndex}` };
		}
	});

	assert.deepEqual(capturedFrameIndices, [29, 31]);
	assert.deepEqual(
		captures.map(({ frameIndex, reusedPrimary }) => ({ frameIndex, reusedPrimary })),
		[
			{ frameIndex: 29, reusedPrimary: false },
			{ frameIndex: 30, reusedPrimary: true },
			{ frameIndex: 31, reusedPrimary: false }
		]
	);
	assert.equal(captures[1].frame, primaryFrame);
});

test('bounded fanout starts groups concurrently and retains failures as values', async () => {
	const groups = groupSupersRenderMatrixCoordinates([
		coordinate('a', 'alpha'),
		coordinate('b', 'beta'),
		coordinate('c', 'gamma')
	]);
	let active = 0;
	let maximumActive = 0;
	const results = await runBoundedSupersRenderMatrixFanout({
		groups,
		concurrency: 2,
		executeGroup: async (group) => {
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			await new Promise((resolve) => setTimeout(resolve, 10));
			active -= 1;
			if (group.presetSlug === 'beta') throw new Error('capture failed');
			return {
				groupId: group.groupId,
				cells: [group.presetSlug],
				evidence: [],
				startedAt: '',
				completedAt: ''
			};
		},
		onGroupFailure: (group) => ({
			groupId: group.groupId,
			cells: [`unavailable:${group.presetSlug}`],
			evidence: [],
			startedAt: '',
			completedAt: ''
		})
	});
	assert.equal(maximumActive, 2);
	assert.equal(results.flatMap((entry) => entry.cells).length, 3);
	assert.ok(results.flatMap((entry) => entry.cells).includes('unavailable:beta'));
});

const cellEvidence: SupersRenderMatrixEvidenceReference = {
	kind: 'dom',
	path: 'render-matrix-evidence/cell/runtime.json',
	sha256: 'a'.repeat(64),
	region: null
};
const probeEvidence: SupersRenderMatrixEvidenceReference = {
	kind: 'probe',
	path: 'render-matrix-evidence/cell/probe.json',
	sha256: 'b'.repeat(64),
	region: { x: 1, y: 2, width: 3, height: 4 }
};

function validCellCandidates(): SupersRenderMatrixCheckCandidate[] {
	const measured = (
		code: SupersRenderMatrixCheckCandidate['code'],
		measurement: unknown
	): SupersRenderMatrixCheckCandidate => ({ code, measurement, evidence: [cellEvidence] });
	const notApplicable = (
		code: SupersRenderMatrixCheckCandidate['code'],
		reason:
			| 'no-text'
			| 'no-shadow'
			| 'no-tonal-region'
			| 'no-non-axis-edge'
			| 'no-transition-window'
			| 'no-reading-content',
		extra: Record<string, unknown> = {}
	): SupersRenderMatrixCheckCandidate =>
		({
			code,
			outcome: 'not-applicable',
			reason,
			evidence: [cellEvidence],
			...extra
		}) as SupersRenderMatrixCheckCandidate;
	return [
		measured('target-resolution-mismatch', {
			actualWidth: 3840,
			actualHeight: 2160,
			activeFrameRate: { num: 30, den: 1 }
		}),
		measured('font-not-ready', { pendingFontCount: 0 }),
		measured('title-safe-violation', { affectedPixelCount: 0 }),
		measured('vertical-platform-safe-area-violation', { affectedPixelCount: 0 }),
		notApplicable('readable-content-clipped', 'no-text'),
		notApplicable('readable-content-occluded', 'no-text'),
		measured('readable-content-coverage', {
			expectedReadableIdentities: [],
			discoveredReadableIdentities: []
		}),
		notApplicable('contrast-below-floor', 'no-text'),
		notApplicable('cap-height-below-floor', 'no-text'),
		measured('output-class-mismatch', {
			expectedClass: 'transparent',
			actualClass: 'transparent'
		}),
		notApplicable('text-edge-softness', 'no-text'),
		notApplicable('shadow-banding', 'no-shadow'),
		notApplicable('tonal-banding', 'no-tonal-region'),
		notApplicable('edge-aliasing', 'no-non-axis-edge'),
		notApplicable('reading-window-too-short', 'no-reading-content', {
			readingPlanDigest: 'b'.repeat(64),
			readingIds: []
		}),
		notApplicable('visibility-discontinuity', 'no-transition-window'),
		measured('layout-instability', { maximumElementDeltaPixels: 0 }),
		measured('nondeterministic-replay', { changedPixelRatio: 0 })
	];
}

test('end-to-end valid cell assembly can pass every closed check', () => {
	const cell = buildSupersRenderMatrixCellVerdict(
		coordinate('cell', 'alpha'),
		validCellCandidates(),
		cellEvidence
	) as { outcome: string; checks: Array<{ outcome: string }> };
	assert.equal(cell.outcome, 'pass');
	assert.equal(cell.checks.length, SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES.length);
	assert.equal(
		cell.checks.some((check) => check.outcome === 'unavailable'),
		false
	);
});

function assertZeroSignalCheckPersists(
	candidate: SupersRenderMatrixCheckCandidate,
	code: SupersRenderMatrixCheckCandidate['code']
): void {
	const candidates = validCellCandidates().map((entry) =>
		entry.code === code ? candidate : entry
	);
	const cell = buildSupersRenderMatrixCellVerdict(
		coordinate('cell', 'alpha'),
		candidates,
		cellEvidence
	) as {
		outcome: string;
		checks: Array<{
			code: string;
			outcome: string;
			unavailableReason?: string;
			evidence: SupersRenderMatrixEvidenceReference[];
		}>;
	};
	assert.equal(cell.outcome, 'unavailable');
	assert.equal(cell.checks.length, SUPERS_RENDER_MATRIX_REQUIRED_CHECK_CODES.length);
	assert.deepEqual(
		cell.checks.filter((check) => check.outcome === 'unavailable'),
		[
			{
				checkId: code,
				code,
				outcome: 'unavailable',
				unavailableReason: 'probe-zero-signal',
				evidence: [cellEvidence, probeEvidence]
			}
		]
	);
}

test('text-edge zero transitions retain the probe and make only that check unavailable', () => {
	assertZeroSignalCheckPersists(
		createSupersTextEdgeProbeCandidate({ max_step_normalized: 0, transition_count: 0 }, [
			cellEvidence,
			probeEvidence
		]),
		'text-edge-softness'
	);
});

test('shadow-banding null transition span retains the probe and makes only that check unavailable', () => {
	assertZeroSignalCheckPersists(
		createSupersShadowBandingProbeCandidate(
			['shadow:card:box-shadow:0'],
			[
				{
					shadowId: 'shadow:card:box-shadow:0',
					band_count: 0,
					max_relative_step: 0,
					transition_span_px: null,
					transition_sample_count: 0
				}
			],
			[cellEvidence, probeEvidence]
		),
		'shadow-banding'
	);
});

test('edge-AA zero transitions retain the probe and make only that check unavailable', () => {
	assertZeroSignalCheckPersists(
		createSupersEdgeAliasingProbeCandidate({ hard_stairsteps: 0, transition_sample_count: 0 }, [
			cellEvidence,
			probeEvidence
		]),
		'edge-aliasing'
	);
});

test('end-to-end incomplete cell assembly fails closed instead of manufacturing pass', () => {
	const candidates = validCellCandidates().filter(
		(candidate) => candidate.code !== 'layout-instability'
	);
	const cell = buildSupersRenderMatrixCellVerdict(
		coordinate('cell', 'alpha'),
		candidates,
		cellEvidence
	) as { outcome: string; checks: Array<{ code: string; outcome: string }> };
	assert.equal(cell.outcome, 'unavailable');
	assert.deepEqual(
		cell.checks.find((check) => check.code === 'layout-instability'),
		{
			checkId: 'layout-instability',
			code: 'layout-instability',
			outcome: 'unavailable',
			unavailableReason: 'probe-failed',
			evidence: [cellEvidence]
		}
	);
});

test('evidence index rejects missing, duplicate, extra, and mismatched files', () => {
	const referencedEvidence = [
		{ path: 'render-matrix-evidence/a/canonical.png', sha256: 'a'.repeat(64) }
	];
	const valid = [{ ...referencedEvidence[0], bytes: 10 }];
	assert.doesNotThrow(() => verifySupersRenderEvidenceIndex({ referencedEvidence, index: valid }));
	assert.throws(() => verifySupersRenderEvidenceIndex({ referencedEvidence, index: [] }));
	assert.throws(() =>
		verifySupersRenderEvidenceIndex({ referencedEvidence, index: [...valid, ...valid] })
	);
	assert.throws(() =>
		verifySupersRenderEvidenceIndex({
			referencedEvidence,
			index: [{ ...valid[0], sha256: 'b'.repeat(64) }]
		})
	);
});
