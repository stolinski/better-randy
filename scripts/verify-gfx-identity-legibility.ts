// Proves the ratified gfx.computer identity at the sizes it has to survive, and
// renders the shipped 1200x630 share card from the same drawn geometry.
//
// Three gates, all deterministic:
//   1. Feature width — the tightest ink of the mark, in real pixels at a 16px
//      favicon. Below ~1.5px a feature stops resolving.
//   2. Raster fidelity — the mark is rasterized at 16/24/32/48 and compared to
//      its own 256px reference. Ink coverage must not drift (the form neither
//      fills into a blob nor thins away) and the separate ink regions and
//      enclosed counters must match, so the fan and the face stay apart.
//   3. Contrast — WCAG ratios for every colour pairing the identity sanctions:
//      the face on both cards, and every decay colour as a graphic on the deck.
//
// Usage: node --experimental-strip-types scripts/verify-gfx-identity-legibility.ts
// Output: captures under docs/identity/captures/, docs/identity/legibility-report.md,
// the shipped share card at static/gfx-social-card.png, and a non-zero exit when
// any gate fails.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { chromium, type Browser, type Page } from 'playwright';

import { GFX_ADDRESS, GFX_SPEC_PLATE } from '../src/lib/identity/gfx-brand.ts';
import {
	GFX_IDENTITY,
	GFX_IDENTITY_PALETTE,
	measureGfxIdentityFeaturePixels,
	renderGfxIdentityLogotypeSvg,
	renderGfxIdentityMarkSvg,
	renderGfxIdentityTitleCardSvg
} from '../src/lib/identity/gfx-identity-geometry.ts';
import { relativeLuminance, wcagContrastRatio } from '../src/lib/utils/color.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const captureDirectory = join(repositoryRoot, 'docs/identity/captures');
const reportPath = join(repositoryRoot, 'docs/identity/legibility-report.md');
const socialCardPath = join(repositoryRoot, 'static/gfx-social-card.png');

// ── Gates ────────────────────────────────────────────────────────────────────

/** Rendered sizes a favicon actually gets painted at, plus the reference. */
const FAVICON_SIZES = [16, 24, 32, 48] as const;
const REFERENCE_SIZE = 256;

const MINIMUM_FEATURE_PIXELS = 1.5;
const MAXIMUM_COVERAGE_DRIFT = 0.08;
/** WCAG 1.4.3 text grade — the identity is held to it even though a mark is not text. */
const MINIMUM_TEXT_CONTRAST = 4.5;
/** WCAG 1.4.11 non-text grade, for the decay colours against the deck. */
const MINIMUM_GRAPHIC_CONTRAST = 3;

// ── Chrome tokens (DESIGN.md) ────────────────────────────────────────────────

const DECK = '#0c0c0e';
const PANEL = '#131315';
const LINE = '#26262a';
const TEXT = '#e8e8ea';
const MUTED = '#8a8a90';

// ── Embedded fonts ───────────────────────────────────────────────────────────
// Captures must render identically offline, so the two chrome faces are inlined
// rather than fetched.

function fontFace(family: string, relativePath: string, extra: string): string {
	const bytes = readFileSync(join(repositoryRoot, relativePath));
	return `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');font-display:block;${extra}}`;
}

const EMBEDDED_FONTS = [
	fontFace(
		'Paper Mono',
		'static/fonts/PaperMono-Variable.woff2',
		'font-weight:100 800;font-style:normal;'
	),
	fontFace(
		'Archivo',
		'node_modules/@fontsource/archivo/files/archivo-latin-400-normal.woff2',
		'font-weight:400;font-style:normal;'
	),
	fontFace(
		'Archivo',
		'node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2',
		'font-weight:600;font-style:normal;'
	)
].join('');

// ── Asset inlining ───────────────────────────────────────────────────────────

