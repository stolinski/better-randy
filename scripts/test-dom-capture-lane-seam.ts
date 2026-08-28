// Every engine render branch must reach the DOM through the lane-neutral capture
// seam, never through the WICG-only API directly.
//
// A standard browser exposes neither `GPUQueue.copyElementImageToTexture` nor
// `HTMLCanvasElement.requestPaint` (ADR-0052's public demo runs stock Chrome), so
// a branch that calls either one renders blank there — or throws — while every
// other branch keeps working. That failure is invisible in review because the
// flagged browser passes. This check makes it a build failure instead: only the
// two modules that OWN lane selection may name the flag-only API.
//
// `src/routes/poc/` is deliberately outside the scan. Those pages are WICG
// capability probes, not composition render branches, and they fail loudly with
// the "unavailable in this browser" error rather than rendering a blank frame.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_ROOT = new URL('../src/lib/', import.meta.url);

/** The only modules allowed to name the flag-only API: the lane switch and the
 *  standard lane's own paint tick, plus their colocated tests. */
const LANE_OWNING_MODULES = new Set([
	'platform/html-in-canvas.ts',
	'platform/html-in-canvas.test.ts',
	'platform/standard-browser-dom-capture.ts',
	'platform/standard-browser-dom-capture.test.ts'
]);

/** Code forms only — a doc comment naming the WICG API is documentation, not a
 *  second capture path. */
const FLAG_ONLY_CAPTURE_FORMS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
	{
		pattern: /getHtmlInCanvasQueue\s*\(/,
		replacement: 'getDomFrameCaptureQueue from $lib/platform/html-in-canvas'
	},
	{
		pattern: /\.copyElementImageToTexture\s*\(/,
		replacement: 'DomFrameCaptureQueue.captureElementToTexture'
	},
	// Any mention at all: `canvas.requestPaint()`, a destructured local, or a
	// service field that re-exposes the flag-only tick to another module.
	{ pattern: /\brequestPaint\b/, replacement: 'requestCanvasPaint' },
	{ pattern: /\.onpaint\s*=/, replacement: 'setCanvasPaintHandler / clearCanvasPaintHandler' }
];

function engineSourceFiles(directory: URL): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
		if (entry.isDirectory()) {
			found.push(...engineSourceFiles(child));
			continue;
		}
		if (/\.(ts|svelte|svelte\.ts)$/.test(entry.name)) {
			found.push(relative(fileURLToPath(ENGINE_ROOT), fileURLToPath(child)));
		}
	}
	return found;
}

