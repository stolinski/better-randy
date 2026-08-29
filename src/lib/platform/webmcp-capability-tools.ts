/**
 * The `capability` family's WebMCP tools: the two an agent can call before
 * anything exists
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2, §5).
 *
 * Discovery has to come first, because everything else takes an argument drawn
 * from a registry. An agent asks which Surfaces this build ships, then sets one;
 * it asks what the duration ceiling is, then authors inside it. Both tools are
 * registered on a cold page for exactly that reason.
 *
 * The section argument is the vocabulary record's own keys, so a registry this
 * engine gains is a section this tool offers on the next load without anyone
 * editing a list.
 */
import {
	readWebmcpVocabularySections,
	WEBMCP_NO_ARGUMENTS_SCHEMA
} from './webmcp-derived-tool-schemas';
import { readWebmcpLiteralArgument, runWebmcpToolOperation } from './webmcp-tool-arguments';
import {
	runInspectCapabilityLimitsOperation,
	runInspectCapabilityVocabularyOperation
} from './composition-capability-operations';

import type { WebmcpToolDefinition } from './webmcp-tool-controller';

export function listWebmcpCapabilityToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'capability.inspect-vocabulary',
			inputSchema: {
				type: 'object',
				properties: {
					section: {
						type: 'string',
						description: 'Which registered vocabulary to list. One section per call.',
						enum: readWebmcpVocabularySections()
					}
				},
				required: ['section'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('capability.inspect-vocabulary', () =>
					runInspectCapabilityVocabularyOperation({
						section: readWebmcpLiteralArgument(args, 'section', readWebmcpVocabularySections())
					})
				)
		},
		{
			operationId: 'capability.inspect-limits',
			inputSchema: WEBMCP_NO_ARGUMENTS_SCHEMA,
			run: async () => runInspectCapabilityLimitsOperation()
		}
	];
}
