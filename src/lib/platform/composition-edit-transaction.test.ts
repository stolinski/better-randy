import { beforeEach, describe, expect, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { compositionAutosaveInvalidation } from './composition-autosave-invalidation.svelte';
import { compositionEditHistory } from './composition-edit-history';
import {
	CompositionOperationError,
	runCompositionEditTransaction,
	runCompositionHistoryTransaction,
	type CompositionEditTransactionRequest,
	type CompositionOperationOutcome,
	type CompositionOperationReceipt
} from './composition-edit-transaction';
import type { CompositionOperationFailure } from './composition-operation-preflight';
import { ACCEPTED_COMPOSITION_SCHEMA_IDS } from '../utils/legacy-supers-compatibility';
import { engineState, packState, transitionState } from './engine-state.svelte';
import { hashStringToUnitInterval } from '../utils/seeded';
import { layerSelection } from './selection.svelte';
import { parsePresetIngress } from './preset-ingress';
import { PRESET_SCHEMA_ID } from './engine-schema';
import { applyPreset } from './preset';
import { presetBase } from './preset-base.svelte';
import { presetToWireFormat, serializeCompositionState } from './preset-pure';
import { WEBMCP_RESULT_CHARACTER_BUDGET } from './webmcp-operation-inventory';

const DEMO_VIDEO_URL = `/api/user-assets/${'a'.repeat(64)}.mp4`;

/** The accepted composition schema id that is not the one writers emit (ADR-0053). */
const LEGACY_COMPOSITION_SCHEMA_ID = ACCEPTED_COMPOSITION_SCHEMA_IDS.find(
	(id) => id !== PRESET_SCHEMA_ID
);

function snapshotOpenComposition(): string {
	return JSON.stringify(
		presetToWireFormat(serializeCompositionState(presetBase, engineState, packState.slug))
	);
}

function expectApplied(outcome: CompositionOperationOutcome): CompositionOperationReceipt {
	if (outcome.status !== 'applied') {
		throw new Error(`Expected an applied receipt but got ${outcome.code}: ${outcome.message}`);
	}
	return outcome;
}

function expectFailed(outcome: CompositionOperationOutcome): CompositionOperationFailure {
	if (outcome.status !== 'failed') {
		throw new Error('Expected a failed outcome but the transaction applied.');
	}
	return outcome;
}

function renameRequest(
	name: string,
	expectedRevision = compositionEditHistory.revision
): CompositionEditTransactionRequest {
	return {
		operationId: 'composition.set-identity',
		expectedRevision,
		undoLabel: 'Set composition name',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.name = name;
		}
	};
}

function orientationRequest(
	orientation: 'horizontal' | 'vertical'
): CompositionEditTransactionRequest {
	return {
		operationId: 'transport.set-orientation',
		expectedRevision: compositionEditHistory.revision,
		undoLabel: 'Set orientation',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.state.transport.orientation = orientation;
		}
	};
}

beforeEach(() => {
	transitionState.capturing = false;
	applyPreset(parsePresetIngress(blankPresetJson));
});

describe('composition edit transaction success', () => {
	it('applies the edit, advances the revision, and reports exactly what moved', async () => {
		const invalidationsBefore = compositionAutosaveInvalidation.revision;

		const receipt = expectApplied(await runCompositionEditTransaction(renameRequest('Renamed')));

		expect(receipt.operationId).toBe('composition.set-identity');
		expect(receipt.revision).toBe(1);
		expect(receipt.changed).toEqual({ pointers: ['/name'], total: 1, truncated: false });
		expect(receipt.undoLabel).toBe('Set composition name');
		expect(receipt.focus).toEqual({ target: 'composition-root' });
		expect(presetBase.name).toBe('Renamed');
		expect(compositionEditHistory.revision).toBe(1);
		expect(compositionEditHistory.undoLabel).toBe('Set composition name');
		expect(compositionAutosaveInvalidation.revision).toBe(invalidationsBefore + 1);
	});

	it('moves the visible Workspace focus to the entity it touched', async () => {
		expectApplied(
			await runCompositionEditTransaction({
				operationId: 'layer.add-overlay',
				expectedRevision: 0,
				undoLabel: 'Add Overlay',
				focus: { target: 'overlay', overlayId: 'headline' },
				mutate: (draft) => {
					draft.state.overlays.push({
						type: 'lower-third',
						id: 'headline',
						content: { title: 'Headline' },
						position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.08 } }
					});
				}
			})
		);

		expect(engineState.overlays.map((entry) => entry.id)).toEqual(['headline']);
		expect(layerSelection.id).toBe('overlay:headline');
	});

	it('records no history and holds the revision when the edit changes nothing', async () => {
		const receipt = expectApplied(
			// The blank composition is already named "Blank", so this write is
			// idempotent: a real operation, no change to the document.
			await runCompositionEditTransaction(renameRequest('Blank'))
		);

		expect(receipt.changed.total).toBe(0);
		expect(receipt.undoLabel).toBeNull();
		expect(receipt.revision).toBe(0);
		expect(compositionEditHistory.canUndo).toBe(false);
	});

	it('reflows a composition loaded from a Legacy Supers document and writes the GFX id', async () => {
		expect(LEGACY_COMPOSITION_SCHEMA_ID).toBeDefined();
		applyPreset(parsePresetIngress({ ...blankPresetJson, schema: LEGACY_COMPOSITION_SCHEMA_ID }));

		const receipt = expectApplied(
			await runCompositionEditTransaction(orientationRequest('vertical'))
		);

		expect(receipt.changed.pointers).toEqual(['/state/transport/orientation']);
		expect(engineState.transport.orientation).toBe('vertical');
		expect(serializeCompositionState(presetBase, engineState, packState.slug).schema).toBe(
			PRESET_SCHEMA_ID
		);
	});

	it('re-dresses the piece when the Pack changes, without touching composition content', async () => {
		const receipt = expectApplied(
			await runCompositionEditTransaction({
				operationId: 'appearance.set-pack',
				expectedRevision: 0,
				undoLabel: 'Set Pack',
				focus: { target: 'composition-root' },
				mutate: (draft) => {
					draft.pack = 'clean-light';
				}
			})
		);

		expect(receipt.changed.pointers).toEqual(['/pack']);
		expect(packState.slug).toBe('clean-light');
		expect(engineState.surface.type).toBe('plain');
	});
});

