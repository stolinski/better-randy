// The final bidirectional GUI ↔ WebMCP operation parity gate
// (ADR-0054 §1, §2, §5).
//
// Reads the approved operation inventory, maps every row to the GUI component
// that owns the same decision and to the WebMCP tool this build registers for
// it, and rejects the run when any row does not reach both transports its
// exposure promises. Missing, duplicate, and stale claims fail on either side;
// `internal-only` verification promises GUI-only reachability, while the
// non-authoring `agent-context` selector promises agent-only reachability.
//
// The registered tool set and the derived vocabulary are read through Vite
// rather than plain Node, because both resolve `import.meta.glob` over the sound
// and substrate asset directories. Loading them any other way would measure a
// vocabulary the browser never sees, which is the one thing a release digest
// must not do.
//
// Usage: node --experimental-strip-types scripts/audit-webmcp-operation-parity.ts
// Output: the release-acceptance record on stdout, one summary line on stderr;
// exit 1 when any row fails.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

import { collectWebmcpParityEvidence } from './collect-webmcp-parity-evidence.ts';
import { hashObject } from '../src/lib/utils/object.ts';
import { WEBMCP_OPERATION_INVENTORY } from '../src/lib/platform/webmcp-operation-inventory.ts';

import type {
	WebmcpParityEvidence,
	WebmcpParityFinding,
	WebmcpParityReport,
	WebmcpParityRowResolution
} from '../src/lib/platform/webmcp-operation-parity.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** One registered tool, narrowed from the module graph at the trust boundary. */
interface RegisteredToolShape {
	operationId: string;
	inputSchema: unknown;
}

/**
 * The gate's own module reaches its contract through the extensionless
 * specifier the app uses, so it loads through Vite alongside the registries
 * rather than through plain Node resolution.
 */
interface WebmcpParityModule {
	auditWebmcpOperationParity: (evidence: WebmcpParityEvidence) => WebmcpParityReport;
	findWebmcpOneTransportOperations: (
		report: WebmcpParityReport
	) => readonly WebmcpParityRowResolution[];
	formatWebmcpParityFindings: (findings: readonly WebmcpParityFinding[]) => string;
}

function readParityModule(loaded: Record<string, unknown>): WebmcpParityModule {
	for (const name of [
		'auditWebmcpOperationParity',
		'findWebmcpOneTransportOperations',
		'formatWebmcpParityFindings'
	]) {
		if (typeof loaded[name] !== 'function') {
			throw new TypeError(
				`audit-webmcp-operation-parity: webmcp-operation-parity.ts exports no ${name}()`
			);
		}
	}
	return loaded as unknown as WebmcpParityModule;
}

function readRegisteredTools(exported: unknown): readonly RegisteredToolShape[] {
	if (typeof exported !== 'function') {
		throw new TypeError(
			'audit-webmcp-operation-parity: webmcp-tool-definitions.ts exports no listWebmcpToolDefinitions()'
		);
	}
	const definitions: unknown = exported();
	if (!Array.isArray(definitions)) {
		throw new TypeError(
			'audit-webmcp-operation-parity: listWebmcpToolDefinitions() did not return a list'
		);
	}
	return definitions.map((definition) => {
		if (typeof definition !== 'object' || definition === null) {
			throw new TypeError('audit-webmcp-operation-parity: a tool definition is not an object');
		}
		const operationId: unknown = Reflect.get(definition, 'operationId');
		if (typeof operationId !== 'string') {
			throw new TypeError('audit-webmcp-operation-parity: a tool definition names no operation');
		}
		return { operationId, inputSchema: Reflect.get(definition, 'inputSchema') };
	});
}

function readDigestFunction(exported: unknown, name: string): () => unknown {
	if (typeof exported !== 'function') {
		throw new TypeError(`audit-webmcp-operation-parity: ${name} is not exported as a function`);
	}
	return exported as () => unknown;
}

const server = await createServer({
	root: repoRoot,
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'error'
});

let registeredTools: readonly RegisteredToolShape[];
let schemaDigest: string;
let derivedVocabulary: unknown;
let parity: WebmcpParityModule;
try {
	const toolModule = await server.ssrLoadModule('/src/lib/platform/webmcp-tool-definitions.ts');
	registeredTools = readRegisteredTools(toolModule.listWebmcpToolDefinitions);

	const schemaModule = await server.ssrLoadModule(
		'/src/lib/platform/webmcp-derived-tool-schemas.ts'
	);
	const digest: unknown = readDigestFunction(
		schemaModule.readWebmcpSchemaDigest,
		'readWebmcpSchemaDigest'
	)();
	if (typeof digest !== 'string') {
		throw new TypeError(
			'audit-webmcp-operation-parity: readWebmcpSchemaDigest() returned no digest'
		);
	}
	schemaDigest = digest;
	derivedVocabulary = readDigestFunction(
		schemaModule.readWebmcpDerivedEnums,
		'readWebmcpDerivedEnums'
	)();

	parity = readParityModule(
		await server.ssrLoadModule('/src/lib/platform/webmcp-operation-parity.ts')
	);
} finally {
	await server.close();
}

const evidence = await collectWebmcpParityEvidence({
	repoRoot,
	registeredOperationIds: registeredTools.map((tool) => tool.operationId)
});
const report = parity.auditWebmcpOperationParity(evidence);
const oneTransportOnly = parity.findWebmcpOneTransportOperations(report);

// Three digests, so release acceptance can tell which layer moved. The schema
// digest folds the vocabulary into the operation contract and the text budgets;
// the registry digest is the live vocabulary alone, so a Pack or Starter
// addition is visible without reading the contract; the tool digest is the
// registered argument surface, which moves when a tool's schema does even though
// the inventory row did not change.
const digests = {
	schema: schemaDigest,
	registry: hashObject(derivedVocabulary),
	tool: hashObject(
		registeredTools.map((tool) => ({
			operationId: tool.operationId,
			inputSchema: tool.inputSchema
		}))
	)
};

console.log(
	JSON.stringify(
		{
			gate: 'webmcp-operation-parity',
			generatedAt: new Date().toISOString(),
			method:
				'inventory rows resolved against the registered WebMCP tool set (loaded through Vite), the requireCompositionOperationRow call sites in the operation layer, and route-reachability of each declared GUI surface',
			digests,
			counts: {
				rows: report.rows.length,
				sharedAuthoringRows: report.rows.filter((row) => row.exposure === 'agent-tool').length,
				agentContextRows: report.rows.filter((row) => row.exposure === 'agent-context').length,
				internalOnlyRows: report.rows.filter((row) => row.exposure === 'internal-only').length,
				registeredTools: registeredTools.length,
				guiSurfaces: evidence.guiBindings.length
			},
			rows: report.rows,
			oneTransportOnly: oneTransportOnly.map((row) => ({
				operationId: row.operationId,
				expectedTransports: row.expectedTransports,
				resolvedTransports: row.resolvedTransports
			})),
			findings: report.findings
		},
		null,
		2
	)
);

if (report.findings.length > 0) {
	console.error(
		`audit-webmcp-operation-parity: ${report.findings.length} parity defect(s) across ${WEBMCP_OPERATION_INVENTORY.length} rows\n${parity.formatWebmcpParityFindings(report.findings)}`
	);
	process.exit(1);
}

console.error(
	`audit-webmcp-operation-parity: ${report.rows.length} rows reach their declared transports (${registeredTools.length} registered tools, ${evidence.guiBindings.length} GUI surfaces); schema ${digests.schema}, registry ${digests.registry}, tool ${digests.tool}`
);
