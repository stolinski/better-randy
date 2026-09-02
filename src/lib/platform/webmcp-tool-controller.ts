/**
 * The `document.modelContext` lifecycle
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §5, §6, §7).
 *
 * One controller owns the whole of it: whether this document may expose tools at
 * all, which tools can succeed in the current state, when a registration ends,
 * and what a call is allowed to return. Nothing else touches `modelContext`.
 *
 * The shape follows a small set of rules that are easy to state and easy to get wrong:
 *
 * - **Feature detection first.** No `modelContext`, no registration, no console
 *   noise — the Workspace behaves exactly as it does without an agent, because
 *   progressive enhancement here is one-directional and nothing in the GUI may
 *   depend on a tool being registered.
 * - **Registered means callable.** A tool whose precondition is unmet is absent,
 *   not present-and-refusing.
 * - **Chrome 153 owns two independent signals.** The registration signal is the
 *   second `registerTool` argument and removes a tool without breaking an
 *   execution already in flight. Each `execute` call receives its own signal
 *   from the browser. For GFX's cancellable operations, the controller combines
 *   that execution signal with the registration lifetime so a route or state
 *   change also stops long render, media, or download work.
 * - **One authoring family joins the core menu at a time.** The context operation
 *   selects a family without changing composition or GUI state. This bounds the
 *   active menu while preserving one named tool per authoring decision.
 * - **Registration is the browser's to refuse.** `registerTool` answers
 *   asynchronously and can say no. The controller awaits that answer and
 *   reports a refusal through `synchronize`, because a discarded registration
 *   promise surfaces as an unhandled rejection on the page.
 * - **Results are bounded.** An operation that overruns its budget fails with
 *   `limit_exceeded` naming the overrun, because silently truncating a receipt
 *   would hand an agent a document it cannot trust.
 * - **The inventory decides exposure.** A row marked `internal-only` has no tool
 *   here at all, and a definition naming one is refused at construction rather
 *   than skipped — an operation the page keeps to itself is a disposition the
 *   contract records, not a registration this module gets to choose.
 * - **The renderer is not a registration input.** The CanvasDrawElement gate
 *   decides whether the app mounts, not whether tools exist: a WebMCP browser
 *   without that flag — a headless agent browser, say — registers the same
 *   menu behind the notice, and only an operation that has to render fails
 *   there, at call time. The one silent outcome is an exposure refusal, which
 *   `startWebmcpToolController` hands back so the root layout can publish it
 *   on `window.__gfxWebmcpExposureRefusal` for a harness to read.
 *
 * Tool handlers themselves live with their families. This module never edits
 * engine state, never resolves an operation's targets, and never invents a
 * refusal an operation did not return.
 */
import { readWebmcpSchemaDigest } from './webmcp-derived-tool-schemas';
import {
	completeWebmcpRegistrationState,
	readWebmcpCompositionPreconditions,
	readWebmcpSessionCompositionPresence,
	readWebmcpUserPackPreconditions
} from './webmcp-tool-preconditions';
import {
	readWebmcpOperationAnnotations,
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_CORE_REGISTERED_CEILING,
	WEBMCP_DISCLOSED_REGISTERED_CEILING,
	WEBMCP_MINIMUM_CHROME_MAJOR_VERSION,
	WEBMCP_ON_DEMAND_FAMILY_NAMES,
	WEBMCP_OPERATION_FAMILIES,
	WEBMCP_OPERATION_INVENTORY,
	WEBMCP_RESULT_CHARACTER_BUDGET,
	WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET
} from './webmcp-operation-inventory';

import type { WebmcpToolInputSchema } from './webmcp-derived-tool-schemas';
import type {
	WebmcpCompositionPreconditions,
	WebmcpRegistrationState
} from './webmcp-tool-preconditions';
import type {
	WebmcpOperationFamilyName,
	WebmcpOperationRow,
	WebmcpToolAnnotations
} from './webmcp-operation-inventory';

/** The one operation ADR-0054 §6 lets past the default result budget. */
const WHOLE_DOCUMENT_OPERATION_ID = 'composition.export-json';

/** What a WebMCP call returns over the wire, in the measured protocol's shape. */
export interface WebmcpToolCallResult {
	content: readonly { type: 'text'; text: string }[];
	isError?: boolean;
}

/** The Chrome 153 context supplied independently to each execution. */
export interface WebmcpToolExecutionContext {
	signal: AbortSignal;
}

