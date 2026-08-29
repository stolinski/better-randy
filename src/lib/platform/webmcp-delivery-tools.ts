/**
 * The `delivery` family's WebMCP tool: turning the composition into a file the
 * visitor receives
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2, §7).
 *
 * One tool, and its only argument is the revision it ships. Every supported
 * format is reachable through it because the format is not an argument here at
 * all — `gfx_transport_set_format` decides it, along with the orientation, rate,
 * and background fill that classify the output. An agent that wants ProRes sets
 * the format and then calls this; a format argument would let a call ship a file
 * whose own document disagrees with its filename and alpha lane.
 *
 * The registration's `AbortSignal` is handed straight to the export, so a caller
 * that walks away stops the render, the encode, and the download together. The
 * receipt is issued only for an export that really delivered: a cancelled run
 * answers `cancelled`, a failed encode answers `export_failed`, and neither one
 * names a file.
 */
import { runExportCompositionVideoOperation } from './composition-delivery-operations';
import {
	readWebmcpObservedRevisionArgument,
	runWebmcpToolOperation
} from './webmcp-tool-arguments';
import { webmcpObservedRevisionOnlySchema } from './webmcp-derived-tool-schemas';

import type { WebmcpToolDefinition } from './webmcp-tool-controller';

export function listWebmcpDeliveryToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'delivery.export-video',
			inputSchema: webmcpObservedRevisionOnlySchema(),
			run: (args, signal) =>
				runWebmcpToolOperation('delivery.export-video', () =>
					runExportCompositionVideoOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						signal
					})
				)
		}
	];
}
