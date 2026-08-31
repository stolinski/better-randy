// Drive the real WebMCP transport in a real browser and prove an agent gets the
// surface ADR-0054 promises: a short cold-page menu of tools that all exist in
// the operation inventory, a vocabulary read that comes from the live registries,
// state-aware growth as a composition is created, corrective refusals on a stale
// revision, untrusted-content annotation on the document body, and no tool at all
// for the operations the inventory keeps internal.
//
// This is a deterministic script on the sanctioned CDP harness — one invocation,
// no interactive tooling. It needs a server already answering for this build and
// starts (or reuses) Chrome in `standard-webmcp` mode, which is the only mode
// that exposes `document.modelContext`:
//
//   pnpm eval:webmcp                                   # the dev server on :7263
//   GFX_EVAL_ORIGIN=http://localhost:7266 pnpm eval:webmcp   # any other build
//
// The origin matters: this eval asserts against the inventory in *this* working
// tree, so pointing it at a server running older code reports that difference as
// a failure, which is the intent.
//
// Writes docs/browser-probes/webmcp-agent-eval.json and exits non-zero on the
// first contract the live page misses.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { format, resolveConfig } from 'prettier';

import {
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_FORBIDDEN_TOOL_NAME_FRAGMENTS,
	WEBMCP_OPERATION_INVENTORY,
	WEBMCP_RESULT_CHARACTER_BUDGET,
	WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH,
	WEBMCP_TOOL_NAME_MAX_LENGTH
} from '../src/lib/platform/webmcp-operation-inventory.ts';

import type { WebmcpOperationRow } from '../src/lib/platform/webmcp-operation-inventory.ts';

const STANDARD_WEBMCP_PORT = 9225;
const PAGE_ORIGIN = process.env.GFX_EVAL_ORIGIN ?? 'http://localhost:7263';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = resolve(
	process.env.WEBMCP_AGENT_EVAL_EVIDENCE ?? `${repoRoot}/docs/browser-probes/webmcp-agent-eval.json`
);

/** How long the page is given to mount and reconcile its first registration. */
const REGISTRATION_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 250;

const AGENT_TOOL_ROWS = WEBMCP_OPERATION_INVENTORY.filter((row) => row.exposure === 'agent-tool');
const INTERNAL_ONLY_ROWS = WEBMCP_OPERATION_INVENTORY.filter(
	(row) => row.exposure === 'internal-only'
);
const ROWS_BY_TOOL_NAME = new Map<string, WebmcpOperationRow>(
	WEBMCP_OPERATION_INVENTORY.map((row) => [row.toolName, row])
);

/** Every tool a page with nothing open may legitimately offer. */
const COLD_PAGE_TOOL_NAMES = new Set(
	AGENT_TOOL_ROWS.filter(
		(row) => row.precondition === 'always' || row.precondition === 'session-composition-present'
	).map((row) => row.toolName)
);

/** The tools a cold page must end up offering, whatever its session holds. */
const ALWAYS_REGISTERED_TOOL_NAMES = new Set(
	AGENT_TOOL_ROWS.filter((row) => row.precondition === 'always').map((row) => row.toolName)
);

/** The operations this eval goes on to look for once a composition is open. */
const OPEN_COMPOSITION_OPERATION_IDS: readonly string[] = [
	'composition.inspect',
	'composition.export-json',
	'transport.set-orientation',
	'layer.add-overlay',
	'validation.inspect-findings',
	'delivery.export-video'
];

const failures: string[] = [];

function check(condition: boolean, failure: string): void {
	if (!condition) failures.push(failure);
}

function toolNameFor(operationId: string): string {
	const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === operationId);
	if (!row) throw new Error(`The inventory declares no ${operationId}`);
	return row.toolName;
}

/** One registered tool as the measured Chrome surface reports it. */
interface RegisteredToolDescriptor {
	name: string;
	description: string;
	/** The measured surface hands the schema back as JSON text, not an object. */
	inputSchema: string;
}

/** What one `executeTool` call returned, already unwrapped to the operation payload. */
interface ToolCallOutcome {
	isError: boolean;
	characterCount: number;
	payload: Record<string, unknown>;
}

