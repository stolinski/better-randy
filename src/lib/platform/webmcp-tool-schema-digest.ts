/**
 * A stable content digest over the WebMCP tool surface a browser actually
 * registered
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md)).
 *
 * The operation inventory says which tools *should* exist, and the parity gate
 * holds it to that. This answers the different question a release seal asks:
 * which tool schemas did the measured page hand an attached agent? Two builds
 * that register the same tool names but changed one argument's schema are not
 * the same authoring surface, so an operation receipt recorded against the older
 * one is stale evidence rather than a smaller version of the same claim.
 *
 * `inputSchema` arrives from the measured Chrome surface as JSON text, so the
 * digest parses it and hashes the parsed value. Hashing the text directly would
 * report the same schema serialized with different key order as a different
 * surface.
 */

import { hashDeterministicRenderValue } from './deterministic-render-registry-fingerprint.ts';

/** One registered tool as the measured Chrome surface reports it. */
export interface WebmcpRegisteredToolDescriptor {
	name: string;
	description: string;
	/** The measured surface hands the schema back as JSON text, not an object. */
	inputSchema: string;
}

/**
 * The schema as a value when it is JSON, and as its exact text when it is not.
 * A surface that hands back something unparseable is still evidence of what it
 * offered, and swallowing that into a digest error would lose it.
 */
function parseWebmcpToolInputSchema(inputSchema: string): unknown {
	try {
		return JSON.parse(inputSchema);
	} catch {
		return inputSchema;
	}
}

export async function hashWebmcpToolSchemaSurface(
	tools: readonly WebmcpRegisteredToolDescriptor[]
): Promise<string> {
	if (tools.length === 0) {
		throw new TypeError('A WebMCP tool schema surface must register at least one tool');
	}
	const names = tools.map((tool) => tool.name);
	if (new Set(names).size !== names.length) {
		throw new TypeError('A WebMCP tool schema surface registered the same tool name twice');
	}
	return hashDeterministicRenderValue(
		[...tools]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: parseWebmcpToolInputSchema(tool.inputSchema)
			}))
	);
}
