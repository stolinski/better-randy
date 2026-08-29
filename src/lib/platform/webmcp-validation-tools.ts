/**
 * The `validation` family's WebMCP tool: what is wrong with the composition
 * without rendering it
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2, §7).
 *
 * This is the call an agent makes to repair a piece, so it takes no arguments
 * and no revision: it reports the state of whatever is open right now, and
 * reading cannot be written against a stale version of anything. The three kinds
 * of finding arrive separately because an author acts on them differently —
 * schema and semantic findings block loading, static-linter findings are
 * advisory video safety — and the operation says which is which rather than
 * flattening them into one list an agent would have to rank for itself.
 *
 * The findings themselves carry the visitor's own words: a schema message quotes
 * the value it rejected, a semantic message names the variant the document
 * asked for. So the receipt is annotated `contentTrust: 'untrusted'` and the
 * tool description says so, because a caption that reads like an instruction is
 * still a caption.
 */
import { runInspectCompositionValidationOperation } from './composition-validation-operations';
import { WEBMCP_NO_ARGUMENTS_SCHEMA } from './webmcp-derived-tool-schemas';

import type { WebmcpToolDefinition } from './webmcp-tool-controller';

export function listWebmcpValidationToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'validation.inspect-findings',
			inputSchema: WEBMCP_NO_ARGUMENTS_SCHEMA,
			run: async () => runInspectCompositionValidationOperation()
		}
	];
}
