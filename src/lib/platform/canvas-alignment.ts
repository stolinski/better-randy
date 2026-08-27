import type { CanvasElementSelectionKey } from './canvas-element-selection';
import type { CanvasInteractionRect } from './canvas-interaction-geometry';

export type CanvasAlignmentReference = 'selection' | 'canvas';

export type CanvasAlignmentCommand =
	'left' | 'horizontal-center' | 'right' | 'top' | 'vertical-middle' | 'bottom';

export type CanvasDistributionCommand = 'horizontal' | 'vertical';

export interface CanvasAlignableElement {
	selectionKey: CanvasElementSelectionKey;
	/** Unprojected normalized composition bounds. Display zoom never enters this value. */
	bounds: CanvasInteractionRect;
}

export interface CanvasElementTranslation {
	selectionKey: CanvasElementSelectionKey;
	delta: { x: number; y: number };
}

const NORMALIZED_CANVAS_BOUNDS: CanvasInteractionRect = {
	left: 0,
	top: 0,
	width: 1,
	height: 1
};

const CANVAS_ALIGNMENT_PRECISION = 1_000_000;

function roundCanvasAlignmentValue(value: number): number {
	const rounded = Math.round(value * CANVAS_ALIGNMENT_PRECISION) / CANVAS_ALIGNMENT_PRECISION;
	return Object.is(rounded, -0) ? 0 : rounded;
}

function isFiniteCanvasAlignmentBounds(bounds: CanvasInteractionRect): boolean {
	return (
		Number.isFinite(bounds.left) &&
		Number.isFinite(bounds.top) &&
		Number.isFinite(bounds.width) &&
		Number.isFinite(bounds.height) &&
		bounds.width >= 0 &&
		bounds.height >= 0
	);
}

function stableCanvasAlignableElements(
	elements: readonly CanvasAlignableElement[],
	minimumCount: number
): CanvasAlignableElement[] | null {
	if (elements.length < minimumCount) return null;
	const keys = new Set<CanvasElementSelectionKey>();
	for (const element of elements) {
		if (!isFiniteCanvasAlignmentBounds(element.bounds) || keys.has(element.selectionKey)) {
			return null;
		}
		keys.add(element.selectionKey);
	}
	return [...elements].sort((first, second) =>
		first.selectionKey.localeCompare(second.selectionKey)
	);
}

function selectionCanvasBounds(elements: readonly CanvasAlignableElement[]): CanvasInteractionRect {
	const left = Math.min(...elements.map(({ bounds }) => bounds.left));
	const top = Math.min(...elements.map(({ bounds }) => bounds.top));
	const right = Math.max(...elements.map(({ bounds }) => bounds.left + bounds.width));
	const bottom = Math.max(...elements.map(({ bounds }) => bounds.top + bounds.height));
	return { left, top, width: right - left, height: bottom - top };
}

function canvasAlignmentReferenceBounds(
	elements: readonly CanvasAlignableElement[],
	reference: CanvasAlignmentReference
): CanvasInteractionRect {
	return reference === 'canvas' ? NORMALIZED_CANVAS_BOUNDS : selectionCanvasBounds(elements);
}

function horizontalAlignmentDelta(
	bounds: CanvasInteractionRect,
	referenceBounds: CanvasInteractionRect,
	command: Extract<CanvasAlignmentCommand, 'left' | 'horizontal-center' | 'right'>
): number {
	switch (command) {
		case 'left':
			return referenceBounds.left - bounds.left;
		case 'horizontal-center':
			return referenceBounds.left + referenceBounds.width / 2 - (bounds.left + bounds.width / 2);
		case 'right':
			return referenceBounds.left + referenceBounds.width - (bounds.left + bounds.width);
	}
}

function verticalAlignmentDelta(
	bounds: CanvasInteractionRect,
	referenceBounds: CanvasInteractionRect,
	command: Extract<CanvasAlignmentCommand, 'top' | 'vertical-middle' | 'bottom'>
): number {
	switch (command) {
		case 'top':
			return referenceBounds.top - bounds.top;
		case 'vertical-middle':
			return referenceBounds.top + referenceBounds.height / 2 - (bounds.top + bounds.height / 2);
		case 'bottom':
			return referenceBounds.top + referenceBounds.height - (bounds.top + bounds.height);
	}
}