interface CdpPage {
	send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
	evaluate<T>(expression: string): Promise<T>;
	close(): Promise<void>;
}

function runCommand(command: string, args: readonly string[], env: Record<string, string>): void {
	const result = spawnSync(command, [...args], {
		cwd: repoRoot,
		encoding: 'utf8',
		stdio: 'inherit',
		env: { ...process.env, ...env }
	});
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}`);
	}
}

async function openCdpPage(port: number): Promise<CdpPage> {
	const response = await fetch(
		`http://localhost:${port}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!response.ok) throw new Error(`CDP ${port} would not open a target`);
	const target = (await response.json()) as { webSocketDebuggerUrl: string };
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise<void>((settle, fail) => {
		socket.onopen = () => settle();
		socket.onerror = () => fail(new Error(`CDP ${port} socket refused the connection`));
	});

	let nextId = 1;
	const pending = new Map<
		number,
		{ settle: (value: Record<string, unknown>) => void; fail: (error: Error) => void }
	>();
	socket.onmessage = (event: MessageEvent) => {
		const message = JSON.parse(String(event.data)) as {
			id?: number;
			error?: { message: string };
			result?: Record<string, unknown>;
		};
		if (message.id === undefined) return;
		const waiting = pending.get(message.id);
		if (!waiting) return;
		pending.delete(message.id);
		if (message.error) waiting.fail(new Error(message.error.message));
		else waiting.settle(message.result ?? {});
	};

	const send = (method: string, params: Record<string, unknown> = {}) =>
		new Promise<Record<string, unknown>>((settle, fail) => {
			const id = nextId++;
			pending.set(id, { settle, fail });
			socket.send(JSON.stringify({ id, method, params }));
		});

	async function evaluate<T>(expression: string): Promise<T> {
		const result = (await send('Runtime.evaluate', {
			expression,
			awaitPromise: true,
			returnByValue: true
		})) as {
			exceptionDetails?: { text: string; exception?: { description?: string } };
			result: { value: T };
		};
		if (result.exceptionDetails) {
			throw new Error(
				result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
			);
		}
		return result.result.value;
	}

	await Promise.all([send('Page.enable'), send('Runtime.enable')]);
	return {
		send,
		evaluate,
		close: async () => {
			await send('Page.close');
			socket.close();
		}
	};
}

const sleep = (milliseconds: number) =>
	new Promise<void>((settle) => setTimeout(settle, milliseconds));

/**
 * The tools `getTools()` reports, once the page has registered at least one. The
 * measured API's authority on what is registered is `getTools()`, so this eval
 * never reads the controller's own bookkeeping.
 */
async function readRegisteredTools(page: CdpPage): Promise<RegisteredToolDescriptor[]> {
	return page.evaluate<RegisteredToolDescriptor[]>(`(async () => {
		const tools = Array.from(await document.modelContext.getTools());
		return tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			inputSchema: typeof tool.inputSchema === 'string'
				? tool.inputSchema
				: JSON.stringify(tool.inputSchema)
		}));
	})()`);
}

/**
 * Wait until every named tool is registered, not until *some* tool is.
 *
 * The controller awaits `registerTool` one call at a time, so `getTools()` mid
 * reconcile returns a real but partial menu — and how far through that menu a
 * poll lands depends on how fast the page hydrates, which differs between the
 * dev server and a built artifact. Settling on a count would make this eval
 * report a slow page as a missing tool.
 */
