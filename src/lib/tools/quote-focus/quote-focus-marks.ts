import {
	drawAnnotationMarks,
	type AnnotationFrameLayout,
	type AnnotationMarkFragmentLayout,
	type AnnotationMarkLayout
} from '$lib/annotations/annotation-marks';
import { getCanvasRgbColor } from '$lib/utils/color';
import { clampNumber } from '$lib/utils/math';

import type { QuoteFocusMarkStyle } from './quote-focus-state.svelte';

export interface QuoteMarkLayout {
	bounds: AnnotationMarkFragmentLayout;
	fragments: AnnotationMarkFragmentLayout[];
}

export interface DrawQuoteMarksOptions {
	attribution: string;
	color: string;
	context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
	intensity: number;
	layout: QuoteMarkLayout | null;
	paperLayout: AnnotationFrameLayout;
	progress: number;
	style: QuoteFocusMarkStyle;
}

export function drawQuoteMarks(options: DrawQuoteMarksOptions): void {
	if (!options.layout || options.progress <= 0 || options.style === 'none') {
		return;
	}

	if (options.style === 'underline' || options.style === 'circle') {
		drawMarkerStyleMark(options);
		return;
	}

	if (options.style === 'box') {
		drawBoxMark(options);
		return;
	}

	drawSideNoteMark(options);
}

function drawMarkerStyleMark(options: DrawQuoteMarksOptions): void {
	const layout = options.layout;

	if (!layout) {
		return;
	}

	const annotationLayout: AnnotationMarkLayout = {
		style: options.style === 'circle' ? 'circle' : 'underline',
		fragments: layout.fragments,
		bounds: layout.bounds
	};

	drawAnnotationMarks({
		colorsByIndex: [options.color],
		context: options.context,
		intensityByIndex: [options.intensity],
		layouts: [annotationLayout],
		progressByIndex: [options.progress]
	});
}

function drawBoxMark(options: DrawQuoteMarksOptions): void {
	const layout = options.layout;

	if (!layout) {
		return;
	}

	const bounds = layout.bounds;
	const padding = Math.max(8, bounds.height * 0.18);
	const left = bounds.x - padding;
	const top = bounds.y - padding * 0.6;
	const right = bounds.x + bounds.width + padding;
	const bottom = bounds.y + bounds.height + padding * 0.6;
	const perimeterStops: [number, number][] = [
		[left, top],
		[right, top],
		[right, bottom],
		[left, bottom],
		[left, top]
	];
	const segments = perimeterStops.length - 1;
	const totalLength = segments;
	const progressLength = totalLength * clampNumber(options.progress, 0, 1);
	const lineWidth = Math.max(4, bounds.height * 0.08);

	options.context.save();
	options.context.lineCap = 'round';
	options.context.lineJoin = 'round';
	options.context.lineWidth = lineWidth;
	options.context.strokeStyle = getCanvasRgbColor(options.color, 0.7 + options.intensity * 0.2);
	options.context.beginPath();
	options.context.moveTo(perimeterStops[0][0], perimeterStops[0][1]);

	for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
		const consumedBefore = segmentIndex;
		const remaining = progressLength - consumedBefore;

		if (remaining <= 0) {
			break;
		}

		const portion = Math.min(1, remaining);
		const start = perimeterStops[segmentIndex];
		const end = perimeterStops[segmentIndex + 1];
		const targetX = start[0] + (end[0] - start[0]) * portion;
		const targetY = start[1] + (end[1] - start[1]) * portion;
		const wobble = bounds.height * 0.018 * Math.sin(segmentIndex * 1.7 + bounds.x * 0.011);

		options.context.lineTo(targetX + wobble, targetY - wobble);
	}

	options.context.stroke();
	options.context.restore();
}

function drawSideNoteMark(options: DrawQuoteMarksOptions): void {
	const layout = options.layout;

	if (!layout) {
		return;
	}

	const bounds = layout.bounds;
	const paper = options.paperLayout;
	const useRightMargin = bounds.x + bounds.width * 0.5 <= paper.x + paper.width * 0.5;
	const noteFontSize = Math.max(28, bounds.height * 0.95);
	const arrowLength = Math.max(60, bounds.height * 2.2);
	const arrowEndX = useRightMargin
		? bounds.x + bounds.width + Math.max(20, bounds.height * 0.45)
		: bounds.x - Math.max(20, bounds.height * 0.45);
	const arrowStartX = useRightMargin ? arrowEndX + arrowLength : arrowEndX - arrowLength;
	const arrowMidY = bounds.y + bounds.height * 0.55;
	const lineWidth = Math.max(3, bounds.height * 0.07);
	const drawProgress = clampNumber(options.progress, 0, 1);

	options.context.save();
	options.context.lineCap = 'round';
	options.context.lineJoin = 'round';
	options.context.strokeStyle = getCanvasRgbColor(options.color, 0.7 + options.intensity * 0.2);
	options.context.fillStyle = getCanvasRgbColor(options.color, 0.85 + options.intensity * 0.1);
	options.context.lineWidth = lineWidth;
	options.context.beginPath();
	options.context.moveTo(arrowStartX, arrowMidY - bounds.height * 0.4);

	const arrowSegments = 24;
	const drawnSegments = Math.max(1, Math.ceil(arrowSegments * drawProgress));

	for (let segment = 1; segment <= drawnSegments; segment += 1) {
		const segmentProgress = segment / arrowSegments;
		const x = arrowStartX + (arrowEndX - arrowStartX) * segmentProgress;
		const sway = Math.sin(segmentProgress * Math.PI) * bounds.height * 0.5;
		const y = arrowMidY - bounds.height * 0.4 + sway;

		options.context.lineTo(x, y);
	}

	options.context.stroke();

	if (drawProgress >= 0.65) {
		const headSize = Math.max(10, bounds.height * 0.4);
		const headDirection = useRightMargin ? -1 : 1;

		options.context.beginPath();
		options.context.moveTo(arrowEndX, arrowMidY);
		options.context.lineTo(
			arrowEndX + headDirection * headSize,
			arrowMidY - headSize * 0.6
		);
		options.context.lineTo(
			arrowEndX + headDirection * headSize * 0.6,
			arrowMidY
		);
		options.context.lineTo(
			arrowEndX + headDirection * headSize,
			arrowMidY + headSize * 0.6
		);
		options.context.closePath();
		options.context.fill();
	}

	const text = options.attribution.trim();

	if (text.length > 0 && drawProgress >= 0.4) {
		const textOpacity = clampNumber((drawProgress - 0.4) / 0.45, 0, 1);

		options.context.fillStyle = getCanvasRgbColor(
			options.color,
			(0.85 + options.intensity * 0.1) * textOpacity
		);
		options.context.font = `italic ${noteFontSize}px Georgia, "Times New Roman", serif`;
		options.context.textBaseline = 'top';
		options.context.textAlign = useRightMargin ? 'left' : 'right';
		options.context.fillText(
			text,
			arrowStartX,
			arrowMidY + bounds.height * 0.3,
			Math.max(160, Math.abs(arrowEndX - arrowStartX) + arrowLength * 0.3)
		);
	}

	options.context.restore();
}
