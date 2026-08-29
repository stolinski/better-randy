import { beforeEach, describe, expect, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { compositionMeta } from './composition-meta.svelte';
import {
	listCompositionTransitionEndpointSlugs,
	runClearCompositionTransitionOperation,
	runSetCompositionTransitionOperation
} from './composition-transition-operations';
import { engineState, transitionState } from './engine-state.svelte';
import { presetBase } from './preset-base.svelte';
import { transitionEffectTypes } from './pipelines/transition-definition-registry';
import { applyPreset } from './preset';
import { parsePresetIngress } from './preset-ingress';

import type { CompositionOperationOutcome } from './composition-edit-transaction';
import type { CompositionOperationFailure } from './composition-operation-preflight';

function expectApplied(outcome: CompositionOperationOutcome): readonly string[] {
	if (outcome.status !== 'applied') {
		throw new Error(`Expected an applied receipt but got ${outcome.code}: ${outcome.message}`);
	}
	return outcome.changed.pointers;
}

function expectFailed(outcome: CompositionOperationOutcome): CompositionOperationFailure {
	if (outcome.status !== 'failed') {
		throw new Error('Expected a failed outcome but the transition edit applied.');
	}
	return outcome;
}

const [firstSlug, secondSlug] = listCompositionTransitionEndpointSlugs();
const [firstEffect] = transitionEffectTypes();

beforeEach(() => {
	transitionState.capturing = false;
	applyPreset(parsePresetIngress(blankPresetJson));
	compositionMeta.isUserComposition = true;
	compositionMeta.userCompositionSlug = 'untitled';
	compositionMeta.forkedFrom = null;
});

describe('transition recipe', () => {
	it('declares the recipe and resolves it for the Workspace', async () => {
		const changed = expectApplied(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: firstEffect,
				durationMs: 1200
			})
		);

		expect(changed).toContain('/transition');
		expect(presetBase.transition).toMatchObject({
			from: firstSlug,
			to: secondSlug,
			durationMs: 1200
		});
		expect(transitionState.active?.effect).toBe(firstEffect);
	});

	it("takes the Effect's own parameter defaults when none are named", async () => {
		expectApplied(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: firstEffect,
				durationMs: 900
			})
		);

		expect(presetBase.transition?.params).toBeDefined();
	});

	it('refuses an endpoint the catalog does not hold, naming the ones it does', async () => {
		const failure = expectFailed(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: 'not-a-composition',
				to: secondSlug,
				effect: firstEffect,
				durationMs: 1200
			})
		);

		expect(failure.code).toBe('unknown_target');
		expect(failure.rejected).toBe('not-a-composition');
		expect(failure.alternatives).toContain(firstSlug);
	});

	it('refuses a transition Effect the registry does not hold', async () => {
		const failure = expectFailed(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: 'cross-dissolve',
				durationMs: 1200
			})
		);

		expect(failure.code).toBe('unsupported_variant');
		expect(failure.alternatives).toContain(firstEffect);
	});

	it('refuses a wipe with no duration', async () => {
		const failure = expectFailed(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: firstEffect,
				durationMs: 0
			})
		);

		expect(failure.code).toBe('invalid_argument');
	});

	it('refuses parameters the Effect rejects, applying nothing', async () => {
		const failure = expectFailed(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: firstEffect,
				durationMs: 1200,
				params: { direction: 'diagonal' }
			})
		);

		expect(failure.code).toBe('schema_invalid');
		expect(presetBase.transition).toBeUndefined();
	});

	it('refuses a transition while the Video track carries clips', async () => {
		engineState.media.videoTrack.clips.push({
			id: 'clip-1',
			assetId: 'asset-1',
			timelineStartFrame: 0,
			durationFrames: 30,
			sourceStartSeconds: 0,
			audio: { enabled: true, gain: 1 }
		});

		const failure = expectFailed(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: firstEffect,
				durationMs: 1200
			})
		);

		expect(failure.code).toBe('precondition_unmet');
		expect(failure.alternatives).toContain('media.remove-video-clip');
	});

	it('removes the recipe and returns to a single-state composition', async () => {
		expectApplied(
			await runSetCompositionTransitionOperation({
				expectedRevision: 0,
				from: firstSlug,
				to: secondSlug,
				effect: firstEffect,
				durationMs: 1200
			})
		);

		expectApplied(await runClearCompositionTransitionOperation({ expectedRevision: 1 }));

		expect(presetBase.transition).toBeUndefined();
		expect(transitionState.active).toBeNull();
	});

	it('refuses clearing a recipe the composition never carried', async () => {
		const failure = expectFailed(
			await runClearCompositionTransitionOperation({ expectedRevision: 0 })
		);

		expect(failure.code).toBe('precondition_unmet');
	});
});
