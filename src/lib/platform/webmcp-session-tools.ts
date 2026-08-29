/**
 * The `session` family's WebMCP tools: what this browser session holds, and how
 * it is emptied
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2,
 * [ADR-0053](../../../docs/adr/0053-gfx-namespace-and-legacy-supers-compatibility.md)).
 *
 * A Public demo session is browser-scoped and holds no account, so a deletion
 * here is final: there is no origin-side copy to restore from. That is why
 * `gfx_session_clear` takes an explicit confirmation rather than inferring one
 * from the call, and why deleting a single composition takes the revision the
 * caller observed.
 *
 * Both destructive tools appear only once the session holds something, so a
 * caller on an empty session is never offered a way to empty it further.
 */
import {
	readWebmcpBooleanArgument,
	readWebmcpObservedRevisionArgument,
	readWebmcpStringArgument,
	runWebmcpToolOperation
} from './webmcp-tool-arguments';
import {
	runClearCompositionSessionOperation,
	runDeleteSessionCompositionOperation,
	runInspectCompositionSessionOperation
} from './composition-session-operations';
import {
	webmcpObservedRevisionProperty,
	WEBMCP_NO_ARGUMENTS_SCHEMA
} from './webmcp-derived-tool-schemas';

import type { WebmcpToolDefinition } from './webmcp-tool-controller';

export function listWebmcpSessionToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'session.inspect',
			inputSchema: WEBMCP_NO_ARGUMENTS_SCHEMA,
			run: () => runInspectCompositionSessionOperation()
		},
		{
			operationId: 'session.delete-composition',
			inputSchema: {
				type: 'object',
				properties: {
					slug: {
						type: 'string',
						description: 'Which composition in this browser session to delete permanently.',
						minLength: 1
					},
					expectedRevision: webmcpObservedRevisionProperty()
				},
				required: ['slug', 'expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('session.delete-composition', () =>
					runDeleteSessionCompositionOperation({
						slug: readWebmcpStringArgument(args, 'slug'),
						expectedRevision: readWebmcpObservedRevisionArgument(args)
					})
				)
		},
		{
			operationId: 'session.clear',
			inputSchema: {
				type: 'object',
				properties: {
					confirmed: {
						type: 'boolean',
						description:
							'Must be true. Every composition in this browser session is deleted and nothing was kept elsewhere.'
					}
				},
				required: ['confirmed'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('session.clear', () =>
					runClearCompositionSessionOperation({
						confirmed: readWebmcpBooleanArgument(args, 'confirmed')
					})
				)
		}
	];
}
