// Prove, in a real browser, that a browser-scoped Public demo session
// (ADR-0053) holds together under everything that can go wrong to it, and that
// the visitor's composition never leaves the browser it was written in.
//
// Nine measurements, each on the live page rather than on a stand-in:
//
//   1. Refresh          — a reload continues the same session.
//   2. Two tabs         — a second tab's save is not silently overwritten by the
//                         first tab's; the older tab is refused and says so.
//   3. Quota            — a session at its ceiling refuses the save and keeps
//                         the composition it already holds.
//   4. Storage denial   — a browser that exposes no local storage refuses
//                         clearly instead of failing somewhere unnamed.
//   5. Invalid records  — a record too corrupt to open is dropped from the
//                         catalog; one an older release left is still opened.
//   6. Unreachable media— a document naming Media the engine cannot resolve is
//                         refused, and the open composition is untouched.
//   7. Consent          — clearing the session refuses without an explicit one.
//   8. No origin store  — the disk-backed composition routes answer 404 here.
//   9. No leak          — no request, console message, or telemetry envelope the
//                         page emitted carries the composition's own content.
//
// The leak measurement is the reason this probe runs its own server and its own
// telemetry sink rather than pointing at the dev server: the composition store
// is a deployment input, a dev checkout serves the disk-backed one, and a probe
// that cannot see what the page sends cannot prove what it does not send. The
// sink is a loopback port standing in for Sentry, so the envelopes the SDK
// really builds are inspected here and go nowhere else.
//
// This is a deterministic script on the sanctioned CDP harness — one
// invocation, no interactive tooling. It needs a built Node artifact:
//
//   pnpm build && pnpm probe:browser-session
//
// Writes docs/browser-probes/browser-session-integrity.json and exits non-zero
// on the first contract the live session misses.
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

import { format, resolveConfig } from 'prettier';

import { PUBLIC_COMPOSITION_SESSION_STORAGE_LIMITS } from '../src/lib/platform/public-runtime-contract.ts';
import { WEBMCP_OPERATION_INVENTORY } from '../src/lib/platform/webmcp-operation-inventory.ts';
import {
	assertVerificationOriginAllowed,
	createVerificationServerJail,
	type VerificationServerJail
} from './verification-server-jail.ts';

/**
 * This probe drives its browser through storage clears and a storage-denial
 * override, so it runs on a port of its own with a profile of its own rather
 * than on the shared standard-webmcp harness (9225). A run that inherited the
 * shared profile inherited whatever the dev origin had left in it.
 */
const STANDARD_WEBMCP_PORT = Number(process.env.GFX_SESSION_PROBE_CDP_PORT ?? 9245);

/** A namespace of its own, so a probe run never reads or writes a real session. */
const PROBE_STORAGE_IDENTITY = 'gfx-session-probe';

/** The key the quota measurement occupies the session with, and then gives back. */
const PROBE_PADDING_SLUG = 'probe-padding';

const SERVER_PORT = Number(process.env.GFX_SESSION_PROBE_PORT ?? 7311);
const TELEMETRY_PORT = Number(process.env.GFX_SESSION_PROBE_TELEMETRY_PORT ?? 7312);
const PROBE_ORIGIN = `http://localhost:${SERVER_PORT}`;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntryPath = resolve(repoRoot, 'build/index.js');
const evidencePath = resolve(
	process.env.GFX_SESSION_PROBE_EVIDENCE ??
		`${repoRoot}/docs/browser-probes/browser-session-integrity.json`
);

/** The corpus blank Preset, as the document body every planted record is built from. */
const blankPresetJson = JSON.parse(
	readFileSync(resolve(repoRoot, 'src/lib/presets/blank.json'), 'utf8')
) as Record<string, unknown>;

/** How long the page is given to mount and register its first tool. */
const REGISTRATION_TIMEOUT_MS = 30_000;
/** How long an autosave — debounced in the route — is given to settle. */
const AUTOSAVE_TIMEOUT_MS = 15_000;
/** How long the telemetry SDK is given to flush what it built. */
const TELEMETRY_FLUSH_MS = 8_000;
const POLL_INTERVAL_MS = 250;

/**
 * The composition body this probe watches for. Two distinct strings so a hit
 * names which part of the document escaped: the description an author types and
 * the caption text an Overlay carries. Neither is ever an identifier — the
 * session slug is derived from the name and is deliberately visible in `/p/…` —
 * so either one appearing anywhere outside the browser is a leak.
 */
