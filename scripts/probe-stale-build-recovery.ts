/**
 * Prove ADR-0058 against the real production artifact: a tab that outlived a
 * rebuild reloads onto the current build instead of showing "Couldn't load
 * renderer", refuses to loop when the reload lands on the same build, and turns
 * a stale tab's next navigation into a full page load once the version poll
 * has run.
 *
 * The rebuild is simulated, not performed. The origin keeps serving one
 * artifact while the probe rewrites `_app/version.json` (what a new build
 * changes) and fails, over CDP, every chunk request the tab has not made before
 * (what a new build removes). Run from a checkout whose `pnpm build` is done:
 *
 *   pnpm probe:stale-build-recovery
 *
 * It starts its own jailed server and the sanctioned CanvasDrawElement Chrome
 * on ports of its own, and puts `version.json` back when it finishes.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	assertVerificationOriginAllowed,
	createVerificationServerJail,
	type VerificationServerJail
} from './verification-server-jail.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntryPath = resolve(repositoryRoot, 'build/index.js');
const versionFilePath = resolve(repositoryRoot, 'build/client/_app/version.json');
/**
 * The adapter precompresses every static file, and the origin serves the `.br`
 * or `.gz` sibling whenever the browser accepts it. A rewritten `version.json`
 * only reaches the browser once those siblings are gone, exactly as a real
 * rebuild regenerates them.
 */
const precompressedVersionFilePaths = ['.br', '.gz'].map(
	(extension) => versionFilePath + extension
);

/** Ports of this run's own, so the probe never addresses the dev server's real store. */
const SERVER_PORT = Number(process.env.GFX_STALE_BUILD_PROBE_PORT ?? 7313);
const CDP_PORT = Number(process.env.GFX_STALE_BUILD_PROBE_CDP_PORT ?? 9251);
const PROBE_ORIGIN = `http://localhost:${SERVER_PORT}`;

const POLL_INTERVAL_MS = 250;
const SERVER_READY_TIMEOUT_MS = 30_000;
const WORKSPACE_READY_TIMEOUT_MS = 60_000;
/** `kit.version.pollInterval` is 30s; the first poll lands shortly after. */
const VERSION_POLL_TIMEOUT_MS = 45_000;

const CHUNK_URL_PATTERN = '*/_app/immutable/chunks/*';
const RELOADED_FROM_BUILD_KEY = 'gfx-stale-build-reloaded-from';

const sleep = (milliseconds: number): Promise<void> =>
	new Promise((settle) => setTimeout(settle, milliseconds));

// ---- The measured server ----------------------------------------------------

interface ProbeServer {
	stop(): Promise<void>;
}

async function startProbeServer(jail: VerificationServerJail): Promise<ProbeServer> {
	if (!existsSync(serverEntryPath)) {
		throw new Error(`No Node artifact at ${serverEntryPath}. Run \`pnpm build\` first.`);
	}
	assertVerificationOriginAllowed(PROBE_ORIGIN);
	// The readiness check reserves export scratch space it can see; a jail whose
	// directories do not exist yet answers 503 until they do.
	await mkdir(jail.compositionStoreDirectory, { recursive: true });
	await mkdir(jail.exportTemporaryDirectory, { recursive: true });
	const child = spawn(process.execPath, [serverEntryPath], {
		cwd: repositoryRoot,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			...jail.environment,
			PORT: String(SERVER_PORT),
			ORIGIN: PROBE_ORIGIN
		}
	});
	const output: string[] = [];
	child.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
	child.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
	const stop = async (): Promise<void> => {
		if (child.exitCode === null) child.kill('SIGTERM');
		await sleep(250);
		if (child.exitCode === null) child.kill('SIGKILL');
	};

	const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
	let lastAnswer = 'no answer yet';
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`The probe server exited with ${child.exitCode}:\n${output.join('')}`);
		}
		try {
			const health = await fetch(`${PROBE_ORIGIN}/api/health`);
			if (health.ok) return { stop };
			lastAnswer = `HTTP ${health.status}: ${await health.text()}`;
		} catch (error) {
			lastAnswer =
				error instanceof Error
					? error.cause instanceof Error
						? error.cause.message
						: error.message
					: String(error);
		}
		await sleep(POLL_INTERVAL_MS);
	}
	await stop();
	throw new Error(
		`The probe server never answered at ${PROBE_ORIGIN} (${lastAnswer}).\n${output.join('')}`
	);
}

