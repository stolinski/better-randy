import {
	lintPresetVisual,
	type RenderedSurfaceMeasurement,
	type RenderedTextMeasurement,
	type RenderedTextRole,
	type RubricIssue,
	type TextBandKey,
	type VisualMeasurement
} from './preset-rubric.ts';
import type { EngineState, Preset } from './engine-schema.ts';
import { calculateEffectiveCapHeight } from '../utils/rendered-text-scale.ts';
import { getVideoFrameSize } from '../utils/video-frame.ts';

const SERIF_CAP_HEIGHT_RATIO = 0.7;
const SANS_CAP_HEIGHT_RATIO = 0.7;
const CONDENSED_CAP_HEIGHT_RATIO = 0.68;
const MONO_CAP_HEIGHT_RATIO = 0.72;

interface RoleSelector {
	role: RenderedTextRole;
	bandKey: TextBandKey;
	selector: string;
	containsMarkedSegment?: boolean;
}

const PAPER_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'source', bandKey: 'surface-label', selector: 'header > p.paper-source__kicker' },
	{ role: 'title', bandKey: 'surface-title', selector: 'header > h2' },
	{ role: 'source', bandKey: 'surface-label', selector: 'header > p.paper-source__byline' },
	{ role: 'kicker', bandKey: 'surface-label', selector: '.paper-source__body-label' },
	{ role: 'body', bandKey: 'surface-body', selector: 'section > p' },
	{ role: 'source', bandKey: 'surface-label', selector: 'footer > span' },
	{ role: 'source', bandKey: 'surface-label', selector: 'footer > cite' }
];

const PLAIN_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'body', bandKey: 'surface-body', selector: 'section > p' }
];

const NEWSPAPER_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'source', bandKey: 'surface-label', selector: 'header > .newspaper-source__kicker' },
	{ role: 'title', bandKey: 'surface-title', selector: 'header > h2' },
	{ role: 'body', bandKey: 'surface-body', selector: 'section > p' },
	{ role: 'source', bandKey: 'surface-label', selector: 'footer > .newspaper-source__byline' },
	{ role: 'source', bandKey: 'surface-label', selector: 'footer > .newspaper-source__date' }
];

const CHAPTER_CARD_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'source', bandKey: 'surface-label', selector: '.chapter-card-source__kicker' },
	{ role: 'title', bandKey: 'surface-title', selector: '.chapter-card-source__title' }
];

const PULLQUOTE_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'title', bandKey: 'surface-title', selector: '.pullquote-source__quote' },
	{ role: 'source', bandKey: 'surface-label', selector: '.pullquote-source__attribution' }
];

const TITLE_SEQUENCE_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'source', bandKey: 'surface-label', selector: '.title-sequence-source__kicker' },
	{ role: 'title', bandKey: 'surface-title', selector: '.title-sequence-source__title' }
];

const TYPE_HERO_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'title', bandKey: 'surface-title', selector: '.type-hero-source__hero' },
	{ role: 'source', bandKey: 'surface-label', selector: '.type-hero-source__subtitle' }
];

// Diagram semantic roles intentionally reuse the established surface bands:
// diagrams are document typography, not Overlays (G4 / ADR-0036).
const DIAGRAM_ROLE_SELECTORS: readonly RoleSelector[] = [
	{
		role: 'title',
		bandKey: 'surface-title',
		selector: '[data-diagram-text-role="headline"]'
	},
	{
		role: 'caption',
		bandKey: 'surface-label',
		selector: '[data-diagram-text-role="caption"]'
	},
	{
		role: 'title',
		bandKey: 'surface-title',
		selector: '[data-diagram-text-role="stat-value"]'
	}
];

// Chart SVG text is native document typography and must pass the same G4 floors.
// Renderers expose one searchable role attribute across both chart families.
const CHART_ROLE_SELECTORS: readonly RoleSelector[] = [
	{ role: 'title', bandKey: 'surface-title', selector: '[data-chart-text-role="title"]' },
	{ role: 'caption', bandKey: 'surface-label', selector: '[data-chart-text-role="axis"]' },
	{ role: 'caption', bandKey: 'surface-label', selector: '[data-chart-text-role="category"]' },
	{ role: 'caption', bandKey: 'surface-label', selector: '[data-chart-text-role="value"]' },
	{ role: 'caption', bandKey: 'surface-label', selector: '[data-chart-text-role="legend"]' },
	{ role: 'source', bandKey: 'surface-label', selector: '[data-chart-text-role="source"]' },
	{ role: 'caption', bandKey: 'surface-label', selector: '[data-chart-text-role="callout"]' }
];

