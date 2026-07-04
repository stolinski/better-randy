/**
 * probe-pack-diff.ts — ADR-0038's regression lock: rendering any Preset under
 * two Packs must produce a visible pixel diff on every non-immune Pipeline.
 *
 * For every Pipeline registered in IDENTITY_REGISTRY this script:
 *   1. picks a representative built-in Preset that exercises it (coverage map
 *      built by scanning src/lib/presets/*.json — surface.type,
 *      overlays[].type, surface.diagram[].type, annotation [style] tags in
 *      body text, and body paragraphs for block:paragraph),
 *   2. drives the flag-enabled Chrome on CDP port 9223 (same harness approach
 *      as scripts/cdp-capture.mjs): loads /p/<slug>, pauses the Timeline,
 *      pins a deterministic mid-piece frame via window.__supersTimeline,
 *      captures the canvas under pack A, swaps packState.slug to pack B
 *      in-page (through the app's versioned engine-state module URL, with
 *      transitionState.capturing=true bracketing the swap so the autosave
 *      fork never observes the scratch pack), captures the SAME frame again,
 *      and restores the original pack. The Preset's authored
 *      typography.paperColor/inkColor overrides are LIFTED for both captures
 *      — see beginPackSwap — so the override ?? packRole seam resolves on
 *      the pack side (the thing being locked),
 *   3. diffs the two captures (mean absolute RGB diff + changed-pixel
 *      percent) and PASSes the Pipeline only when the frame visibly changed.
 *
 * Pack-immune Pipelines (PACK_IMMUNE_PIPELINE_KEYS — surface:imessage,
 * surface:web-document) are EXEMPT from must-diff: their artifact is
 * verisimilar by contract and may legitimately render identically. They are
 * listed as `immune (exempt)`. A registered Pipeline with no covering Preset
 * is reported as a coverage-gap WARNING, not a failure.
 *
 * Thresholds (calibrated 2026-07-04, syntax ↔ editorial-mono at 960×540):
 *   - a pixel counts as "changed" when any RGB channel moves by > 8/255 —
 *     re-capturing the same pinned frame under the same pack measures
 *     0.00–0.03% changed pixels (WebGPU + text-AA re-capture noise);
 *   - a Pipeline PASSes when changed-pixel-percent ≥ 0.25%. The smallest
 *     real re-skin measured is 0.78% (lower-third-cinematic — one small
 *     overlay in an otherwise-empty 4K frame; plate/accent/ink all flip);
 *     full-frame surfaces measure 10–57%. 0.25% sits ~8× above the noise
 *     floor and ~3× below the smallest genuine re-skin.
 *
 * Usage:
 *   npx tsx scripts/probe-pack-diff.ts                       # preset's own pack vs editorial-mono
 *   npx tsx scripts/probe-pack-diff.ts --packs syntax,crt-terminal
 *   npx tsx scripts/probe-pack-diff.ts --only quote-magnify  # subset while iterating
 *   npx tsx scripts/probe-pack-diff.ts --threshold 1.0 --port 9223
 *
 * Captures + stats land in docs/critic-captures/pack-diff/ (committed): the
 * paired half-ish-res captures (<slug>--<pack>.png at 25% of native 4K) and
 * pack-diff-results.json with the coverage map and per-preset numbers.
 * Non-zero exit on any FAIL (= partial pack buy-in regressed).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PNG } from 'pngjs';

// The Pack manifests transitively import @fontsource side-effect stylesheets
// (`packs/syntax/fonts.ts`), which Node/tsx cannot load — stub `.css` modules
// so the registry is importable outside Vite (same pattern as verify-presets).
registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith('.css')) {
			return { format: 'module', source: '', shortCircuit: true };
		}
		return nextLoad(url, context);
	}
});

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const presetDir = resolve(repoRoot, 'src/lib/presets');
const identityRegistryModulePath = resolve(
	repoRoot,
	'src/lib/platform/pipelines/identity-registry.ts'
);
const packRegistryModulePath = resolve(repoRoot, 'src/lib/platform/packs/registry.ts');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
	packA: string | null; // null = each preset's own pack
	packB: string;
	only: readonly string[] | null;
	port: number;
	changedPctThreshold: number;
	channelDelta: number;
	captureScale: number;
	outDir: string;
}

function parseCli(argv: readonly string[]): CliOptions {
	const options: CliOptions = {
		packA: null,
		packB: 'editorial-mono',
		only: null,
		port: 9223,
		changedPctThreshold: 0.25,
		channelDelta: 8,
		captureScale: 0.25,
		outDir: resolve(repoRoot, 'docs/critic-captures/pack-diff')
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = (): string => {
			const value = argv[++i];
			if (value === undefined) {
				throw new Error(`Flag ${arg} expects a value`);
			}
			return value;
		};
		if (arg === '--packs') {
			const [a, b] = next().split(',');
			if (!a || !b) {
				throw new Error('--packs expects "packA,packB"');
			}
			options.packA = a.trim();
			options.packB = b.trim();
		} else if (arg === '--only') {
			options.only = next()
				.split(',')
				.map((slug) => slug.trim())
				.filter((slug) => slug.length > 0);
		} else if (arg === '--port') {
			options.port = Number(next());
		} else if (arg === '--threshold') {
			options.changedPctThreshold = Number(next());
		} else if (arg === '--channel-delta') {
			options.channelDelta = Number(next());
		} else if (arg === '--scale') {
			options.captureScale = Number(next());
		} else if (arg === '--outdir') {
			options.outDir = resolve(process.cwd(), next());
		} else {
			throw new Error(`Unknown flag: ${arg}`);
		}
	}

	return options;
}

const cli = parseCli(process.argv.slice(2));

// ---------------------------------------------------------------------------
// Registry import (tsx resolves $lib; CSS is stubbed above)
// ---------------------------------------------------------------------------

const { IDENTITY_REGISTRY, PACK_IMMUNE_PIPELINE_KEYS } = (await import(
	pathToFileURL(identityRegistryModulePath).href
)) as {
	IDENTITY_REGISTRY: Readonly<Record<string, unknown>>;
	PACK_IMMUNE_PIPELINE_KEYS: readonly string[];
};

const { PACK_REGISTRY } = (await import(pathToFileURL(packRegistryModulePath).href)) as {
	PACK_REGISTRY: Readonly<Record<string, { slug: string }>>;
};

const registeredPipelineKeys = Object.keys(IDENTITY_REGISTRY);
const immuneKeys = new Set(PACK_IMMUNE_PIPELINE_KEYS);

for (const pack of [cli.packA, cli.packB]) {
	if (pack !== null && !(pack in PACK_REGISTRY)) {
		console.error(
			`Unknown pack "${pack}" — registered packs: ${Object.keys(PACK_REGISTRY).join(', ')}`
		);
		process.exit(2);
	}
}

// ---------------------------------------------------------------------------
// Coverage map — scan the corpus for which Preset exercises which Pipeline
// ---------------------------------------------------------------------------

interface PresetScan {
	slug: string;
	kind: string | undefined;
	pack: string;
	orientation: string;
	covers: ReadonlySet<string>;
}

const annotationStyles = registeredPipelineKeys
	.filter((key) => key.startsWith('annotation:'))
	.map((key) => key.slice('annotation:'.length));

/** Surfaces whose non-empty `content.body` renders through block:paragraph. */
const PARAGRAPH_BODY_SURFACES = new Set(['paper', 'plain', 'newspaper']);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scanPreset(slug: string, json: unknown): PresetScan | null {
	if (!isRecord(json) || !isRecord(json.state)) {
		return null;
	}
	const state = json.state;
	const covers = new Set<string>();

	const surface = isRecord(state.surface) ? state.surface : null;
	const surfaceType = surface && typeof surface.type === 'string' ? surface.type : null;
	if (surfaceType) {
		covers.add(`surface:${surfaceType}`);
	}

	if (Array.isArray(state.overlays)) {
		for (const overlay of state.overlays) {
			if (isRecord(overlay) && typeof overlay.type === 'string') {
				covers.add(`overlay:${overlay.type}`);
			}
		}
	}

	if (surface && Array.isArray(surface.diagram)) {
		for (const element of surface.diagram) {
			if (isRecord(element) && typeof element.type === 'string') {
				covers.add(`block:${element.type}`);
			}
		}
	}

	// Annotation marks ride inline [style]…[/style] tags in body text (paper /
	// plain / newspaper bodies and web-document / imessage message bodies alike).
	const serialized = JSON.stringify(json);
	for (const style of annotationStyles) {
		if (serialized.includes(`[${style}]`)) {
			covers.add(`annotation:${style}`);
		}
	}

	// block:paragraph has no JSON `type` of its own — body paragraphs on the
	// text surfaces render through the paragraph Block pipeline.
	if (surfaceType && PARAGRAPH_BODY_SURFACES.has(surfaceType)) {
		const content = isRecord(surface.content) ? surface.content : null;
		const body = content?.body;
		const hasBody =
			(typeof body === 'string' && body.trim().length > 0) ||
			(Array.isArray(body) && body.length > 0);
		if (hasBody) {
			covers.add('block:paragraph');
		}
	}

	return {
		slug,
		kind: typeof json.kind === 'string' ? json.kind : undefined,
		pack: typeof json.pack === 'string' ? json.pack : 'syntax',
		orientation:
			isRecord(state.transport) && typeof state.transport.orientation === 'string'
				? state.transport.orientation
				: 'horizontal',
		covers
	};
}