const CONTENT_SENTINELS = {
	description: `gfx-probe-description-${Math.random().toString(36).slice(2, 10)}`,
	overlayTitle: `gfx-probe-overlay-${Math.random().toString(36).slice(2, 10)}`
} as const;

const failures: string[] = [];

function check(condition: boolean, failure: string): void {
	if (!condition) failures.push(failure);
}

function toolNameFor(operationId: string): string {
	const row = WEBMCP_OPERATION_INVENTORY.find((entry) => entry.id === operationId);
	if (!row) throw new Error(`The inventory declares no ${operationId}`);
	return row.toolName;
}

const sleep = (milliseconds: number) =>
	new Promise<void>((settle) => setTimeout(settle, milliseconds));

async function waitFor<T>(
	label: string,
	timeoutMs: number,
	read: () => Promise<T>,
	satisfied: (value: T) => boolean
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let latest = await read();
	while (!satisfied(latest) && Date.now() < deadline) {
		await sleep(POLL_INTERVAL_MS);
		latest = await read();
	}
	if (!satisfied(latest)) {
		throw new Error(
			`${label} never settled within ${timeoutMs}ms; last saw ${JSON.stringify(latest)}`
		);
	}
	return latest;
}

// ---- The telemetry sink -----------------------------------------------------

interface TelemetrySink {
	dsn: string;
	envelopes: string[];
	close(): Promise<void>;
}

/**
 * A loopback stand-in for the telemetry origin. The browser SDK is pointed here
 * by DSN, so it builds and sends the envelopes it really would — and this probe
 * reads them instead of a vendor.
 */
async function startTelemetrySink(): Promise<TelemetrySink> {
	const envelopes: string[] = [];
	const server = createServer((request, response) => {
		let body = '';
		request.on('data', (chunk: Buffer) => {
			body += chunk.toString('utf8');
		});
		request.on('end', () => {
			envelopes.push(`${request.method} ${request.url}\n${body}`);
			response.writeHead(200, {
				'content-type': 'application/json',
				'access-control-allow-origin': '*',
				'access-control-allow-headers': '*'
			});
			response.end('{}');
		});
	});
	await new Promise<void>((settle) => server.listen(TELEMETRY_PORT, '127.0.0.1', settle));
	return {
		dsn: `http://gfxsessionprobe@127.0.0.1:${TELEMETRY_PORT}/1`,
		envelopes,
		close: () => new Promise<void>((settle) => server.close(() => settle()))
	};
}

// ---- The server under measurement -------------------------------------------

interface ProbeServer {
	stop(): Promise<void>;
}

async function startBrowserStoreServer(
	sentryDsn: string,
	jail: VerificationServerJail
): Promise<ProbeServer> {
	if (!existsSync(serverEntryPath)) {
		throw new Error(`No Node artifact at ${serverEntryPath}. Run \`pnpm build\` first.`);
	}
	// The jail is what makes this probe safe to run from any checkout: its storage
	// clear and denial tests below can only ever reach directories this run made.
	assertVerificationOriginAllowed(PROBE_ORIGIN);
	const child = spawn(process.execPath, [serverEntryPath], {
		cwd: repoRoot,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			...jail.environment,
			PORT: String(SERVER_PORT),
			ORIGIN: PROBE_ORIGIN,
			PUBLIC_GFX_COMPOSITION_STORE: 'browser',
			PUBLIC_GFX_COMPOSITION_STORAGE_IDENTITY: PROBE_STORAGE_IDENTITY,
			PUBLIC_SENTRY_DSN: sentryDsn
		}
	});
	const stop = async (): Promise<void> => {
		if (child.exitCode === null) child.kill('SIGTERM');
		await sleep(250);
		if (child.exitCode === null) child.kill('SIGKILL');
	};

	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) throw new Error(`The probe server exited with ${child.exitCode}.`);
		try {
			const health = await fetch(`${PROBE_ORIGIN}/api/health`);
			if (health.ok) return { stop };
		} catch {
			// Not listening yet.
		}
		await sleep(POLL_INTERVAL_MS);
	}
	await stop();
	throw new Error(`The probe server never answered at ${PROBE_ORIGIN}.`);
}

// ---- The measured browser ---------------------------------------------------

