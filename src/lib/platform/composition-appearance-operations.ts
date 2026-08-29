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
	readOpenCompositionDocument,
	refuseCompositionOperation,
	refuseUnlessCompositionEditable,
	requireCompositionOperationRow
} from './composition-operation-preflight';
import { compositionEditHistory } from './composition-edit-history';
import { refuseUnloadableCompositionRenderers } from './composition-renderer-readiness';
import { PACK_REGISTRY } from './packs/registry';
import {
	runCompositionEditTransaction,
	type CompositionOperationOutcome
} from './composition-edit-transaction';

export interface SetCompositionPackRequest {
	expectedRevision: number;
	packSlug: string;
}

/** The Packs a composition can bind to, derived from the live registry. */
export function listRegisteredPackSlugs(): readonly string[] {
	return Object.keys(PACK_REGISTRY);
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

	// A Pack's chrome contributes Effects to a full-frame piece, so switching
	// Packs can require renderers the current bundle has never loaded. Resolving
	// the prospective document first is what keeps a re-dress from producing a
	// frame missing its chrome.
	const rendererRefusal = await refuseUnloadableCompositionRenderers(
		row,
		{ ...readOpenCompositionDocument(), pack: request.packSlug },
		`the ${request.packSlug} Pack`
	);
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
