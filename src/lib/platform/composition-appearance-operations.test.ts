import { beforeEach, describe, expect, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { compositionMeta } from './composition-meta.svelte';
import { engineState, packState, transitionState } from './engine-state.svelte';
import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
import { runSetCompositionBackgroundOperation } from './composition-transport-operations';
import { runSetCompositionPackOperation } from './composition-appearance-operations';
import { applyPreset } from './preset';
import { getPack } from './packs/registry';
import { parsePresetIngress } from './preset-ingress';

import type { CompositionOperationOutcome } from './composition-edit-transaction';
import type { CompositionOperationFailure } from './composition-operation-preflight';

/** The registered Pack whose chrome contributes Effects to a full-frame piece. */
const CHROME_PACK_SLUG = 'crt-terminal';

function expectApplied(outcome: CompositionOperationOutcome): readonly string[] {
	if (outcome.status !== 'applied') {
		throw new Error(`Expected an applied receipt but got ${outcome.code}: ${outcome.message}`);
	}
	return outcome.changed.pointers;
}

function expectFailed(outcome: CompositionOperationOutcome): CompositionOperationFailure {
	if (outcome.status !== 'failed') {
		throw new Error('Expected a failed outcome but the Pack edit applied.');
	}
	return outcome;
}

function chromeEffectTypes(slug: string): string[] {
	const chrome = getPack(slug).roles.chrome;
	return chrome?.kind === 'chrome' ? chrome.effects.map((effect) => effect.type) : [];
}

beforeEach(() => {
	transitionState.capturing = false;
	applyPreset(parsePresetIngress(blankPresetJson));
	compositionMeta.isUserComposition = true;
	compositionMeta.userCompositionSlug = 'untitled';
	compositionMeta.forkedFrom = null;
});

describe('composition Pack', () => {
	it('re-dresses the piece without touching composition content', async () => {
		const changed = expectApplied(
			await runSetCompositionPackOperation({ expectedRevision: 0, packSlug: 'clean-light' })
		);

		expect(changed).toEqual(['/pack']);
		expect(packState.slug).toBe('clean-light');
		expect(engineState.surface.type).toBe('plain');
		expect(engineState.surface.content).toEqual(
			parsePresetIngress(blankPresetJson).state.surface.content
		);
	});

	it('loads the Effect renderers a full-frame piece takes from the new Pack chrome', async () => {
		expect(chromeEffectTypes(CHROME_PACK_SLUG).length).toBeGreaterThan(0);
		expectApplied(await runSetCompositionBackgroundOperation({ expectedRevision: 0, fill: 'pack' }));

		expectApplied(
			await runSetCompositionPackOperation({ expectedRevision: 1, packSlug: CHROME_PACK_SLUG })
		);

		for (const type of chromeEffectTypes(CHROME_PACK_SLUG)) {
			expect(pipelineRendererRuntime.current().effects.has(type)).toBe(true);
		}
	});

	it('refuses a Pack the registry does not hold and names the ones it does', async () => {
		const failure = expectFailed(
			await runSetCompositionPackOperation({ expectedRevision: 0, packSlug: 'not-a-pack' })
		);

		expect(failure.code).toBe('unsupported_variant');
		expect(failure.rejected).toBe('not-a-pack');
		expect(failure.alternatives).toContain('syntax');
		expect(packState.slug).toBe('syntax');
	});

	it('refuses a stale revision and leaves the Pack bound where it was', async () => {
		expectApplied(
			await runSetCompositionPackOperation({ expectedRevision: 0, packSlug: 'clean-light' })
		);

		const failure = expectFailed(
			await runSetCompositionPackOperation({ expectedRevision: 0, packSlug: 'editorial-mono' })
		);

		expect(failure.code).toBe('stale_revision');
		expect(packState.slug).toBe('clean-light');
	});
});
