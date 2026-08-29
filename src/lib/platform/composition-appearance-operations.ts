/**
 * The `appearance` family: how the piece looks under its Pack
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Binding a Pack is the whole-composition look decision. It writes `/pack` and
 * nothing else: every Pack-resolved Role re-dresses, and no composition content
 * changes, because a Pack is appearance only (ADR-0023). That is also why the
 * decision sits here rather than in `transport`, which frames and classifies
 * output rather than dressing it.
 */
import {
	refuseCompositionOperation,
	refuseUnlessCompositionEditable,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { compositionEditHistory } from './composition-edit-history';
import { engineState, packState } from './engine-state.svelte';
import { ensureCompositionRenderersLoaded } from './composition-renderer-readiness';
import { PACK_REGISTRY } from './packs/registry';
import { presetBase } from './preset-base.svelte';
import { serializeCompositionState } from './preset-pure';
import {
	runCompositionEditTransaction,
	type CompositionOperationOutcome
} from './composition-edit-transaction';

import type { Preset } from './engine-schema';
import type { WebmcpOperationRow } from './webmcp-operation-inventory';

export interface SetCompositionPackRequest {
	expectedRevision: number;
	packSlug: string;
}

/** The Packs a composition can bind to, derived from the live registry. */
export function listRegisteredPackSlugs(): readonly string[] {
	return Object.keys(PACK_REGISTRY);
}

/**
 * A Pack's chrome contributes Effects to a full-frame piece, so switching Packs
 * can require renderers the current bundle has never loaded. Resolving the
 * prospective document first is what keeps a re-dress from producing a frame
 * missing its chrome.
 */
async function refuseUnloadablePackRenderers(
	row: WebmcpOperationRow,
	packSlug: string
): Promise<CompositionOperationFailure | null> {
	const current = serializeCompositionState(presetBase, engineState, packState.slug);
	const prospective: Preset = { ...current, pack: packSlug };
	try {
		await ensureCompositionRenderersLoaded(prospective);
		return null;
	} catch (cause) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'render_failed',
			`This browser could not load the renderers the ${packSlug} Pack needs: ${
				cause instanceof Error ? cause.message : 'a renderer module failed to load'
			}.`
		);
	}
}

/** Bind the composition to a registered Pack; every Pack-resolved Role re-dresses. */
export async function runSetCompositionPackOperation(
	request: SetCompositionPackRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('appearance.set-pack');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	if (!Object.hasOwn(PACK_REGISTRY, request.packSlug)) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${request.packSlug}" is not a Pack this engine registers.`,
			{ rejected: request.packSlug, alternatives: listRegisteredPackSlugs() }
		);
	}

	const rendererRefusal = await refuseUnloadablePackRenderers(row, request.packSlug);
	if (rendererRefusal) return rendererRefusal;

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Set Pack',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.pack = request.packSlug;
		}
	});
}