/** One request the page made, as the leak measurement reads it. */
interface RecordedRequest {
	url: string;
	method: string;
	postData: string;
}

interface CdpPage {
	send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
	evaluate<T>(expression: string): Promise<T>;
	navigate(url: string): Promise<void>;
	readonly requests: RecordedRequest[];
	readonly consoleMessages: string[];
	close(): Promise<void>;
}

async function openCdpPage(): Promise<CdpPage> {
	const response = await fetch(
		`http://localhost:${STANDARD_WEBMCP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!response.ok) throw new Error(`CDP ${STANDARD_WEBMCP_PORT} would not open a target`);
	const target = (await response.json()) as { webSocketDebuggerUrl: string };
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise<void>((settle, fail) => {
		socket.onopen = () => settle();
		socket.onerror = () => fail(new Error('The CDP socket refused the connection'));
	});

	let nextId = 1;
	const pending = new Map<
		number,
		{ settle: (value: Record<string, unknown>) => void; fail: (error: Error) => void }
	>();
	const requests: RecordedRequest[] = [];
	const consoleMessages: string[] = [];

	socket.onmessage = (event: MessageEvent) => {
		const message = JSON.parse(String(event.data)) as {
			id?: number;
			method?: string;
			params?: Record<string, unknown>;
			error?: { message: string };
			result?: Record<string, unknown>;
		};
		if (message.id !== undefined) {
			const waiting = pending.get(message.id);
			if (!waiting) return;
			pending.delete(message.id);
			if (message.error) waiting.fail(new Error(message.error.message));
			else waiting.settle(message.result ?? {});
			return;
		}
		if (message.method === 'Network.requestWillBeSent') {
			const request = (message.params?.request ?? {}) as {
				url?: string;
				method?: string;
				postData?: string;
			};
			requests.push({
				url: request.url ?? '',
				method: request.method ?? '',
				postData: request.postData ?? ''
			});
			return;
		}
		if (message.method === 'Runtime.consoleAPICalled') {
			const args = (message.params?.args ?? []) as { value?: unknown; description?: string }[];
			consoleMessages.push(
				args.map((argument) => argument.description ?? JSON.stringify(argument.value)).join(' ')
			);
			return;
		}
		if (message.method === 'Log.entryAdded') {
			const entry = (message.params?.entry ?? {}) as { text?: string };
			consoleMessages.push(entry.text ?? '');
		}
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

	await Promise.all([
		send('Page.enable'),
		send('Runtime.enable'),
		send('Log.enable'),
		// Bodies, not just addresses: a leak that matters travels in a request body.
		send('Network.enable', { maxPostDataSize: 1_000_000 })
	]);

	return {
		send,
		evaluate,
		navigate: async (url: string) => {
			await send('Page.navigate', { url });
		},
		requests,
		consoleMessages,
		close: async () => {
			await send('Page.close').catch(() => undefined);
			socket.close();
		}
	};
}

/** What one `executeTool` call returned, unwrapped to the operation payload. */
interface ToolCallOutcome {
	isError: boolean;
	payload: Record<string, unknown>;
}

async function awaitToolRegistration(page: CdpPage): Promise<void> {
	await waitFor(
		'WebMCP tool registration',
		REGISTRATION_TIMEOUT_MS,
		() =>
			page.evaluate<number>(`(async () => {
				if (document.readyState !== 'complete') return 0;
				if (typeof document.modelContext !== 'object') return 0;
				return Array.from(await document.modelContext.getTools()).length;
			})()`),
		(count) => count > 0
	);
}

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
		return { isError: result.isError === true, payload: JSON.parse(text) };
	})()`);
}

async function callOperation(
	page: CdpPage,
	operationId: string,
	args: Record<string, unknown> = {}
): Promise<ToolCallOutcome> {
	return callTool(page, toolNameFor(operationId), args);
}

/** The Composition revision the page is currently on, read the way an agent reads it. */
async function readCurrentRevision(page: CdpPage): Promise<number> {
	const inspected = await callOperation(page, 'composition.inspect');
	return Number(inspected.payload.revision);
}

/** The persistence refusal the Workspace is showing, or empty when it shows none. */
async function readPersistenceError(page: CdpPage): Promise<string> {
	return page.evaluate<string>(
		`document.querySelector('.persistence-error')?.textContent?.trim() ?? ''`
	);
}