// ---- The measured browser ---------------------------------------------------

interface CdpPage {
	send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
	evaluate<T>(expression: string): Promise<T>;
	on(method: string, handler: (params: Record<string, unknown>) => void): void;
	close(): Promise<void>;
}

async function openCdpPage(): Promise<CdpPage> {
	const response = await fetch(
		`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!response.ok) throw new Error(`CDP ${CDP_PORT} would not open a target.`);
	const target = (await response.json()) as { webSocketDebuggerUrl: string };
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise<void>((settle, fail) => {
		socket.onopen = () => settle();
		socket.onerror = () => fail(new Error('The CDP socket refused the connection.'));
	});

	let nextId = 1;
	const pending = new Map<
		number,
		{ settle: (value: Record<string, unknown>) => void; fail: (error: Error) => void }
	>();
	const handlers = new Map<string, ((params: Record<string, unknown>) => void)[]>();

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
		if (!message.method) return;
		for (const handler of handlers.get(message.method) ?? []) handler(message.params ?? {});
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
		send('Network.enable'),
		send('Log.enable')
	]);

	return {
		send,
		evaluate,
		on: (method, handler) => {
			handlers.set(method, [...(handlers.get(method) ?? []), handler]);
		},
		close: async () => {
			await send('Page.close').catch(() => undefined);
			socket.close();
		}
	};
}

/** Chrome answers `Browser.close` by exiting, so wait for the port to stop answering. */
async function closeHarnessBrowser(): Promise<void> {
	const version = (await fetch(`http://localhost:${CDP_PORT}/json/version`).then((response) =>
		response.json()
	)) as { webSocketDebuggerUrl?: string };
	if (!version.webSocketDebuggerUrl) return;
	const socket = new WebSocket(version.webSocketDebuggerUrl);
	await new Promise<void>((settle, fail) => {
		socket.onopen = () => settle();
		socket.onerror = () => fail(new Error('The CDP browser endpoint refused the connection.'));
	});
	socket.send(JSON.stringify({ id: 1, method: 'Browser.close', params: {} }));
	for (let attempt = 0; attempt < 40; attempt += 1) {
		await sleep(POLL_INTERVAL_MS);
		try {
			await fetch(`http://localhost:${CDP_PORT}/json/version`);
		} catch {
			socket.close();
			return;
		}
	}
	socket.close();
}

// ---- What the page is showing ----------------------------------------------

/** The states a Preset route can settle into, as the probe reads them off the DOM. */
type RouteView = 'home' | 'loading' | 'workspace' | 'renderer-error' | 'other';

interface PageView {
	pathname: string;
	view: RouteView;
	errorMessage: string | null;
	cardCount: number;
	canvasDrawElement: boolean;
}

const PAGE_VIEW_EXPRESSION = `(() => {
	const cards = document.querySelectorAll('a.poster-card');
	const errorHeading = document.querySelector('main.missing h1');
	const view = cards.length > 0
		? 'home'
		: errorHeading?.textContent?.includes("Couldn't load renderer")
			? 'renderer-error'
			: document.querySelector('main.loading')
				? 'loading'
				: document.querySelector('canvas') && window.__gfxTimeline
					? 'workspace'
					: 'other';
	return {
		pathname: location.pathname,
		view,
		errorMessage: document.querySelector('main.missing p')?.textContent ?? null,
		cardCount: cards.length,
		canvasDrawElement: typeof GPUQueue !== 'undefined' && 'copyElementImageToTexture' in GPUQueue.prototype
	};
})()`;

async function readPageView(page: CdpPage): Promise<PageView | null> {
	try {
		return await page.evaluate<PageView>(PAGE_VIEW_EXPRESSION);
	} catch {
		// Mid-navigation: the execution context is gone until the next document lands.
		return null;
	}
}

async function waitForPageView(
	page: CdpPage,
	accept: (view: PageView) => boolean,
	timeoutMs: number,
	label: string
): Promise<PageView> {
	const deadline = Date.now() + timeoutMs;
	let latest: PageView | null = null;
	while (Date.now() < deadline) {
		latest = await readPageView(page);
		if (latest && !latest.canvasDrawElement) {
			throw new Error(
				`CanvasDrawElement is unavailable on CDP port ${CDP_PORT}; the app hard-gates without it.`
			);
		}
		if (latest && accept(latest)) return latest;
		await sleep(POLL_INTERVAL_MS);
	}
	throw new Error(`Timed out waiting for ${label}; last view: ${JSON.stringify(latest)}.`);
}