async function awaitRegistration(
	page: CdpPage,
	required: ReadonlySet<string>
): Promise<RegisteredToolDescriptor[]> {
	const deadline = Date.now() + REGISTRATION_TIMEOUT_MS;
	let tools: RegisteredToolDescriptor[] = [];
	let missing: string[] = [...required];
	while (Date.now() < deadline) {
		const ready = await page.evaluate<boolean>(
			`document.readyState === 'complete' && typeof document.modelContext === 'object'`
		);
		if (ready) {
			tools = await readRegisteredTools(page);
			const registered = new Set(tools.map((tool) => tool.name));
			missing = [...required].filter((name) => !registered.has(name));
			if (missing.length === 0) return tools;
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(
		`The page registered ${tools.length} WebMCP tools within ${REGISTRATION_TIMEOUT_MS}ms but never offered ${missing.join(', ')}`
	);
}

/**
 * Call one registered tool the way an attached agent does: pick it out of
 * `getTools()` and hand `executeTool` the tool and its arguments as JSON text —
 * the shape the measured Chrome 152 surface accepts.
 */
async function callTool(
	page: CdpPage,
	toolName: string,
	args: Record<string, unknown>
): Promise<ToolCallOutcome> {
	return page.evaluate<ToolCallOutcome>(`(async () => {
		const tools = Array.from(await document.modelContext.getTools());
		const tool = tools.find((entry) => entry.name === ${JSON.stringify(toolName)});
		if (!tool) throw new Error('No registered tool named ' + ${JSON.stringify(toolName)});
		const raw = await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(args))});
		const result = typeof raw === 'string' ? JSON.parse(raw) : raw;
		const text = result.content[0].text;
		return {
			isError: result.isError === true,
			characterCount: text.length,
			payload: JSON.parse(text)
		};
	})()`);
}

/** Whether this CDP session is the standard-WebMCP one the eval is written for. */
async function readHarnessCapabilities(page: CdpPage): Promise<Record<string, unknown>> {
	const version = (await (
		await fetch(`http://localhost:${STANDARD_WEBMCP_PORT}/json/version`)
	).json()) as Record<string, string>;
	const capabilities = await page.evaluate<Record<string, unknown>>(`({
		modelContext: typeof document.modelContext === 'object',
		modelContextMembers: document.modelContext
			? Object.getOwnPropertyNames(Object.getPrototypeOf(document.modelContext)).sort()
			: [],
		secureContext: isSecureContext,
		canvasDrawElement:
			typeof GPUQueue === 'function' && 'copyElementImageToTexture' in GPUQueue.prototype
	})`);
	return {
		browser: version.Browser,
		protocolVersion: version['Protocol-Version'],
		...capabilities
	};
}

/**
 * Whether a same-origin frame of this page registers tools of its own. ADR-0054
 * §7 registers only in the top-level document; Chrome's `ModelContext` reports
 * every same-origin tool in the tab, so the question is ownership, not presence.
 *
 * A public origin answers this before the frame ever loads: its
 * `frame-ancestors 'none'` policy refuses the embed, and reaching into the
 * blocked frame throws a `SecurityError`. That is the same guarantee, reached
 * earlier, so it is recorded as `frameRefusedByPolicy` rather than treated as a
 * failure — the dev server, which is held to no CSP, still takes the branch
 * below and has its ownership measured.
 */
async function readFramedRegistration(page: CdpPage): Promise<Record<string, unknown>> {
	return page.evaluate<Record<string, unknown>>(`(async () => {
		const frame = document.createElement('iframe');
		frame.src = location.origin + '/';
		document.body.appendChild(frame);
		await new Promise((settle) => { frame.onload = settle; });
		await new Promise((settle) => setTimeout(settle, 5000));
		try {
			const framedContext = frame.contentWindow.document.modelContext;
			const tools = framedContext ? Array.from(await framedContext.getTools()) : [];
			const ownedByFrame = tools.filter((tool) => tool.window === frame.contentWindow);
			return {
				frameRefusedByPolicy: false,
				framedContextExposed: Boolean(framedContext),
				toolsOwnedByFrame: ownedByFrame.map((tool) => tool.name),
				toolsOwnedByTopDocument: tools.filter((tool) => tool.window === window).length
			};
		} catch (cause) {
			if (!(cause instanceof DOMException) || cause.name !== 'SecurityError') throw cause;
			return {
				frameRefusedByPolicy: true,
				framedContextExposed: false,
				toolsOwnedByFrame: [],
				toolsOwnedByTopDocument: null
			};
		} finally {
			frame.remove();
		}
	})()`);
}

runCommand('scripts/launch-cdp-chrome.sh', [], {
	CDP_PORT: String(STANDARD_WEBMCP_PORT),
	CDP_BROWSER_MODE: 'standard-webmcp'
});

const page = await openCdpPage(STANDARD_WEBMCP_PORT);
await page.send('Page.navigate', { url: `${PAGE_ORIGIN}/` });
const coldPageTools = await awaitRegistration(page, ALWAYS_REGISTERED_TOOL_NAMES);

const harness = await readHarnessCapabilities(page);
check(harness.modelContext === true, 'the CDP session does not expose document.modelContext');
check(
	harness.canvasDrawElement === false,
	'the CDP session enables CanvasDrawElement, so it is not the standard-webmcp harness'
);

// The cold page: a short menu of real rows, and nothing that needs a composition.
check(
	coldPageTools.length <= WEBMCP_ALWAYS_REGISTERED_CEILING,
	`a cold page registered ${coldPageTools.length} tools, past the ceiling of ${WEBMCP_ALWAYS_REGISTERED_CEILING}`
);
for (const tool of coldPageTools) {
	const row = ROWS_BY_TOOL_NAME.get(tool.name);
	check(row !== undefined, `${tool.name} is registered but is not an inventory row`);
	check(
		COLD_PAGE_TOOL_NAMES.has(tool.name),
		`${tool.name} is registered on a cold page but needs an open composition`
	);
	check(
		tool.description === row?.summary,
		`${tool.name} is described with text the inventory row does not carry`
	);
	check(
		tool.name.length <= WEBMCP_TOOL_NAME_MAX_LENGTH,
		`${tool.name} is longer than the ${WEBMCP_TOOL_NAME_MAX_LENGTH}-character name budget`
	);
	check(
		tool.description.length <= WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH,
		`${tool.name} is described past the ${WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH}-character budget`
	);
	for (const fragment of WEBMCP_FORBIDDEN_TOOL_NAME_FRAGMENTS) {
		check(!tool.name.includes(fragment), `${tool.name} names the interface verb "${fragment}"`);
	}
}
for (const row of AGENT_TOOL_ROWS.filter((entry) => entry.precondition === 'always')) {
	check(
		coldPageTools.some((tool) => tool.name === row.toolName),
		`${row.toolName} is an always-registered row the cold page did not offer`
	);
}

// Discovery reads the live registries rather than a list written into a tool.
const vocabulary = await callTool(page, toolNameFor('capability.inspect-vocabulary'), {
	section: 'overlay-type'
});
check(!vocabulary.isError, 'the vocabulary read refused on the live page');
check(
	Array.isArray(vocabulary.payload.members) && (vocabulary.payload.members as unknown[]).length > 0,
	'the vocabulary read returned no Overlay types'
);
check(
	vocabulary.characterCount <= WEBMCP_RESULT_CHARACTER_BUDGET,
	`the vocabulary read returned ${vocabulary.characterCount} characters, past its budget`
);

// Creating a composition is what makes the rest of the surface exist.
const created = await callTool(page, toolNameFor('composition.create-blank'), {});
check(!created.isError, `creating a blank composition refused: ${String(created.payload.message)}`);
const openSlug = String(created.payload.slug ?? '');
check(openSlug.length > 0, 'the create receipt named no session slug');

const openPageTools = await awaitRegistration(
	page,
	new Set(OPEN_COMPOSITION_OPERATION_IDS.map(toolNameFor))
);
const openPageToolNames = new Set(openPageTools.map((tool) => tool.name));
for (const operationId of OPEN_COMPOSITION_OPERATION_IDS) {
	check(
		openPageToolNames.has(toolNameFor(operationId)),
		`${operationId} did not appear once a composition was open`
	);
}
for (const row of INTERNAL_ONLY_ROWS) {
	check(
		!openPageToolNames.has(row.toolName),
		`${row.id} is marked internal-only but reached an attached agent as ${row.toolName}`
	);
}
for (const tool of openPageTools) {
	check(
		ROWS_BY_TOOL_NAME.get(tool.name)?.exposure === 'agent-tool',
		`${tool.name} is registered without an agent-tool inventory row`
	);
}

// The revision contract, over the real transport.
const inspected = await callTool(page, toolNameFor('composition.inspect'), {});
check(!inspected.isError, 'inspecting the open composition refused');
check(
	inspected.payload.contentTrust === 'untrusted',
	'the inspection receipt does not annotate the visitor’s own text as untrusted'
);
const currentRevision = Number(inspected.payload.revision);

const stale = await callTool(page, toolNameFor('transport.set-orientation'), {
	expectedRevision: currentRevision + 1,
	orientation: 'vertical'
});
check(stale.isError, 'a write against a revision the composition never had was accepted');
check(
	stale.payload.code === 'stale_revision',
	`a stale write answered ${String(stale.payload.code)} instead of stale_revision`
);

const applied = await callTool(page, toolNameFor('transport.set-orientation'), {
	expectedRevision: currentRevision,
	orientation: 'vertical'
});
check(!applied.isError, `the current-revision write refused: ${String(applied.payload.message)}`);
check(
	applied.characterCount <= WEBMCP_RESULT_CHARACTER_BUDGET,
	`the edit receipt returned ${applied.characterCount} characters, past its budget`
);

const reinspected = await callTool(page, toolNameFor('composition.inspect'), {});
check(
	(reinspected.payload.transport as { orientation?: string } | undefined)?.orientation ===
		'vertical',
	'the applied edit is not visible in the next inspection'
);

const exported = await callTool(page, toolNameFor('composition.export-json'), {});
check(!exported.isError, 'exporting the composition JSON refused');
check(
	exported.payload.contentTrust === 'untrusted',
	'the whole-document read does not annotate the composition body as untrusted'
);

const framed = await readFramedRegistration(page);
check(
	Array.isArray(framed.toolsOwnedByFrame) && (framed.toolsOwnedByFrame as unknown[]).length === 0,
	`a same-origin frame registered its own tools: ${JSON.stringify(framed.toolsOwnedByFrame)}`
);

// Leave the browser session as clean as this eval found it. A reload closes the
// composition — a session tool refuses to delete the one that is open, because
// it would autosave itself straight back — and returns the revision to zero.
await page.send('Page.navigate', { url: `${PAGE_ORIGIN}/` });
await awaitRegistration(
	page,
	new Set([...ALWAYS_REGISTERED_TOOL_NAMES, toolNameFor('session.delete-composition')])
);
const deleted = await callTool(page, toolNameFor('session.delete-composition'), {
	slug: openSlug,
	expectedRevision: 0
});
check(
	!deleted.isError,
	`deleting the eval composition refused: ${String(deleted.payload.message)}`
);

const evidence = {
	schemaVersion: 1,
	generatedAt: new Date().toISOString(),
	probe: 'webmcp-agent-eval',
	origin: PAGE_ORIGIN,
	harness,
	inventory: {
		rows: WEBMCP_OPERATION_INVENTORY.length,
		agentTools: AGENT_TOOL_ROWS.length,
		internalOnly: INTERNAL_ONLY_ROWS.map((row) => row.id)
	},
	coldPage: {
		registered: coldPageTools.map((tool) => tool.name).sort(),
		ceiling: WEBMCP_ALWAYS_REGISTERED_CEILING
	},
	openComposition: {
		slug: openSlug,
		registered: [...openPageToolNames].sort(),
		verificationToolsRegistered: INTERNAL_ONLY_ROWS.filter((row) =>
			openPageToolNames.has(row.toolName)
		).map((row) => row.toolName)
	},
	calls: {
		vocabularyMembers: vocabulary.payload.members,
		staleWriteCode: stale.payload.code,
		appliedRevision: applied.payload.revision,
		exportedCharacterCount: exported.payload.characterCount,
		contentTrust: {
			inspect: inspected.payload.contentTrust,
			exportJson: exported.payload.contentTrust
		}
	},
	framedDocument: framed,
	failures
};

mkdirSync(dirname(evidencePath), { recursive: true });
const prettierConfig = (await resolveConfig(evidencePath)) ?? {};
writeFileSync(
	evidencePath,
	await format(JSON.stringify(evidence), { ...prettierConfig, parser: 'json' })
);
await page.close();

console.log(`Wrote ${evidencePath}`);
if (failures.length > 0) {
	console.error(`WebMCP agent eval failed:\n- ${failures.join('\n- ')}`);
	process.exitCode = 1;
} else {
	console.log(
		`WebMCP agent eval passed: ${coldPageTools.length} cold-page tools, ${openPageToolNames.size} with a composition open, ${INTERNAL_ONLY_ROWS.length} internal-only rows unexposed.`
	);
}