const presetScans: PresetScan[] = [];
for (const file of readdirSync(presetDir).filter((name) => name.endsWith('.json'))) {
	const slug = file.replace(/\.json$/, '');
	const parsed: unknown = JSON.parse(readFileSync(resolve(presetDir, file), 'utf8'));
	const scan = scanPreset(slug, parsed);
	if (scan) {
		presetScans.push(scan);
	}
}

/**
 * Hand-picked representatives where the deterministic scoring below would pick
 * a Preset that covers the Pipeline but doesn't showcase it (the lower-third's
 * cinematic variant exercises the plate/scrim/flare Roles; the DOF presets
 * merely carry a lower-third in the background).
 */
const REPRESENTATIVE_OVERRIDES: Readonly<Record<string, string>> = {
	'overlay:lower-third': 'lower-third-cinematic'
};

/**
 * Per-Preset frame choice (Timeline progress 0..1) — the frame both captures
 * pin. Default is 0.5 (mid-piece: enters settled, exits not started). Override
 * where a covered Pipeline isn't fully on-frame at 0.5:
 *   - research-paper-critique: its third mark (circle) draws at 0.60–0.70, so
 *     0.75 is the first mid-piece frame with all three annotation styles
 *     (highlight / underline / circle) fully drawn.
 */
const PRESET_PROGRESS: Readonly<Record<string, number>> = {
	'research-paper-critique': 0.75
};
const DEFAULT_PROGRESS = 0.5;