async function clickHomeCard(page: CdpPage, index: number): Promise<string> {
	return page.evaluate<string>(`(() => {
		const card = document.querySelectorAll('a.poster-card')[${index}];
		if (!card) throw new Error('No home card at index ${index}.');
		const href = card.getAttribute('href');
		card.click();
		return new URL(href, location.href).pathname;
	})()`);
}

async function clickHomeLink(page: CdpPage): Promise<void> {
	await page.evaluate(`(() => {
		const link = document.querySelector('a.gfx-mark-home-link') ?? document.querySelector('main.missing a');
		if (!link) throw new Error('No link back to the home page on this view.');
		link.click();
	})()`);
}

// ---- The probe --------------------------------------------------------------

interface ProbeFinding {
	name: string;
	passed: boolean;
	detail: string;
}

interface RebuildSimulation {
	/** The build the served artifact was made with, as its own version.json states it. */
	buildVersion: string;
	/** Chunk URLs this tab has already fetched; anything else is "removed by the rebuild". */
	knownChunkUrls: Set<string>;
	armed: boolean;
	/** Every chunk request the browser paused for the probe, armed or not. */
	pausedChunkRequests: number;
	/** Chunk URLs requested while armed, whether or not they were known. */
	armedChunkRequests: string[];
	/** Which step of the run each chunk was first requested in, for the report. */
	phase: string;
	chunkRequestsByPhase: Record<string, string[]>;
	failedChunkUrls: string[];
	fullNavigations: string[];
	reloadWarnings: number;
	/** Every version.json answer the tab received, as `status` strings, for the report. */
	versionResponses: string[];
	/** Console warnings and errors the page logged, for the report. */
	consoleMessages: string[];
}

/**
 * What a rebuild leaves behind for an open tab: a different `version.json` on
 * an origin that has restarted. The restart is not optional — adapter-node's
 * static handler reads each file's length and ETag once at startup, so a
 * rewritten file only reaches the browser after the process comes back.
 */
async function publishNewerVersion(
	label: string,
	restartOrigin: () => Promise<void>
): Promise<string> {
	const version = `stale-build-probe-${label}-${Date.now()}`;
	await writeFile(versionFilePath, JSON.stringify({ version }));
	for (const path of precompressedVersionFilePaths) await rm(path, { force: true });
	await restartOrigin();
	return version;
}

/**
 * Click cards until one needs a chunk the tab has never fetched. A Preset whose
 * renderers were all loaded by an earlier card cannot show the failure, so it is
 * stepped over rather than counted either way.
 */
async function openCardNeedingNewChunks(
	page: CdpPage,
	simulation: RebuildSimulation,
	startIndex: number,
	cardCount: number,
	settle: (view: PageView) => boolean
): Promise<{ cardIndex: number; pathname: string; view: PageView }> {
	const skipped: string[] = [];
	for (let cardIndex = startIndex; cardIndex < cardCount; cardIndex += 1) {
		const failedBefore = simulation.failedChunkUrls.length;
		const pathname = await clickHomeCard(page, cardIndex);
		skipped.push(pathname);
		const view = await waitForPageView(
			page,
			(candidate) =>
				candidate.pathname === pathname &&
				(settle(candidate) ||
					(candidate.view === 'workspace' && simulation.failedChunkUrls.length === failedBefore)),
			WORKSPACE_READY_TIMEOUT_MS,
			`card ${cardIndex} (${pathname}) to settle`
		);
		if (settle(view)) return { cardIndex, pathname, view };
		// Every chunk this card needed was already in the tab: back to the cards.
		await clickHomeLink(page);
		await waitForPageView(
			page,
			(candidate) => candidate.view === 'home',
			WORKSPACE_READY_TIMEOUT_MS,
			'the home page'
		);
	}
	throw new Error(
		`No card from index ${startIndex} of ${cardCount} needed a chunk the tab lacked ` +
			`(${simulation.pausedChunkRequests} chunk request(s) paused overall; ${simulation.knownChunkUrls.size} known; ` +
			`requested while armed: ${simulation.armedChunkRequests.join(', ') || 'none'}; tried ${skipped.join(', ')}; ` +
			`by phase: ${JSON.stringify(simulation.chunkRequestsByPhase)}).`
	);
}

