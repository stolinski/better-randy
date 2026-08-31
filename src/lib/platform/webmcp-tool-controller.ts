/**
 * The `document.modelContext` lifecycle
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §5, §6, §7).
 *
 * One controller owns the whole of it: whether this document may expose tools at
 * all, which tools can succeed in the current state, when a registration ends,
 * and what a call is allowed to return. Nothing else touches `modelContext`.
 *
 * The shape follows four rules that are easy to state and easy to get wrong:
 *
 * - **Feature detection first.** No `modelContext`, no registration, no console
 *   noise — the Workspace behaves exactly as it does without an agent, because
 *   progressive enhancement here is one-directional and nothing in the GUI may
 *   depend on a tool being registered.
 * - **Registered means callable.** A tool whose precondition is unmet is absent,
 *   not present-and-refusing.
 * - **AbortSignal ends a registration; the document keeps the name.** Each
 *   registration is scoped to its own signal, aborted when the tool stops being
 *   eligible or when the page tears down, and a call already in flight on an
 *   aborted registration resolves as `cancelled` rather than mutating a
 *   composition that has moved on. The measured surface (Chrome 152) goes no
 *   further than that: it offers `registerTool`, `getTools`, `executeTool` and
 *   `ontoolchange` and no way to unregister, and an aborted registration stays
 *   in `getTools()` while its name refuses re-registration as
 *   `InvalidStateError: Duplicate tool name` for the life of the document. So a
 *   name given up here is given up until the page reloads, which is why nothing
 *   ends a registration the current state would ask for again — a tool ended and
 *   re-asked is a tool an agent can see and can no longer call.
 * - **Registration is the browser's to refuse.** `registerTool` answers
 *   asynchronously and can say no — a name the document still holds from a
 *   controller that has not finished tearing down refuses as
 *   `InvalidStateError: Duplicate tool name`. The controller awaits that answer
 *   and reports a refusal through `synchronize`, because a discarded
 *   registration promise surfaces as an unhandled rejection on the page, and a
 *   refused tool recorded as owned would never be attempted again.
 * - **Results are bounded.** An operation that overruns its budget fails with
 *   `limit_exceeded` naming the overrun, because silently truncating a receipt
 *   would hand an agent a document it cannot trust.
 * - **The inventory decides exposure.** A row marked `internal-only` has no tool
 *   here at all, and a definition naming one is refused at construction rather
 *   than skipped — an operation the page keeps to itself is a disposition the
 *   contract records, not a registration this module gets to choose.
 *
 * Tool handlers themselves live with their families. This module never edits
 * engine state, never resolves an operation's targets, and never invents a
 * refusal an operation did not return.
 */
import { readWebmcpSchemaDigest } from './webmcp-derived-tool-schemas';
import {
	completeWebmcpRegistrationState,
	readWebmcpSessionCompositionPresence
} from './webmcp-tool-preconditions';
import {
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_OPERATION_INVENTORY,
	WEBMCP_RESULT_CHARACTER_BUDGET,
	WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET
} from './webmcp-operation-inventory';

import type { WebmcpToolInputSchema } from './webmcp-derived-tool-schemas';
import type {
	WebmcpCompositionPreconditions,
	WebmcpRegistrationState
} from './webmcp-tool-preconditions';
import type { WebmcpOperationRow } from './webmcp-operation-inventory';

/** The one operation ADR-0054 §6 lets past the default result budget. */
const WHOLE_DOCUMENT_OPERATION_ID = 'composition.export-json';

/** What a WebMCP call returns over the wire, in the measured protocol's shape. */
export interface WebmcpToolCallResult {
	content: readonly { type: 'text'; text: string }[];
	isError?: boolean;
}

/** The registration descriptor the measured Chrome surface accepts. */
export interface WebmcpToolDescriptor {
	name: string;
	description: string;
	inputSchema: WebmcpToolInputSchema;
	execute(args: unknown): Promise<WebmcpToolCallResult>;
	/** Ends this registration. The controller aborts it; nothing else may. */
	signal: AbortSignal;
}

/**
 * The measured `document.modelContext` surface (Chrome 152, protocol 1.3):
 * `registerTool`, `getTools`, `executeTool`, `ontoolchange`. Only the two the
 * controller drives are named — `getTools` because it, not the controller's own
 * bookkeeping, is the authority on what is registered.
 */