function isCommentLine(line: string): boolean {
	const trimmed = line.trimStart();
	return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

const violations: string[] = [];
let scanned = 0;

for (const modulePath of engineSourceFiles(ENGINE_ROOT)) {
	if (LANE_OWNING_MODULES.has(modulePath)) continue;
	scanned += 1;
	const lines = readFileSync(new URL(modulePath, ENGINE_ROOT), 'utf8').split('\n');
	lines.forEach((line, index) => {
		if (isCommentLine(line)) return;
		for (const { pattern, replacement } of FLAG_ONLY_CAPTURE_FORMS) {
			if (pattern.test(line)) {
				violations.push(
					`src/lib/${modulePath}:${index + 1} reaches the flag-only capture API directly — use ${replacement}.`
				);
			}
		}
	});
}

assert.deepEqual(
	violations,
	[],
	`Every engine render branch must capture through the lane-neutral seam:\n${violations.join('\n')}`
);
assert.ok(scanned > 0, 'the capture-lane scan must actually read engine modules');

// The seam itself must keep both lanes reachable and refuse to guess.
const laneSwitch = readFileSync(
	new URL('platform/html-in-canvas.ts', ENGINE_ROOT),
	'utf8'
);
for (const helper of [
	'export function getDomFrameCaptureQueue',
	'export function requestCanvasPaint',
	'export function setCanvasPaintHandler',
	'export function clearCanvasPaintHandler'
]) {
	assert.ok(laneSwitch.includes(helper), `html-in-canvas.ts must expose ${helper}`);
}

const laneSelection = readFileSync(
	new URL('platform/standard-browser-dom-capture.ts', ENGINE_ROOT),
	'utf8'
);
assert.match(
	laneSelection,
	/throw new Error\(\s*'No DOM frame capture lane is available/,
	'a browser with neither capture lane must fail loudly rather than render blank'
);

// Every registered Surface Pipeline — the plain card, the paper substrates, the
// web-document and iMessage chat screens, the chart and diagram carriers — must
// reach the DOM through one of the two runtime factories that own the seam. A
// Surface that grew its own capture would be blank on a standard browser while
// every other Surface still rendered.
const SURFACE_PIPELINE_FACTORIES: ReadonlyArray<{ factory: string; module: string }> = [
	{ factory: 'createPlainPipeline', module: 'pipelines/surfaces/plain/pipeline.ts' },
	{ factory: 'createPaperPipeline', module: 'pipelines/surfaces/paper/pipeline.ts' }
];

for (const { factory, module } of SURFACE_PIPELINE_FACTORIES) {
	assert.match(
		readFileSync(new URL(module, ENGINE_ROOT), 'utf8'),
		/getDomFrameCaptureQueue\(device\.queue\)/,
		`${factory} must upload its Surface DOM through the lane-neutral capture queue`
	);
}

const surfaceVariants = readdirSync(new URL('pipelines/surfaces/', ENGINE_ROOT), {
	withFileTypes: true
}).filter((entry) => entry.isDirectory());
assert.ok(surfaceVariants.length > 0, 'the Surface registry scan must find variants');

for (const variant of surfaceVariants) {
	const runtime = readFileSync(
		new URL(`pipelines/surfaces/${variant.name}/index.ts`, ENGINE_ROOT),
		'utf8'
	);
	assert.ok(
		SURFACE_PIPELINE_FACTORIES.some(({ factory }) => runtime.includes(`${factory}(`)),
		`Surface "${variant.name}" must build its runtime from a capture-seam pipeline factory`
	);
}

// The image substrate and the Video underlay are uploaded from an ImageBitmap and
// a decoded VideoFrame, never from the DOM, so both branches are lane-independent
// by construction rather than by a second capture path.
for (const module of ['platform/substrate-textures.ts', 'platform/video-underlay-frame-texture.ts']) {
	assert.match(
		readFileSync(new URL(module, ENGINE_ROOT), 'utf8'),
		/copyExternalImageToTexture\(/,
		`${module} must upload its media substrate independently of the DOM capture lane`
	);
}

// The rasterizer reads whatever the timeline already wrote. Giving it a timestamp
// would make the standard lane a second clock, and text-animation frames would
// stop matching the flagged lane at the same time.
const rasterizer = readFileSync(
	new URL('platform/composition-dom-rasterizer.ts', ENGINE_ROOT),
	'utf8'
);
const rasterRequest = rasterizer.match(
	/export interface CompositionDomRasterRequest \{([\s\S]*?)\n\}/
);
assert.ok(rasterRequest, 'the rasterizer must declare its request contract');
assert.doesNotMatch(
	rasterRequest[1],
	/timestamp|progress|frame\b/,
	'the standard capture lane must never own a timestamp — the caller seeks first'
);

// Audio is rendered once, before the frame loop, so the standard lane's slower
// per-frame raster changes export wall-clock but never the audio/video alignment.
assert.match(
	readFileSync(new URL('platform/composition-export-controller.ts', ENGINE_ROOT), 'utf8'),
	/const audio = await this\.#services\.renderAudio\([\s\S]*?const renderFrame: TransparentVideoExportOptions\['renderFrame'\]/,
	'export must render audio before the frame loop so raster cost cannot desync it'
);

console.log(
	`test-dom-capture-lane-seam.ts: ${scanned} engine modules and ${surfaceVariants.length} Surfaces capture through the lane-neutral seam`
);
