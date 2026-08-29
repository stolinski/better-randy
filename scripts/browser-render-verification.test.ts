import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	BROWSER_RENDER_BRANCHES,
	BROWSER_RENDER_CHECK_IDS,
	BROWSER_RENDER_GEOMETRY_TOLERANCE_PIXELS,
	BROWSER_RENDER_MATRIX_COORDINATES,
	BROWSER_RENDER_PERFORMANCE_BUDGET,
	ESTABLISHED_RENDER_LANE,
	SELECTED_PUBLIC_RENDER_LANE,
	evaluateBrowserRenderCoordinate,
	findBrowserRenderCoverageGaps,
	maximumGeometryDeltaPixels,
	selectBrowserRenderSampleFrameIndex,
	summarizeBrowserRenderVerification,
	type BrowserRenderLaneEvidence,
	type BrowserRenderMatrixCoordinate
} from './browser-render-verification.ts';
import { collectGfxRenderRegistry } from './derive-gfx-render-matrix-manifest.ts';

const COORDINATE: BrowserRenderMatrixCoordinate = {
	coordinateId: 'sample',
	presetSlug: 'lower-third',
	packId: 'syntax',
	orientation: 'horizontal',
	branchIds: ['html-text']
};

function laneEvidence(
	lane: typeof ESTABLISHED_RENDER_LANE | typeof SELECTED_PUBLIC_RENDER_LANE,
	overrides: Partial<BrowserRenderLaneEvidence> = {}
): BrowserRenderLaneEvidence {
	return {
		lane,
		reportedCaptureMode: lane,
		expectedOutputClass: 'transparent',
		configuredWidth: 3840,
		configuredHeight: 2160,
		fontsStatus: 'loaded',
		frame: {
			sha256: `${lane}-frame`,
			width: 3840,
			height: 2160,
			nonUniformPixelCount: 4_096,
			alphaCoverage: 0.24,
			outputClass: 'transparent'
		},
		replayFrameSha256: `${lane}-frame`,
		replayChangedPixelRatio: 0,
		geometry: { 'composition-root': { x: 0, y: 0, width: 3840, height: 2160 } },
		retainedRasterCount: lane === SELECTED_PUBLIC_RENDER_LANE ? 1 : 0,
		directCanvasChildCount: 1,
		frameMilliseconds: 180,
		...overrides
	};
}

test('the declared matrix covers every branch, Pack, and orientation of the live registry', async () => {
	const registry = await collectGfxRenderRegistry();
	const gaps = findBrowserRenderCoverageGaps({
		deliverablePresetSlugs: registry.presets.map((preset) => preset.slug),
		packIds: registry.packs.map((pack) => pack.id)
	});
	assert.deepEqual(gaps, []);
});

test('every coordinate is measured at a composed checkpoint, never at the blank opening frame', async () => {
	const registry = await collectGfxRenderRegistry();
	for (const coordinate of BROWSER_RENDER_MATRIX_COORDINATES) {
		const preset = registry.presets.find((entry) => entry.slug === coordinate.presetSlug);
		assert.ok(preset, `${coordinate.coordinateId} names a Preset the registry does not have`);
		const frameIndex = selectBrowserRenderSampleFrameIndex(preset.samples);
		assert.ok(
			frameIndex !== null && frameIndex > 0,
			`${coordinate.coordinateId} resolved to frame ${frameIndex}`
		);
		assert.ok(
			preset.samples.some(
				(sample) => sample.kind === 'checkpoint' && sample.frameIndex === frameIndex
			),
			`${coordinate.coordinateId} resolved to a frame outside its own sample plan`
		);
	}
});

test('sample selection prefers the mid checkpoint and refuses a plan with only an opening frame', () => {
	const samples = [
		{ kind: 'checkpoint' as const, sampleId: 'checkpoint:opening', frameIndex: 0 },
		{ kind: 'checkpoint' as const, sampleId: 'checkpoint:quarter', frameIndex: 50 },
		{ kind: 'checkpoint' as const, sampleId: 'checkpoint:middle', frameIndex: 100 },
		{ kind: 'checkpoint' as const, sampleId: 'checkpoint:closing', frameIndex: 200 }
	];
	assert.equal(selectBrowserRenderSampleFrameIndex(samples), 100);
	// No mid checkpoint: the middle composed checkpoint stands in.
	assert.equal(
		selectBrowserRenderSampleFrameIndex([samples[0], samples[1], samples[3]]),
		50
	);
	// A transition window is not a checkpoint, and frame 0 alone is not composed.
	assert.equal(selectBrowserRenderSampleFrameIndex([samples[0]]), null);
	assert.equal(
		selectBrowserRenderSampleFrameIndex([
			{ kind: 'transition-window', sampleId: 'transition:a', frameIndex: 40 }
		]),
		null
	);
	assert.equal(selectBrowserRenderSampleFrameIndex([]), null);
});