export interface WebmcpModelContextHost {
	/** Settles when the document accepts the tool, and rejects when it refuses it. */
	registerTool(descriptor: WebmcpToolDescriptor): unknown;
	getTools(): Iterable<{ name: string }> | Promise<Iterable<{ name: string }>>;
}

/** One operation's WebMCP side: the arguments it takes and the handler it runs. */
export interface WebmcpToolDefinition {
	/** The inventory row this tool exposes. A definition without a row is a defect. */
	operationId: string;
	inputSchema: WebmcpToolInputSchema;
	/** Runs the operation. Resolves with the receipt or the refusal it produced. */
	run(args: unknown, signal: AbortSignal): Promise<unknown>;
}

/** What one reconciliation did, as the tool names the browser now reports. */
export interface WebmcpRegistrationSummary {
	routeId: string | null;
	/** Read back from `getTools()`, filtered to this inventory's tool names. */
	registered: readonly string[];
	added: readonly string[];
	removed: readonly string[];
	schemaDigest: string;
}

/** Why this document does not expose tools, or `null` when it does. */
export type WebmcpExposureRefusal =
	'model-context-absent' | 'insecure-context' | 'framed-document' | 'opaque-origin';

export interface WebmcpExposureVerdict {
	host: WebmcpModelContextHost | null;
	refusal: WebmcpExposureRefusal | null;
}

/**
 * The globals the exposure check reads. A real `Window` satisfies it; naming
 * only the four properties keeps the check answerable without a DOM.
 */
export interface WebmcpExposureView {
	document: { modelContext?: WebmcpModelContextHost };
	isSecureContext: boolean;
	top: unknown;
	self: unknown;
	/** The serialized origin, or the string `null` on a sandboxed opaque one. */
	origin: string;
}

const OPERATION_ROWS_BY_ID = new Map<string, WebmcpOperationRow>(
	WEBMCP_OPERATION_INVENTORY.map((row) => [row.id, row])
);

const INVENTORY_TOOL_NAMES = new Set(WEBMCP_OPERATION_INVENTORY.map((row) => row.toolName));

/**
 * Whether this document may expose tools, and the host it exposes them on.
 * Same-origin, top-level, secure context only: never inside a frame, never on a
 * sandboxed opaque origin, never on another origin's behalf.
 */
export function readWebmcpToolExposure(view: WebmcpExposureView): WebmcpExposureVerdict {
	const host = view.document.modelContext;
	if (typeof host !== 'object' || host === null) {
		return { host: null, refusal: 'model-context-absent' };
	}
	if (!view.isSecureContext) return { host: null, refusal: 'insecure-context' };
	if (view.top !== view.self) return { host: null, refusal: 'framed-document' };
	if (view.origin === 'null') return { host: null, refusal: 'opaque-origin' };
	return { host, refusal: null };
}

function readResultBudget(row: WebmcpOperationRow): number {
	return row.id === WHOLE_DOCUMENT_OPERATION_ID
		? WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET
		: WEBMCP_RESULT_CHARACTER_BUDGET;
}

function textResult(payload: unknown, isError: boolean): WebmcpToolCallResult {
	return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError };
}

/**
 * The refusal for a call that outlived its registration. It names `cancelled`
 * rather than reporting whatever the handler eventually returned, because the
 * state that call was written against is gone.
 */
function cancelledResult(row: WebmcpOperationRow): WebmcpToolCallResult {
	return textResult(
		{
			status: 'cancelled',
			operationId: row.id,
			code: 'cancelled',
			message: `${row.toolName} was unregistered while this call was in flight; re-read the composition and call it again.`
		},
		true
	);
}

/**
 * A promise that settles the moment the registration ends, so an in-flight call
 * stops waiting on a handler whose composition has moved on. `until` releases
 * the listener once the race is over — a long-lived registration serves many
 * calls, and each one would otherwise leave a listener behind.
 */
function registrationEnded(signal: AbortSignal, until: AbortSignal): Promise<'ended'> {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve('ended');
			return;
		}
		signal.addEventListener('abort', () => resolve('ended'), { once: true, signal: until });
	});
}

async function readHostToolNames(host: WebmcpModelContextHost): Promise<readonly string[]> {
	const tools = await host.getTools();
	return [...tools].map((tool) => tool.name).filter((name) => INVENTORY_TOOL_NAMES.has(name));
}

