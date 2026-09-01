// Prove, in a real browser, that a composition bound to a User Pack renders
// through the two-source pack chain and the same-origin font cache (ADR-0055):
//
//   1. Seed   — a jail holds a User Pack forked from clean-light with a magenta
//               field, its faces pre-materialized from the @fontsource woff2
//               files this checkout already ships (sha-256 named, indexed), and
//               a composition bound to it with a pack background fill. Nothing is
//               fetched from Google: the seed is exactly what a save leaves behind.
//   2. Render — the built Node artifact serves the jail; the sanctioned CDP
//               harness opens /p/<slug>, waits for the render, and screenshots
//               the canvas.
//   3. Assert — the field pixels are the User Pack's magenta (the pack decided
//               the pixels, nothing substituted a built-in), Geist resolved from
//               /api/user-pack-fonts and is loaded in document.fonts, and no
//               request left for fonts.googleapis.com or fonts.gstatic.com.
//
// One deterministic script on the CDP harness — never the MCP browser. Needs a
// built artifact:
//
//   pnpm build && pnpm probe:user-pack-render
//
// Writes docs/browser-probes/user-pack-render.json and exits non-zero on the
// first contract the live render misses.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PNG } from 'pngjs';

import { registerGfxRuntimeModuleHooks } from './gfx-runtime-module-hooks.ts';
import {
	assertVerificationOriginAllowed,
	createVerificationServerJail,
	type VerificationServerJail
} from './verification-server-jail.ts';

const PROBE_CDP_PORT = Number(process.env.GFX_USER_PACK_PROBE_CDP_PORT ?? 9249);
const SERVER_PORT = Number(process.env.GFX_USER_PACK_PROBE_PORT ?? 7321);
const PROBE_ORIGIN = `http://localhost:${SERVER_PORT}`;
const PACK_SLUG = 'probe-brand';
const COMPOSITION_SLUG = 'probe-user-pack';
const FIELD_HEX = '#ff00ff';
const RENDER_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 250;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntryPath = resolve(repoRoot, 'build/index.js');
const evidencePath = resolve(
	process.env.GFX_USER_PACK_PROBE_EVIDENCE ??
		`${repoRoot}/docs/browser-probes/user-pack-render.json`
);

registerGfxRuntimeModuleHooks(repoRoot);
const { PACK_REGISTRY } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/registry.ts')).href
)) as typeof import('../src/lib/platform/packs/registry.ts');
const { userPackContentHash } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/user-pack-store-documents.server.ts')).href
)) as typeof import('../src/lib/platform/user-pack-store-documents.server.ts');