test('a branch with no live coordinate is a coverage gap, not a silent pass', () => {
	const gaps = findBrowserRenderCoverageGaps(
		{ deliverablePresetSlugs: ['lower-third'], packIds: ['syntax'] },
		[
			{ branchId: 'html-text', description: 'text', authority: 'live-lane-matrix' },
			{ branchId: 'depth-effects', description: 'depth', authority: 'live-lane-matrix' }
		],
		[COORDINATE]
	);
	assert.deepEqual(gaps, [
		'Branch depth-effects has no live matrix coordinate',
		'Orientation vertical is never rendered by the matrix'
	]);
});

test('a structural-seam branch must name the check that proves lane independence', () => {
	const gaps = findBrowserRenderCoverageGaps(
		{ deliverablePresetSlugs: ['lower-third'], packIds: ['syntax'] },
		[
			{ branchId: 'html-text', description: 'text', authority: 'live-lane-matrix' },
			{ branchId: 'video-underlay', description: 'video', authority: 'structural-seam' }
		],
		[COORDINATE, { ...COORDINATE, coordinateId: 'vertical', orientation: 'vertical' }]
	);
	assert.deepEqual(gaps, [
		'Branch video-underlay claims a structural authority but names no check'
	]);
});

test('a coordinate naming a Preset or Pack the registry does not have is a gap', () => {
	const gaps = findBrowserRenderCoverageGaps(
		{ deliverablePresetSlugs: ['lower-third'], packIds: ['syntax'] },
		[{ branchId: 'html-text', description: 'text', authority: 'live-lane-matrix' }],
		[{ ...COORDINATE, presetSlug: 'retired-preset', packId: 'retired-pack', orientation: 'vertical' }]
	);
	assert.deepEqual(gaps, [
		'Coordinate sample names retired-preset, which is not a live deliverable Preset',
		'Coordinate sample names Pack retired-pack, which is not registered',
		'Pack syntax is never rendered by the matrix',
		'Orientation horizontal is never rendered by the matrix'
	]);
});

test('both lanes agreeing on a settled frame passes every check', () => {
	const verdict = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE)
	});
	assert.equal(verdict.outcome, 'pass');
	assert.deepEqual(
		verdict.checks.map((check) => check.checkId),
		[...BROWSER_RENDER_CHECK_IDS]
	);
});

test('missing evidence from either lane fails closed as unavailable', () => {
	for (const [established, selected] of [
		[null, laneEvidence(SELECTED_PUBLIC_RENDER_LANE)],
		[laneEvidence(ESTABLISHED_RENDER_LANE), null]
	] as const) {
		const verdict = evaluateBrowserRenderCoordinate({ coordinate: COORDINATE, established, selected });
		assert.equal(verdict.outcome, 'unavailable');
		assert.equal(verdict.checks.length, BROWSER_RENDER_CHECK_IDS.length);
		assert.ok(verdict.checks.every((check) => check.outcome === 'unavailable'));
	}
});

test('a blank standard-lane frame fails even though the flagged lane rendered', () => {
	const verdict = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			frame: { ...laneEvidence(SELECTED_PUBLIC_RENDER_LANE).frame, nonUniformPixelCount: 0 }
		})
	});
	assert.equal(verdict.outcome, 'fail');
	assert.equal(verdict.checks.find((check) => check.checkId === 'nonblank-frame')?.outcome, 'fail');
});

test('output class is a lane comparison: only the public path diverging is a failure', () => {
	const opaqueDeclaration = { expectedOutputClass: 'opaque' as const };
	// The established lane's own frame already breaks its declaration: a
	// composition or Pack defect the deliverable render matrix owns, reproduced
	// identically on the public path. Reported by name, not charged to the lane.
	const preexisting = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE, {
			...opaqueDeclaration,
			frame: { ...laneEvidence(ESTABLISHED_RENDER_LANE).frame, outputClass: 'transparent' }
		}),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			...opaqueDeclaration,
			frame: { ...laneEvidence(SELECTED_PUBLIC_RENDER_LANE).frame, outputClass: 'transparent' }
		})
	});
	assert.equal(
		preexisting.checks.find((check) => check.checkId === 'output-class-parity')?.outcome,
		'pass'
	);
	assert.match(preexisting.establishedLaneDeclarationMismatch ?? '', /declares opaque/);
	assert.deepEqual(
		summarizeBrowserRenderVerification([preexisting], []).establishedLaneDefects,
		[preexisting.establishedLaneDeclarationMismatch]
	);

	// The public path alone losing the background fill is exactly this gate's job.
	const laneDivergence = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE, {
			...opaqueDeclaration,
			frame: { ...laneEvidence(ESTABLISHED_RENDER_LANE).frame, outputClass: 'opaque' }
		}),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			...opaqueDeclaration,
			frame: { ...laneEvidence(SELECTED_PUBLIC_RENDER_LANE).frame, outputClass: 'transparent' }
		})
	});
	assert.equal(laneDivergence.outcome, 'fail');
	assert.equal(laneDivergence.establishedLaneDeclarationMismatch, undefined);
	assert.equal(
		summarizeBrowserRenderVerification([laneDivergence], []).establishedLaneDefects.length,
		0
	);
});

