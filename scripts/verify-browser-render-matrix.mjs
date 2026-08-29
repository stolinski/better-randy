// Render the bounded browser-render matrix in BOTH DOM-capture lanes and compare
// the selected public path against the established one.
//
// The flagged WICG lane (CDP port 9223) is what every existing render harness
// measures. The public gfx.computer demo runs the `dom-rasterization` lane
// (ADR-0052), reproduced here on a standard WebMCP Chrome (CDP port 9225) that
// deliberately exposes neither `copyElementImageToTexture` nor `requestPaint`. A
// branch that renders in the first and is blank, stale, or unmeasurable in the
// second passes every other gate, so this one compares them at every branch.
//
// The dev server must already be running. Evidence is written to
// docs/browser-probes/browser-render-verification.json; any coordinate whose
// evidence is missing fails closed rather than being skipped.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { format, resolveConfig } from 'prettier';

import { computeRepositoryScopedTreeFingerprint } from '../src/lib/utils/repository-tree-fingerprint.server.ts';
import { readGfxEnvironmentValue } from '../src/lib/utils/legacy-supers-compatibility.ts';
import { classifyProbeOutputClass } from './_probe-output-class.ts';
import { collectGfxRenderRegistry } from './derive-gfx-render-matrix-manifest.ts';
import {
	BROWSER_RENDER_BRANCHES,
	BROWSER_RENDER_MATRIX_COORDINATES,
	BROWSER_RENDER_PERFORMANCE_BUDGET,
	ESTABLISHED_RENDER_LANE,
	SELECTED_PUBLIC_RENDER_LANE,
	evaluateBrowserRenderCoordinate,
	findBrowserRenderCoverageGaps,
	selectBrowserRenderSampleFrameIndex,
	summarizeBrowserRenderVerification
} from './browser-render-verification.ts';

const BASE_URL = readGfxEnvironmentValue(process.env, 'GFX_BASE_URL') ?? 'http://localhost:7263';
const WAIT_MS = Number(
	readGfxEnvironmentValue(process.env, 'GFX_BROWSER_RENDER_WAIT_MS') ?? 120_000
);
const EVIDENCE_PATH = resolve(
	readGfxEnvironmentValue(process.env, 'GFX_BROWSER_RENDER_EVIDENCE') ??
		'docs/browser-probes/browser-render-verification.json'
);
// The source the served origin must be running for its pixels to be evidence.
// Scoped rather than whole-tree on purpose: the evidence this run writes lives
// under `docs/`, so the identity a run asserts is the identity the next run
// asserts, and re-running the gate is not a way to change its own answer.
const RENDER_SOURCE_SCOPE_PATHS = ['src', 'scripts', 'package.json'];
const LANES = [
	{ lane: ESTABLISHED_RENDER_LANE, port: 9223, browserMode: 'canvas' },
	{ lane: SELECTED_PUBLIC_RENDER_LANE, port: 9225, browserMode: 'standard-webmcp' }
];
// A 480×270 sample answers alpha coverage and blankness without reading 8.3M
// pixels per frame; the PNG hash below is taken over the full native frame.
const ALPHA_SAMPLE_WIDTH = 480;
const ALPHA_SAMPLE_HEIGHT = 270;

function launchBrowser({ port, browserMode }) {
	const launch = spawnSync('bash', ['scripts/launch-cdp-chrome.sh'], {
		encoding: 'utf8',
		env: { ...process.env, CDP_PORT: String(port), CDP_BROWSER_MODE: browserMode }
	});
	if (launch.status !== 0) {
		throw new Error(`Sanctioned Chrome unavailable on port ${port}: ${launch.stderr || launch.stdout}`);
	}
}

/**
 * Reject an origin that is not serving the checkout under test.
 *
 * A machine that runs this gate has more than one GFX origin available — the
 * long-lived primary dev server and whatever a worktree is previewing — and
 * pointing two flagged browsers at the wrong one produces a full, plausible,
 * meaningless matrix. Asserted before the first pixel and again after the last,
 * so a restart or a checkout swap mid-sweep invalidates the run instead of
 * splitting it silently across two builds.
 */