function pickRepresentative(pipelineKey: string): PresetScan | null {
	const override = REPRESENTATIVE_OVERRIDES[pipelineKey];
	if (override) {
		const scan = presetScans.find((entry) => entry.slug === override);
		if (!scan || !scan.covers.has(pipelineKey)) {
			throw new Error(
				`REPRESENTATIVE_OVERRIDES["${pipelineKey}"] = "${override}" does not cover that pipeline`
			);
		}
		return scan;
	}

	const candidates = presetScans.filter((entry) => entry.covers.has(pipelineKey));
	if (candidates.length === 0) {
		return null;
	}
	// Prefer deliverables over fixtures, horizontal over vertical (one aspect to
	// eyeball), then the Preset covering the most Pipelines (fewer captures
	// overall), then alphabetical for determinism.
	candidates.sort((a, b) => {
		const fixtureRank = Number(a.kind === 'fixture') - Number(b.kind === 'fixture');
		if (fixtureRank !== 0) return fixtureRank;
		const orientationRank =
			Number(a.orientation !== 'horizontal') - Number(b.orientation !== 'horizontal');
		if (orientationRank !== 0) return orientationRank;
		if (a.covers.size !== b.covers.size) return b.covers.size - a.covers.size;
		return a.slug.localeCompare(b.slug);
	});
	return candidates[0];
}