describe('composition edit transaction refusals', () => {
	it('refuses a stale revision, names what moved, and applies nothing', async () => {
		expectApplied(await runCompositionEditTransaction(renameRequest('First')));
		const before = snapshotOpenComposition();

		const failure = expectFailed(await runCompositionEditTransaction(renameRequest('Second', 0)));

		expect(failure.code).toBe('stale_revision');
		expect(failure.revision).toBe(1);
		expect(failure.alternatives).toEqual(['1']);
		expect(failure.movedSince).toEqual(['Set composition name']);
		expect(snapshotOpenComposition()).toBe(before);
		expect(presetBase.name).toBe('First');
	});

	it('refuses a revision that is not a non-negative integer', async () => {
		const failure = expectFailed(await runCompositionEditTransaction(renameRequest('Renamed', -1)));

		expect(failure.code).toBe('invalid_argument');
		expect(failure.rejected).toBe('-1');
	});

	it('returns the corrective refusal an operation raises and rolls the draft away', async () => {
		const before = snapshotOpenComposition();

		const failure = expectFailed(
			await runCompositionEditTransaction({
				...renameRequest('Renamed'),
				mutate: () => {
					throw new CompositionOperationError(
						'unsupported_variant',
						'Surface "diagram" declares no variant "isometric".',
						{ rejected: 'isometric', alternatives: ['flat', 'stacked'] }
					);
				}
			})
		);

		expect(failure.code).toBe('unsupported_variant');
		expect(failure.rejected).toBe('isometric');
		expect(failure.alternatives).toEqual(['flat', 'stacked']);
		expect(failure.revision).toBe(0);
		expect(snapshotOpenComposition()).toBe(before);
	});

	it('refuses a draft the schema rejects and leaves the composition byte-identical', async () => {
		const before = snapshotOpenComposition();

		const failure = expectFailed(
			await runCompositionEditTransaction({
				operationId: 'transport.set-timing',
				expectedRevision: 0,
				undoLabel: 'Set timing',
				focus: { target: 'composition-root' },
				mutate: (draft) => {
					draft.state.transport.durationSeconds = 0;
				}
			})
		);

		expect(failure.code).toBe('schema_invalid');
		expect(failure.findings.total).toBeGreaterThan(0);
		expect(failure.findings.findings[0].source).toBe('schema');
		expect(failure.findings.findings[0].path).toBe('/state/transport/durationSeconds');
		expect(snapshotOpenComposition()).toBe(before);
		expect(compositionEditHistory.revision).toBe(0);
	});

	it('refuses a draft the engine could not load and leaves the composition byte-identical', async () => {
		const before = snapshotOpenComposition();

		const failure = expectFailed(
			await runCompositionEditTransaction({
				operationId: 'appearance.set-pack',
				expectedRevision: 0,
				undoLabel: 'Set Pack',
				focus: { target: 'composition-root' },
				mutate: (draft) => {
					draft.pack = 'not-a-registered-pack';
				}
			})
		);

		expect(failure.code).toBe('semantic_invalid');
		expect(failure.findings.findings[0].source).toBe('semantic');
		expect(failure.findings.findings[0].path).toBe('/pack');
		expect(snapshotOpenComposition()).toBe(before);
		expect(packState.slug).toBe('syntax');
	});

	it('refuses every transaction while the transition snapshot path owns engine state', async () => {
		transitionState.capturing = true;

		const failure = expectFailed(await runCompositionEditTransaction(renameRequest('Renamed')));

		expect(failure.code).toBe('precondition_unmet');
		expect(presetBase.name).toBe('Blank');
	});

	it('lets an unexpected defect propagate with the composition untouched', async () => {
		const before = snapshotOpenComposition();

		await expect(
			runCompositionEditTransaction({
				...renameRequest('Renamed'),
				mutate: () => {
					throw new Error('Operation implementation defect');
				}
			})
		).rejects.toThrow('Operation implementation defect');

		expect(snapshotOpenComposition()).toBe(before);
		expect(compositionEditHistory.revision).toBe(0);
	});
});