async function assertServedSourceIdentity(expected) {
	const endpoint = new URL('/api/verification/source-identity', BASE_URL);
	endpoint.searchParams.set('paths', JSON.stringify(RENDER_SOURCE_SCOPE_PATHS));
	const response = await fetch(endpoint);
	if (!response.ok) throw new Error(`Served source identity unavailable (${response.status})`);
	const identity = await response.json();
	if (
		identity.sourceRevision !== expected.sourceRevision ||
		identity.treeFingerprint !== expected.treeFingerprint
	) {
		throw new Error(`${BASE_URL} is not serving the checkout under test`);
	}
}

async function openPage(port, { url, readyExpression }) {
	const response = await fetch(
		`http://localhost:${port}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!response.ok) throw new Error(`Could not create a CDP target on port ${port}`);
	const target = await response.json();
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	const close = async () => {
		socket.close();
		await fetch(`http://localhost:${port}/json/close/${encodeURIComponent(target.id)}`).catch(
			() => undefined
		);
	};
	try {
		await new Promise((settle, reject) => {
			const timer = setTimeout(() => reject(new Error('CDP socket did not open')), WAIT_MS);
			socket.onopen = () => {
				clearTimeout(timer);
				settle();
			};
			socket.onerror = (error) => {
				clearTimeout(timer);
				reject(error);
			};
		});
		let nextId = 1;
		const pending = new Map();
		socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			const request = pending.get(message.id);
			if (!request) return;
			pending.delete(message.id);
			clearTimeout(request.timer);
			if (message.error) request.reject(new Error(message.error.message));
			else request.resolve(message.result);
		};
		const send = (method, params = {}) =>
			new Promise((settle, reject) => {
				const id = nextId++;
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(new Error(`CDP ${method} timed out`));
				}, WAIT_MS);
				pending.set(id, { resolve: settle, reject, timer });
				socket.send(JSON.stringify({ id, method, params }));
			});
		const evaluate = async (expression) => {
			const result = await send('Runtime.evaluate', {
				expression,
				awaitPromise: true,
				returnByValue: true
			});
			if (result.exceptionDetails) {
				throw new Error(
					result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
				);
			}
			return result.result.value;
		};
		const waitFor = async (expression, failure) => {
			const deadline = Date.now() + WAIT_MS;
			for (;;) {
				const ready = await evaluate(expression).catch(() => false);
				if (ready === true) return;
				if (Date.now() > deadline) throw new Error(failure);
				await new Promise((settle) => setTimeout(settle, 250));
			}
		};
		await Promise.all([send('Page.enable'), send('Runtime.enable')]);
		await send('Page.navigate', { url });
		await waitFor(readyExpression, `${url} never became ready`);
		return { evaluate, waitFor, close };
	} catch (error) {
		await close();
		throw error;
	}
}

/** Reject a stale or swapped session before any of its pixels become evidence. */
async function assertLaneCapabilities(port, expectedLane) {
	// Read the capability on the served origin, not `about:blank`: the WICG
	// capture API is a renderer feature, and a blank target answers for a
	// renderer no composition will ever run in.
	const page = await openPage(port, {
		url: BASE_URL,
		readyExpression: `document.readyState === 'complete'`
	});
	try {
		const capabilities = await page.evaluate(`(() => ({
			copyElementImageToTexture: typeof GPUQueue === 'function' && 'copyElementImageToTexture' in GPUQueue.prototype,
			requestPaint: typeof HTMLCanvasElement.prototype.requestPaint === 'function'
		}))()`);
		const flagged = capabilities.copyElementImageToTexture && capabilities.requestPaint;
		const expectFlagged = expectedLane === ESTABLISHED_RENDER_LANE;
		if (flagged !== expectFlagged) {
			throw new Error(
				`CDP port ${port} should host the ${expectedLane} lane, but ${flagged ? 'exposes' : 'does not expose'} the WICG capture API`
			);
		}
		return capabilities;
	} finally {
		await page.close();
	}
}