const SURFACE_AUDIT_CONFIG: Readonly<
	Record<string, { root: string; roles: readonly RoleSelector[] }>
> = {
	paper: { root: '.paper-source', roles: PAPER_ROLE_SELECTORS },
	plain: { root: '.plain-source', roles: PLAIN_ROLE_SELECTORS },
	newspaper: { root: '.newspaper-source', roles: NEWSPAPER_ROLE_SELECTORS },
	'chapter-card': { root: '.chapter-card-source', roles: CHAPTER_CARD_ROLE_SELECTORS },
	'pullquote-on-photo': { root: '.pullquote-source', roles: PULLQUOTE_ROLE_SELECTORS },
	'title-sequence': { root: '.title-sequence-source', roles: TITLE_SEQUENCE_ROLE_SELECTORS },
	'type-hero': { root: '.type-hero-source', roles: TYPE_HERO_ROLE_SELECTORS }
};

type FontKey = 'serif' | 'sans' | 'mono' | 'condensed' | 'unknown';

function classifyFont(fontFamily: string): FontKey {
	const lower = fontFamily.toLowerCase();

	if (/avenir|helvetica|arial|sans/.test(lower) && /condensed|narrow/.test(lower)) {
		return 'condensed';
	}

	if (/mono|consolas|sfmono/.test(lower)) {
		return 'mono';
	}

	if (/avenir|helvetica|arial|sans/.test(lower)) {
		return 'sans';
	}

	if (/georgia|times|serif/.test(lower)) {
		return 'serif';
	}

	return 'unknown';
}

function capHeightRatioFor(font: FontKey): number {
	switch (font) {
		case 'condensed':
			return CONDENSED_CAP_HEIGHT_RATIO;
		case 'mono':
			return MONO_CAP_HEIGHT_RATIO;
		case 'sans':
			return SANS_CAP_HEIGHT_RATIO;
		case 'serif':
		case 'unknown':
		default:
			return SERIF_CAP_HEIGHT_RATIO;
	}
}

function countLineBoxes(node: HTMLElement, fontSize: number, lineHeight: number): number {
	const range = document.createRange();
	range.selectNodeContents(node);
	const rects = Array.from(range.getClientRects());

	if (rects.length === 0) {
		const r = node.getBoundingClientRect();
		const lineHeightPx = lineHeight > 0 ? lineHeight : fontSize * 1.2;

		return Math.max(1, Math.round(r.height / lineHeightPx));
	}

	const tolerance = Math.max(2, fontSize * 0.25);
	const baselines: number[] = [];

	for (const rect of rects) {
		if (rect.width === 0 || rect.height === 0) {
			continue;
		}

		const center = rect.top + rect.height / 2;
		const existing = baselines.find((value) => Math.abs(value - center) <= tolerance);

		if (existing === undefined) {
			baselines.push(center);
		}
	}

	return Math.max(1, baselines.length);
}

function bandKeyFor(node: HTMLElement, defaultKey: TextBandKey): TextBandKey {
	if (defaultKey !== 'surface-body') {
		return defaultKey;
	}

	if (node.querySelector('[data-annotation-mark]')) {
		return 'surface-body-focal';
	}

	return defaultKey;
}

const AVG_CHAR_WIDTH_RATIO: Record<FontKey, number> = {
	serif: 0.48,
	sans: 0.52,
	condensed: 0.42,
	mono: 0.6,
	unknown: 0.5
};

function measureCharsPerLine(node: HTMLElement, fontSize: number, font: FontKey): number {
	const rect = node.getBoundingClientRect();

	if (rect.width <= 0 || fontSize <= 0) {
		return 0;
	}

	const ratio = AVG_CHAR_WIDTH_RATIO[font];

	return Math.round(rect.width / (fontSize * ratio));
}

