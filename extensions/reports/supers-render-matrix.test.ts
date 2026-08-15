import assert from 'node:assert/strict';

import { report } from './supers-render-matrix.ts';

const SHA = 'a'.repeat(64);
const REVISION = 'b'.repeat(40);
const evidence = [
	{
		kind: 'probe',
		path: 'render-matrix-evidence/cell/error.json',
		sha256: SHA,
		region: null
	}
];
const zeroSignalCodes = new Set(['text-edge-softness', 'shadow-banding', 'edge-aliasing']);
const codes = [
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
];

function context(resources: Record<string, unknown>) {
	const entries = Object.entries(resources);
	return {
		methodName: 'verify-render-matrix',
		modelType: '@supers/render-matrix-verification',
		modelId: 'model',
		dataHandles: entries.map(([specName]) => ({ specName, name: specName })),
		dataRepository: {
			getContent: async (_type: string, _model: string, name: string) =>
				new TextEncoder().encode(JSON.stringify(resources[name]))
		}
	};
}

Deno.test('report renders not-applicable without inventing an empty manifest', async () => {
	const result = await report.execute(
		context({
			'render-matrix-run': {
				schemaVersion: 1,
				status: 'not-applicable',
				scope: 'affected',
				workItem: 'imjlwx0s',
				sourceRevision: REVISION,
				expectedTreeFingerprint: SHA,
				changedPathsDigest: SHA,
				reason: 'no-deliverable-render-impact',
				advisories: []
			}
		})
	);
	assert.match(result.markdown, /not applicable/);
});

Deno.test('report names exact unavailable coordinates and separates advisories', async () => {
	const sample = {
		kind: 'checkpoint',
		sampleId: 'checkpoint:opening',
		frameIndex: 0,
		timestampMicroseconds: 0,
		auxiliaryFrameIndices: [0],
		stableGeometryCandidateIds: ['composition-root', 'overlay-root']
	};
	const coordinate = {
		schemaVersion: 1,
		sourceRevision: REVISION,
		engineFingerprint: SHA,
		presetSlug: 'lower-third',
		presetFingerprint: SHA,
		packId: 'syntax',
		packFingerprint: SHA,
		orientation: 'horizontal',
		frameRate: { num: 30, den: 1 },
		width: 3840,
		height: 2160,
		sample,
		cellId: SHA
	};
	const resources = {
		'render-registry-snapshot': {
			schemaVersion: 1,
			sourceRevision: REVISION,
			engineFingerprint: SHA,
			deliverablePresets: [
				{
					slug: 'lower-third',
					presetFingerprint: SHA,
					readingPlanDigest: SHA,
					readingPlanIds: [],
					samples: [sample]
				}
			],
			packs: [{ id: 'syntax', packFingerprint: SHA }],
			orientations: ['horizontal', 'vertical'],
			snapshotDigest: SHA
		},
		'render-matrix-manifest': {
			schemaVersion: 1,
			sourceRevision: REVISION,
			engineFingerprint: SHA,
			scope: 'affected',
			presets: [
				{
					slug: 'lower-third',
					fingerprint: SHA,
					readingPlanDigest: SHA,
					readingPlanIds: [],
					samples: [sample]
				}
			],
			packs: [{ id: 'syntax', fingerprint: SHA }],
			orientations: ['horizontal'],
			requiredCheckCodes: codes,
			coordinates: [coordinate],
			manifestDigest: SHA
		},
		'render-matrix-bundle': {
			schemaVersion: 1,
			bundleDigest: SHA,
			manifestDigest: SHA,
			sourceRevision: REVISION,
			outcome: 'unavailable',
			cells: [
				{
					schemaVersion: 1,
					coordinate,
					outcome: 'unavailable',
					checks: codes.map((code) => ({
						checkId: code,
						code,
						outcome: 'unavailable',
						unavailableReason: zeroSignalCodes.has(code)
							? 'probe-zero-signal'
							: 'authority-missing',
						evidence
					}))
				}
			]
		},
		'render-matrix-run': {
			schemaVersion: 1,
			status: 'completed',
			scope: 'affected',
			workItem: 'imjlwx0s',
			sourceRevision: REVISION,
			expectedTreeFingerprint: SHA,
			registrySnapshotName: 'snapshot',
			registrySnapshotDigest: SHA,
			manifestName: 'manifest',
			manifestDigest: SHA,
			bundleName: 'bundle',
			bundleDigest: SHA,
			evidenceArchiveName: 'evidence',
			evidenceArchiveDigest: SHA,
			startedAt: '2026-08-15T00:00:00.000Z',
			completedAt: '2026-08-15T00:01:00.000Z',
			executionMode: 'bounded-internal-fanout',
			freshness: {
				localBefore: SHA,
				servedBefore: SHA,
				servedAfter: SHA,
				localAfter: SHA
			},
			counts: {
				presets: 1,
				packs: 1,
				orientations: 1,
				samples: 1,
				cells: 1,
				passed: 0,
				failed: 0,
				unavailable: 1
			},
			outcome: 'unavailable',
			advisories: []
		}
	};
	const result = await report.execute(context(resources));
	assert.match(result.markdown, /lower-third \/ syntax \/ horizontal \/ checkpoint:opening/);
	assert.match(result.markdown, /Advisory observations — no routing authority/);
	const unavailableCoordinates = (
		result.json as { unavailableCoordinates: Array<{ codes: string[] }> }
	).unavailableCoordinates;
	assert.equal(unavailableCoordinates.length, 1);
	for (const code of zeroSignalCodes) assert.ok(unavailableCoordinates[0].codes.includes(code));

	await assert.rejects(() =>
		report.execute(
			context({
				...resources,
				'render-matrix-run': {
					...resources['render-matrix-run'],
					bundleDigest: 'c'.repeat(64)
				}
			})
		)
	);
});