function decodeDataUrl(value) {
	const separator = value.indexOf(',');
	if (separator < 0) throw new Error('Malformed PNG data URL');
	return Buffer.from(value.slice(separator + 1), 'base64');
}

const CANVAS_EXPRESSION = `[...document.querySelectorAll('canvas')].sort((left, right) => right.width * right.height - left.width * left.height)[0]`;

async function captureNativeFrame(page) {
	const dataUrl = await page.evaluate(`(async () => {
		const canvas = ${CANVAS_EXPRESSION};
		if (!canvas) throw new Error('composition canvas unavailable');
		const blob = await new Promise((settle) => canvas.toBlob(settle, 'image/png'));
		if (!blob) throw new Error('composition canvas produced no PNG');
		return await new Promise((settle, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(reader.error);
			reader.onload = () => settle(reader.result);
			reader.readAsDataURL(blob);
		});
	})()`);
	return decodeDataUrl(dataUrl);
}

/**
 * Fraction of pixels two native frames disagree on.
 *
 * A determinism failure reads very differently at 1e-6 (a stray antialiased
 * edge) and at 0.06 (the whole composition is a different frame), so the verdict
 * carries the magnitude rather than only "the hashes differ".
 */
function changedPixelRatio(left, right) {
	const a = PNG.sync.read(left);
	const b = PNG.sync.read(right);
	if (a.width !== b.width || a.height !== b.height) return 1;
	let changed = 0;
	for (let index = 0; index < a.data.length; index += 4) {
		if (
			a.data[index] !== b.data[index] ||
			a.data[index + 1] !== b.data[index + 1] ||
			a.data[index + 2] !== b.data[index + 2] ||
			a.data[index + 3] !== b.data[index + 3]
		) {
			changed += 1;
		}
	}
	return changed / (a.width * a.height);
}

/** Blankness, alpha coverage, and output class from one native frame. */
function readFrameEvidence(png) {
	const image = PNG.sync.read(png);
	const stepX = Math.max(1, Math.floor(image.width / ALPHA_SAMPLE_WIDTH));
	const stepY = Math.max(1, Math.floor(image.height / ALPHA_SAMPLE_HEIGHT));
	const first = [image.data[0], image.data[1], image.data[2], image.data[3]];
	let sampled = 0;
	let alphaSamples = 0;
	let nonUniformPixelCount = 0;
	for (let y = 0; y < image.height; y += stepY) {
		for (let x = 0; x < image.width; x += stepX) {
			const index = (y * image.width + x) * 4;
			sampled += 1;
			if (image.data[index + 3] > 0) alphaSamples += 1;
			if (
				image.data[index] !== first[0] ||
				image.data[index + 1] !== first[1] ||
				image.data[index + 2] !== first[2] ||
				image.data[index + 3] !== first[3]
			) {
				nonUniformPixelCount += 1;
			}
		}
	}
	return {
		sha256: createHash('sha256').update(png).digest('hex'),
		width: image.width,
		height: image.height,
		nonUniformPixelCount,
		alphaCoverage: sampled === 0 ? 0 : alphaSamples / sampled,
		// The same frame-edge authority the deliverable render matrix classifies with.
		outputClass: classifyProbeOutputClass(image)
	};
}

function frameAddress(frameIndex, frameRate) {
	return {
		frameIndex,
		timestampMicroseconds: Math.round((frameIndex * frameRate.den * 1_000_000) / frameRate.num)
	};
}

async function settleFrame(page, frameIndex, frameRate) {
	return page.evaluate(
		`window.__settleGfxDeterministicCompositionFrame(${JSON.stringify({
			address: frameAddress(frameIndex, frameRate),
			frameRate
		})})`
	);
}

/**
 * One coordinate's evidence from one lane.
 *
 * The replay frame is reached by seeking AWAY from the sample address and back,
 * so frame determinism is a real property of the address rather than an artifact
 * of capturing the same settled canvas twice.
 */