function measureText(
	root: ParentNode,
	role: RenderedTextRole,
	bandKey: TextBandKey,
	selector: string,
	computedScaleForNode?: (node: HTMLElement) => string
): RenderedTextMeasurement[] {
	const measurements: RenderedTextMeasurement[] = [];
	const nodes = root.querySelectorAll<HTMLElement>(selector);

	for (const node of nodes) {
		const text = (node.textContent ?? '').trim();

		if (text.length === 0) {
			continue;
		}

		const style = getComputedStyle(node);
		const fontSize = parseFloat(style.fontSize);
		const font = classifyFont(style.fontFamily);
		const ratio = capHeightRatioFor(font);
		const computedScale = computedScaleForNode?.(node) ?? 'none';
		const lineHeightPx = parseFloat(style.lineHeight);
		const lineHeightRatio =
			isNaN(lineHeightPx) || lineHeightPx <= 0 ? 1.2 : lineHeightPx / fontSize;
		const lineCount = countLineBoxes(node, fontSize, lineHeightPx);
		const effectiveBand = bandKeyFor(node, bandKey);
		const charsPerLine = measureCharsPerLine(node, fontSize, font);
		measurements.push({
			role,
			bandKey: effectiveBand,
			capHeight: calculateEffectiveCapHeight(fontSize, ratio, computedScale),
			fontFamily: font,
			lineHeight: lineHeightRatio,
			charsPerLine,
			lineCount,
			label: text.slice(0, 40)
		});
	}

	return measurements;
}

interface SourceTextBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface FrameRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface DiagramTextMeasurement {
	texts: readonly RenderedTextMeasurement[];
	textBounds: SourceTextBounds;
}

function sourceTextBoundsFor(
	elements: Iterable<HTMLElement>,
	frameRect: FrameRect
): SourceTextBounds {
	const clientBounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

	for (const element of elements) {
		if ((element.textContent ?? '').trim().length === 0) {
			continue;
		}

		const rect = element.getBoundingClientRect();
		clientBounds.left = Math.min(clientBounds.left, rect.left);
		clientBounds.top = Math.min(clientBounds.top, rect.top);
		clientBounds.right = Math.max(clientBounds.right, rect.right);
		clientBounds.bottom = Math.max(clientBounds.bottom, rect.bottom);
	}

	return isFinite(clientBounds.left)
		? {
				x: clientBounds.left - frameRect.left,
				y: clientBounds.top - frameRect.top,
				width: clientBounds.right - clientBounds.left,
				height: clientBounds.bottom - clientBounds.top
			}
		: { x: 0, y: 0, width: 0, height: 0 };
}

function mergeSourceTextBounds(
	first: SourceTextBounds,
	second: SourceTextBounds
): SourceTextBounds {
	if (second.width <= 0 || second.height <= 0) {
		return first;
	}
	if (first.width <= 0 || first.height <= 0) {
		return second;
	}

	const left = Math.min(first.x, second.x);
	const top = Math.min(first.y, second.y);
	const right = Math.max(first.x + first.width, second.x + second.width);
	const bottom = Math.max(first.y + first.height, second.y + second.height);

	return { x: left, y: top, width: right - left, height: bottom - top };
}

function diagramItemComputedScale(node: HTMLElement): string {
	const item = node.closest<HTMLElement>('.diagram-mount__item');
	return item ? getComputedStyle(item).scale : 'none';
}

function measureDiagramText(frameRect: FrameRect): DiagramTextMeasurement {
	const texts: RenderedTextMeasurement[] = [];
	for (const { role, bandKey, selector } of DIAGRAM_ROLE_SELECTORS) {
		texts.push(...measureText(document, role, bandKey, selector, diagramItemComputedScale));
	}

	const elements = document.querySelectorAll<HTMLElement>('[data-diagram-text-role]');
	return { texts, textBounds: sourceTextBoundsFor(elements, frameRect) };
}

function measureChartText(frameRect: FrameRect): DiagramTextMeasurement {
	const texts: RenderedTextMeasurement[] = [];
	for (const { role, bandKey, selector } of CHART_ROLE_SELECTORS) {
		texts.push(...measureText(document, role, bandKey, selector));
	}

	const elements = document.querySelectorAll<HTMLElement>('[data-chart-text-role]');
	return { texts, textBounds: sourceTextBoundsFor(elements, frameRect) };
}