async function runProbe(
	page: CdpPage,
	buildVersion: string,
	restartOrigin: () => Promise<void>,
	findings: ProbeFinding[]
): Promise<void> {
	const simulation: RebuildSimulation = {
		buildVersion,
		knownChunkUrls: new Set(),
		armed: false,
		pausedChunkRequests: 0,
		armedChunkRequests: [],
		phase: 'home',
		chunkRequestsByPhase: {},
		failedChunkUrls: [],
		fullNavigations: [],
		reloadWarnings: 0,
		versionResponses: [],
		consoleMessages: []
	};

	page.on('Network.requestWillBeSent', (params) => {
		const url = String((params.request as { url?: string } | undefined)?.url ?? '');
		if (!url.includes('/_app/immutable/chunks/')) return;
		(simulation.chunkRequestsByPhase[simulation.phase] ??= []).push(url.split('/').at(-1) ?? url);
		if (simulation.armed) simulation.armedChunkRequests.push(url);
		else simulation.knownChunkUrls.add(url);
	});
	page.on('Fetch.requestPaused', (params) => {
		const requestId = String(params.requestId);
		const url = String((params.request as { url?: string } | undefined)?.url ?? '');
		simulation.pausedChunkRequests += 1;
		if (simulation.armed && !simulation.knownChunkUrls.has(url)) {
			simulation.failedChunkUrls.push(url);
			void page.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
			return;
		}
		void page.send('Fetch.continueRequest', { requestId });
	});
	page.on('Page.frameNavigated', (params) => {
		const frame = params.frame as { parentId?: string; url?: string } | undefined;
		if (frame?.parentId) return;
		simulation.fullNavigations.push(frame?.url ?? '');
		// A new document has landed: it must be able to fetch the chunks the
		// "rebuild" removed, which is what a real new build serves. (A client-side
		// navigation never reaches this event, so the tab stays armed through it.)
		simulation.armed = false;
	});
	page.on('Runtime.consoleAPICalled', (params) => {
		const args = (params.args ?? []) as { value?: unknown; description?: string }[];
		if (
			params.type === 'warning' &&
			args.some((argument) => argument.value === 'Reloading onto the current build.')
		) {
			simulation.reloadWarnings += 1;
		}
		if (params.type === 'warning' || params.type === 'error') {
			simulation.consoleMessages.push(
				`${String(params.type)}: ${args.map((argument) => argument.description ?? JSON.stringify(argument.value)).join(' ')}`
			);
		}
	});
	page.on('Runtime.exceptionThrown', (params) => {
		const details = params.exceptionDetails as
			{ text?: string; exception?: { description?: string } } | undefined;
		simulation.consoleMessages.push(
			`exception: ${details?.exception?.description ?? details?.text ?? 'unknown'}`
		);
	});
	page.on('Network.responseReceived', (params) => {
		const response = params.response as { url?: string; status?: number } | undefined;
		if (response?.url?.endsWith('/_app/version.json')) {
			simulation.versionResponses.push(String(response.status));
		}
	});
	await page.send('Fetch.enable', {
		patterns: [{ urlPattern: CHUNK_URL_PATTERN, requestStage: 'Request' }]
	});

	// Warm up the tab the way a session does: home, one Preset, home again. The
	// chunks fetched along the way are what a stale tab still has.
	await page.send('Page.navigate', { url: `${PROBE_ORIGIN}/` });
	const home = await waitForPageView(
		page,
		(view) => view.view === 'home' && view.cardCount >= 4,
		WORKSPACE_READY_TIMEOUT_MS,
		'the home page'
	);
	const cardCount = home.cardCount;
	simulation.phase = 'warm-preset';
	const warmPathname = await clickHomeCard(page, 0);
	await waitForPageView(
		page,
		(view) => view.pathname === warmPathname && view.view === 'workspace',
		WORKSPACE_READY_TIMEOUT_MS,
		`the Workspace at ${warmPathname}`
	);
	simulation.phase = 'home-again';
	await clickHomeLink(page);
	await waitForPageView(
		page,
		(view) => view.view === 'home',
		WORKSPACE_READY_TIMEOUT_MS,
		'the home page'
	);
	const fullNavigationsAfterWarmUp = simulation.fullNavigations.length;
	simulation.phase = 'armed';

	// 1. A rebuild lands. The next Preset needs a chunk the origin no longer has:
	//    the tab must reload onto the current build and then render it.
	const firstNewerVersion = await publishNewerVersion('reload', restartOrigin);
	simulation.armed = true;
	const reloaded = await openCardNeedingNewChunks(
		page,
		simulation,
		1,
		cardCount,
		(view) =>
			simulation.fullNavigations.length > fullNavigationsAfterWarmUp ||
			view.view === 'renderer-error'
	);
	const reloadedOnce = simulation.fullNavigations.length === fullNavigationsAfterWarmUp + 1;
	const landedOnSamePreset =
		reloadedOnce &&
		new URL(simulation.fullNavigations.at(-1) ?? '', PROBE_ORIGIN).pathname === reloaded.pathname;
	findings.push({
		name: 'failed on-demand import reloads the tab once',
		passed: reloadedOnce && landedOnSamePreset && reloaded.view.view !== 'renderer-error',
		detail: reloadedOnce
			? `${simulation.failedChunkUrls.length} chunk request(s) failed on ${reloaded.pathname}; the tab reloaded to ${simulation.fullNavigations.at(-1)}`
			: `no reload; the route showed ${reloaded.view.view} (${reloaded.view.errorMessage ?? 'no message'}); ` +
				`version.json answers: ${simulation.versionResponses.join(', ') || 'none'}; ` +
				`guard: ${await page.evaluate<string | null>(`sessionStorage.getItem(${JSON.stringify(RELOADED_FROM_BUILD_KEY)})`)}; ` +
				`origin now says: ${await page.evaluate<string>(`fetch('/_app/version.json', { cache: 'no-store' }).then((r) => r.status + ' ' + r.headers.get('content-length') + ' ' + r.text())`).catch((error: Error) => error.message)}; ` +
				`console: ${simulation.consoleMessages.join(' | ') || 'quiet'}`
	});
	if (reloadedOnce) {
		const rendered = await waitForPageView(
			page,
			(view) =>
				view.pathname === reloaded.pathname &&
				(view.view === 'workspace' || view.view === 'renderer-error'),
			WORKSPACE_READY_TIMEOUT_MS,
			`the reloaded Workspace at ${reloaded.pathname}`
		);
		const remembered = await page.evaluate<string | null>(
			`sessionStorage.getItem(${JSON.stringify(RELOADED_FROM_BUILD_KEY)})`
		);
		findings.push({
			name: 'the reloaded tab renders the Preset and remembers the build it left',
			passed:
				rendered.view === 'workspace' &&
				remembered === buildVersion &&
				simulation.reloadWarnings === 1,
			detail: `view ${rendered.view}; ${RELOADED_FROM_BUILD_KEY}=${remembered} (build ${buildVersion}); ${simulation.reloadWarnings} reload warning(s)`
		});
	}

	// 2. The same build is still what the origin serves (a restart window). The
	//    guard refuses a second reload from it, and the failure is shown instead.
	await clickHomeLink(page);
	await waitForPageView(
		page,
		(view) => view.view === 'home',
		WORKSPACE_READY_TIMEOUT_MS,
		'the home page'
	);
	const fullNavigationsBeforeGuard = simulation.fullNavigations.length;
	const failedBeforeGuard = simulation.failedChunkUrls.length;
	simulation.armed = true;
	const guarded = await openCardNeedingNewChunks(
		page,
		simulation,
		reloaded.cardIndex + 1,
		cardCount,
		(view) =>
			view.view === 'renderer-error' ||
			simulation.fullNavigations.length > fullNavigationsBeforeGuard
	);
	simulation.armed = false;
	findings.push({
		name: 'a second failure from the same build shows the error instead of looping',
		passed:
			guarded.view.view === 'renderer-error' &&
			simulation.fullNavigations.length === fullNavigationsBeforeGuard &&
			simulation.failedChunkUrls.length > failedBeforeGuard,
		detail: `view ${guarded.view.view} on ${guarded.pathname}: ${guarded.view.errorMessage ?? 'no message'}; ${simulation.fullNavigations.length - fullNavigationsBeforeGuard} further reload(s)`
	});

	// 3. The tab now knows a newer build exists (`updated.current`): its next
	//    navigation must be a full page load, not a client-side one.
	//    (`navigatedWithinDocument` still fires for the router's own replaceState
	//    scroll bookkeeping on the way out, so only the document navigation counts.)
	const fullNavigationsBeforeHome = simulation.fullNavigations.length;
	await clickHomeLink(page);
	const homeAgain = await waitForPageView(
		page,
		(view) => view.view === 'home' && simulation.fullNavigations.length > fullNavigationsBeforeHome,
		WORKSPACE_READY_TIMEOUT_MS,
		'a full navigation back to the home page'
	);
	findings.push({
		name: 'a stale tab leaves the client router on its next navigation',
		passed:
			homeAgain.pathname === '/' &&
			simulation.fullNavigations.length === fullNavigationsBeforeHome + 1,
		detail: `full navigation to ${simulation.fullNavigations.at(-1)}`
	});

	// 4. A fresh page on the old build learns of the newer one by polling, then
	//    takes its next click as a full page load before any import is attempted.
	const secondNewerVersion = await publishNewerVersion('poll', restartOrigin);
	let versionPolls = 0;
	page.on('Network.requestWillBeSent', (params) => {
		const url = String((params.request as { url?: string } | undefined)?.url ?? '');
		if (url.endsWith('/_app/version.json')) versionPolls += 1;
	});
	const pollDeadline = Date.now() + VERSION_POLL_TIMEOUT_MS;
	while (versionPolls === 0 && Date.now() < pollDeadline) await sleep(POLL_INTERVAL_MS);
	const fullNavigationsBeforePolledClick = simulation.fullNavigations.length;
	const polledPathname = await clickHomeCard(page, 0);
	const polled = await waitForPageView(
		page,
		(view) => view.pathname === polledPathname && view.view === 'workspace',
		WORKSPACE_READY_TIMEOUT_MS,
		`the Workspace at ${polledPathname} after the version poll`
	);
	findings.push({
		name: 'the version poll turns the next click into a full page load',
		passed:
			versionPolls > 0 &&
			simulation.fullNavigations.length === fullNavigationsBeforePolledClick + 1 &&
			polled.view === 'workspace',
		detail: `${versionPolls} poll(s) saw ${secondNewerVersion} (first rebuild was ${firstNewerVersion}); ${simulation.fullNavigations.length - fullNavigationsBeforePolledClick} full navigation(s) to ${polledPathname}`
	});
}