interface CoverageEntry {
	pipeline: string;
	status: 'covered' | 'immune' | 'gap';
	preset: string | null;
	progress: number | null;
}

const coverage: CoverageEntry[] = registeredPipelineKeys.map((pipelineKey) => {
	if (immuneKeys.has(pipelineKey)) {
		return { pipeline: pipelineKey, status: 'immune', preset: null, progress: null };
	}
	const representative = pickRepresentative(pipelineKey);
	if (!representative) {
		return { pipeline: pipelineKey, status: 'gap', preset: null, progress: null };
	}
	return {
		pipeline: pipelineKey,
		status: 'covered',
		preset: representative.slug,
		progress: PRESET_PROGRESS[representative.slug] ?? DEFAULT_PROGRESS
	};
});

// Deduped capture jobs.
interface CaptureJob {
	slug: string;
	progress: number;
	pipelines: string[];
}

const jobsBySlug = new Map<string, CaptureJob>();
for (const entry of coverage) {
	if (entry.status !== 'covered' || entry.preset === null || entry.progress === null) {
		continue;
	}
	const existing = jobsBySlug.get(entry.preset);
	if (existing) {
		existing.pipelines.push(entry.pipeline);
	} else {
		jobsBySlug.set(entry.preset, {
			slug: entry.preset,
			progress: entry.progress,
			pipelines: [entry.pipeline]
		});
	}
}
const jobs = [...jobsBySlug.values()]
	.filter((job) => cli.only === null || cli.only.includes(job.slug))
	.sort((a, b) => a.slug.localeCompare(b.slug));

// ---------------------------------------------------------------------------
// CDP plumbing (same connection + native-canvas capture approach as
// scripts/cdp-capture.mjs — flag-enabled Chrome on the debug port)
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface CdpTarget {
	type: string;
	webSocketDebuggerUrl?: string;
}

async function getTarget(port: number): Promise<CdpTarget & { webSocketDebuggerUrl: string }> {
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const res = await fetch(`http://localhost:${port}/json`);
			const targets = (await res.json()) as CdpTarget[];
			const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
			if (page?.webSocketDebuggerUrl) {
				return page as CdpTarget & { webSocketDebuggerUrl: string };
			}
		} catch {
			// Chrome not up yet; retry.
		}
		await sleep(500);
	}
	throw new Error(
		`Chrome not reachable on CDP port ${port} — launch it with --enable-blink-features=CanvasDrawElement --remote-debugging-port=${port}`
	);
}

interface CdpMessage {
	id?: number;
	error?: unknown;
	result?: unknown;
}

class CdpSession {
	#ws: WebSocket;
	#nextId = 1;
	#pending = new Map<number, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();

	private constructor(ws: WebSocket) {
		this.#ws = ws;
		ws.onmessage = (event: MessageEvent) => {
			const msg = JSON.parse(String(event.data)) as CdpMessage;
			if (msg.id !== undefined && this.#pending.has(msg.id)) {
				const entry = this.#pending.get(msg.id);
				this.#pending.delete(msg.id);
				if (msg.error) entry?.reject(new Error(JSON.stringify(msg.error)));
				else entry?.resolve(msg.result);
			}
		};
	}

	static async connect(url: string): Promise<CdpSession> {
		const ws = new WebSocket(url);
		await new Promise<void>((res, rej) => {
			ws.onopen = () => res();
			ws.onerror = () => rej(new Error(`WebSocket connect failed: ${url}`));
		});
		return new CdpSession(ws);
	}

	send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
		const id = this.#nextId++;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#ws.send(JSON.stringify({ id, method, params }));
		});
	}

	async evaluate<T>(expression: string): Promise<T> {
		const result = (await this.send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true
		})) as { exceptionDetails?: { text: string }; result: { value: T } };
		if (result.exceptionDetails) {
			throw new Error(`Page evaluate failed: ${result.exceptionDetails.text}`);
		}
		return result.result.value;
	}

	close(): void {
		this.#ws.close();
	}
}

interface CanvasRect {
	x: number;
	y: number;
	w: number;
	h: number;
	bw: number;
	bh: number;
}