/** The registration descriptor the Chrome 153 surface accepts. */
export interface WebmcpToolDescriptor {
	name: string;
	description: string;
	inputSchema: WebmcpToolInputSchema;
	annotations: WebmcpToolAnnotations;
	execute(args: unknown, context: WebmcpToolExecutionContext): Promise<WebmcpToolCallResult>;
}

export interface WebmcpToolRegistrationOptions {
	/** Aborting removes this tool while leaving an execution already in flight intact. */
	signal: AbortSignal;
}

/**
 * The `document.modelContext` surface GFX supports from Chrome 153 onward. Only
 * the methods the controller drives are named here.
 */
export interface WebmcpModelContextHost {
	/** Settles when the document accepts the tool, and rejects when it refuses it. */
	registerTool(descriptor: WebmcpToolDescriptor, options: WebmcpToolRegistrationOptions): unknown;
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
	/** The one on-demand authoring family active beside the core menu. */
	authoringFamily: WebmcpOperationFamilyName | null;
	/** Read back from `getTools()`, filtered to this inventory's tool names. */
	registered: readonly string[];
	added: readonly string[];
	removed: readonly string[];
	schemaDigest: string;
}

/** Why this document does not expose tools, or `null` when it does. */
export type WebmcpExposureRefusal =
	| 'model-context-absent'
	| 'unsupported-browser-version'
	| 'insecure-context'
	| 'framed-document'
	| 'opaque-origin';

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
	navigator: { userAgent: string };
	isSecureContext: boolean;
	top: unknown;
	self: unknown;
	/** The serialized origin, or the string `null` on a sandboxed opaque one. */
	origin: string;
}

const OPERATION_ROWS_BY_ID = new Map<string, WebmcpOperationRow>(
	WEBMCP_OPERATION_INVENTORY.map((row) => [row.id, row])
);