async function captureLaneEvidence(lane, port, coordinate, sampleFrameIndex) {
	const page = await openPage(port, {
		url: `${BASE_URL}/p/${encodeURIComponent(coordinate.presetSlug)}?source=builtin`,
		readyExpression: `document.readyState === 'complete' && typeof window.__configureGfxDeterministicRenderCell === 'function' && typeof window.__settleGfxDeterministicCompositionFrame === 'function'`
	});
	try {
		const configured = await page.evaluate(
			`window.__configureGfxDeterministicRenderCell(${JSON.stringify({
				presetSlug: coordinate.presetSlug,
				packId: coordinate.packId,
				orientation: coordinate.orientation
			})})`
		);
		// Configuring the cell can remount the Workspace, which clears its window
		// hooks and re-publishes them. Wait for the whole set this capture uses, not
		// just the two that gate the page load, or a capture races the remount and
		// reports a missing hook as if the lane were broken.
		await page.waitFor(
			`['__settleGfxDeterministicCompositionFrame','__captureGfxDeterministicFrameGeometry','__readGfxRetainedCompositionRasters'].every((hook) => typeof window[hook] === 'function')`,
			'the composition capture hooks never all became available'
		);
		const frameRate = configured.frameRate;
		const awayFrameIndex = sampleFrameIndex === 0 ? 1 : 0;

		const settled = await settleFrame(page, sampleFrameIndex, frameRate);
		if (settled.address.frameIndex !== sampleFrameIndex) {
			throw new Error(
				`${coordinate.coordinateId}: settled on frame ${settled.address.frameIndex}, not ${sampleFrameIndex}`
			);
		}
		const framePng = await captureNativeFrame(page);
		const frame = readFrameEvidence(framePng);
		const geometry = await page.evaluate(
			`window.__captureGfxDeterministicFrameGeometry(${JSON.stringify(['composition-root', 'overlay-root'])})`
		);
		const runtime = await page.evaluate(`(() => {
			const canvas = ${CANVAS_EXPRESSION};
			const retained = window.__readGfxRetainedCompositionRasters?.() ?? null;
			return {
				reportedCaptureMode: window.__gfxDomFrameCaptureMode ?? null,
				fontsStatus: document.fonts.status,
				directCanvasChildCount: canvas ? canvas.children.length : 0,
				retained
			};
		})()`);
		if (!runtime.retained) throw new Error(`${coordinate.coordinateId}: raster accounting unavailable`);

		await settleFrame(page, awayFrameIndex, frameRate);
		const replaySettle = await settleFrame(page, sampleFrameIndex, frameRate);
		const replayPng = await captureNativeFrame(page);
		const replayFrame = readFrameEvidence(replayPng);

		return {
			lane,
			reportedCaptureMode: runtime.reportedCaptureMode,
			expectedOutputClass: configured.expectedOutputClass,
			configuredWidth: configured.width,
			configuredHeight: configured.height,
			fontsStatus: runtime.fontsStatus,
			frame,
			replayFrameSha256: replayFrame.sha256,
			replayChangedPixelRatio:
				frame.sha256 === replayFrame.sha256 ? 0 : changedPixelRatio(framePng, replayPng),
			geometry: geometry.elements,
			retainedRasterCount: runtime.retained.retainedRasterCount,
			retainedRasterBytes: runtime.retained.retainedRasterBytes,
			directCanvasChildCount: runtime.directCanvasChildCount,
			frameMilliseconds: replaySettle.settleMilliseconds,
			sampleFrameIndex,
			awayFrameIndex,
			frameRate
		};
	} finally {
		await page.close();
	}
}

const sourceIdentity = await computeRepositoryScopedTreeFingerprint(
	process.cwd(),
	RENDER_SOURCE_SCOPE_PATHS
);
await assertServedSourceIdentity(sourceIdentity);

const registry = await collectGfxRenderRegistry();
const coverageGaps = findBrowserRenderCoverageGaps({
	deliverablePresetSlugs: registry.presets.map((preset) => preset.slug),
	packIds: registry.packs.map((pack) => pack.id)
});