async function waitReady(session: CdpSession, slug: string): Promise<void> {
	// The PREVIOUS page also has a canvas + timeline, so readiness must be
	// pinned to the expected route or a slow navigation captures the old page.
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			const state = await session.evaluate<{
				onRoute: boolean;
				canvas: boolean;
				timeline: boolean;
			}>(
				`(() => ({
					onRoute: location.pathname === ${JSON.stringify(`/p/${slug}`)},
					canvas: !!document.querySelector('canvas'),
					timeline: !!window.__supersTimeline
				}))()`
			);
			if (state.onRoute && state.canvas && state.timeline) {
				return;
			}
		} catch {
			// Mid-navigation; retry.
		}
		await sleep(500);
	}
	throw new Error(
		`App did not become ready on /p/${slug} (route + canvas + window.__supersTimeline)`
	);
}

/** Pause + seek deterministically; confirm the playhead landed (cdp-capture's loop). */
async function pinFrame(session: CdpSession, progress: number): Promise<number> {
	let landed = -1;
	for (let attempt = 0; attempt < 20; attempt++) {
		landed = await session.evaluate<number>(
			`(() => {
				const t = window.__supersTimeline;
				t.pause();
				t.seekProgress(${progress});
				return t.time;
			})()`
		);
		await sleep(120);
		const { time, expected } = await session.evaluate<{ time: number; expected: number }>(
			`(() => {
				const t = window.__supersTimeline;
				return { time: t.time, expected: ${progress} * t.durationSeconds };
			})()`
		);
		if (Math.abs(time - expected) < 0.05) {
			return time;
		}
	}
	return landed;
}

async function captureCanvas(
	session: CdpSession,
	rect: CanvasRect,
	scale: number,
	outPath: string
): Promise<void> {
	// On-surface capture clipped to the canvas (never the page/editor chrome).
	// NO captureBeyondViewport — it re-rasters without the accelerated WebGPU
	// layer and yields a blank canvas. Clip height derives from the BACKING
	// aspect (see cdp-capture.mjs). `scale` down-samples from native 4K.
	const clipScale = rect.w > 0 ? rect.bw / rect.w : 1;
	const shot = (await session.send('Page.captureScreenshot', {
		format: 'png',
		fromSurface: true,
		clip: {
			x: rect.x,
			y: rect.y,
			width: rect.w,
			height: rect.bh / clipScale,
			scale: clipScale * scale
		}
	})) as { data: string };
	writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
}

// ---------------------------------------------------------------------------
// In-page pack swap — versioned module URL + autosave suppression
// ---------------------------------------------------------------------------

/**
 * Import engine-state through the URL the app itself loaded (Vite versions
 * invalidated modules with ?t=; a bare dynamic import can resolve to a
 * SECOND module instance whose writes the app never sees). Bracket the whole
 * swap window with transitionState.capturing=true so the /p/[slug] autosave
 * effect never observes the scratch pack as a user edit.
 *
 * The window also LIFTS the Preset's authored `typography.paperColor` /
 * `inkColor`. Under ADR-0038 an authored colour is an explicit override that
 * WINS over the Pack, and nearly the whole corpus authors paper+ink — so
 * with the overrides in place a correctly-wired text pipeline legitimately
 * renders identical pixels under two Packs and proves nothing. Lifting them
 * for both captures makes the `override ?? packRole` seam resolve on the
 * pack side, which is exactly the buy-in this lock verifies. EXCEPTION: on
 * full-frame pieces (`backgroundFill` set) the authored ink is load-bearing
 * for legibility (light ink on a dark field — both Packs' core inks are
 * dark, so lifting makes every stroke invisible and zeroes a real structural
 * diff); there the overrides stay and pack response rides the structural
 * Roles (stroke/plate/accent/fill). Everything is restored in endPackSwap.
 *
 * Annotation-mark colours are NOT lifted: the render path
 * (`resolveMarkForIndex` in engine-schema.ts) resolves `timing.color ??
 * defaults.color` with a literal fallback and has no Pack code path today —
 * the declared `<style>.fill` viaPack Roles only reach the editor swatches
 * (`readMarkColor`). Lifting mark colours therefore just blanks the marks
 * (colour undefined) instead of revealing pack response. Until that wiring
 * lands, annotation rows are verified by their covering Preset's frame
 * (surface re-skin included), not by mark ink alone.
 */