/** Every record the probe's storage namespace holds, by key. */
async function readProbeStorage(page: CdpPage): Promise<Record<string, string>> {
	return page.evaluate<Record<string, string>>(`(() => {
		const prefix = ${JSON.stringify(`${PROBE_STORAGE_IDENTITY}:`)};
		const held = {};
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key && key.startsWith(prefix)) held[key] = localStorage.getItem(key) ?? '';
		}
		return held;
	})()`);
}

async function writeProbeStorage(page: CdpPage, slug: string, body: string): Promise<void> {
	await page.evaluate<null>(
		`(localStorage.setItem(${JSON.stringify(`${PROBE_STORAGE_IDENTITY}:${slug}`)}, ${JSON.stringify(body)}), null)`
	);
}

/**
 * Occupy this session's namespace up to its ratified ceiling, so the next save
 * of `openSlug` is one no composition of any size could fit into.
 *
 * Sized in the page against what the session already holds — the same UTF-16
 * accounting the store measures itself with — rather than guessed here, because
 * a guess that leaves room measures nothing. The open composition's own record
 * is left out of the sum for the same reason the store leaves it out: a save
 * replaces that record rather than adding to it.
 */
async function fillProbeStorageToCeiling(page: CdpPage, openSlug: string): Promise<number> {
	return page.evaluate<number>(`(() => {
		const prefix = ${JSON.stringify(`${PROBE_STORAGE_IDENTITY}:`)};
		const key = prefix + ${JSON.stringify(PROBE_PADDING_SLUG)};
		const replaced = prefix + ${JSON.stringify(openSlug)};
		let occupied = 0;
		for (let index = 0; index < localStorage.length; index += 1) {
			const held = localStorage.key(index);
			if (held && held.startsWith(prefix) && held !== replaced && held !== key) {
				occupied += (held.length + (localStorage.getItem(held) ?? '').length) * 2;
			}
		}
		const remainingBytes = ${PUBLIC_COMPOSITION_SESSION_STORAGE_LIMITS.maxStorageBytes} - occupied;
		const length = Math.max(0, Math.floor(remainingBytes / 2) - key.length - 128);
		localStorage.setItem(key, 'x'.repeat(length));
		return length;
	})()`);
}

async function clearProbeStorage(page: CdpPage): Promise<void> {
	await page.evaluate<null>(`(() => {
		const prefix = ${JSON.stringify(`${PROBE_STORAGE_IDENTITY}:`)};
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith(prefix)) localStorage.removeItem(key);
		}
		return null;
	})()`);
}

/**
 * A composition whose Video track names an asset its own library does not carry
 * — Media the engine cannot resolve, which is refused rather than admitted and
 * quietly dropped.
 */
function compositionNamingUnresolvableMedia(): Record<string, unknown> {
	const state = blankPresetJson.state as Record<string, unknown>;
	return {
		...blankPresetJson,
		name: 'Probe unresolvable media',
		state: {
			...state,
			media: {
				assets: [],
				videoTrack: {
					clips: [
						{
							id: 'clip-1',
							assetId: 'no-such-asset',
							timelineStartFrame: 0,
							durationFrames: 30,
							sourceStartSeconds: 0,
							audio: { enabled: false, gain: 1 }
						}
					]
				}
			}
		}
	};
}

// ---- The run ----------------------------------------------------------------

const sink = await startTelemetrySink();
const jail = await createVerificationServerJail('browser-session');
const server = await startBrowserStoreServer(sink.dsn, jail);
const harness = spawnSync('scripts/launch-cdp-chrome.sh', [], {
	cwd: repoRoot,
	stdio: 'inherit',
	env: {
		...process.env,
		CDP_PORT: String(STANDARD_WEBMCP_PORT),
		CDP_BROWSER_MODE: 'standard-webmcp',
		CDP_PROFILE_DIR: jail.chromeProfileDirectory
	}
});
if (harness.status !== 0) {
	await server.stop();
	await sink.close();
	await jail.dispose();
	throw new Error(`The sanctioned CDP harness would not start (status ${harness.status}).`);
}

const firstTab = await openCdpPage();
let secondTab: CdpPage | null = null;
let deniedStorageTab: CdpPage | null = null;
const measurements: Record<string, unknown> = {};