test('a session serving the wrong lane cannot pass as evidence', () => {
	const verdict = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			reportedCaptureMode: ESTABLISHED_RENDER_LANE
		})
	});
	assert.equal(verdict.checks.find((check) => check.checkId === 'lane-identity')?.outcome, 'fail');
});

test('a retained raster for a child the composition dropped fails cleanup', () => {
	const verdict = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			retainedRasterCount: 2,
			directCanvasChildCount: 1
		})
	});
	assert.equal(verdict.checks.find((check) => check.checkId === 'raster-cleanup')?.outcome, 'fail');
});

test('the selected public lane is the only one the performance budget gates', () => {
	const overBudget = BROWSER_RENDER_PERFORMANCE_BUDGET.standardLaneFrameMilliseconds + 1;
	assert.equal(
		evaluateBrowserRenderCoordinate({
			coordinate: COORDINATE,
			established: laneEvidence(ESTABLISHED_RENDER_LANE, { frameMilliseconds: overBudget }),
			selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE)
		}).outcome,
		'pass'
	);
	assert.equal(
		evaluateBrowserRenderCoordinate({
			coordinate: COORDINATE,
			established: laneEvidence(ESTABLISHED_RENDER_LANE),
			selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, { frameMilliseconds: overBudget })
		}).checks.find((check) => check.checkId === 'frame-capture-performance')?.outcome,
		'fail'
	);
});

test('a frame that differs when the same address is reached again fails determinism', () => {
	const verdict = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			replayFrameSha256: 'drifted',
			replayChangedPixelRatio: 0.061
		})
	});
	const determinism = verdict.checks.find((check) => check.checkId === 'frame-determinism');
	assert.equal(determinism?.outcome, 'fail');
	// The magnitude separates a stray antialiased edge from a whole stale frame.
	assert.match(determinism?.detail ?? '', /selected=6\.10e-2/);
});

test('geometry parity measures the largest edge delta and is unavailable with no shared element', () => {
	assert.equal(maximumGeometryDeltaPixels({}, {}), null);
	assert.equal(
		maximumGeometryDeltaPixels(
			{ a: { x: 0, y: 0, width: 100, height: 50 } },
			{ a: { x: 1, y: 0, width: 100, height: 47 } }
		),
		3
	);
	const drifted = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, {
			geometry: {
				'composition-root': {
					x: 0,
					y: 0,
					width: 3840 - BROWSER_RENDER_GEOMETRY_TOLERANCE_PIXELS - 1,
					height: 2160
				}
			}
		})
	});
	assert.equal(drifted.checks.find((check) => check.checkId === 'geometry-parity')?.outcome, 'fail');
	const unmeasured = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE, { geometry: {} })
	});
	assert.equal(unmeasured.outcome, 'unavailable');
});

test('the matrix summary fails closed on coverage gaps and on unavailable coordinates', () => {
	const passing = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: laneEvidence(ESTABLISHED_RENDER_LANE),
		selected: laneEvidence(SELECTED_PUBLIC_RENDER_LANE)
	});
	assert.equal(summarizeBrowserRenderVerification([passing], []).outcome, 'pass');
	assert.equal(summarizeBrowserRenderVerification([passing], ['a gap']).outcome, 'fail');
	const unavailable = evaluateBrowserRenderCoordinate({
		coordinate: COORDINATE,
		established: null,
		selected: null
	});
	const summary = summarizeBrowserRenderVerification([passing, unavailable], []);
	assert.equal(summary.outcome, 'unavailable');
	assert.deepEqual(summary.unavailableCoordinateIds, ['sample']);
});

test('every declared branch is claimed by the shipped matrix or by a named structural check', () => {
	const claimed = new Set(BROWSER_RENDER_MATRIX_COORDINATES.flatMap((entry) => entry.branchIds));
	for (const branch of BROWSER_RENDER_BRANCHES) {
		assert.ok(
			branch.authority === 'structural-seam'
				? Boolean(branch.structuralAuthorityPath)
				: claimed.has(branch.branchId),
			`${branch.branchId} has no coverage authority`
		);
	}
});