async function beginPackSwap(session: CdpSession): Promise<string> {
	const result = await session.evaluate<{ ownSlug: string; moduleUrl: string }>(
		`(async () => {
			const names = performance
				.getEntriesByType('resource')
				.map((entry) => entry.name)
				.filter((name) => name.includes('engine-state.svelte.ts'));
			if (names.length === 0) {
				throw new Error('engine-state.svelte.ts not in the resource-timing buffer — cannot import the app module instance');
			}
			const url = names[names.length - 1];
			const mod = await import(url);
			const state = mod.engineState;
			const lift = state.backgroundFill === undefined || state.backgroundFill === null;
			const saved = {
				lift,
				paperColor: state.typography.paperColor,
				inkColor: state.typography.inkColor
			};
			if (lift) {
				state.typography.paperColor = undefined;
				state.typography.inkColor = undefined;
			}
			window.__packDiff = { mod, originalSlug: mod.packState.slug, saved };
			mod.transitionState.capturing = true;
			return { ownSlug: mod.packState.slug, moduleUrl: url };
		})()`
	);
	return result.ownSlug;
}

async function setPack(session: CdpSession, slug: string): Promise<void> {
	const applied = await session.evaluate<string>(
		`(async () => {
			const pd = window.__packDiff;
			pd.mod.packState.slug = ${JSON.stringify(slug)};
			await document.fonts.ready;
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			return pd.mod.packState.slug;
		})()`
	);
	if (applied !== slug) {
		throw new Error(`Pack swap did not stick: expected "${slug}", app reads "${applied}"`);
	}
	// Let the pack-tracking render $effect re-capture the DOM and composite
	// (uploadDom + tick) before screenshotting.
	await sleep(800);
}

/**
 * Fingerprint the appearance vars the mounts carry (inline --* custom
 * properties under .composition). Sampled under each pack: when the two packs
 * differ but this fingerprint doesn't, the swap never reached the app's DOM
 * (e.g. a duplicate engine-state module instance) and the zero pixel diff
 * would be a harness artifact, not a pipeline verdict — fail the job instead.
 */
async function sampleAppearanceVars(session: CdpSession): Promise<string> {
	return session.evaluate<string>(
		`(() => {
			const samples = [];
			for (const node of document.querySelectorAll('.composition *')) {
				const style = node.getAttribute('style');
				if (style && style.includes('--')) {
					samples.push(style);
					if (samples.length >= 5) break;
				}
			}
			return samples.join('|');
		})()`
	);
}

async function endPackSwap(session: CdpSession): Promise<void> {
	await session.evaluate<boolean>(
		`(async () => {
			const pd = window.__packDiff;
			if (!pd) return false;
			const state = pd.mod.engineState;
			if (pd.saved.lift) {
				state.typography.paperColor = pd.saved.paperColor;
				state.typography.inkColor = pd.saved.inkColor;
			}
			pd.mod.packState.slug = pd.originalSlug;
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			pd.mod.transitionState.capturing = false;
			delete window.__packDiff;
			return true;
		})()`
	);
}

// ---------------------------------------------------------------------------
// Pixel diff
// ---------------------------------------------------------------------------

interface DiffStats {
	width: number;
	height: number;
	meanAbsDiff: number;
	changedPct: number;
}

function diffCaptures(pathA: string, pathB: string, channelDelta: number): DiffStats {
	const a = PNG.sync.read(readFileSync(pathA));
	const b = PNG.sync.read(readFileSync(pathB));
	if (a.width !== b.width || a.height !== b.height) {
		throw new Error(
			`Capture size mismatch: ${pathA} ${a.width}x${a.height} vs ${pathB} ${b.width}x${b.height}`
		);
	}
	const totalPixels = a.width * a.height;
	let sum = 0;
	let changed = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		const dr = Math.abs(a.data[i] - b.data[i]);
		const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
		const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
		sum += dr + dg + db;
		if (dr > channelDelta || dg > channelDelta || db > channelDelta) {
			changed++;
		}
	}
	return {
		width: a.width,
		height: a.height,
		meanAbsDiff: Number((sum / (totalPixels * 3) / 255).toFixed(5)),
		changedPct: Number(((changed / totalPixels) * 100).toFixed(2))
	};
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

