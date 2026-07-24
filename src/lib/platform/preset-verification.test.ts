import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { appendVisualVerificationIssues, verifyPresetArtifact } from './preset-verification';

describe('verifyPresetArtifact', () => {
	it('returns path-qualified structural failures', () => {
		const result = verifyPresetArtifact({ ...blankPresetJson, pack: undefined });

		assert.equal(result.isValid, false);
		assert.equal(result.preset, null);
		assert.equal(result.issues[0]?.source, 'schema');
		assert.equal(result.issues[0]?.path, 'pack');
	});

	it('returns registry-derived semantic failures', () => {
		const result = verifyPresetArtifact({ ...blankPresetJson, pack: 'missing-pack' });

		assert.equal(result.isValid, false);
		assert.equal(result.issues[0]?.source, 'semantic');
		assert.equal(result.issues[0]?.path, 'pack');
	});

	it('runs the static linter for deliverables and exempts fixtures', () => {
		const unsafe = {
			...blankPresetJson,
			kind: 'deliverable',
			state: {
				...blankPresetJson.state,
				overlays: [
					{
						type: 'lower-third',
						id: 'unsafe',
						content: { kicker: 'Kicker', title: 'Title' },
						position: { anchor: 'bottom-left', offset: { x: 0, y: 0 } }
					}
				]
			}
		};

		const deliverable = verifyPresetArtifact(unsafe);
		const fixture = verifyPresetArtifact({ ...unsafe, kind: 'fixture' });

		assert.equal(
			deliverable.issues.some((issue) => issue.source === 'linter'),
			true
		);
		assert.deepEqual(fixture.issues, []);
		assert.equal(fixture.isValid, true);
	});

	it('combines rendered visual issues with the artifact result', () => {
		const result = appendVisualVerificationIssues(verifyPresetArtifact(blankPresetJson), [
			{
				rule: 'audit',
				severity: 'error',
				path: 'document',
				message: 'Surface root missing.'
			}
		]);

		assert.equal(result.isValid, false);
		assert.equal(result.issues.at(-1)?.source, 'visual');
	});
});