try {
	await firstTab.navigate(`${PROBE_ORIGIN}/`);
	await awaitToolRegistration(firstTab);
	await clearProbeStorage(firstTab);

	// 8. The origin composition routes do not serve a browser-scoped session.
	const originStoreStatus = await firstTab.evaluate<number>(
		`fetch('/api/user-compositions').then((response) => response.status)`
	);
	check(
		originStoreStatus === 404,
		`the disk-backed composition route answered ${originStoreStatus} on a browser-store host`
	);
	measurements.originCompositionRouteStatus = originStoreStatus;

	// A composition carrying content that must never leave this browser.
	const created = await callOperation(firstTab, 'composition.create-blank');
	check(!created.isError, `creating a composition refused: ${String(created.payload.message)}`);
	const slug = String(created.payload.slug ?? '');
	check(slug.length > 0, 'the create receipt named no session slug');

	await firstTab.navigate(`${PROBE_ORIGIN}/p/${slug}`);
	await awaitToolRegistration(firstTab);

	const named = await callOperation(firstTab, 'composition.set-identity', {
		expectedRevision: await readCurrentRevision(firstTab),
		description: CONTENT_SENTINELS.description
	});
	check(
		!named.isError,
		`setting the composition description refused: ${String(named.payload.message)}`
	);

	const overlay = await callOperation(firstTab, 'layer.add-overlay', {
		expectedRevision: await readCurrentRevision(firstTab),
		overlayType: 'lower-third'
	});
	check(!overlay.isError, `adding an Overlay refused: ${String(overlay.payload.message)}`);
	const overlayId = String(
		(overlay.payload.focus as { overlayId?: string } | undefined)?.overlayId ?? ''
	);
	const written = await callOperation(firstTab, 'content.set-overlay-content', {
		expectedRevision: await readCurrentRevision(firstTab),
		overlayId,
		content: JSON.stringify({ title: CONTENT_SENTINELS.overlayTitle })
	});
	check(!written.isError, `writing Overlay content refused: ${String(written.payload.message)}`);

	// 1. A reload continues the same session, with the content it was holding.
	const storedAfterEdits = await waitFor(
		'the first tab autosaving its edits',
		AUTOSAVE_TIMEOUT_MS,
		() => readProbeStorage(firstTab),
		(held) => Object.values(held).some((body) => body.includes(CONTENT_SENTINELS.overlayTitle))
	);
	measurements.recordsAfterEdits = Object.keys(storedAfterEdits);

	await firstTab.navigate(`${PROBE_ORIGIN}/p/${slug}`);
	await awaitToolRegistration(firstTab);
	const reloaded = await callOperation(firstTab, 'composition.export-json');
	check(
		JSON.stringify(reloaded.payload).includes(CONTENT_SENTINELS.overlayTitle),
		'a reload did not continue the same composition'
	);
	const sessionAfterReload = await callOperation(firstTab, 'session.inspect');
	check(
		Number(sessionAfterReload.payload.total) === 1,
		`the session held ${String(sessionAfterReload.payload.total)} compositions after a reload, not 1`
	);
	measurements.sessionAfterReload = sessionAfterReload.payload;

	// 2. Two tabs: the older tab is refused, not silently applied over the newer.
	secondTab = await openCdpPage();
	await secondTab.navigate(`${PROBE_ORIGIN}/p/${slug}`);
	await awaitToolRegistration(secondTab);
	const secondTabEdit = await callOperation(secondTab, 'composition.set-identity', {
		expectedRevision: await readCurrentRevision(secondTab),
		name: 'Second tab'
	});
	check(
		!secondTabEdit.isError,
		`the second tab's edit refused: ${String(secondTabEdit.payload.message)}`
	);
	await waitFor(
		'the second tab autosaving',
		AUTOSAVE_TIMEOUT_MS,
		() => readProbeStorage(secondTab as CdpPage),
		(held) => Object.values(held).some((body) => body.includes('"name":"Second tab"'))
	);

	const firstTabEdit = await callOperation(firstTab, 'composition.set-identity', {
		expectedRevision: await readCurrentRevision(firstTab),
		name: 'First tab'
	});
	check(
		!firstTabEdit.isError,
		`the first tab's edit refused: ${String(firstTabEdit.payload.message)}`
	);
	const conflictMessage = await waitFor(
		'the first tab reporting the second tab',
		AUTOSAVE_TIMEOUT_MS,
		() => readPersistenceError(firstTab),
		(message) => message.includes('another tab')
	);
	const storedAfterConflict = await readProbeStorage(secondTab);
	check(
		Object.values(storedAfterConflict).some((body) => body.includes('"name":"Second tab"')),
		'the older tab overwrote the newer tab’s saved composition'
	);
	measurements.twoTabs = { conflictMessage };
	await secondTab.close();
	secondTab = null;

	// 3. Quota: a full session refuses and keeps what it already holds.
	await firstTab.navigate(`${PROBE_ORIGIN}/p/${slug}`);
	await awaitToolRegistration(firstTab);
	const paddingLength = await fillProbeStorageToCeiling(firstTab, slug);
	const quotaEdit = await callOperation(firstTab, 'composition.set-identity', {
		expectedRevision: await readCurrentRevision(firstTab),
		name: 'Edited against a full session'
	});
	check(!quotaEdit.isError, `the edit itself refused: ${String(quotaEdit.payload.message)}`);
	const quotaMessage = await waitFor(
		'the session reporting it is full',
		AUTOSAVE_TIMEOUT_MS,
		() => readPersistenceError(firstTab),
		(message) => message.length > 0
	);
	check(
		quotaMessage.includes('bytes'),
		`a full session reported "${quotaMessage}" rather than what it holds against its ceiling`
	);
	const storedAfterQuota = await readProbeStorage(firstTab);
	check(
		Object.values(storedAfterQuota).some((body) => body.includes(CONTENT_SENTINELS.overlayTitle)),
		'a refused save destroyed the composition the session already held'
	);
	measurements.quota = { paddingLength, quotaMessage };
	await firstTab.evaluate<null>(
		`(localStorage.removeItem(${JSON.stringify(`${PROBE_STORAGE_IDENTITY}:${PROBE_PADDING_SLUG}`)}), null)`
	);

	// 5. Invalid records: unopenable is dropped, older-release is still opened.
	await writeProbeStorage(firstTab, 'probe-corrupt', '{"forkedFrom":null,"saved');
	await writeProbeStorage(
		firstTab,
		'probe-legacy',
		JSON.stringify({
			forkedFrom: null,
			savedAt: '2026-08-29T12:00:00.000Z',
			preset: { ...blankPresetJson, name: 'Probe older release' }
		})
	);
	await firstTab.navigate(`${PROBE_ORIGIN}/p/${slug}`);
	await awaitToolRegistration(firstTab);
	const catalog = await callOperation(firstTab, 'session.inspect');
	const catalogSlugs = (catalog.payload.entries as { slug: string }[]).map((entry) => entry.slug);
	check(
		!catalogSlugs.includes('probe-corrupt'),
		'a record too corrupt to open was listed as a composition'
	);
	check(
		catalogSlugs.includes('probe-legacy'),
		'a record an older release left behind was dropped instead of opened'
	);
	measurements.invalidRecords = { catalogSlugs };

	// 6. Media the engine cannot resolve is refused; the open composition stands.
	const revisionBeforeImport = await readCurrentRevision(firstTab);
	const unresolvableMedia = await callOperation(firstTab, 'composition.import-json', {
		document: JSON.stringify(compositionNamingUnresolvableMedia())
	});
	check(unresolvableMedia.isError, 'a composition naming unresolvable Media was imported');
	check(
		unresolvableMedia.payload.code === 'semantic_invalid',
		`unresolvable Media answered ${String(unresolvableMedia.payload.code)} instead of semantic_invalid`
	);
	check(
		String(unresolvableMedia.payload.message).includes('Media'),
		'the refusal did not name Media as the part to correct'
	);
	check(
		(await readCurrentRevision(firstTab)) === revisionBeforeImport,
		'a refused import moved the open composition'
	);
	measurements.unresolvableMedia = {
		code: unresolvableMedia.payload.code,
		message: unresolvableMedia.payload.message
	};

	// 7. Clearing the whole session is never implied.
	const unconfirmedClear = await callOperation(firstTab, 'session.clear', { confirmed: false });
	check(unconfirmedClear.isError, 'clearing the session ran without an explicit confirmation');
	check(
		unconfirmedClear.payload.code === 'consent_required',
		`an unconfirmed clear answered ${String(unconfirmedClear.payload.code)} instead of consent_required`
	);
	measurements.consent = { code: unconfirmedClear.payload.code };

	// 4. A browser that exposes no local storage refuses clearly.
	deniedStorageTab = await openCdpPage();
	await deniedStorageTab.send('Page.addScriptToEvaluateOnNewDocument', {
		source: `Object.defineProperty(window, 'localStorage', {
			configurable: true,
			get() { throw new DOMException('Site data is blocked', 'SecurityError'); }
		});`
	});
	await deniedStorageTab.navigate(`${PROBE_ORIGIN}/`);
	await awaitToolRegistration(deniedStorageTab);
	const deniedCreate = await callOperation(deniedStorageTab, 'composition.create-blank');
	check(deniedCreate.isError, 'a browser with no local storage created a composition anyway');
	check(
		deniedCreate.payload.code === 'storage_unavailable',
		`denied storage answered ${String(deniedCreate.payload.code)} instead of storage_unavailable`
	);
	measurements.storageDenied = {
		code: deniedCreate.payload.code,
		message: deniedCreate.payload.message
	};
	await deniedStorageTab.close();
	deniedStorageTab = null;

	// 9. Nothing carrying the composition's content left the browser.
	await firstTab.navigate(`${PROBE_ORIGIN}/`);
	await sleep(TELEMETRY_FLUSH_MS);

	const sentinels = Object.values(CONTENT_SENTINELS);
	const carriesContent = (text: string): boolean =>
		sentinels.some((sentinel) => text.includes(sentinel));

	const leakingRequests = firstTab.requests.filter(
		(request) => carriesContent(request.url) || carriesContent(request.postData)
	);
	check(
		leakingRequests.length === 0,
		`${leakingRequests.length} request(s) carried composition content: ${leakingRequests
			.map((request) => `${request.method} ${request.url}`)
			.join(', ')}`
	);

	const leakingConsole = firstTab.consoleMessages.filter(carriesContent);
	check(
		leakingConsole.length === 0,
		`${leakingConsole.length} console message(s) carried composition content`
	);

	// A vacuous pass is not a pass: the SDK must have sent something to inspect.
	check(sink.envelopes.length > 0, 'the telemetry SDK sent nothing, so nothing was inspected');
	const leakingEnvelopes = sink.envelopes.filter(carriesContent);
	check(
		leakingEnvelopes.length === 0,
		`${leakingEnvelopes.length} telemetry envelope(s) carried composition content`
	);

	measurements.noLeak = {
		requests: firstTab.requests.length,
		consoleMessages: firstTab.consoleMessages.length,
		telemetryEnvelopes: sink.envelopes.length,
		// The addresses the origin sees that this session produced, with the build's
		// own immutable bundle left out because it is the same for every visitor.
		// A session slug is derived from the composition's name and is deliberately
		// part of `/p/<slug>`, and a poster key is a fingerprint of the document;
		// the document itself is what may never be here.
		originVisibleSessionPaths: [
			...new Set(
				firstTab.requests
					.filter((request) => request.url.startsWith(PROBE_ORIGIN))
					.map((request) => new URL(request.url).pathname)
					.filter((path) => !path.startsWith('/_app/immutable/'))
			)
		].sort()
	};

	await clearProbeStorage(firstTab);
} finally {
	await secondTab?.close().catch(() => undefined);
	await deniedStorageTab?.close().catch(() => undefined);
	await firstTab.close().catch(() => undefined);
	await server.stop();
	await sink.close();
	await jail.dispose();
}

const evidence = {
	schemaVersion: 1,
	generatedAt: new Date().toISOString(),
	probe: 'browser-session-integrity',
	origin: PROBE_ORIGIN,
	storageIdentity: PROBE_STORAGE_IDENTITY,
	limits: PUBLIC_COMPOSITION_SESSION_STORAGE_LIMITS,
	measurements,
	failures
};

mkdirSync(dirname(evidencePath), { recursive: true });
const prettierConfig = (await resolveConfig(evidencePath)) ?? {};
writeFileSync(
	evidencePath,
	await format(JSON.stringify(evidence), { ...prettierConfig, parser: 'json' })
);

console.log(`Wrote ${evidencePath}`);
if (failures.length > 0) {
	console.error(`Browser session integrity probe failed:\n- ${failures.join('\n- ')}`);
	process.exitCode = 1;
} else {
	console.log(
		`Browser session integrity probe passed: ${firstTab.requests.length} requests, ${sink.envelopes.length} telemetry envelopes, and ${firstTab.consoleMessages.length} console messages inspected, none carrying composition content.`
	);
}