const failures: string[] = [];
function check(condition: boolean, failure: string): void {
	if (!condition) failures.push(failure);
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

// ---- The seed ---------------------------------------------------------------

/** The latin slice fontsource ships, declared with the range Google would have served it under. */
const LATIN_UNICODE_RANGE =
	'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

interface SeededFace {
	family: string;
	style: 'normal';
	weight: string;
	unicodeRange: string;
	url: string;
}

/**
 * Materialize the built-in's font claims from the bundled @fontsource files:
 * the same bytes a browser already renders clean-light with, pinned exactly the
 * way `materializeUserPackFonts` pins a download.
 */
function seedFontCache(jail: VerificationServerJail): SeededFace[] {
	const fontCacheDirectory = resolve(jail.root, 'fonts');
	mkdirSync(fontCacheDirectory, { recursive: true });
	const faces: SeededFace[] = [];
	const index: Record<string, { files: object[]; fetchedAt: string }> = {};
	for (const font of PACK_REGISTRY['clean-light'].fonts ?? []) {
		const packageName = font.family.toLowerCase().replace(/ /g, '-');
		for (const weight of font.weights ?? [400]) {
			const fileName = `${packageName}-latin-${weight}-normal.woff2`;
			const sourcePath = resolve(
				repoRoot,
				'node_modules/@fontsource',
				packageName,
				'files',
				fileName
			);
			const bytes = readFileSync(sourcePath);
			const hash = createHash('sha256').update(bytes).digest('hex');
			writeFileSync(resolve(fontCacheDirectory, `${hash}.woff2`), bytes);
			const file = {
				hash,
				sourceUrl: `fontsource:@fontsource/${packageName}/files/${fileName}`,
				weight: String(weight),
				style: 'normal',
				unicodeRange: LATIN_UNICODE_RANGE
			};
			index[`${font.family}|${weight}|normal`] = {
				files: [file],
				fetchedAt: '2026-09-01T00:00:00.000Z'
			};
			faces.push({
				family: font.family,
				style: 'normal',
				weight: String(weight),
				unicodeRange: LATIN_UNICODE_RANGE,
				url: `/api/user-pack-fonts/${hash}.woff2`
			});
		}
	}
	writeFileSync(
		resolve(fontCacheDirectory, 'index.json'),
		JSON.stringify({ faces: index }, null, '\t')
	);
	return faces;
}

function seedUserPack(jail: VerificationServerJail, fontFaces: SeededFace[]): string {
	const builtin = PACK_REGISTRY['clean-light'];
	const manifest = {
		slug: PACK_SLUG,
		label: 'Probe brand',
		description: 'A clean-light fork whose field is unmistakably not a built-in colour.',
		roles: {
			...structuredClone(builtin.roles),
			'field-treatment': { kind: 'style', value: FIELD_HEX }
		},
		fonts: structuredClone(builtin.fonts)
	};
	const contentHash = userPackContentHash(manifest);
	const packStoreDirectory = resolve(jail.root, 'packs');
	mkdirSync(packStoreDirectory, { recursive: true });
	writeFileSync(
		resolve(packStoreDirectory, `${PACK_SLUG}.json`),
		JSON.stringify(
			{
				meta: {
					forkedFrom: 'clean-light',
					savedAt: '2026-09-01T00:00:00.000Z',
					contentHash,
					fontFaces
				},
				manifest
			},
			null,
			'\t'
		)
	);
	return contentHash;
}

function seedComposition(jail: VerificationServerJail): void {
	const blank = JSON.parse(
		readFileSync(resolve(repoRoot, 'src/lib/presets/blank.json'), 'utf8')
	) as Record<string, unknown>;
	const state = blank.state as Record<string, unknown>;
	mkdirSync(jail.compositionStoreDirectory, { recursive: true });
	writeFileSync(
		resolve(jail.compositionStoreDirectory, `${COMPOSITION_SLUG}.json`),
		JSON.stringify(
			{
				meta: { forkedFrom: null, savedAt: '2026-09-01T00:00:00.000Z' },
				preset: {
					...blank,
					name: 'Probe user pack',
					pack: PACK_SLUG,
					state: { ...state, backgroundFill: 'pack' }
				}
			},
			null,
			'\t'
		)
	);
}

// ---- The server under measurement -------------------------------------------

async function startOriginStoreServer(jail: VerificationServerJail): Promise<() => Promise<void>> {
	if (!existsSync(serverEntryPath)) {
		throw new Error(`No Node artifact at ${serverEntryPath}. Run \`pnpm build\` first.`);
	}
	assertVerificationOriginAllowed(PROBE_ORIGIN);
	const child = spawn(process.execPath, [serverEntryPath], {
		cwd: repoRoot,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {
			...process.env,
			...jail.environment,
			PORT: String(SERVER_PORT),
			ORIGIN: PROBE_ORIGIN
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
			if (health.ok || health.status === 503) return stop;
		} catch {
			// Not listening yet.
		}
		await sleep(POLL_INTERVAL_MS);
	}
	await stop();
	throw new Error(`The probe server never answered at ${PROBE_ORIGIN}.`);
}

// ---- The measured browser ---------------------------------------------------

interface CdpPage {
	send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
	evaluate<T>(expression: string): Promise<T>;
	navigate(url: string): Promise<void>;
	readonly requests: string[];
	readonly consoleMessages: string[];
	close(): Promise<void>;
}

async function openCdpPage(): Promise<CdpPage> {
	const response = await fetch(
		`http://localhost:${PROBE_CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!response.ok) throw new Error(`CDP ${PROBE_CDP_PORT} would not open a target`);
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
	const requests: string[] = [];
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
			const request = (message.params?.request ?? {}) as { url?: string };
			requests.push(request.url ?? '');
			return;
		}
		if (message.method === 'Runtime.consoleAPICalled') {
			const args = (message.params?.args ?? []) as { value?: unknown; description?: string }[];
			consoleMessages.push(
				args.map((argument) => argument.description ?? JSON.stringify(argument.value)).join(' ')
			);
			return;
		}
		if (message.method === 'Runtime.exceptionThrown') {
			const details = (message.params?.exceptionDetails ?? {}) as {
				text?: string;
				exception?: { description?: string };
			};
			consoleMessages.push(`exception: ${details.exception?.description ?? details.text ?? ''}`);
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
	await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
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

/**
 * Close the browser this run launched, so its jailed profile can be disposed
 * and the port is free for the next run. Best effort: a browser that already
 * went away is the state this wants.
 */
async function closeProbeBrowser(): Promise<void> {
	try {
		const version = (await (
			await fetch(`http://localhost:${PROBE_CDP_PORT}/json/version`)
		).json()) as {
			webSocketDebuggerUrl: string;
		};
		const socket = new WebSocket(version.webSocketDebuggerUrl);
		await new Promise<void>((settle, fail) => {
			socket.onopen = () => settle();
			socket.onerror = () => fail(new Error('browser socket refused'));
		});
		socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
		await sleep(500);
		socket.close();
	} catch {
		// Already gone.
	}
}

