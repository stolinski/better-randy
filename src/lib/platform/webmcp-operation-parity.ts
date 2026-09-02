/**
 * The bidirectional GUI ↔ WebMCP parity gate
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §1, §2).
 *
 * The operation inventory promises that every authoring decision is reachable
 * from both transports over one shared implementation. This module turns that
 * promise into a decision. It takes evidence about what actually exists — the
 * WebMCP tools this build registers, the operation modules that claim each row,
 * and whether each row's GUI surface is still a component a visitor can reach —
 * and reports every row that does not hold up.
 *
 * Four failure shapes are rejected, on both sides:
 *
 * - **missing** — a row with no operation behind it, no registered tool, or a
 *   GUI surface that is gone.
 * - **duplicate** — one row claimed by two operation modules or exposed by two
 *   tools, or one id or tool name declared twice in the inventory.
 * - **stale** — an operation module or a registered tool naming a row the
 *   inventory no longer declares, or a GUI surface no route reaches any more.
 * - **one-transport-only** — a row that resolves to fewer transports than its
 *   `exposure` promises. An `internal-only` row promises the GUI alone; an
 *   `agent-context` row promises the agent alone because it changes disclosure,
 *   not authored state; every `agent-tool` row promises both.
 *
 * The module is deliberately pure: it reads the inventory and the evidence it is
 * handed and returns findings. Gathering the evidence needs a Vite module graph
 * and a filesystem walk, which is `scripts/audit-webmcp-operation-parity.ts`.
 */
import { WEBMCP_OPERATION_INVENTORY } from './webmcp-operation-inventory';

import type { WebmcpOperationFamilyName, WebmcpOperationRow } from './webmcp-operation-inventory';

/** The two ways an authoring decision is reached. */
export type WebmcpOperationTransport = 'gui' | 'agent';

/** One WebMCP tool this build registers, named by the row it runs. */
export interface WebmcpParityAgentBinding {
	operationId: string;
	/** The module that defines the tool, so a duplicate names both sides. */
	module: string;
}

/** One operation-layer claim: a module that names the row it implements. */
export interface WebmcpParityOperationBinding {
	operationId: string;
	module: string;
}

/** What became of one row's declared GUI surface on disk. */
export interface WebmcpParityGuiBinding {
	guiSurface: string;
	exists: boolean;
	/**
	 * Whether the component is still reached from a SvelteKit route entry. A file
	 * that exists but nothing renders is a stale anchor, which is the failure a
	 * bare existence check cannot see.
	 */
	reachableFromRoute: boolean;
}

/** Everything the gate needs to know about the world outside the inventory. */
export interface WebmcpParityEvidence {
	agentBindings: readonly WebmcpParityAgentBinding[];
	operationBindings: readonly WebmcpParityOperationBinding[];
	guiBindings: readonly WebmcpParityGuiBinding[];
}

export type WebmcpParityDefect =
	/** The inventory itself declares an id or a tool name twice. */
	| 'duplicate-inventory-row'
	/** No operation module implements the row, so neither transport can run it. */
	| 'missing-operation'
	/** Two operation modules claim the row; ownership is ambiguous. */
	| 'duplicate-operation'
	/** An operation module names a row the inventory no longer declares. */
	| 'stale-operation'
	/** A row the inventory exposes has no registered tool: reachable from the GUI only. */
	| 'missing-agent-transport'
	/** Two registered tools expose one row. */
	| 'duplicate-agent-tool'
	/** A registered tool names a row the inventory no longer declares. */
	| 'stale-agent-tool'
	/** A registered tool exposes a row the inventory keeps internal. */
	| 'exposed-internal-operation'
	/** The row's GUI surface is missing or no route reaches it any more. */
	| 'missing-gui-transport';

export interface WebmcpParityFinding {
	defect: WebmcpParityDefect;
	/** The inventory row at fault, or null when the defect is a stale claim. */
	operationId: string | null;
	/** The exact thing rejected — a module path, a GUI surface, a tool name. */
	subject: string;
	detail: string;
}

/** Where one row lands on both transports, once the evidence is resolved. */
export interface WebmcpParityRowResolution {
	operationId: string;
	family: WebmcpOperationFamilyName;
	exposure: WebmcpOperationRow['exposure'];
	/** The repo-relative GUI component, or null for agent context control. */
	guiSurface: string | null;
	/** The WebMCP tool that exposes it, or null when the row is internal-only. */
	toolName: string | null;
	/** The operation module both transports run, or null when nothing implements it. */
	operationModule: string | null;
	/** The transports this row promises, from its exposure. */
	expectedTransports: readonly WebmcpOperationTransport[];
	/** The transports the evidence actually resolved. */
	resolvedTransports: readonly WebmcpOperationTransport[];
}

export interface WebmcpParityReport {
	rows: readonly WebmcpParityRowResolution[];
	findings: readonly WebmcpParityFinding[];
}

/**
 * The transports a row's `exposure` promises. Shared authoring reaches both;
 * internal verification reaches the GUI; transport-only context control reaches
 * the agent and changes no composition or Workspace state.
 */
function expectedTransportsFor(row: WebmcpOperationRow): readonly WebmcpOperationTransport[] {
	switch (row.exposure) {
		case 'agent-tool':
			return ['gui', 'agent'];
		case 'agent-context':
			return ['agent'];
		case 'internal-only':
			return ['gui'];
	}
}

function groupBindingModules(
	bindings: readonly { operationId: string; module: string }[]
): Map<string, string[]> {
	const grouped = new Map<string, string[]>();
	for (const binding of bindings) {
		const modules = grouped.get(binding.operationId);
		if (modules) modules.push(binding.module);
		else grouped.set(binding.operationId, [binding.module]);
	}
	return grouped;
}