export interface WebmcpToolControllerOptions {
	host: WebmcpModelContextHost;
	/** The tool definitions this build ships. Each names an inventory row. */
	definitions: readonly WebmcpToolDefinition[];
	/** Aborted on teardown: ends every registration the controller holds. */
	lifetime: AbortSignal;
}

/**
 * Owns every registration this page makes. Construct one per document, then call
 * `synchronize` whenever the route or the composition changes; it is idempotent,
 * so calling it more often than necessary costs a diff and nothing else.
 */
export class WebmcpToolController {
	readonly #host: WebmcpModelContextHost;
	readonly #definitions: readonly WebmcpToolDefinition[];
	readonly #lifetime: AbortSignal;
	readonly #registrations = new Map<string, AbortController>();
	#routeId: string | null = null;
	#pending: { composition: WebmcpCompositionPreconditions; routeId: string | null } | null = null;
	#queue: Promise<void> = Promise.resolve();

	constructor(options: WebmcpToolControllerOptions) {
		this.#host = options.host;
		this.#definitions = options.definitions;
		this.#lifetime = options.lifetime;

		for (const definition of this.#definitions) {
			const row = OPERATION_ROWS_BY_ID.get(definition.operationId);
			if (!row) {
				throw new TypeError(
					`A WebMCP tool definition names an operation the inventory does not declare: ${definition.operationId}`
				);
			}
			if (row.exposure === 'internal-only') {
				throw new TypeError(
					`The inventory marks this operation internal-only, so it has no WebMCP tool: ${definition.operationId}`
				);
			}
		}

		this.#lifetime.addEventListener('abort', () => this.#abortAll(), { once: true });
	}