/** The largest canvas on the page is the composition's WebGPU output. */
const COMPOSITION_CANVAS = `[...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]`;

interface CanvasRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

async function awaitRender(page: CdpPage): Promise<CanvasRect> {
	return waitFor(
		'the composition render',
		RENDER_TIMEOUT_MS,
		() =>
			page.evaluate<CanvasRect | null>(`(async () => {
				if (document.readyState !== 'complete' || !window.__gfxTimeline) return null;
				const canvas = ${COMPOSITION_CANVAS};
				if (!canvas || canvas.width === 0) return null;
				if (document.fonts.status !== 'loaded') return null;
				window.__gfxTimeline.seekProgress(0.5);
				await new Promise((settle) => setTimeout(settle, 400));
				const rect = canvas.getBoundingClientRect();
				return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
			})()`),
		(rect) => rect !== null && rect.width > 0
	) as Promise<CanvasRect>;
}

/** Mean RGB of a small on-surface clip: a field sample near a corner, well inside the frame. */
async function sampleCanvas(
	page: CdpPage,
	rect: CanvasRect,
	fractionX: number,
	fractionY: number
): Promise<{ r: number; g: number; b: number }> {
	const size = 12;
	const shot = (await page.send('Page.captureScreenshot', {
		format: 'png',
		fromSurface: true,
		clip: {
			x: rect.x + rect.width * fractionX - size / 2,
			y: rect.y + rect.height * fractionY - size / 2,
			width: size,
			height: size,
			scale: 1
		}
	})) as { data: string };
	const png = PNG.sync.read(Buffer.from(shot.data, 'base64'));
	let r = 0;
	let g = 0;
	let b = 0;
	const pixels = png.width * png.height;
	for (let index = 0; index < pixels; index += 1) {
		r += png.data[index * 4];
		g += png.data[index * 4 + 1];
		b += png.data[index * 4 + 2];
	}
	return { r: Math.round(r / pixels), g: Math.round(g / pixels), b: Math.round(b / pixels) };
}

// ---- The run ----------------------------------------------------------------

const jail = await createVerificationServerJail('user-pack-render');
const fontFaces = seedFontCache(jail);
const seededContentHash = seedUserPack(jail, fontFaces);
seedComposition(jail);
const stopServer = await startOriginStoreServer(jail);
const harness = spawnSync('scripts/launch-cdp-chrome.sh', [], {
	cwd: repoRoot,
	stdio: 'inherit',
	env: {
		...process.env,
		CDP_PORT: String(PROBE_CDP_PORT),
		CDP_BROWSER_MODE: 'canvas',
		CDP_PROFILE_DIR: jail.chromeProfileDirectory
	}
});
if (harness.status !== 0) {
	await stopServer();
	await jail.dispose();
	throw new Error(`The sanctioned CDP harness would not start (status ${harness.status}).`);
}

