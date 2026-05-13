import { getCanvasRgbColor } from '$lib/utils/color';
import { clampNumber } from '$lib/utils/math';

export type AnnotationMarkStyle = 'highlight' | 'circle' | 'underline' | 'strike';

export interface AnnotationFrameLayout {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface AnnotationMarkColors {
	circle: string;
	highlight: string;
	strike: string;
	underline: string;
}

export interface AnnotationMarkDelimiters {
	closer: string;
	opener: string;
}

export interface AnnotationMarkFragmentLayout {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface AnnotationMarkLayout {
	bounds: AnnotationMarkFragmentLayout;
	fragments: AnnotationMarkFragmentLayout[];
	style: AnnotationMarkStyle;
}

export interface AnnotationTextSegment {
	markStyle: AnnotationMarkStyle | null;
	text: string;
}

export interface AnnotatedTextParagraph {
	segments: AnnotationTextSegment[];
}

interface AnnotationMarkSyntax extends AnnotationMarkDelimiters {
	style: AnnotationMarkStyle;
}

interface MarkerLineOptions {
	color: string;
	endX: number;
	endY: number;
	intensity: number;
	lineWidth: number;
	opacity: number;
	phase: number;
	progress: number;
	startX: number;
	startY: number;
	wobble: number;
}

type AnnotationCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

interface AnnotationTextureBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface AnnotationTextureCanvas {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	context: AnnotationCanvasContext;
	height: number;
	width: number;
}

interface MarkerEllipseOptions {
	centerX: number;
	centerY: number;
	color: string;
	intensity: number;
	lineWidth: number;
	opacity: number;
	progress: number;
	radiusX: number;
	radiusY: number;
	rotation: number;
	seed: number;
	wobble: number;
}

export interface DrawAnnotationMarksOptions {
	colors: AnnotationMarkColors;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	intensity: number;
	layouts: AnnotationMarkLayout[];
	progressByIndex: readonly number[];
	markStyles?: readonly AnnotationMarkStyle[];
}

export const ANNOTATION_MARK_ATTRIBUTE = 'data-annotation-mark';
const ANNOTATION_MARK_SYNTAX: AnnotationMarkSyntax[] = [
	{
		style: 'highlight',
		opener: '==',
		closer: '=='
	},
	{
		style: 'underline',
		opener: '__',
		closer: '__'
	},
	{
		style: 'strike',
		opener: '~~',
		closer: '~~'
	},
	{
		style: 'circle',
		opener: '((',
		closer: '))'
	}
];

export function getAnnotationMarkDelimiters(style: AnnotationMarkStyle): AnnotationMarkDelimiters {
	const syntax = ANNOTATION_MARK_SYNTAX.find((item) => item.style === style);

	if (!syntax) {
		throw new TypeError(`Unknown annotation mark style: ${style}`);
	}

	return {
		opener: syntax.opener,
		closer: syntax.closer
	};
}

export function isAnnotationMarkStyle(value: string | undefined): value is AnnotationMarkStyle {
	return ANNOTATION_MARK_SYNTAX.some((syntax) => syntax.style === value);
}

export function getAnnotationTextSegments(paragraph: string): AnnotationTextSegment[] {
	const segments: AnnotationTextSegment[] = [];
	let cursor = 0;

	while (cursor < paragraph.length) {
		const syntax = ANNOTATION_MARK_SYNTAX.find((item) => paragraph.startsWith(item.opener, cursor));

		if (!syntax) {
			const nextMarkIndex = ANNOTATION_MARK_SYNTAX.reduce((nearestIndex, item) => {
				const index = paragraph.indexOf(item.opener, cursor + 1);

				if (index === -1) {
					return nearestIndex;
				}

				return nearestIndex === -1 ? index : Math.min(nearestIndex, index);
			}, -1);
			const end = nextMarkIndex === -1 ? paragraph.length : nextMarkIndex;

			segments.push({
				text: paragraph.slice(cursor, end),
				markStyle: null
			});
			cursor = end;
			continue;
		}

		const markStart = cursor + syntax.opener.length;
		const markEnd = paragraph.indexOf(syntax.closer, markStart);

		if (markEnd === -1) {
			segments.push({
				text: syntax.opener,
				markStyle: null
			});
			cursor += syntax.opener.length;
			continue;
		}

		const markedText = paragraph.slice(markStart, markEnd);

		if (markedText.length > 0) {
			segments.push({
				text: getAnnotationDisplayText(markedText),
				markStyle: syntax.style
			});
		}

		cursor = markEnd + syntax.closer.length;
	}

	return segments;
}

function getAnnotationDisplayText(text: string): string {
	const hasNestedMark = ANNOTATION_MARK_SYNTAX.some((syntax) => text.includes(syntax.opener));

	if (!hasNestedMark) {
		return text;
	}

	return getAnnotationTextSegments(text)
		.map((segment) => segment.text)
		.join('');
}

export function getAnnotatedTextParagraphs(body: string): AnnotatedTextParagraph[] {
	return body
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0)
		.map((paragraph) => ({
			segments: getAnnotationTextSegments(paragraph)
		}));
}

export function getAnnotationMarkLayouts(
	sourceElement: HTMLElement,
	frameLayout: AnnotationFrameLayout
): AnnotationMarkLayout[] {
	const sourceRect = sourceElement.getBoundingClientRect();

	if (sourceRect.width <= 0 || sourceRect.height <= 0) {
		return [];
	}

	const scaleX = frameLayout.width / sourceRect.width;
	const scaleY = frameLayout.height / sourceRect.height;
	const markedElements = sourceElement.querySelectorAll<HTMLElement>(
		`[${ANNOTATION_MARK_ATTRIBUTE}]`
	);
	const layouts: AnnotationMarkLayout[] = [];

	for (const markedElement of markedElements) {
		const style = markedElement.dataset.annotationMark;

		if (!isAnnotationMarkStyle(style)) {
			continue;
		}

		const fragments = Array.from(markedElement.getClientRects())
			.map<AnnotationMarkFragmentLayout>((rect) => ({
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
			bounds: getAnnotationMarkBounds(fragments)
		});
	}

	return layouts;
}

export function drawAnnotationMarks({
	colors,
	context,
	intensity,
	layouts,
	progressByIndex,
	markStyles
}: DrawAnnotationMarksOptions): void {
	if (layouts.length === 0) {
		return;
	}

	for (const [index, layout] of layouts.entries()) {
		const markProgress = clampNumber(progressByIndex[index] ?? 0, 0, 1);

		if (markProgress <= 0) {
			continue;
		}

		if (markStyles && !markStyles.includes(layout.style)) {
			continue;
		}

		if (layout.style === 'circle') {
			drawCircle(context, layout.bounds, markProgress, colors.circle, intensity);
			continue;
		}

		drawFragmentedMark(context, layout, markProgress, colors, intensity);
	}
}

function getAnnotationMarkBounds(
	fragments: AnnotationMarkFragmentLayout[]
): AnnotationMarkFragmentLayout {
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

function drawFragmentedMark(
	context: AnnotationCanvasContext,
	layout: AnnotationMarkLayout,
	progress: number,
	colors: AnnotationMarkColors,
	intensity: number
): void {
	for (const fragment of layout.fragments) {
		if (layout.style === 'highlight') {
			drawHighlight(context, fragment, progress, colors.highlight, intensity);
			continue;
		}

		if (layout.style === 'underline') {
			drawUnderline(context, fragment, progress, colors.underline, intensity);
			continue;
		}

		drawStrike(context, fragment, progress, colors.strike, intensity);
	}
}

function drawHighlight(
	context: AnnotationCanvasContext,
	fragment: AnnotationMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const visibleWidth = fragment.width * progress;

	if (visibleWidth <= 0) {
		return;
	}

	const insetX = fragment.height * 0.16;
	const left = fragment.x - insetX;
	const right = fragment.x + visibleWidth + insetX * 0.62;
	const top = fragment.y + fragment.height * 0.17;
	const bottom = fragment.y + fragment.height * 0.88;
	const seed = fragment.x * 0.017 + fragment.y * 0.031;
	const textureBounds = getTextureBounds(left, top, right, bottom, fragment.height * 0.18);
	const texture = createAnnotationTextureCanvas(textureBounds.width, textureBounds.height);
	const localLeft = left - textureBounds.x;
	const localRight = right - textureBounds.x;
	const localTop = top - textureBounds.y;
	const localBottom = bottom - textureBounds.y;

	texture.context.save();
	createHighlighterPath({
		context: texture.context,
		left: localLeft,
		right: localRight,
		top: localTop,
		bottom: localBottom,
		seed
	});
	texture.context.clip();
	texture.context.fillStyle = getCanvasRgbColor(color, 0.95);
	texture.context.fillRect(0, 0, texture.width, texture.height);
	drawHighlighterPigment({
		context: texture.context,
		left: localLeft,
		right: localRight,
		top: localTop,
		bottom: localBottom,
		color,
		intensity,
		seed
	});
	texture.context.restore();
	applyAlphaTexture(texture, (x, y) =>
		getHighlighterTextureAlpha(x, y, texture.width, texture.height, seed, intensity)
	);
	drawTextureCanvas(context, texture, textureBounds, 'multiply');
}

function drawUnderline(
	context: AnnotationCanvasContext,
	fragment: AnnotationMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const y = fragment.y + fragment.height * 0.96;

	drawMarkerLine(context, {
		startX: fragment.x - fragment.height * 0.05,
		startY: y,
		endX: fragment.x + fragment.width + fragment.height * 0.08,
		endY: y + fragment.height * 0.03,
		progress,
		color,
		intensity,
		opacity: 0.58 + intensity * 0.22,
		lineWidth: Math.max(3, fragment.height * 0.13),
		wobble: fragment.height * 0.04,
		phase: fragment.x * 0.022 + fragment.y * 0.044
	});
}

function drawStrike(
	context: AnnotationCanvasContext,
	fragment: AnnotationMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const y = fragment.y + fragment.height * 0.52;

	drawMarkerLine(context, {
		startX: fragment.x - fragment.height * 0.04,
		startY: y - fragment.height * 0.08,
		endX: fragment.x + fragment.width + fragment.height * 0.08,
		endY: y + fragment.height * 0.08,
		progress,
		color,
		intensity,
		opacity: 0.62 + intensity * 0.2,
		lineWidth: Math.max(3, fragment.height * 0.14),
		wobble: fragment.height * 0.035,
		phase: fragment.x * 0.026 + fragment.y * 0.039
	});
}

function drawCircle(
	context: AnnotationCanvasContext,
	bounds: AnnotationMarkFragmentLayout,
	progress: number,
	color: string,
	intensity: number
): void {
	const centerX = bounds.x + bounds.width * 0.5;
	const centerY = bounds.y + bounds.height * 0.52;
	const radiusX = bounds.width * 0.6 + bounds.height * 0.12;
	const radiusY = bounds.height * 0.78;
	const lineWidth = Math.max(5, bounds.height * 0.055);
	const seed = bounds.x * 0.02 + bounds.y * 0.035;

	drawMarkerEllipse(context, {
		centerX,
		centerY,
		radiusX,
		radiusY,
		rotation: -0.08,
		progress,
		color,
		intensity,
		opacity: 0.72 + intensity * 0.18,
		lineWidth,
		wobble: Math.max(1.2, bounds.height * 0.018),
		seed
	});
}

function createHighlighterPath({
	context,
	left,
	right,
	top,
	bottom,
	seed
}: {
	context: AnnotationCanvasContext;
	left: number;
	right: number;
	top: number;
	bottom: number;
	seed: number;
}): void {
	const height = bottom - top;
	const topLeft = top + signedNoise(seed + 1) * height * 0.06;
	const topRight = top + signedNoise(seed + 2) * height * 0.05;
	const bottomRight = bottom + signedNoise(seed + 3) * height * 0.05;
	const bottomLeft = bottom + signedNoise(seed + 4) * height * 0.06;
	const chiselLead = height * (0.12 + pseudoNoise(seed + 5) * 0.08);
	const chiselTail = height * (0.08 + pseudoNoise(seed + 6) * 0.1);

	context.beginPath();
	context.moveTo(left + chiselLead, topLeft);
	context.lineTo(right - chiselTail, topRight);
	context.lineTo(right + chiselTail * 0.45, bottomRight);
	context.lineTo(left - chiselLead * 0.35, bottomLeft);
	context.closePath();
}

function drawHighlighterPigment({
	context,
	left,
	right,
	top,
	bottom,
	color,
	intensity,
	seed
}: {
	context: AnnotationCanvasContext;
	left: number;
	right: number;
	top: number;
	bottom: number;
	color: string;
	intensity: number;
	seed: number;
}): void {
	const height = bottom - top;
	const width = right - left;
	const rowCount = Math.max(8, Math.round(height / 3));

	context.save();
	context.globalCompositeOperation = 'source-atop';
	context.fillStyle = getCanvasRgbColor(color, 0.11 + intensity * 0.05);
	context.fillRect(left, top + height * 0.03, width, Math.max(1, height * 0.12));
	context.fillRect(left, bottom - height * 0.17, width, Math.max(1, height * 0.13));

	for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
		const rowProgress = rowCount === 1 ? 0.5 : rowIndex / (rowCount - 1);
		const y = top + height * rowProgress + signedNoise(seed + rowIndex * 3.9) * height * 0.035;
		const rowHeight = Math.max(1, height * (0.035 + pseudoNoise(seed + rowIndex * 1.7) * 0.045));
		const opacity = 0.025 + intensity * 0.018 + pseudoNoise(seed + rowIndex * 2.2) * 0.035;

		context.fillStyle = getCanvasRgbColor(color, opacity);
		context.fillRect(left, y, width, rowHeight);
	}

	context.restore();
}

function drawMarkerLine(context: AnnotationCanvasContext, options: MarkerLineOptions): void {
	const visibleProgress = clampNumber(options.progress, 0, 1);

	if (visibleProgress <= 0) {
		return;
	}

	const deltaX = options.endX - options.startX;
	const deltaY = options.endY - options.startY;
	const length = Math.hypot(deltaX, deltaY);

	if (length <= 0) {
		return;
	}

	const padding = options.lineWidth * 2.3 + options.wobble * 2;
	const textureBounds = getTextureBounds(
		Math.min(options.startX, options.endX),
		Math.min(options.startY, options.endY),
		Math.max(options.startX, options.endX),
		Math.max(options.startY, options.endY),
		padding
	);
	const texture = createAnnotationTextureCanvas(textureBounds.width, textureBounds.height);
	const localOptions = {
		...options,
		startX: options.startX - textureBounds.x,
		startY: options.startY - textureBounds.y,
		endX: options.endX - textureBounds.x,
		endY: options.endY - textureBounds.y
	};

	drawMarkerLineLayer(texture.context, localOptions, options.lineWidth, options.opacity, 0);
	texture.context.save();
	texture.context.globalCompositeOperation = 'source-atop';
	drawMarkerLineLayer(
		texture.context,
		localOptions,
		options.lineWidth * 0.42,
		0.1 + options.intensity * 0.08,
		-options.lineWidth * 0.08
	);
	texture.context.restore();
	drawMarkerCap(
		texture.context,
		localOptions,
		colorWithOpacity(options.color, 0.11 + options.intensity * 0.08)
	);
	applyAlphaTexture(texture, (x, y) =>
		getMarkerTextureAlpha(x, y, texture.width, texture.height, options.phase, options.intensity)
	);
	drawTextureCanvas(context, texture, textureBounds, 'multiply');
}

function drawMarkerLineLayer(
	context: AnnotationCanvasContext,
	options: MarkerLineOptions,
	lineWidth: number,
	opacity: number,
	offset: number
): void {
	const deltaX = options.endX - options.startX;
	const deltaY = options.endY - options.startY;
	const length = Math.hypot(deltaX, deltaY);
	const steps = Math.max(12, Math.ceil(length / 22));
	const drawnSteps = Math.max(1, Math.ceil(steps * clampNumber(options.progress, 0, 1)));

	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.lineWidth = lineWidth;
	context.strokeStyle = getCanvasRgbColor(options.color, opacity);
	context.beginPath();

	for (let step = 0; step <= drawnSteps; step += 1) {
		const t = Math.min(options.progress, step / steps);
		const point = getOrganicMarkerLinePoint(options, t, offset);

		if (step === 0) {
			context.moveTo(point.x, point.y);
			continue;
		}

		context.lineTo(point.x, point.y);
	}

	context.stroke();
	context.restore();
}

function getOrganicMarkerLinePoint(
	options: MarkerLineOptions,
	t: number,
	offset: number
): { x: number; y: number } {
	const deltaX = options.endX - options.startX;
	const deltaY = options.endY - options.startY;
	const length = Math.hypot(deltaX, deltaY);
	const normalX = length === 0 ? 0 : -deltaY / length;
	const normalY = length === 0 ? 0 : deltaX / length;
	const wobble =
		Math.sin(t * Math.PI * 2.15 + options.phase) * options.wobble * 0.45 +
		Math.sin(t * Math.PI * 5.35 + options.phase * 0.37) * options.wobble * 0.28 +
		signedNoise(options.phase + t * 9.2) * options.wobble * 0.18;

	return {
		x: options.startX + deltaX * t + normalX * (offset + wobble),
		y: options.startY + deltaY * t + normalY * (offset + wobble)
	};
}

function drawMarkerCap(
	context: AnnotationCanvasContext,
	options: MarkerLineOptions,
	color: string
): void {
	const endPoint = getOrganicMarkerLinePoint(options, clampNumber(options.progress, 0, 1), 0);
	const radius = options.lineWidth * 0.58;
	const gradient = context.createRadialGradient(
		endPoint.x,
		endPoint.y,
		0,
		endPoint.x,
		endPoint.y,
		radius
	);

	gradient.addColorStop(0, color);
	gradient.addColorStop(1, getCanvasRgbColor(options.color, 0));
	context.save();
	context.globalCompositeOperation = 'source-atop';
	context.fillStyle = gradient;
	context.beginPath();
	context.arc(endPoint.x, endPoint.y, radius, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function drawMarkerEllipse(context: AnnotationCanvasContext, options: MarkerEllipseOptions): void {
	const visibleProgress = clampNumber(options.progress, 0, 1);

	if (visibleProgress <= 0) {
		return;
	}

	const padding = options.lineWidth * 2.6 + options.wobble * 2;
	const textureBounds = getTextureBounds(
		options.centerX - options.radiusX,
		options.centerY - options.radiusY,
		options.centerX + options.radiusX,
		options.centerY + options.radiusY,
		padding
	);
	const texture = createAnnotationTextureCanvas(textureBounds.width, textureBounds.height);
	const localOptions = {
		...options,
		centerX: options.centerX - textureBounds.x,
		centerY: options.centerY - textureBounds.y
	};

	drawMarkerEllipseLayer(texture.context, localOptions, options.lineWidth, options.opacity);
	texture.context.save();
	texture.context.globalCompositeOperation = 'source-atop';
	drawMarkerEllipseLayer(
		texture.context,
		localOptions,
		options.lineWidth * 0.42,
		0.12 + options.intensity * 0.07
	);
	texture.context.restore();
	drawMarkerEllipseCap(texture.context, localOptions);
	applyAlphaTexture(texture, (x, y) =>
		getMarkerTextureAlpha(x, y, texture.width, texture.height, options.seed, options.intensity)
	);
	drawTextureCanvas(context, texture, textureBounds, 'multiply');
}

function drawMarkerEllipseLayer(
	context: AnnotationCanvasContext,
	options: MarkerEllipseOptions,
	lineWidth: number,
	opacity: number
): void {
	const startAngle = -Math.PI * 0.38;
	const fullProgress = options.progress >= 1 ? 1.035 : options.progress;
	const endAngle = startAngle + Math.PI * 2 * fullProgress;
	const steps = Math.max(36, Math.ceil(120 * fullProgress));

	context.save();
	context.lineCap = 'round';
	context.lineJoin = 'round';
	context.lineWidth = lineWidth;
	context.strokeStyle = getCanvasRgbColor(options.color, opacity);
	context.beginPath();

	for (let step = 0; step <= steps; step += 1) {
		const angle = startAngle + ((endAngle - startAngle) * step) / steps;
		const point = getOrganicMarkerEllipsePoint(options, angle);

		if (step === 0) {
			context.moveTo(point.x, point.y);
			continue;
		}

		context.lineTo(point.x, point.y);
	}

	context.stroke();
	context.restore();
}

function getOrganicMarkerEllipsePoint(
	options: MarkerEllipseOptions,
	angle: number
): { x: number; y: number } {
	const cosRotation = Math.cos(options.rotation);
	const sinRotation = Math.sin(options.rotation);
	const radialWobble =
		Math.sin(angle * 2.4 + options.seed) * options.wobble * 0.52 +
		Math.sin(angle * 5.2 + options.seed * 0.61) * options.wobble * 0.28 +
		signedNoise(options.seed + angle * 1.9) * options.wobble * 0.16;
	const rawX = Math.cos(angle) * (options.radiusX + radialWobble);
	const rawY = Math.sin(angle) * (options.radiusY + radialWobble * 0.74);

	return {
		x: options.centerX + rawX * cosRotation - rawY * sinRotation,
		y: options.centerY + rawX * sinRotation + rawY * cosRotation
	};
}

function drawMarkerEllipseCap(
	context: AnnotationCanvasContext,
	options: MarkerEllipseOptions
): void {
	const startAngle = -Math.PI * 0.38;
	const fullProgress = options.progress >= 1 ? 1.035 : options.progress;
	const endAngle = startAngle + Math.PI * 2 * fullProgress;
	const endPoint = getOrganicMarkerEllipsePoint(options, endAngle);
	const radius = options.lineWidth * 0.68;
	const gradient = context.createRadialGradient(
		endPoint.x,
		endPoint.y,
		0,
		endPoint.x,
		endPoint.y,
		radius
	);

	gradient.addColorStop(0, getCanvasRgbColor(options.color, 0.16 + options.intensity * 0.08));
	gradient.addColorStop(1, getCanvasRgbColor(options.color, 0));
	context.save();
	context.globalCompositeOperation = 'source-atop';
	context.fillStyle = gradient;
	context.beginPath();
	context.arc(endPoint.x, endPoint.y, radius, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

function getTextureBounds(
	left: number,
	top: number,
	right: number,
	bottom: number,
	padding: number
): AnnotationTextureBounds {
	const x = Math.floor(left - padding);
	const y = Math.floor(top - padding);
	const maxX = Math.ceil(right + padding);
	const maxY = Math.ceil(bottom + padding);

	return {
		x,
		y,
		width: Math.max(1, maxX - x),
		height: Math.max(1, maxY - y)
	};
}

function createAnnotationTextureCanvas(width: number, height: number): AnnotationTextureCanvas {
	const canvasWidth = Math.max(1, Math.ceil(width));
	const canvasHeight = Math.max(1, Math.ceil(height));

	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Unable to create annotation texture canvas context.');
		}

		return {
			canvas,
			context,
			width: canvasWidth,
			height: canvasHeight
		};
	}

	if (typeof document !== 'undefined') {
		const canvas = document.createElement('canvas');
		canvas.width = canvasWidth;
		canvas.height = canvasHeight;
		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('Unable to create annotation texture canvas context.');
		}

		return {
			canvas,
			context,
			width: canvasWidth,
			height: canvasHeight
		};
	}

	throw new Error('Annotation texture rendering requires a canvas implementation.');
}

function drawTextureCanvas(
	context: AnnotationCanvasContext,
	texture: AnnotationTextureCanvas,
	bounds: AnnotationTextureBounds,
	compositeOperation: GlobalCompositeOperation
): void {
	const source: CanvasImageSource = texture.canvas;

	context.save();
	context.globalCompositeOperation = compositeOperation;
	context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height);
	context.restore();
}

function applyAlphaTexture(
	texture: AnnotationTextureCanvas,
	getAlpha: (x: number, y: number) => number
): void {
	const mask = createAnnotationTextureCanvas(texture.width, texture.height);
	const imageData = mask.context.createImageData(texture.width, texture.height);
	const data = imageData.data;

	for (let y = 0; y < texture.height; y += 1) {
		for (let x = 0; x < texture.width; x += 1) {
			const dataIndex = (y * texture.width + x) * 4;
			const alpha = clampNumber(getAlpha(x, y), 0, 1);

			data[dataIndex] = 0;
			data[dataIndex + 1] = 0;
			data[dataIndex + 2] = 0;
			data[dataIndex + 3] = Math.round(alpha * 255);
		}
	}

	mask.context.putImageData(imageData, 0, 0);
	texture.context.save();
	texture.context.globalCompositeOperation = 'destination-in';
	texture.context.drawImage(mask.canvas, 0, 0);
	texture.context.restore();
}

function getHighlighterTextureAlpha(
	x: number,
	y: number,
	width: number,
	height: number,
	seed: number,
	intensity: number
): number {
	const yRatio = height <= 1 ? 0.5 : y / (height - 1);
	const xRatio = width <= 1 ? 0.5 : x / (width - 1);
	const rowFiber = pseudoNoise(seed + Math.floor(y * 0.46) * 9.37);
	const longFiber = pseudoNoise(seed + y * 0.13 + Math.floor(x * 0.035) * 1.17);
	const fineGrain = pseudoNoise(seed + x * 0.73 + y * 1.91);
	const paperGrain = pseudoNoise(seed + Math.floor(x / 3) * 2.31 + Math.floor(y / 2) * 3.11);
	const edgeBody = 0.82 + Math.sin(yRatio * Math.PI) * 0.18;
	const capDensity = xRatio < 0.045 || xRatio > 0.955 ? 1.08 : 1;
	const dryBreak = fineGrain < 0.026 + (1 - intensity) * 0.03 ? 0.32 + fineGrain * 7 : 1;

	return (
		(0.94 + intensity * 0.06) *
		(0.86 + rowFiber * 0.14) *
		(0.92 + longFiber * 0.08) *
		(0.88 + paperGrain * 0.12) *
		edgeBody *
		capDensity *
		dryBreak
	);
}

function getMarkerTextureAlpha(
	x: number,
	y: number,
	width: number,
	height: number,
	seed: number,
	intensity: number
): number {
	const xRatio = width <= 1 ? 0.5 : x / (width - 1);
	const yRatio = height <= 1 ? 0.5 : y / (height - 1);
	const feltFiber = pseudoNoise(seed + Math.floor(x * 0.28) * 1.73 + Math.floor(y * 0.28) * 2.41);
	const finePore = pseudoNoise(seed + x * 1.43 + y * 1.89);
	const paperTooth = pseudoNoise(seed + Math.floor(x / 4) * 3.07 + Math.floor(y / 4) * 4.19);
	const broadVariation =
		0.88 +
		Math.sin((xRatio * 2.2 + yRatio * 1.35) * Math.PI + seed) * 0.06 +
		Math.sin((xRatio * 6.1 - yRatio * 3.4) * Math.PI + seed * 0.41) * 0.04;
	const dryPore = finePore < 0.025 + (1 - intensity) * 0.028 ? 0.22 + finePore * 8 : 1;

	return (
		(0.72 + intensity * 0.18) *
		(0.72 + feltFiber * 0.28) *
		(0.82 + paperTooth * 0.18) *
		broadVariation *
		dryPore
	);
}

function colorWithOpacity(color: string, opacity: number): string {
	return getCanvasRgbColor(color, opacity);
}

function signedNoise(seed: number): number {
	return pseudoNoise(seed) * 2 - 1;
}

function pseudoNoise(seed: number): number {
	const value = Math.sin(seed * 12.9898) * 43758.5453;

	return value - Math.floor(value);
}