describe('composition edit transaction identity', () => {
	it('rejects an operation the inventory does not declare', async () => {
		await expect(
			runCompositionEditTransaction({
				...renameRequest('Renamed'),
				operationId: 'composition.rename'
			})
		).rejects.toThrow(TypeError);
	});

	it('rejects an operation whose effect is not a write', async () => {
		await expect(
			runCompositionEditTransaction({
				...renameRequest('Renamed'),
				operationId: 'composition.inspect'
			})
		).rejects.toThrow(/is a read operation/);
	});

	it('rejects a focus that disagrees with the operation row', async () => {
		await expect(
			runCompositionEditTransaction({ ...renameRequest('Renamed'), focus: { target: 'surface' } })
		).rejects.toThrow(/disagrees with the composition.set-identity row/);
	});

	it('rejects an undo label an author could not read in the history', async () => {
		await expect(
			runCompositionEditTransaction({ ...renameRequest('Renamed'), undoLabel: '  ' })
		).rejects.toThrow(/non-empty undo label/);
	});

	it('rejects a write that reached into another family subtree', async () => {
		const before = snapshotOpenComposition();

		await expect(
			runCompositionEditTransaction({
				...orientationRequest('vertical'),
				mutate: (draft) => {
					draft.state.transport.orientation = 'vertical';
					draft.name = 'Renamed by the wrong family';
				}
			})
		).rejects.toThrow(/wrote outside its family/);

		expect(snapshotOpenComposition()).toBe(before);
	});
});

describe('composition edit transaction cancellation', () => {
	function addLibraryEntryRequest(signal: AbortSignal): CompositionEditTransactionRequest {
		return {
			operationId: 'media.add-library-entry',
			expectedRevision: compositionEditHistory.revision,
			undoLabel: 'Add media library entry',
			focus: { target: 'media-library' },
			signal,
			mutate: (draft) => {
				draft.state.media.assets.push({
					id: 'demo-asset',
					kind: 'video',
					name: 'Demo clip',
					assetUrl: DEMO_VIDEO_URL
				});
			}
		};
	}

	it('never starts an operation whose signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		let mutated = false;

		const failure = expectFailed(
			await runCompositionEditTransaction({
				...addLibraryEntryRequest(controller.signal),
				mutate: () => {
					mutated = true;
				}
			})
		);

		expect(failure.code).toBe('cancelled');
		expect(mutated).toBe(false);
	});

	it('discards a cancelled draft instead of half-applying it', async () => {
		const controller = new AbortController();
		const before = snapshotOpenComposition();

		const failure = expectFailed(
			await runCompositionEditTransaction({
				...addLibraryEntryRequest(controller.signal),
				mutate: (draft) => {
					controller.abort();
					draft.state.media.assets.push({
						id: 'demo-asset',
						kind: 'video',
						name: 'Demo clip',
						assetUrl: DEMO_VIDEO_URL
					});
				}
			})
		);

		expect(failure.code).toBe('cancelled');
		expect(engineState.media.assets).toEqual([]);
		expect(snapshotOpenComposition()).toBe(before);
		expect(compositionEditHistory.revision).toBe(0);
	});

	it('refuses a cancellation signal on an operation the inventory does not mark cancellable', async () => {
		await expect(
			runCompositionEditTransaction({
				...renameRequest('Renamed'),
				signal: new AbortController().signal
			})
		).rejects.toThrow(/does not mark cancellable/);
	});
});