interface PresetResult {
	slug: string;
	packA: string;
	packB: string;
	progress: number;
	timelineTime: number;
	captures: [string, string];
	stats: DiffStats | null;
	error: string | null;
}

mkdirSync(cli.outDir, { recursive: true });

const target = await getTarget(cli.port);
const session = await CdpSession.connect(target.webSocketDebuggerUrl);
await session.send('Page.enable');
await session.send('Runtime.enable');
// The default resource-timing buffer (250 entries) overflows on a Vite dev
// page long before engine-state.svelte.ts is recorded — and the versioned-URL
// lookup in beginPackSwap NEEDS that entry (a bare-path dynamic import can
// resolve to a duplicate module instance whose writes the app never sees).
// Raise the buffer before every navigation.
await session.send('Page.addScriptToEvaluateOnNewDocument', {
	source: 'performance.setResourceTimingBufferSize(10000);'
});

const presetResults: PresetResult[] = [];

async function runJob(job: CaptureJob): Promise<PresetResult> {
	const url = `http://localhost:7263/p/${job.slug}`;
	await session.send('Page.navigate', { url });
	await sleep(1800);
	await waitReady(session, job.slug);
	await sleep(900);

	const rect = await session.evaluate<CanvasRect>(
		`(() => {
			const c = document.querySelector('canvas');
			const r = c.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height, bw: c.width, bh: c.height };
		})()`
	);

	const timelineTime = await pinFrame(session, job.progress);
	await sleep(350);

	const ownSlug = await beginPackSwap(session);
	const packA = cli.packA ?? ownSlug;
	// When the preset's own pack IS pack B, diff against the reference pack
	// instead of diffing a pack against itself.
	const packB = packA === cli.packB ? 'syntax' : cli.packB;
	const fileA = resolve(cli.outDir, `${job.slug}--${packA}.png`);
	const fileB = resolve(cli.outDir, `${job.slug}--${packB}.png`);

	let stats: DiffStats | null = null;
	let error: string | null = null;
	try {
		await setPack(session, packA);
		const varsA = await sampleAppearanceVars(session);
		await captureCanvas(session, rect, cli.captureScale, fileA);
		await setPack(session, packB);
		const varsB = await sampleAppearanceVars(session);
		await captureCanvas(session, rect, cli.captureScale, fileB);
		if (varsA.length > 0 && varsA === varsB) {
			// Harness artifact, not a pipeline verdict — thrown so the job-level
			// retry re-navigates and swaps on a fresh page.
			throw new Error(
				'pack swap did not restyle the DOM (appearance vars identical between packs)'
			);
		}
	} finally {
		await endPackSwap(session);
	}

	if (error === null) {
		try {
			stats = diffCaptures(fileA, fileB, cli.channelDelta);
		} catch (diffError) {
			error = diffError instanceof Error ? diffError.message : String(diffError);
		}
	}

	return {
		slug: job.slug,
		packA,
		packB,
		progress: job.progress,
		timelineTime: Number(timelineTime.toFixed(3)),
		captures: [fileA, fileB],
		stats,
		error
	};
}

for (const job of jobs) {
	process.stderr.write(`▶ ${job.slug} @ p=${job.progress} … `);
	// Two attempts: a concurrent dev session's HMR invalidation can full-reload
	// the page mid-job, which surfaces as a torn evaluate/swap — retry once on
	// a fresh navigation before recording a failure.
	let result: PresetResult | null = null;
	for (let attempt = 0; attempt < 2 && result === null; attempt++) {
		try {
			result = await runJob(job);
		} catch (jobError) {
			const message = jobError instanceof Error ? jobError.message : String(jobError);
			if (attempt === 0) {
				process.stderr.write(`retrying (${message}) … `);
				continue;
			}
			result = {
				slug: job.slug,
				packA: cli.packA ?? 'unknown',
				packB: cli.packB,
				progress: job.progress,
				timelineTime: -1,
				captures: ['', ''],
				stats: null,
				error: message
			};
		}
	}
	if (result === null) {
		continue;
	}
	presetResults.push(result);
	process.stderr.write(
		result.stats
			? `diff ${result.stats.changedPct}% (mean ${result.stats.meanAbsDiff})\n`
			: `ERROR ${result.error}\n`
	);
}