function measureSurfaceElement(
	root: HTMLElement,
	roleSelectors: readonly RoleSelector[],
	frameRect: FrameRect
): RenderedSurfaceMeasurement {
	const cardClientRect = root.getBoundingClientRect();
	const texts: RenderedTextMeasurement[] = [];

	for (const { role, bandKey, selector } of roleSelectors) {
		texts.push(...measureText(root, role, bandKey, selector));
	}

	const allTextElements = root.querySelectorAll<HTMLElement>(
		'h2, p, span, cite, time, footer, header, section'
	);

	// Translate from viewport coords to frame-relative (4K source) coords by
	// subtracting the canvas's viewport offset. The frame origin in source
	// coords is (0,0); width/height are the 4K dimensions.
	const offsetX = frameRect.left;
	const offsetY = frameRect.top;
	const cardX = cardClientRect.left - offsetX;
	const cardY = cardClientRect.top - offsetY;
	const cardRight = cardX + cardClientRect.width;
	const cardBottom = cardY + cardClientRect.height;

	const frameRight = frameRect.width;
	const frameBottom = frameRect.height;
	const visibleLeft = Math.max(cardX, 0);
	const visibleTop = Math.max(cardY, 0);
	const visibleRight = Math.min(cardRight, frameRight);
	const visibleBottom = Math.min(cardBottom, frameBottom);
	const visibleWidth = Math.max(0, visibleRight - visibleLeft);
	const visibleHeight = Math.max(0, visibleBottom - visibleTop);
	const bleedLength = Math.max(0, cardBottom - frameBottom);

	const textBounds = sourceTextBoundsFor(allTextElements, frameRect);

	return {
		cardRect: { x: cardX, y: cardY, width: cardClientRect.width, height: cardClientRect.height },
		visibleCardRect: { x: visibleLeft, y: visibleTop, width: visibleWidth, height: visibleHeight },
		textBounds,
		texts,
		bleeds: bleedLength > 0,
		bleedLength
	};
}

function getFrameInSourceCoords(orientation: 'horizontal' | 'vertical'): {
	left: number;
	top: number;
	width: number;
	height: number;
} {
	const size = getVideoFrameSize(orientation);
	const canvas = document.querySelector<HTMLCanvasElement>('.video-frame__canvas');
	const left = canvas ? canvas.getBoundingClientRect().left : 0;
	const top = canvas ? canvas.getBoundingClientRect().top : 0;

	return { left, top, width: size.width, height: size.height };
}

function wrapStateAsPreset(state: EngineState, name: string): Preset {
	return { schema: 'supers@1', name, pack: 'syntax', kind: 'deliverable', state };
}

export function captureMeasurement(state: EngineState, name = '(current)'): VisualMeasurement {
	const preset = wrapStateAsPreset(state, name);
	const config = SURFACE_AUDIT_CONFIG[state.surface.type];
	const root = config ? document.querySelector<HTMLElement>(config.root) : null;
	const frameRect = getFrameInSourceCoords(state.transport.orientation);
	const measuredSurface =
		config && root ? measureSurfaceElement(root, config.roles, frameRect) : null;
	const diagram = measureDiagramText(frameRect);
	const chart = measureChartText(frameRect);
	const surface = measuredSurface
		? {
				...measuredSurface,
				textBounds: mergeSourceTextBounds(
					mergeSourceTextBounds(measuredSurface.textBounds, diagram.textBounds),
					chart.textBounds
				),
				texts: [...measuredSurface.texts, ...diagram.texts, ...chart.texts]
			}
		: null;

	return { preset, surface };
}

/**
 * The issue emitted when a Surface can't be visually measured — distinguishes
 * "this Surface type has no audit mapping yet" from "the mapped root isn't in
 * the DOM", so the failure is actionable instead of a misleading paper/plain
 * message for every other Surface.
 */
function surfaceUnavailableIssue(state: EngineState): RubricIssue {
	const config = SURFACE_AUDIT_CONFIG[state.surface.type];
	return {
		rule: 'audit',
		severity: 'error',
		path: 'document',
		message: config
			? `Surface root "${config.root}" not found in DOM for surface type "${state.surface.type}".`
			: `Surface type "${state.surface.type}" has no visual-audit mapping yet — G2/G4/T1 are not gated for it.`
	};
}

export function runVisualAudit(state: EngineState, name = '(current)'): RubricIssue[] {
	const measurement = captureMeasurement(state, name);

	if (!measurement.surface) {
		return [surfaceUnavailableIssue(state)];
	}

	return lintPresetVisual(measurement);
}

declare global {
	interface Window {
		__supersVisualAudit?: {
			issues: RubricIssue[];
			measurement: VisualMeasurement;
			timestamp: number;
		};
	}
}

export function exposeVisualAudit(state: EngineState, name = '(current)'): void {
	const measurement = captureMeasurement(state, name);
	const issues = measurement.surface
		? lintPresetVisual(measurement)
		: [surfaceUnavailableIssue(state)];

	window.__supersVisualAudit = {
		issues,
		measurement,
		timestamp: Date.now()
	};
}