// ---- Run --------------------------------------------------------------------

if (!existsSync(versionFilePath)) {
	throw new Error(`No version.json at ${versionFilePath}. Run \`pnpm build\` first.`);
}
const originalVersionFile = await readFile(versionFilePath, 'utf8');
const originalPrecompressedVersionFiles = await Promise.all(
	precompressedVersionFilePaths.map(async (path) => ({
		path,
		content: existsSync(path) ? await readFile(path) : null
	}))
);
const buildVersion = String((JSON.parse(originalVersionFile) as { version: string }).version);

const jail = await createVerificationServerJail('stale-build');
let server = await startProbeServer(jail);
const restartOrigin = async (): Promise<void> => {
	await server.stop();
	server = await startProbeServer(jail);
};
const harness = spawnSync('scripts/launch-cdp-chrome.sh', [], {
	cwd: repositoryRoot,
	stdio: 'inherit',
	env: {
		...process.env,
		CDP_PORT: String(CDP_PORT),
		CDP_BROWSER_MODE: 'canvas',
		CDP_PROFILE_DIR: jail.chromeProfileDirectory
	}
});
if (harness.status !== 0) {
	await server.stop();
	await jail.dispose();
	throw new Error(`The sanctioned CDP harness would not start (status ${harness.status}).`);
}

let page: CdpPage | null = null;
// Findings land here as they are made, so a run that dies mid-way still reports
// what it proved before the failure.
const findings: ProbeFinding[] = [];
let failure: string | null = null;
try {
	page = await openCdpPage();
	await runProbe(page, buildVersion, restartOrigin, findings);
} catch (error) {
	failure = error instanceof Error ? error.message : String(error);
} finally {
	// Leave the artifact as the build made it, precompressed siblings included.
	await writeFile(versionFilePath, originalVersionFile);
	for (const { path, content } of originalPrecompressedVersionFiles) {
		if (content) await writeFile(path, content);
	}
	await page?.close().catch(() => undefined);
	await closeHarnessBrowser().catch(() => undefined);
	await server.stop();
	await jail.dispose();
}

const passed =
	failure === null && findings.length === 5 && findings.every((finding) => finding.passed);
console.log(
	JSON.stringify(
		{
			origin: PROBE_ORIGIN,
			buildVersion,
			findings,
			failure,
			verdict: passed ? 'pass' : 'fail'
		},
		null,
		2
	)
);
if (!passed) process.exitCode = 1;