function svgDataUrl(svg: string): string {
	return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function pngDataUrl(bytes: Buffer): string {
	return `data:image/png;base64,${bytes.toString('base64')}`;
}

const ARTWORK = {
	mark: svgDataUrl(renderGfxIdentityMarkSvg()),
	logotype: svgDataUrl(renderGfxIdentityLogotypeSvg()),
	titleCardLit: svgDataUrl(renderGfxIdentityTitleCardSvg({ lit: true }))
} as const;

// ── Raster measurement ───────────────────────────────────────────────────────

interface RasterMeasurement {
	readonly size: number;
	readonly inkCoverage: number;
	/** Separate bright shapes the mark resolves into — the fan and the face. */
	readonly inkRegions: number;
	/** Counters fully enclosed by ink. */
	readonly enclosedCounters: number;
}

/**
 * Luminance a reader separates bright form from the ground at. Gamma-encoded
 * Rec. 709, because the question is on-screen separation, not a colorimetric
 * ratio. The boundary sits between the dimmest decay colour and the card, so
 * the whole fan counts as form and the card and deck count as ground.
 */
const INK_THRESHOLD =
	(relativeLuminance(GFX_IDENTITY_PALETTE.decay[2]) +
		relativeLuminance(GFX_IDENTITY_PALETTE.card)) /
	2;

/** 4-connected component count over a boolean mask; diagonal touches stay separate. */
function countRegions(mask: readonly boolean[], size: number, wanted: boolean): number {
	const seen = new Uint8Array(mask.length);
	let regions = 0;
	for (let start = 0; start < mask.length; start += 1) {
		if (seen[start] || mask[start] !== wanted) continue;
		regions += 1;
		const stack = [start];
		seen[start] = 1;
		while (stack.length > 0) {
			const index = stack.pop()!;
			const x = index % size;
			const y = (index - x) / size;
			for (const [nextX, nextY] of [
				[x - 1, y],
				[x + 1, y],
				[x, y - 1],
				[x, y + 1]
			]) {
				if (nextX < 0 || nextY < 0 || nextX >= size || nextY >= size) continue;
				const neighbour = nextY * size + nextX;
				if (seen[neighbour] || mask[neighbour] !== wanted) continue;
				seen[neighbour] = 1;
				stack.push(neighbour);
			}
		}
	}
	return regions;
}

/** Background regions that never reach the tile edge — the mark's real counters. */
function countEnclosedCounters(mask: readonly boolean[], size: number): number {
	const reachable = new Uint8Array(mask.length);
	const stack: number[] = [];
	for (let along = 0; along < size; along += 1) {
		for (const index of [along, (size - 1) * size + along, along * size, along * size + size - 1]) {
			if (!mask[index] && !reachable[index]) {
				reachable[index] = 1;
				stack.push(index);
			}
		}
	}
	while (stack.length > 0) {
		const index = stack.pop()!;
		const x = index % size;
		const y = (index - x) / size;
		for (const [nextX, nextY] of [
			[x - 1, y],
			[x + 1, y],
			[x, y - 1],
			[x, y + 1]
		]) {
			if (nextX < 0 || nextY < 0 || nextX >= size || nextY >= size) continue;
			const neighbour = nextY * size + nextX;
			if (reachable[neighbour] || mask[neighbour]) continue;
			reachable[neighbour] = 1;
			stack.push(neighbour);
		}
	}
	const enclosed = mask.map((isInk, index) => !isInk && reachable[index] === 0);
	return countRegions(enclosed, size, true);
}

function measureRaster(bytes: Buffer, inkThreshold: number): Omit<RasterMeasurement, 'size'> {
	const image = PNG.sync.read(bytes);
	const mask: boolean[] = [];
	for (let index = 0; index < image.data.length; index += 4) {
		const luminance =
			(0.2126 * image.data[index] +
				0.7152 * image.data[index + 1] +
				0.0722 * image.data[index + 2]) /
			255;
		mask.push(luminance >= inkThreshold);
	}
	return {
		inkCoverage: mask.filter(Boolean).length / mask.length,
		inkRegions: countRegions(mask, image.width, true),
		enclosedCounters: countEnclosedCounters(mask, image.width)
	};
}

async function rasterizeMark(page: Page, size: number): Promise<Buffer> {
	await page.setViewportSize({ width: Math.max(size, 64), height: Math.max(size, 64) });
	await page.setContent(
		`<!doctype html><style>html,body{margin:0;background:${DECK}}img{display:block;width:${size}px;height:${size}px}</style><img src="${ARTWORK.mark}" alt="">`
	);
	return page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
}

// ── Capture sheets ───────────────────────────────────────────────────────────

const SHEET_STYLE = `${EMBEDDED_FONTS}
*{box-sizing:border-box}
html,body{margin:0;background:${DECK};color:${TEXT};font-family:Archivo,sans-serif;-webkit-font-smoothing:antialiased}
.plate{color:${MUTED};font-family:'Paper Mono',monospace;font-size:9px;font-weight:400;letter-spacing:.22em;line-height:1.2;text-transform:uppercase;margin:0}
/* The address keeps its own case: gfx.computer is a machine address, not a plate label. */
.address{color:${MUTED};font-family:'Paper Mono',monospace;font-size:9px;font-weight:400;letter-spacing:.18em;line-height:1.2;margin:0}
.caption{color:${MUTED};font-family:'Paper Mono',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;margin:0}
.topbar{align-items:center;background:${PANEL};border-block-end:1px solid ${LINE};display:flex;gap:20px;min-block-size:52px;padding-inline:15px 16px}
.topbar__brand{align-items:center;display:flex;flex-shrink:0;gap:10px}
.topbar__search{align-items:center;background:${DECK};border:1px solid ${LINE};block-size:32px;border-radius:6px;color:${MUTED};display:flex;flex:1;font-size:13px;padding-inline:10px}
.topbar__button{background:#1a1a1d;border-radius:2px;color:${TEXT};font-size:13px;font-weight:500;padding:6px 10px}
.stack{display:flex;flex-direction:column;gap:8px}
.row{align-items:center;display:flex;gap:16px}`;

/** Every capture written this run, so stale ones can be pruned afterwards. */
const capturedFileNames = new Set<string>();

async function renderSheet(
	page: Page,
	body: string,
	width: number,
	height: number,
	deviceScale: number
): Promise<Buffer> {
	await page.setViewportSize({ width, height });
	await page.setContent(`<!doctype html><style>${SHEET_STYLE}</style>${body}`);
	await page.evaluate(() => document.fonts.ready);
	return page.screenshot({ clip: { x: 0, y: 0, width, height, scale: deviceScale } });
}

async function captureSheet(
	page: Page,
	body: string,
	width: number,
	height: number,
	fileName: string,
	deviceScale: number
): Promise<void> {
	writeFileSync(
		join(captureDirectory, fileName),
		await renderSheet(page, body, width, height, deviceScale)
	);
	capturedFileNames.add(fileName);
}

// Mirrors the shipped listing topbar — the sheet has to prove the lockup that
// actually renders: the mark, then the flat logotype, on one baseline.
function topbarMarkup(): string {
	return `<header class="topbar">
	<div class="topbar__brand">
		<img src="${ARTWORK.mark}" alt="" style="block-size:22px;inline-size:22px">
		<img src="${ARTWORK.logotype}" alt="GFX" style="block-size:15px">
	</div>
	<div class="topbar__search">Search 42 compositions…</div>
	<div class="topbar__button">Import</div>
	<div class="topbar__button">New composition</div>
</header>`;
}

// The masthead is the title card on air: the lit cut, the address, the plate.
function mastheadMarkup(): string {
	return `<section style="padding:56px 72px">
	<img src="${ARTWORK.titleCardLit}" alt="GFX" style="inline-size:380px">
	<p class="address" style="font-size:13px;margin-block-start:20px">${GFX_ADDRESS}</p>
	<div style="background:${LINE};block-size:1px;margin-block:28px 18px"></div>
	<p class="plate" style="font-size:11px">${GFX_SPEC_PLATE}</p>
</section>`;
}

function socialCardMarkup(): string {
	return `<section style="block-size:630px;display:flex;flex-direction:column;justify-content:space-between;padding:64px 80px">
	<img src="${ARTWORK.titleCardLit}" alt="GFX" style="inline-size:560px">
	<div class="stack" style="gap:26px">
		<p class="address" style="font-size:20px">${GFX_ADDRESS}</p>
		<div style="align-items:center;display:flex;gap:14px;inline-size:100%">
			<div style="background:${LINE};block-size:1px;flex:1"></div>
			<p class="plate" style="font-size:14px">${GFX_SPEC_PLATE}</p>
		</div>
	</div>
</section>`;
}

/** Magnification of the true small raster, so a merged feature is visible rather than inferred. */
const FAVICON_MAGNIFICATION = 6;

function faviconMarkup(rasters: readonly { readonly size: number; readonly url: string }[]): string {
	const column = (raster: { size: number; url: string }): string =>
		`<div class="stack" style="align-items:center;gap:14px">
			<img src="${raster.url}" alt="" style="block-size:${raster.size}px;inline-size:${raster.size}px">
			<img src="${raster.url}" alt="" style="block-size:${raster.size * FAVICON_MAGNIFICATION}px;image-rendering:pixelated;inline-size:${raster.size * FAVICON_MAGNIFICATION}px">
			<p class="caption">${raster.size}px</p>
		</div>`;
	return `<div class="row" style="align-items:flex-end;gap:34px;padding:36px">${rasters.map(column).join('')}</div>`;
}

/** Width the favicon sheet needs for every magnified column plus gaps and padding. */
const FAVICON_SHEET_WIDTH =
	FAVICON_SIZES.reduce((total, size) => total + size * FAVICON_MAGNIFICATION, 0) +
	34 * (FAVICON_SIZES.length - 1) +
	72;
const FAVICON_SHEET_HEIGHT =
	Math.max(...FAVICON_SIZES) * (FAVICON_MAGNIFICATION + 1) + 14 * 2 + 20 + 72;

/** The levers the ratified artwork is drawn from, read off the identity itself. */
function identitySpecLine(): string {
	const { markCardUnits, markFanStepUnits, titleCardUnits, titleCardFanStepUnits } = GFX_IDENTITY;
	return [
		`mark card ${markCardUnits} / step ${markFanStepUnits} flat`,
		`title card ${titleCardUnits.width}×${titleCardUnits.height} / step ${titleCardFanStepUnits} concentric`,
		`cap 100 / bar 26`
	].join(' · ');
}

// ── Report ───────────────────────────────────────────────────────────────────

interface ContrastCheck {
	readonly pairing: string;
	readonly ratio: number;
	readonly minimum: number;
}

/**
 * The pairings the identity sanctions: the face on both cards, the plate and
 * address voices on the deck, and each decay colour as a non-text graphic on
 * the deck it fans over.
 */
function verifyContrast(): ContrastCheck[] {
	const palette = GFX_IDENTITY_PALETTE;
	const decayNames = ['decay yellow', 'decay red', 'decay blue'] as const;
	return [
		{
			pairing: 'face on the mark card',
			ratio: wcagContrastRatio(palette.face, palette.card),
			minimum: MINIMUM_TEXT_CONTRAST
		},
		{
			pairing: 'face on the title card',
			ratio: wcagContrastRatio(palette.face, palette.cardLifted),
			minimum: MINIMUM_TEXT_CONTRAST
		},
		{
			pairing: 'lit face on the title card',
			ratio: wcagContrastRatio(palette.faceLit, palette.cardLifted),
			minimum: MINIMUM_TEXT_CONTRAST
		},
		{
			pairing: 'spec-plate mono on deck',
			ratio: wcagContrastRatio(MUTED, DECK),
			minimum: MINIMUM_TEXT_CONTRAST
		},
		...palette.decay.map((decayColor, index) => ({
			pairing: `${decayNames[index]} on deck`,
			ratio: wcagContrastRatio(decayColor, DECK),
			minimum: MINIMUM_GRAPHIC_CONTRAST
		}))
	];
}

function formatRatio(value: number): string {
	return `${value.toFixed(2)}:1`;
}

function buildReport(
	featurePixelsAt16: number,
	reference: RasterMeasurement,
	rasters: readonly RasterMeasurement[],
	contrast: readonly ContrastCheck[],
	failures: readonly string[]
): string {
	const lines: string[] = [
		'# gfx.computer identity — legibility and accessibility proof',
		'',
		'Generated by `pnpm verify:identity`',
		'(`scripts/verify-gfx-identity-legibility.ts`). Do not hand-edit — re-run it.',
		'',
		`The ratified identity is the Slate (\`${GFX_IDENTITY.ratifiedCandidateId}\`).`,
		`Levers: ${identitySpecLine()}.`,
		'',
		'Gates, all measured against the mark’s own 256px reference raster:',
		'',
		`- Tightest feature at a 16px favicon ≥ ${MINIMUM_FEATURE_PIXELS}px.`,
		`- Ink-coverage drift ≤ ${MAXIMUM_COVERAGE_DRIFT} — the form neither fills into a blob nor thins away.`,
		'- Separate bright regions and enclosed counters both match the reference exactly — the fan and the face stay apart and the mouth stays open.',
		`- WCAG contrast ≥ ${MINIMUM_TEXT_CONTRAST}:1 for anything read as text, ≥ ${MINIMUM_GRAPHIC_CONTRAST}:1 for non-text graphics.`,
		'',
		`Tightest feature at 16px: **${featurePixelsAt16.toFixed(2)}px**.`,
		`Reference (${REFERENCE_SIZE}px): coverage ${reference.inkCoverage.toFixed(3)},`,
		`${reference.inkRegions} bright region(s), ${reference.enclosedCounters} enclosed counter(s).`,
		'',
		'| Rendered size | Ink coverage | Coverage drift | Bright regions | Enclosed counters |',
		'| --- | --- | --- | --- | --- |'
	];
	for (const raster of rasters) {
		const drift = Math.abs(raster.inkCoverage - reference.inkCoverage);
		lines.push(
			`| ${raster.size}px | ${raster.inkCoverage.toFixed(3)} | ${drift.toFixed(3)} | ${raster.inkRegions} | ${raster.enclosedCounters} |`
		);
	}
	lines.push('', '| Contrast pairing | Ratio | Minimum |', '| --- | --- | --- |');
	for (const check of contrast) {
		lines.push(`| ${check.pairing} | ${formatRatio(check.ratio)} | ${formatRatio(check.minimum)} |`);
	}
	lines.push(
		'',
		failures.length === 0 ? '**Passes every gate.**' : `**Fails:** ${failures.join('; ')}.`,
		''
	);
	return lines.join('\n');
}

// ── Run ──────────────────────────────────────────────────────────────────────

interface IdentityVerification {
	readonly featurePixelsAt16: number;
	readonly reference: RasterMeasurement;
	readonly rasters: readonly RasterMeasurement[];
	readonly contrast: readonly ContrastCheck[];
	readonly failures: readonly string[];
}

/** Measures every gate and writes every sheet; the browser is the only shared state. */
async function verifyIdentity(page: Page): Promise<IdentityVerification> {
	const reference: RasterMeasurement = {
		size: REFERENCE_SIZE,
		...measureRaster(await rasterizeMark(page, REFERENCE_SIZE), INK_THRESHOLD)
	};

	const rasters: RasterMeasurement[] = [];
	const previews: { size: number; url: string }[] = [];
	for (const size of FAVICON_SIZES) {
		const bytes = await rasterizeMark(page, size);
		rasters.push({ size, ...measureRaster(bytes, INK_THRESHOLD) });
		previews.push({ size, url: pngDataUrl(bytes) });
	}

	const featurePixelsAt16 = measureGfxIdentityFeaturePixels(16);
	const contrast = verifyContrast();
	const failures: string[] = [];
	if (featurePixelsAt16 < MINIMUM_FEATURE_PIXELS) {
		failures.push(
			`tightest feature is ${featurePixelsAt16.toFixed(2)}px at 16px, below ${MINIMUM_FEATURE_PIXELS}px`
		);
	}
	for (const raster of rasters) {
		const drift = Math.abs(raster.inkCoverage - reference.inkCoverage);
		if (drift > MAXIMUM_COVERAGE_DRIFT) {
			failures.push(`ink coverage drifts ${drift.toFixed(3)} at ${raster.size}px`);
		}
		if (raster.inkRegions !== reference.inkRegions) {
			failures.push(
				`${raster.size}px resolves ${raster.inkRegions} bright regions against ${reference.inkRegions} in the reference`
			);
		}
		if (raster.enclosedCounters !== reference.enclosedCounters) {
			failures.push(
				`${raster.size}px keeps ${raster.enclosedCounters} enclosed counters against ${reference.enclosedCounters} in the reference`
			);
		}
	}
	for (const check of contrast) {
		if (check.ratio < check.minimum) {
			failures.push(
				`${check.pairing} is ${formatRatio(check.ratio)}, below ${formatRatio(check.minimum)}`
			);
		}
	}

	await captureSheet(
		page,
		faviconMarkup(previews),
		FAVICON_SHEET_WIDTH,
		FAVICON_SHEET_HEIGHT,
		'favicon.png',
		2
	);
	await captureSheet(page, topbarMarkup(), 1280, 53, 'topbar.png', 2);
	await captureSheet(page, mastheadMarkup(), 1280, 420, 'masthead.png', 2);

	// The share card is a shipped asset, not a review capture, so it is rendered
	// at its exact 1200x630 pixel size straight into static/.
	writeFileSync(socialCardPath, await renderSheet(page, socialCardMarkup(), 1200, 630, 1));

	return { featurePixelsAt16, reference, rasters, contrast, failures };
}

mkdirSync(captureDirectory, { recursive: true });

const browser: Browser = await chromium.launch();
let verification: IdentityVerification;
try {
	verification = await verifyIdentity(await browser.newPage({ deviceScaleFactor: 1 }));
} finally {
	await browser.close();
}

// Captures are generated output, so anything this run did not write is stale —
// including the retired Quarter's monochrome sheet.
for (const entry of readdirSync(captureDirectory)) {
	if (!capturedFileNames.has(entry)) rmSync(join(captureDirectory, entry), { force: true });
}

writeFileSync(
	reportPath,
	buildReport(
		verification.featurePixelsAt16,
		verification.reference,
		verification.rasters,
		verification.contrast,
		verification.failures
	),
	'utf8'
);

process.stdout.write(
	verification.failures.length === 0
		? `${GFX_IDENTITY.ratifiedCandidateId}: pass\n`
		: `${GFX_IDENTITY.ratifiedCandidateId}: FAIL — ${verification.failures.join('; ')}\n`
);
if (verification.failures.length > 0) process.exitCode = 1;