	/** The controller's own view of what it registered, in registration order. */
	get registeredToolNames(): readonly string[] {
		return [...this.#registrations.keys()];
	}

	/**
	 * Bring the registered set in line with the current route and composition.
	 * Reconciliations run one at a time and the newest request wins: state can
	 * change faster than the session catalog answers, and applying a stale
	 * request afterwards would register tools for a composition that has moved.
	 */
	async synchronize(
		composition: WebmcpCompositionPreconditions,
		routeId: string | null
	): Promise<WebmcpRegistrationSummary> {
		this.#pending = { composition, routeId };
		const run = this.#queue.then(() => this.#drainPending());
		this.#queue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	/** Reconcile the newest request, or report the settled set when one already did. */
	async #drainPending(): Promise<WebmcpRegistrationSummary> {
		const request = this.#pending;
		this.#pending = null;
		if (!request) return this.#summarize(this.#routeId, [], []);
		return this.#reconcile(request.composition, request.routeId);
	}

	async #reconcile(
		composition: WebmcpCompositionPreconditions,
		routeId: string | null
	): Promise<WebmcpRegistrationSummary> {
		if (this.#lifetime.aborted) {
			this.#abortAll();
			return this.#summarize(routeId, [], []);
		}

		// A route change does not end a registration that the new route would make
		// again. It cannot: the measured document never releases a tool name (see
		// the note on unregistration above), so ending and re-asking loses the name
		// for the rest of the visit. What a route change actually changes is which
		// preconditions hold, and the eligibility diff below ends exactly those.
		const removed: string[] = [];
		this.#routeId = routeId;

		const state = completeWebmcpRegistrationState(
			composition,
			await readWebmcpSessionCompositionPresence()
		);
		if (this.#lifetime.aborted) {
			this.#abortAll();
			return this.#summarize(routeId, [], removed);
		}

		const eligible = this.#eligibleRows(state);
		const eligibleNames = new Set(eligible.map(({ row }) => row.toolName));

		for (const [toolName, registration] of this.#registrations) {
			if (eligibleNames.has(toolName)) continue;
			registration.abort();
			this.#registrations.delete(toolName);
			removed.push(toolName);
		}

		// Registrations are awaited one at a time so a refusal is attributable to
		// the tool that drew it, and so a lifetime aborted mid-reconcile stops the
		// loop instead of re-populating the map `#abortAll` just cleared.
		const added: string[] = [];
		const refused: string[] = [];
		let firstRefusal: unknown = null;
		for (const { row, definition } of eligible) {
			if (this.#lifetime.aborted) break;
			if (this.#registrations.has(row.toolName)) continue;
			try {
				await this.#register(row, definition);
				added.push(row.toolName);
			} catch (error) {
				refused.push(row.toolName);
				firstRefusal ??= error;
			}
		}

		if (refused.length > 0) {
			throw new Error(
				`document.modelContext refused ${refused.length} WebMCP registration(s): ${refused.join(', ')}. The next synchronize retries them.`,
				{ cause: firstRefusal }
			);
		}

		return this.#summarize(routeId, added, removed);
	}

	/**
	 * The rows a call could actually succeed on: shipped as a definition, with its
	 * precondition met. The cold-page ceiling is checked rather than applied —
	 * overrunning it means the inventory grew a tool that belongs behind an open
	 * composition, and truncating the list would hide that.
	 */
	#eligibleRows(
		state: WebmcpRegistrationState
	): readonly { row: WebmcpOperationRow; definition: WebmcpToolDefinition }[] {
		const eligible: { row: WebmcpOperationRow; definition: WebmcpToolDefinition }[] = [];
		for (const definition of this.#definitions) {
			const row = OPERATION_ROWS_BY_ID.get(definition.operationId);
			if (!row) continue;
			if (!state[row.precondition]) continue;
			eligible.push({ row, definition });
		}

		if (!state['composition-open'] && eligible.length > WEBMCP_ALWAYS_REGISTERED_CEILING) {
			throw new TypeError(
				`A cold page would register ${eligible.length} WebMCP tools, past the ceiling of ${WEBMCP_ALWAYS_REGISTERED_CEILING}: ${eligible
					.map(({ row }) => row.toolName)
					.join(', ')}`
			);
		}

		return eligible;
	}

	/**
	 * Register one tool and wait for the document's answer. A refusal leaves no
	 * trace: the entry is dropped so the next reconcile treats the tool as
	 * missing and tries again, which is what a duplicate name during a teardown
	 * race needs.
	 */
	async #register(row: WebmcpOperationRow, definition: WebmcpToolDefinition): Promise<void> {
		const registration = new AbortController();
		this.#registrations.set(row.toolName, registration);
		const signal = registration.signal;
		const budget = readResultBudget(row);

		const accepted = this.#host.registerTool({
			name: row.toolName,
			description: row.summary,
			inputSchema: definition.inputSchema,
			signal,
			execute: async (args: unknown): Promise<WebmcpToolCallResult> => {
				if (signal.aborted) return cancelledResult(row);

				const raceEnded = new AbortController();
				let settled: { value: unknown } | 'ended';
				try {
					settled = await Promise.race([
						definition.run(args, signal).then((value) => ({ value })),
						registrationEnded(signal, raceEnded.signal)
					]);
				} finally {
					raceEnded.abort();
				}
				if (settled === 'ended' || signal.aborted) return cancelledResult(row);

				const result = textResult(settled.value, isFailedOutcome(settled.value));
				const length = result.content[0].text.length;
				if (length <= budget) return result;

				return textResult(
					{
						status: 'failed',
						operationId: row.id,
						code: 'limit_exceeded',
						message: `${row.toolName} produced ${length} characters, past its ${budget}-character result budget.`,
						rejected: String(length),
						alternatives: [String(budget)]
					},
					true
				);
			}
		});

		try {
			await accepted;
		} catch (error) {
			registration.abort();
			this.#registrations.delete(row.toolName);
			throw new Error(`document.modelContext refused to register ${row.toolName}.`, {
				cause: error
			});
		}
	}

	#abortAll(): void {
		for (const registration of this.#registrations.values()) registration.abort();
		this.#registrations.clear();
	}

	async #summarize(
		routeId: string | null,
		added: readonly string[],
		removed: readonly string[]
	): Promise<WebmcpRegistrationSummary> {
		return {
			routeId,
			registered: await readHostToolNames(this.#host),
			added,
			removed,
			schemaDigest: readWebmcpSchemaDigest()
		};
	}
}

/** Whether an operation answered with a refusal rather than a receipt. */
function isFailedOutcome(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		'status' in value &&
		(value as { status: unknown }).status === 'failed'
	);
}

/**
 * Start the controller for this document, or answer why it stays inert. An
 * absent, framed, insecure, or opaque-origin document gets `null` and no console
 * noise: the page is expected to run without an agent attached.
 */
export function startWebmcpToolController(options: {
	view: WebmcpExposureView;
	definitions: readonly WebmcpToolDefinition[];
	lifetime: AbortSignal;
}): WebmcpToolController | null {
	const exposure = readWebmcpToolExposure(options.view);
	if (!exposure.host) return null;
	return new WebmcpToolController({
		host: exposure.host,
		definitions: options.definitions,
		lifetime: options.lifetime
	});
}