describe('composition history transaction', () => {
	it('undoes and redoes the shared history, advancing the revision each way', async () => {
		expectApplied(await runCompositionEditTransaction(renameRequest('Renamed')));

		const undone = expectApplied(runCompositionHistoryTransaction('undo', 1));
		expect(undone.operationId).toBe('composition.undo');
		expect(undone.revision).toBe(2);
		expect(undone.undoLabel).toBeNull();
		expect(undone.changed.pointers).toEqual(['/name']);
		expect(presetBase.name).toBe('Blank');

		const redone = expectApplied(runCompositionHistoryTransaction('redo', 2));
		expect(redone.revision).toBe(3);
		expect(presetBase.name).toBe('Renamed');
	});

	it('undoes the most recent edit whoever made it', async () => {
		compositionEditHistory.recordApplied({
			label: 'Drag Overlay',
			undo: () => {
				engineState.transport.durationSeconds = 6;
			},
			redo: () => {
				engineState.transport.durationSeconds = 9;
			}
		});
		engineState.transport.durationSeconds = 9;

		expectApplied(runCompositionHistoryTransaction('undo', 1));

		expect(engineState.transport.durationSeconds).toBe(6);
	});

	it('refuses to undo a history that holds nothing', () => {
		const failure = expectFailed(runCompositionHistoryTransaction('undo', 0));

		expect(failure.code).toBe('precondition_unmet');
		expect(failure.revision).toBe(0);
	});

	it('refuses a stale revision before replaying anything', async () => {
		expectApplied(await runCompositionEditTransaction(renameRequest('Renamed')));

		const failure = expectFailed(runCompositionHistoryTransaction('undo', 0));

		expect(failure.code).toBe('stale_revision');
		expect(presetBase.name).toBe('Renamed');
		expect(compositionEditHistory.revision).toBe(1);
	});
});

describe('composition operation receipt budget', () => {
	it('keeps a receipt for a wide edit inside the WebMCP result budget', async () => {
		const filler = 'A readable line of composition copy that an author actually wrote. '.repeat(4);

		const receipt = expectApplied(
			await runCompositionEditTransaction({
				operationId: 'content.set-surface-content',
				expectedRevision: 0,
				undoLabel: 'Set surface content',
				focus: { target: 'surface' },
				mutate: (draft) => {
					draft.state.surface.content = {
						...draft.state.surface.content,
						title: filler,
						kicker: filler,
						counterpoint: filler,
						source: filler,
						sourceUrl: filler,
						author: filler,
						affiliation: filler,
						bodyLabel: filler,
						dateLabel: filler,
						avatarUrl: filler,
						imageUrl: filler,
						logoUrl: filler,
						items: [{ text: filler, checked: false }]
					};
				}
			})
		);

		expect(receipt.changed.total).toBeGreaterThan(receipt.changed.pointers.length);
		expect(receipt.changed.truncated).toBe(true);
		expect(JSON.stringify(receipt).length).toBeLessThanOrEqual(WEBMCP_RESULT_CHARACTER_BUDGET);
	});
});

describe('composition edit transaction invariants', () => {
	const ACTIONS = ['rename', 'orient', 'stale', 'invalid', 'undo', 'redo'] as const;

	function chooseAction(step: number): (typeof ACTIONS)[number] {
		const index = Math.floor(hashStringToUnitInterval(`transaction-step-${step}`) * ACTIONS.length);
		return ACTIONS[Math.min(index, ACTIONS.length - 1)];
	}

	it('never leaves a partial edit behind across a randomized authoring session', async () => {
		let highestRevision = compositionEditHistory.revision;

		for (let step = 0; step < 48; step += 1) {
			const action = chooseAction(step);
			const before = snapshotOpenComposition();
			const revisionBefore = compositionEditHistory.revision;

			let outcome: CompositionOperationOutcome;
			if (action === 'rename') {
				outcome = await runCompositionEditTransaction(renameRequest(`Name ${step}`));
			} else if (action === 'orient') {
				outcome = await runCompositionEditTransaction(
					orientationRequest(step % 2 === 0 ? 'vertical' : 'horizontal')
				);
			} else if (action === 'stale') {
				outcome = await runCompositionEditTransaction(
					renameRequest(`Stale ${step}`, revisionBefore + 7)
				);
			} else if (action === 'invalid') {
				outcome = await runCompositionEditTransaction({
					operationId: 'transport.set-timing',
					expectedRevision: revisionBefore,
					undoLabel: 'Set timing',
					focus: { target: 'composition-root' },
					mutate: (draft) => {
						draft.state.transport.durationSeconds = -1;
					}
				});
			} else {
				outcome = runCompositionHistoryTransaction(action, revisionBefore);
			}

			expect(compositionEditHistory.revision).toBeGreaterThanOrEqual(highestRevision);
			highestRevision = compositionEditHistory.revision;

			if (outcome.status === 'failed') {
				expect(snapshotOpenComposition(), `${action} at step ${step} mutated the composition`).toBe(
					before
				);
				expect(compositionEditHistory.revision).toBe(revisionBefore);
				continue;
			}

			expect(outcome.revision).toBe(compositionEditHistory.revision);
			expect(() =>
				parsePresetIngress(
					presetToWireFormat(serializeCompositionState(presetBase, engineState, packState.slug))
				)
			).not.toThrow();
		}
	});
});
