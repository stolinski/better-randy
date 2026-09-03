/**
 * The `transport` family's WebMCP tools: how the piece is framed and how it is
 * classified on output
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Orientation, time, rate, and format decide what leaves the engine. The
 * background fill decides what the piece *is*: declaring one makes it a
 * full-frame segment, and omitting it on this tool removes it, returning a
 * transparent overlay. `fill` is the only thing that tool sets, so leaving it
 * out can mean nothing else.
 *
 * The Pack is deliberately not here. A Pack is appearance only
 * ([ADR-0023](../../../docs/adr/0023-pack-is-appearance-only.md)), so
 * `gfx_appearance_set_pack` owns it even though switching one changes how a
 * full-frame piece looks.
 */
import { availableCompositionExportFormats } from './composition-export-formats';
import {
	COMPOSITION_ORIENTATIONS,
	PACK_BACKGROUND_FILL,
	runSetCompositionBackgroundOperation,
	runSetCompositionFormatOperation,
	runSetCompositionOrientationOperation,
	runSetCompositionTimingOperation
} from './composition-transport-operations';
import {
	readWebmcpClearableNumberArgument,
	readWebmcpLiteralArgument,
	readWebmcpObservedRevisionArgument,
	readWebmcpOptionalNumberArgument,
	readWebmcpOptionalStringArgument,
	runWebmcpToolOperation
} from './webmcp-tool-arguments';
import {
	webmcpClearableNumberProperty,
	webmcpDerivedEnumProperty,
	webmcpObservedRevisionProperty,
	webmcpTransportRateProperty
} from './webmcp-derived-tool-schemas';

import type { WebmcpToolDefinition } from './webmcp-tool-controller';

export function listWebmcpTransportToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'transport.set-orientation',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					orientation: webmcpDerivedEnumProperty(
						'delivery-orientation',
						'The frame this piece delivers in. Authored geometry reflows; it is never clamped.'
					)
				},
				required: ['expectedRevision', 'orientation'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('transport.set-orientation', () =>
					runSetCompositionOrientationOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						orientation: readWebmcpLiteralArgument(args, 'orientation', COMPOSITION_ORIENTATIONS)
					})
				)
		},
		{
			operationId: 'transport.set-timing',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					durationSeconds: {
						type: 'number',
						description: 'How long the piece runs, in seconds.',
						minimum: 0
					},
					fps: webmcpTransportRateProperty(
						'The delivery rate. Every frame computation resolves it to an exact rational.'
					),
					posterSeconds: webmcpClearableNumberProperty(
						'The frame the library poster is rendered from, in seconds. Null clears it, so the poster frame is chosen by content again.',
						{ minimum: 0 }
					)
				},
				required: ['expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('transport.set-timing', () =>
					runSetCompositionTimingOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						durationSeconds: readWebmcpOptionalNumberArgument(args, 'durationSeconds'),
						fps: readWebmcpOptionalNumberArgument(args, 'fps'),
						posterSeconds: readWebmcpClearableNumberArgument(args, 'posterSeconds')
					})
				)
		},
		{
			operationId: 'transport.set-format',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					format: webmcpDerivedEnumProperty('export-format', 'The format this piece encodes to.')
				},
				required: ['expectedRevision', 'format'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('transport.set-format', () =>
					runSetCompositionFormatOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						format: readWebmcpLiteralArgument(args, 'format', availableCompositionExportFormats())
					})
				)
		},
		{
			operationId: 'transport.set-background',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					fill: {
						type: 'string',
						description: `A #RRGGBB hex, or "${PACK_BACKGROUND_FILL}" to take the active Pack's field. Omit it to remove the fill and return a transparent overlay.`,
						minLength: 1
					}
				},
				required: ['expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('transport.set-background', () =>
					runSetCompositionBackgroundOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						fill: readWebmcpOptionalStringArgument(args, 'fill') ?? null
					})
				)
		}
	];
}
