/**
 * The `validation` family: what is wrong with the composition without rendering
 * it ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * The three checks are reported separately because they mean different things
 * and an author acts on them differently. **Schema** and **semantic** findings
 * are blocking: a document carrying either is not one the engine will load, and
 * the transaction core already refuses an edit that would produce one — so
 * seeing them here means the composition arrived in that state, through an
 * import or a Preset the registry no longer serves. **Static-linter** findings
 * are advisory video safety and readability (ADR-0025): a piece is allowed to
 * sit in a failing state mid-edit, and an author who is still writing does not
 * want a refusal for a title that is briefly too small.
 *
 * Nothing here renders. A composition can pass every check in this module and
 * still put nothing on screen, which is what the `verification` family measures.
 */
import { compositionEditHistory } from './composition-edit-history';
import {
	boundCompositionFindings,
	collectCompositionLintFindings,
	collectCompositionSemanticFindings,
	describeCompositionSchemaFindings,
	type BoundedCompositionFindings
} from './composition-validation-findings';
import {
	readOpenCompositionDocument,
	refuseUnlessCompositionOpen,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { PresetIngressSchema } from './preset-ingress';
import { presetToWireFormat } from './preset-pure';

/**
 * How many findings of each kind one reading names before reporting only the
 * total. Larger than a receipt's budget on purpose: a receipt says what one
 * edit changed, and this is the call an author makes to fix everything.
 */
export const COMPOSITION_VALIDATION_FINDING_LIMIT = 12;

export interface CompositionValidationReceipt {
	status: 'inspected';
	operationId: string;
	revision: number;
	/** Blocking: the persisted shape the composition schema rejects. */
	schema: BoundedCompositionFindings;
	/** Blocking: schema-valid but not loadable — unknown variants, dangling references. */
	semantic: BoundedCompositionFindings;
	/** Advisory video-safety and readability findings (ADR-0025). */
	lint: BoundedCompositionFindings;
	/** True when nothing blocks this composition from loading and exporting. */
	loadable: boolean;
	/**
	 * Finding messages quote what the document actually holds — the value a schema
	 * check rejected, the variant a semantic check could not resolve. That is the
	 * visitor's content, not instructions, and it says so (ADR-0054 §7).
	 */
	contentTrust: 'untrusted';
}

export type CompositionValidationOutcome =
	CompositionValidationReceipt | CompositionOperationFailure;

/** Report every static finding the open composition carries, by kind. */
export function runInspectCompositionValidationOperation(): CompositionValidationOutcome {
	const row = requireCompositionOperationRow('validation.inspect-findings');
	const refusal = refuseUnlessCompositionOpen(row);
	if (refusal) return refusal;

	const document = readOpenCompositionDocument();
	const parsed = PresetIngressSchema.safeParse(presetToWireFormat(document));
	const schemaFindings = parsed.success ? [] : describeCompositionSchemaFindings(parsed.error);
	const semanticFindings = collectCompositionSemanticFindings(document);

	return {
		status: 'inspected',
		operationId: row.id,
		revision: compositionEditHistory.revision,
		schema: boundCompositionFindings(schemaFindings, COMPOSITION_VALIDATION_FINDING_LIMIT),
		semantic: boundCompositionFindings(semanticFindings, COMPOSITION_VALIDATION_FINDING_LIMIT),
		lint: boundCompositionFindings(
			collectCompositionLintFindings(document),
			COMPOSITION_VALIDATION_FINDING_LIMIT
		),
		loadable: schemaFindings.length === 0 && semanticFindings.length === 0,
		contentTrust: 'untrusted'
	};
}