for (const lane of LANES) launchBrowser(lane);
const laneCapabilities = {};
for (const lane of LANES) {
	laneCapabilities[lane.lane] = await assertLaneCapabilities(lane.port, lane.lane);
}

const coordinates = [];
for (const coordinate of BROWSER_RENDER_MATRIX_COORDINATES) {
	// The frame each coordinate is verified at comes from the composition's own
	// deterministic sample plan, not from an arbitrary address: it is a checkpoint
	// the deliverable render matrix already measures.
	const preset = registry.presets.find((entry) => entry.slug === coordinate.presetSlug);
	const sampleFrameIndex = selectBrowserRenderSampleFrameIndex(preset?.samples ?? []);
	if (sampleFrameIndex === null) {
		throw new Error(`${coordinate.coordinateId}: no deterministic checkpoint past the opening frame`);
	}
	const evidence = {};
	let unavailableReason;
	for (const lane of LANES) {
		try {
			evidence[lane.lane] = await captureLaneEvidence(
				lane.lane,
				lane.port,
				coordinate,
				sampleFrameIndex
			);
		} catch (error) {
			evidence[lane.lane] = null;
			unavailableReason = `${lane.lane}: ${error instanceof Error ? error.message : String(error)}`;
			console.error(`✗ ${coordinate.coordinateId} — ${unavailableReason}`);
		}
	}
	const verdict = evaluateBrowserRenderCoordinate({
		coordinate,
		established: evidence[ESTABLISHED_RENDER_LANE],
		selected: evidence[SELECTED_PUBLIC_RENDER_LANE],
		unavailableReason
	});
	const failedChecks = verdict.checks.filter((entry) => entry.outcome !== 'pass');
	console.log(
		`${verdict.outcome === 'pass' ? '✓' : '✗'} ${coordinate.coordinateId} (${coordinate.presetSlug} × ${coordinate.packId} × ${coordinate.orientation}) — ${verdict.outcome}`
	);
	for (const entry of failedChecks) console.log(`    ${entry.outcome} ${entry.checkId}: ${entry.detail}`);
	if (verdict.establishedLaneDeclarationMismatch) {
		console.log(`    established-lane defect: ${verdict.establishedLaneDeclarationMismatch}`);
	}
	coordinates.push({ coordinate, lanes: evidence, verdict });
}

await assertServedSourceIdentity(sourceIdentity);

const summary = summarizeBrowserRenderVerification(
	coordinates.map((entry) => entry.verdict),
	coverageGaps
);
const evidenceDocument = {
	schemaVersion: 1,
	generatedAt: new Date().toISOString(),
	verification: 'browser-render-fidelity-coverage-and-performance',
	baseUrl: BASE_URL,
	sourceRevision: sourceIdentity.sourceRevision,
	sourceScopePaths: RENDER_SOURCE_SCOPE_PATHS,
	sourceScopeFingerprint: sourceIdentity.treeFingerprint,
	establishedLane: ESTABLISHED_RENDER_LANE,
	selectedPublicLane: SELECTED_PUBLIC_RENDER_LANE,
	performanceBudget: BROWSER_RENDER_PERFORMANCE_BUDGET,
	laneCapabilities,
	branches: BROWSER_RENDER_BRANCHES,
	coordinates,
	summary
};
await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
const prettierConfig = (await resolveConfig(EVIDENCE_PATH)) ?? {};
await writeFile(
	EVIDENCE_PATH,
	await format(JSON.stringify(evidenceDocument), { ...prettierConfig, parser: 'json' })
);
console.log(`\n${summary.outcome.toUpperCase()} — wrote ${EVIDENCE_PATH}`);
for (const gap of coverageGaps) console.error(`coverage gap: ${gap}`);
// Not this gate's verdict — the established lane is its reference, not its
// subject — but never silent either: `output-class-mismatch` in the deliverable
// render matrix owns these.
for (const defect of summary.establishedLaneDefects) {
	console.error(`established-lane defect (deliverable render matrix owns this): ${defect}`);
}
process.exit(summary.outcome === 'pass' ? 0 : 1);