const page = await openCdpPage();
const measurements: Record<string, unknown> = { packSlug: PACK_SLUG, seededContentHash };
try {
	// The store serves the seeded pack exactly as written.
	const served = (await (await fetch(`${PROBE_ORIGIN}/api/user-packs/${PACK_SLUG}`)).json()) as {
		contentHash?: string;
		fontFaces?: unknown[];
	} | null;
	check(served?.contentHash === seededContentHash, 'the origin did not serve the seeded User Pack');
	measurements.servedFontFaces = served?.fontFaces?.length ?? 0;

	await page.navigate(`${PROBE_ORIGIN}/p/${COMPOSITION_SLUG}`);
	let rect: CanvasRect;
	try {
		rect = await awaitRender(page);
	} catch (cause) {
		const pageText = await page
			.evaluate<string>(`document.body.textContent.replace(/\\s+/g, ' ').slice(0, 600)`)
			.catch(() => '(page unreadable)');
		throw new Error(
			`${cause instanceof Error ? cause.message : String(cause)}\nPage text: ${pageText}\nConsole:\n${page.consoleMessages.join('\n')}`,
			{ cause }
		);
	}
	measurements.canvasRect = rect;

	const missingPackShown = await page.evaluate<boolean>(
		`document.body.textContent.includes('User Pack store holds nothing')`
	);
	check(!missingPackShown, 'the Workspace reported the seeded User Pack as missing');

	// The Pack control must list and show the User Pack, not a blank option.
	const packControlValue = await page.evaluate<string>(
		`([...document.querySelectorAll('select')].find((select) => [...select.options].some((option) => option.value === ${JSON.stringify(PACK_SLUG)}))?.value ?? '')`
	);
	measurements.packControlValue = packControlValue;
	check(
		packControlValue === PACK_SLUG,
		`the Pack control shows "${packControlValue}", not the bound User Pack`
	);

	const field = await sampleCanvas(page, rect, 0.04, 0.06);
	measurements.fieldSample = field;
	check(
		field.r >= 200 && field.g <= 80 && field.b >= 200,
		`the field rendered ${JSON.stringify(field)}, not the User Pack's ${FIELD_HEX}`
	);

	const fontState = await page.evaluate<{ geistLoaded: boolean; cachedFaces: number }>(`({
		geistLoaded: document.fonts.check('normal 400 1em "Geist"'),
		cachedFaces: [...document.fonts].filter((face) => face.family === 'Geist' && face.status === 'loaded').length
	})`);
	measurements.fontState = fontState;
	check(fontState.geistLoaded, 'Geist was not loaded when the render was ready');

	const cacheRequests = page.requests.filter((url) => url.includes('/api/user-pack-fonts/'));
	const thirdPartyRequests = page.requests.filter(
		(url) => url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')
	);
	measurements.cacheRequests = cacheRequests.length;
	measurements.thirdPartyFontRequests = thirdPartyRequests;
	check(cacheRequests.length > 0, 'no request reached the same-origin font cache');
	check(
		thirdPartyRequests.length === 0,
		`render time reached a third party: ${thirdPartyRequests.join(', ')}`
	);
} finally {
	await page.close();
	await closeProbeBrowser();
	await stopServer();
	await jail.dispose();
}

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(
	evidencePath,
	`${JSON.stringify({ probe: 'user-pack-render', origin: PROBE_ORIGIN, measurements, failures }, null, '\t')}\n`
);
if (failures.length > 0) {
	console.error(
		`user-pack-render: ${failures.length} contract(s) missed\n- ${failures.join('\n- ')}`
	);
	process.exit(1);
}
console.log(
	`user-pack-render: the User Pack decided the pixels and every face came from the cache; evidence at ${evidencePath}`
);