function findDuplicateInventoryRows(): WebmcpParityFinding[] {
	const findings: WebmcpParityFinding[] = [];
	const seenIds = new Set<string>();
	const seenToolNames = new Map<string, string>();

	for (const row of WEBMCP_OPERATION_INVENTORY) {
		if (seenIds.has(row.id)) {
			findings.push({
				defect: 'duplicate-inventory-row',
				operationId: row.id,
				subject: row.id,
				detail: 'The inventory declares this operation id more than once.'
			});
		}
		seenIds.add(row.id);

		const owner = seenToolNames.get(row.toolName);
		if (owner) {
			findings.push({
				defect: 'duplicate-inventory-row',
				operationId: row.id,
				subject: row.toolName,
				detail: `The tool name is already declared by ${owner}.`
			});
		} else {
			seenToolNames.set(row.toolName, row.id);
		}
	}

	return findings;
}

/**
 * Resolve every inventory row against the evidence and report what does not hold
 * up. Findings come back grouped by the row they belong to, then by the stale
 * claims that belong to no row, so a failing gate reads top to bottom.
 */
export function auditWebmcpOperationParity(evidence: WebmcpParityEvidence): WebmcpParityReport {
	const declaredIds = new Set(WEBMCP_OPERATION_INVENTORY.map((row) => row.id));
	const operationModules = groupBindingModules(evidence.operationBindings);
	const agentModules = groupBindingModules(evidence.agentBindings);
	const guiBindings = new Map(
		evidence.guiBindings.map((binding) => [binding.guiSurface, binding] as const)
	);

	const findings: WebmcpParityFinding[] = findDuplicateInventoryRows();
	const rows: WebmcpParityRowResolution[] = [];

	for (const row of WEBMCP_OPERATION_INVENTORY) {
		const implementations = operationModules.get(row.id) ?? [];
		if (implementations.length === 0) {
			findings.push({
				defect: 'missing-operation',
				operationId: row.id,
				subject: row.id,
				detail: 'No operation module implements this row, so neither transport can run it.'
			});
		} else if (implementations.length > 1) {
			findings.push({
				defect: 'duplicate-operation',
				operationId: row.id,
				subject: implementations.join(', '),
				detail: 'Two operation modules claim this row; exactly one owns it.'
			});
		}

		const exposures = agentModules.get(row.id) ?? [];
		if (exposures.length > 1) {
			findings.push({
				defect: 'duplicate-agent-tool',
				operationId: row.id,
				subject: exposures.join(', '),
				detail: `Two registered tools expose ${row.toolName}; a row is exposed once.`
			});
		}
		if (exposures.length > 0 && row.exposure === 'internal-only') {
			findings.push({
				defect: 'exposed-internal-operation',
				operationId: row.id,
				subject: exposures.join(', '),
				detail: 'The inventory keeps this row internal, but a registered tool exposes it.'
			});
		}
		if (exposures.length === 0 && row.exposure !== 'internal-only') {
			findings.push({
				defect: 'missing-agent-transport',
				operationId: row.id,
				subject: row.toolName,
				detail:
					'The row promises an agent tool and none is registered, so the decision is reachable from the GUI only.'
			});
		}

		const gui = row.guiSurface === null ? undefined : guiBindings.get(row.guiSurface);
		const guiResolved = gui?.exists === true && gui.reachableFromRoute;
		if (row.exposure !== 'agent-context' && !guiResolved) {
			findings.push({
				defect: 'missing-gui-transport',
				operationId: row.id,
				subject: row.guiSurface ?? row.id,
				detail:
					gui?.exists === true
						? 'The GUI surface exists but no route reaches it, so the row anchors to a component a visitor never sees.'
						: 'The GUI surface named by this row does not exist.'
			});
		}

		const resolvedTransports: WebmcpOperationTransport[] = [];
		if (guiResolved) resolvedTransports.push('gui');
		if (exposures.length > 0) resolvedTransports.push('agent');

		rows.push({
			operationId: row.id,
			family: row.family,
			exposure: row.exposure,
			guiSurface: row.guiSurface,
			toolName: row.exposure === 'internal-only' ? null : row.toolName,
			operationModule: implementations[0] ?? null,
			expectedTransports: expectedTransportsFor(row),
			resolvedTransports
		});
	}

	for (const binding of evidence.operationBindings) {
		if (declaredIds.has(binding.operationId)) continue;
		findings.push({
			defect: 'stale-operation',
			operationId: null,
			subject: `${binding.module}: ${binding.operationId}`,
			detail: 'An operation module names a row the inventory does not declare.'
		});
	}

	for (const binding of evidence.agentBindings) {
		if (declaredIds.has(binding.operationId)) continue;
		findings.push({
			defect: 'stale-agent-tool',
			operationId: null,
			subject: `${binding.module}: ${binding.operationId}`,
			detail: 'A registered tool names a row the inventory does not declare.'
		});
	}

	return { rows, findings };
}

/**
 * The rows the evidence reached from fewer transports than they promise. The
 * gate's headline number: parity is exactly this list being empty.
 */
export function findWebmcpOneTransportOperations(
	report: WebmcpParityReport
): readonly WebmcpParityRowResolution[] {
	return report.rows.filter((row) => row.resolvedTransports.length < row.expectedTransports.length);
}

/** One line per finding, for a gate that has to say what to fix. */
export function formatWebmcpParityFindings(findings: readonly WebmcpParityFinding[]): string {
	return findings
		.map((finding) => `${finding.defect}: ${finding.subject} — ${finding.detail}`)
		.join('\n');
}