function stableCanvasTranslations(
	translations: readonly CanvasElementTranslation[]
): CanvasElementTranslation[] {
	return [...translations]
		.filter(({ delta }) => delta.x !== 0 || delta.y !== 0)
		.sort((first, second) => first.selectionKey.localeCompare(second.selectionKey));
}

/** Resolve equal-edge/center alignment entirely in normalized composition space. */
export function resolveCanvasAlignmentTranslations(
	elements: readonly CanvasAlignableElement[],
	command: CanvasAlignmentCommand,
	reference: CanvasAlignmentReference
): CanvasElementTranslation[] {
	const stableElements = stableCanvasAlignableElements(elements, 2);
	if (!stableElements) return [];
	const referenceBounds = canvasAlignmentReferenceBounds(stableElements, reference);
	const horizontal = command === 'left' || command === 'horizontal-center' || command === 'right';

	return stableCanvasTranslations(
		stableElements.map(({ selectionKey, bounds }) => ({
			selectionKey,
			delta: horizontal
				? {
						x: roundCanvasAlignmentValue(
							horizontalAlignmentDelta(
								bounds,
								referenceBounds,
								command as Extract<CanvasAlignmentCommand, 'left' | 'horizontal-center' | 'right'>
							)
						),
						y: 0
					}
				: {
						x: 0,
						y: roundCanvasAlignmentValue(
							verticalAlignmentDelta(
								bounds,
								referenceBounds,
								command as Extract<CanvasAlignmentCommand, 'top' | 'vertical-middle' | 'bottom'>
							)
						)
					}
		}))
	);
}

function horizontalDistributionOrder(
	first: CanvasAlignableElement,
	second: CanvasAlignableElement
): number {
	const leftDifference = first.bounds.left - second.bounds.left;
	if (leftDifference !== 0) return leftDifference;
	return first.selectionKey.localeCompare(second.selectionKey);
}

function verticalDistributionOrder(
	first: CanvasAlignableElement,
	second: CanvasAlignableElement
): number {
	const topDifference = first.bounds.top - second.bounds.top;
	if (topDifference !== 0) return topDifference;
	return first.selectionKey.localeCompare(second.selectionKey);
}

/**
 * Resolve equal-gap distribution. Selection reference pins the outer selected
 * bounds; canvas reference pins the group to the normalized frame edges.
 */
export function resolveCanvasDistributionTranslations(
	elements: readonly CanvasAlignableElement[],
	command: CanvasDistributionCommand,
	reference: CanvasAlignmentReference
): CanvasElementTranslation[] {
	const stableElements = stableCanvasAlignableElements(elements, 3);
	if (!stableElements) return [];
	const referenceBounds = canvasAlignmentReferenceBounds(stableElements, reference);
	const ordered = [...stableElements].sort(
		command === 'horizontal' ? horizontalDistributionOrder : verticalDistributionOrder
	);
	const totalExtent = ordered.reduce(
		(total, { bounds }) => total + (command === 'horizontal' ? bounds.width : bounds.height),
		0
	);
	const referenceExtent = command === 'horizontal' ? referenceBounds.width : referenceBounds.height;
	const equalGap = (referenceExtent - totalExtent) / (ordered.length - 1);
	let cursor = command === 'horizontal' ? referenceBounds.left : referenceBounds.top;
	const translations: CanvasElementTranslation[] = [];

	for (const { selectionKey, bounds } of ordered) {
		const currentStart = command === 'horizontal' ? bounds.left : bounds.top;
		translations.push({
			selectionKey,
			delta:
				command === 'horizontal'
					? { x: roundCanvasAlignmentValue(cursor - currentStart), y: 0 }
					: { x: 0, y: roundCanvasAlignmentValue(cursor - currentStart) }
		});
		cursor += (command === 'horizontal' ? bounds.width : bounds.height) + equalGap;
	}

	return stableCanvasTranslations(translations);
}