const OPERATION_FAMILIES_BY_NAME = new Map(
	WEBMCP_OPERATION_FAMILIES.map((family) => [family.name, family] as const)
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
	const chromeMajor = Number(/(?:Chrome|Chromium)\/(\d+)/.exec(view.navigator.userAgent)?.[1]);
	if (!Number.isSafeInteger(chromeMajor) || chromeMajor < WEBMCP_MINIMUM_CHROME_MAJOR_VERSION) {
		return { host: null, refusal: 'unsupported-browser-version' };
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
 * The refusal for a call cancelled by its caller or by the lifetime of its
 * registration. It never claims a result the operation did not finish.
 */
function cancelledResult(row: WebmcpOperationRow): WebmcpToolCallResult {
	return textResult(
		{
			status: 'cancelled',
			operationId: row.id,
			code: 'cancelled',
			message: `${row.toolName} was cancelled before it finished; re-read the composition and call it again.`
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

/** One signal that ends when either Chrome cancels the call or GFX removes the tool. */
function combineWebmcpAbortSignals(
	registration: AbortSignal,
	execution: AbortSignal
): { signal: AbortSignal; dispose: () => void } {
	const combined = new AbortController();
	const abort = (): void => combined.abort();
	if (registration.aborted || execution.aborted) combined.abort();
	else {
		registration.addEventListener('abort', abort, { once: true });
		execution.addEventListener('abort', abort, { once: true });
	}
	return {
		signal: combined.signal,
		dispose: () => {
			registration.removeEventListener('abort', abort);
			execution.removeEventListener('abort', abort);
		}
	};
}

function readPreparedAuthoringFamily(value: unknown): WebmcpOperationFamilyName | null {
	if (typeof value !== 'object' || value === null) return null;
	if (Reflect.get(value, 'status') !== 'prepared') return null;
	const family = Reflect.get(value, 'family');
	if (typeof family !== 'string') return null;
	return WEBMCP_ON_DEMAND_FAMILY_NAMES.find((candidate) => candidate === family) ?? null;
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
	/** Re-read after a family selection so its receipt waits for current-state tools. */
	readCompositionPreconditions?: () => WebmcpCompositionPreconditions;
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
	readonly #readCompositionPreconditions: (() => WebmcpCompositionPreconditions) | null;
	readonly #registrations = new Map<string, AbortController>();
	#routeId: string | null = null;
	#authoringFamily: WebmcpOperationFamilyName | null = null;
	#current: { composition: WebmcpCompositionPreconditions; routeId: string | null } | null = null;
	#pending: { composition: WebmcpCompositionPreconditions; routeId: string | null } | null = null;
	#queue: Promise<void> = Promise.resolve();

	constructor(options: WebmcpToolControllerOptions) {
		this.#host = options.host;
		this.#definitions = options.definitions;
		this.#lifetime = options.lifetime;
		this.#readCompositionPreconditions = options.readCompositionPreconditions ?? null;

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
		this.#current = { composition, routeId };
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

		// Route and state changes feed the same eligibility diff. Chrome 153 removes
		// registrations by signal and permits the same name to be registered again,
		// so a family or precondition may disappear and later return in one document.
		const removed: string[] = [];
		this.#routeId = routeId;
		if (!composition['composition-open']) this.#authoringFamily = null;

		const [sessionCompositionPresent, userPacks] = await Promise.all([
			readWebmcpSessionCompositionPresence(),
			readWebmcpUserPackPreconditions()
		]);
		const state = completeWebmcpRegistrationState(
			composition,
			sessionCompositionPresent,
			userPacks
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
			const family = OPERATION_FAMILIES_BY_NAME.get(row.family);
			if (family?.disclosure === 'on-demand' && row.family !== this.#authoringFamily) continue;
			eligible.push({ row, definition });
		}

		const ceiling = !state['composition-open']
			? WEBMCP_ALWAYS_REGISTERED_CEILING
			: this.#authoringFamily === null
				? WEBMCP_CORE_REGISTERED_CEILING
				: WEBMCP_DISCLOSED_REGISTERED_CEILING;
		if (eligible.length > ceiling) {
			throw new TypeError(
				`This page would register ${eligible.length} WebMCP tools, past its ${ceiling}-tool context ceiling: ${eligible
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

		const accepted = this.#host.registerTool(
			{
				name: row.toolName,
				description: row.summary,
				inputSchema: definition.inputSchema,
				annotations: readWebmcpOperationAnnotations(row),
				execute: async (
					args: unknown,
					context: WebmcpToolExecutionContext
				): Promise<WebmcpToolCallResult> => {
					if (signal.aborted || context.signal.aborted) return cancelledResult(row);

					const callLifetime = combineWebmcpAbortSignals(signal, context.signal);
					const raceEnded = new AbortController();
					let settled: { value: unknown } | 'ended';
					try {
						const operation = definition
							.run(args, callLifetime.signal)
							.then((value) => ({ value }));
						settled = row.cancellable
							? await Promise.race([
									operation,
									registrationEnded(callLifetime.signal, raceEnded.signal)
								])
							: await operation;
					} finally {
						raceEnded.abort();
						callLifetime.dispose();
					}
					if (settled === 'ended') return cancelledResult(row);

					const preparedFamily =
						row.id === 'capability.prepare-authoring-family'
							? readPreparedAuthoringFamily(settled.value)
							: null;
					if (preparedFamily) await this.#prepareAuthoringFamily(preparedFamily);

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
			},
			{ signal }
		);

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

	async #prepareAuthoringFamily(family: WebmcpOperationFamilyName): Promise<void> {
		this.#authoringFamily = family;
		const current = this.#current;
		if (!current) return;
		const composition = this.#readCompositionPreconditions?.() ?? current.composition;
		await this.synchronize(composition, current.routeId);
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
			authoringFamily: this.#authoringFamily,
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

/** What starting a document's controller produced: the controller, or why none started. */
export interface WebmcpToolControllerStart {
	controller: WebmcpToolController | null;
	/** Why this document registers no tools; `null` whenever `controller` is set. */
	refusal: WebmcpExposureRefusal | null;
}

/**
 * Start the controller for this document, or answer why it stays inert. An
 * absent, pre-Chrome-153, framed, insecure, or opaque-origin document gets no
 * controller and no console noise: the page is expected to run without an
 * agent. The refusal comes back beside the controller because silence alone
 * cannot tell a harness whether the page chose not to register or failed to.
 */
export function startWebmcpToolController(options: {
	view: WebmcpExposureView;
	definitions: readonly WebmcpToolDefinition[];
	lifetime: AbortSignal;
}): WebmcpToolControllerStart {
	const exposure = readWebmcpToolExposure(options.view);
	if (!exposure.host) return { controller: null, refusal: exposure.refusal };
	return {
		controller: new WebmcpToolController({
			host: exposure.host,
			definitions: options.definitions,
			lifetime: options.lifetime,
			readCompositionPreconditions: readWebmcpCompositionPreconditions
		}),
		refusal: null
	};
}