session.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const resultBySlug = new Map(presetResults.map((entry) => [entry.slug, entry]));

interface PipelineRow {
	pipeline: string;
	preset: string;
	diffPct: string;
	status: string;
}

let failures = 0;
let gaps = 0;

const rows: PipelineRow[] = coverage.map((entry) => {
	if (entry.status === 'immune') {
		return { pipeline: entry.pipeline, preset: '—', diffPct: '—', status: 'immune (exempt)' };
	}
	if (entry.status === 'gap' || entry.preset === null) {
		gaps++;
		return {
			pipeline: entry.pipeline,
			preset: '—',
			diffPct: '—',
			status: 'GAP (no covering preset)'
		};
	}
	const result = resultBySlug.get(entry.preset);
	if (!result) {
		return {
			pipeline: entry.pipeline,
			preset: entry.preset,
			diffPct: '—',
			status: 'skipped (--only)'
		};
	}
	if (result.error !== null || result.stats === null) {
		failures++;
		return {
			pipeline: entry.pipeline,
			preset: entry.preset,
			diffPct: '—',
			status: `FAIL (${result.error ?? 'no stats'})`
		};
	}
	const pass = result.stats.changedPct >= cli.changedPctThreshold;
	if (!pass) {
		failures++;
	}
	return {
		pipeline: entry.pipeline,
		preset: entry.preset,
		diffPct: `${result.stats.changedPct}%`,
		status: pass ? 'PASS' : `FAIL (< ${cli.changedPctThreshold}% changed — partial pack buy-in?)`
	};
});

const widths = {
	pipeline: Math.max(...rows.map((r) => r.pipeline.length), 'pipeline'.length),
	preset: Math.max(...rows.map((r) => r.preset.length), 'preset'.length),
	diffPct: Math.max(...rows.map((r) => r.diffPct.length), 'diff'.length)
};

console.log('');
console.log(
	`${'pipeline'.padEnd(widths.pipeline)}  ${'preset'.padEnd(widths.preset)}  ${'diff'.padEnd(widths.diffPct)}  status`
);
for (const row of rows) {
	console.log(
		`${row.pipeline.padEnd(widths.pipeline)}  ${row.preset.padEnd(widths.preset)}  ${row.diffPct.padEnd(widths.diffPct)}  ${row.status}`
	);
}

const summary = {
	generatedAt: new Date().toISOString(),
	packs: { a: cli.packA ?? "each preset's own pack", b: cli.packB },
	thresholds: {
		changedPctMin: cli.changedPctThreshold,
		perChannelDelta: cli.channelDelta,
		captureScale: cli.captureScale
	},
	coverage: rows,
	presets: presetResults.map((entry) => ({
		...entry,
		captures: entry.captures.map((path) => path.replace(`${repoRoot}/`, ''))
	}))
};
const summaryPath = resolve(cli.outDir, 'pack-diff-results.json');
writeFileSync(summaryPath, `${JSON.stringify(summary, null, '\t')}\n`);

console.log('');
if (gaps > 0) {
	console.log(`⚠ ${gaps} pipeline(s) have NO covering preset — coverage gap, not a failure.`);
}
console.log(`Stats + paired captures: ${cli.outDir}`);
if (failures > 0) {
	console.error(
		`✗ ${failures} pipeline(s) FAILED the two-pack pixel-diff — a non-immune pipeline rendered (near-)identically under two Packs (ADR-0038 partial buy-in regression).`
	);
	process.exit(1);
}
console.log('✓ Every covered non-immune pipeline visibly re-skins under a pack swap.');
process.exit(0);
