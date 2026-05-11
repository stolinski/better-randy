import { getHtmlInCanvasContext } from '$lib/platform/html-in-canvas';
import { getCanvasRgbColor } from '$lib/utils/color';
import { clampNumber, easeOutCubic } from '$lib/utils/math';

import { isResearchPaperMarkStyle } from './research-paper-content';
import type {
	ResearchPaperMarkColors,
	ResearchPaperMarkStyle
} from './research-paper-state.svelte';

export interface ResearchPaperFrameOptions {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	durationSeconds: number;
	markColors: ResearchPaperMarkColors;
	markIntensity: number;
	sourceElement: HTMLElement;
	timestamp: number;
}

interface ResearchPaperFrameLayout {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ResearchPaperMarkLayout {
	bounds: ResearchPaperMarkFragmentLayout;
	fragments: ResearchPaperMarkFragmentLayout[];
	style: ResearchPaperMarkStyle;
}

interface ResearchPaperMarkFragmentLayout {
	x: number;
	y: number;
	width: number;
	height: number;
}

const PAPER_ASPECT_RATIO = Math.SQRT2;

function getResearchPaperFrameLayout({
	canvas,
	durationSeconds,
	timestamp
}: Pick<
	ResearchPaperFrameOptions,
	'canvas' | 'durationSeconds' | 'timestamp'
>): ResearchPaperFrameLayout {
	const maxWidth = canvas.width * 0.38;
	const maxHeight = canvas.height * 0.88;
	const width = Math.min(maxWidth, maxHeight / PAPER_ASPECT_RATIO);
	const height = width * PAPER_ASPECT_RATIO;
	const entranceProgress = easeOutCubic(
		clampNumber(timestamp / Math.max(1, durationSeconds * 0.28), 0, 1)
	);
	const x = canvas.width * 0.5 - width / 2;
	const startY = canvas.height + height * 0.08;
	const endY = canvas.height * 0.5 - height / 2;
	const y = startY + (endY - startY) * entranceProgress;

	return {
		x,
		y,
		width,
		height
	};
}

function getMarkProgress(timestamp: number, durationSeconds: number): number {
	const start = durationSeconds * 0.34;
	const length = Math.max(0.1, durationSeconds * 0.24);

	return easeOutCubic(clampNumber((timestamp - start) / length, 0, 1));
}

function drawHighlight(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	fragment: ResearchPaperMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const opacity = 0.32 + intensity * 0.4;
	const lineWidth = fragment.height * 0.72;
	const endX = fragment.x + fragment.width * progress;
	const y = fragment.y + fragment.height * 0.58;

	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.lineWidth = lineWidth;
	context.strokeStyle = getCanvasRgbColor(color, opacity);
	context.beginPath();
	context.moveTo(fragment.x, y);
	context.bezierCurveTo(
		fragment.x + fragment.width * 0.24,
		y - lineWidth * 0.08,
		fragment.x + fragment.width * 0.56,
		y + lineWidth * 0.08,
		endX,
		y
	);
	context.stroke();

	context.restore();
}

function drawUnderline(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	fragment: ResearchPaperMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const opacity = 0.48 + intensity * 0.36;
	const y = fragment.y + fragment.height * 0.94;
	const endX = fragment.x + fragment.width * progress;

	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.lineWidth = fragment.height * 0.08;
	context.strokeStyle = getCanvasRgbColor(color, opacity);
	context.beginPath();
	context.moveTo(fragment.x, y);
	context.bezierCurveTo(
		fragment.x + fragment.width * 0.2,
		y + fragment.height * 0.08,
		fragment.x + fragment.width * 0.58,
		y - fragment.height * 0.1,
		endX,
		y
	);
	context.stroke();
	context.restore();
}

function drawStrike(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	fragment: ResearchPaperMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const opacity = 0.5 + intensity * 0.32;
	const endX = fragment.x + fragment.width * progress;
	const y = fragment.y + fragment.height * 0.52;

	context.save();
	context.lineCap = 'round';
	context.lineWidth = fragment.height * 0.1;
	context.strokeStyle = getCanvasRgbColor(color, opacity);
	context.beginPath();
	context.moveTo(fragment.x, y - fragment.height * 0.08);
	context.lineTo(endX, y + fragment.height * 0.05);
	context.stroke();
	context.restore();
}

function drawCircle(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	bounds: ResearchPaperMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const opacity = 0.42 + intensity * 0.38;
	const centerX = bounds.x + bounds.width * 0.5;
	const centerY = bounds.y + bounds.height * 0.52;

	context.save();
	context.lineCap = 'round';
	context.lineWidth = Math.max(3, bounds.height * 0.08);
	context.strokeStyle = getCanvasRgbColor(color, opacity);
	context.beginPath();
	context.ellipse(
		centerX,
		centerY,
		bounds.width * 0.58,
		bounds.height * 0.78,
		-0.08,
		-Math.PI * 0.35,
		-Math.PI * 0.35 + Math.PI * 2 * progress
	);
	context.stroke();
	context.restore();
}

function getResearchPaperMarkBounds(
	fragments: ResearchPaperMarkFragmentLayout[]
): ResearchPaperMarkFragmentLayout {
	const left = Math.min(...fragments.map((fragment) => fragment.x));
	const top = Math.min(...fragments.map((fragment) => fragment.y));
	const right = Math.max(...fragments.map((fragment) => fragment.x + fragment.width));
	const bottom = Math.max(...fragments.map((fragment) => fragment.y + fragment.height));

	return {
		x: left,
		y: top,
		width: right - left,
		height: bottom - top
	};
}

function getResearchPaperMarkLayouts(
	sourceElement: HTMLElement,
	frameLayout: ResearchPaperFrameLayout
): ResearchPaperMarkLayout[] {
	const sourceRect = sourceElement.getBoundingClientRect();

	if (sourceRect.width <= 0 || sourceRect.height <= 0) {
		return [];
	}

	const scaleX = frameLayout.width / sourceRect.width;
	const scaleY = frameLayout.height / sourceRect.height;
	const markedElements = sourceElement.querySelectorAll<HTMLElement>('[data-research-paper-mark]');
	const layouts: ResearchPaperMarkLayout[] = [];

	for (const markedElement of markedElements) {
		const style = markedElement.dataset.researchPaperMark;

		if (!isResearchPaperMarkStyle(style)) {
			continue;
		}

		const fragments = Array.from(markedElement.getClientRects())
			.map<ResearchPaperMarkFragmentLayout>((rect) => ({
				x: frameLayout.x + (rect.left - sourceRect.left) * scaleX,
				y: frameLayout.y + (rect.top - sourceRect.top) * scaleY,
				width: rect.width * scaleX,
				height: rect.height * scaleY
			}))
			.filter((fragment) => fragment.width > 0 && fragment.height > 0);

		if (fragments.length === 0) {
			continue;
		}

		layouts.push({
			style,
			fragments,
			bounds: getResearchPaperMarkBounds(fragments)
		});
	}

	return layouts;
}

function drawFragmentedMark(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	markLayout: ResearchPaperMarkLayout,
	progress: number,
	markColors: ResearchPaperMarkColors,
	intensity: number
): void {
	for (const fragment of markLayout.fragments) {
		if (markLayout.style === 'highlight') {
			drawHighlight(context, fragment, progress, markColors.highlight, intensity);
			continue;
		}

		if (markLayout.style === 'underline') {
			drawUnderline(context, fragment, progress, markColors.underline, intensity);
			continue;
		}

		drawStrike(context, fragment, progress, markColors.strike, intensity);
	}
}

function drawResearchPaperMark({
	context,
	durationSeconds,
	markColors,
	markLayouts,
	markIntensity,
	timestamp
}: Pick<
	ResearchPaperFrameOptions,
	'context' | 'durationSeconds' | 'markColors' | 'markIntensity' | 'timestamp'
> & {
	markLayouts: ResearchPaperMarkLayout[];
}): void {
	const progress = getMarkProgress(timestamp, durationSeconds);

	if (progress <= 0 || markLayouts.length === 0) {
		return;
	}

	for (const [index, markLayout] of markLayouts.entries()) {
		const markProgress = clampNumber(progress * markLayouts.length - index, 0, 1);

		if (markProgress <= 0) {
			continue;
		}

		if (markLayout.style === 'circle') {
			drawCircle(context, markLayout.bounds, markProgress, markColors.circle, markIntensity);
			continue;
		}

		drawFragmentedMark(context, markLayout, markProgress, markColors, markIntensity);
	}
}

export function renderResearchPaperFrame({
	canvas,
	context,
	durationSeconds,
	markColors,
	markIntensity,
	sourceElement,
	timestamp
}: ResearchPaperFrameOptions): void {
	const htmlInCanvasContext = getHtmlInCanvasContext(context);
	const layout = getResearchPaperFrameLayout({
		canvas,
		durationSeconds,
		timestamp
	});
	sourceElement.style.transform = '';
	const markLayouts = getResearchPaperMarkLayouts(sourceElement, layout);
	const transform = htmlInCanvasContext.drawElementImage(
		sourceElement,
		layout.x,
		layout.y,
		layout.width,
		layout.height
	);

	sourceElement.style.transform = transform.toString();

	drawResearchPaperMark({
		context,
		durationSeconds,
		markColors,
		markLayouts,
		markIntensity,
		timestamp
	});
}
