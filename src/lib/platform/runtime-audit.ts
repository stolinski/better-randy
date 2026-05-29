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
	root: HTMLElement,
	role: RenderedTextRole,
	bandKey: TextBandKey,
	selector: string
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
		const lineHeightPx = parseFloat(style.lineHeight);
		const lineHeightRatio = isNaN(lineHeightPx) || lineHeightPx <= 0 ? 1.2 : lineHeightPx / fontSize;
		const lineCount = countLineBoxes(node, fontSize, lineHeightPx);
		const effectiveBand = bandKeyFor(node, bandKey);
		const charsPerLine = measureCharsPerLine(node, fontSize, font);
		measurements.push({
			role,
			bandKey: effectiveBand,
			capHeight: fontSize * ratio,
			fontFamily: font,
			lineHeight: lineHeightRatio,
			charsPerLine,
			lineCount,
			label: text.slice(0, 40)
		});
	}

	return measurements;
}

function measureSurfaceElement(
	root: HTMLElement,
	roleSelectors: readonly RoleSelector[],
	frameRect: { width: number; height: number; left: number; top: number }
): RenderedSurfaceMeasurement {
	const cardClientRect = root.getBoundingClientRect();
	const texts: RenderedTextMeasurement[] = [];

	for (const { role, bandKey, selector } of roleSelectors) {
		texts.push(...measureText(root, role, bandKey, selector));
	}

	let textClientBounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
	const allTextElements = root.querySelectorAll<HTMLElement>('h2, p, span, cite, time, footer, header, section');

	for (const el of allTextElements) {
		if ((el.textContent ?? '').trim().length === 0) {
			continue;
		}

		const r = el.getBoundingClientRect();
		textClientBounds.left = Math.min(textClientBounds.left, r.left);
		textClientBounds.top = Math.min(textClientBounds.top, r.top);
		textClientBounds.right = Math.max(textClientBounds.right, r.right);
		textClientBounds.bottom = Math.max(textClientBounds.bottom, r.bottom);
	}

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

	const textBounds = isFinite(textClientBounds.left)
		? {
				x: textClientBounds.left - offsetX,
				y: textClientBounds.top - offsetY,
				width: textClientBounds.right - textClientBounds.left,
				height: textClientBounds.bottom - textClientBounds.top
			}
		: { x: 0, y: 0, width: 0, height: 0 };

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
	return { schema: 'hiviz@1', name, pack: 'syntax', state };
}

export function captureMeasurement(state: EngineState, name = '(current)'): VisualMeasurement {
	const preset = wrapStateAsPreset(state, name);
	const paperRoot = document.querySelector<HTMLElement>('.paper-source');
	const plainRoot = document.querySelector<HTMLElement>('.plain-source');
	const frameRect = getFrameInSourceCoords(state.transport.orientation);
	const surface =
		state.surface.type === 'paper'
			? paperRoot
				? measureSurfaceElement(paperRoot, PAPER_ROLE_SELECTORS, frameRect)
				: null
			: plainRoot
				? measureSurfaceElement(plainRoot, PLAIN_ROLE_SELECTORS, frameRect)
				: null;

	return { preset, surface };
}

export function runVisualAudit(state: EngineState, name = '(current)'): RubricIssue[] {
	const measurement = captureMeasurement(state, name);

	if (!measurement.surface) {
		return [
			{
				rule: 'audit',
				severity: 'error',
				path: 'document',
				message: 'No surface root element found in DOM (.paper-source / .plain-source).'
			}
		];
	}

	return lintPresetVisual(measurement);
}

declare global {
	interface Window {
		__hivizVisualAudit?: {
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
		: [
				{
					rule: 'audit' as const,
					severity: 'error' as const,
					path: 'document',
					message: 'No surface root element found in DOM (.paper-source / .plain-source).'
				}
			];

	window.__hivizVisualAudit = {
		issues,
		measurement,
		timestamp: Date.now()
	};
}
