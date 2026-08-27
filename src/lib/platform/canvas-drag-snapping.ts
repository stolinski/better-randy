import { getLayoutSafeArea } from '$lib/utils/safe-area';
import type { VideoOrientation } from '$lib/utils/video-frame';

import type { CanvasAlignableElement } from './canvas-alignment';
import type { CanvasElementSelectionKey } from './canvas-element-selection';
import type { CanvasInteractionPoint, CanvasInteractionRect } from './canvas-interaction-geometry';

export type CanvasSnapGuideAxis = 'x' | 'y';
export type CanvasSnapGuideKind = 'canvas-edge' | 'canvas-center' | 'safe-area' | 'element-bound';

export interface CanvasSnapGuide {
	/** `x` is a vertical guide; `y` is a horizontal guide. */
	axis: CanvasSnapGuideAxis;
	kind: CanvasSnapGuideKind;
	/** Normalized composition coordinate on the guide axis. */
	position: number;
	/** Normalized guide extent on the perpendicular axis. */
	start: number;
	end: number;
	targetSelectionKey?: CanvasElementSelectionKey;
}

export interface CanvasDragSnapInput {
	movingElement: CanvasAlignableElement;
	/** Unsnapped translation from the gesture origin in normalized composition space. */
	proposedDelta: CanvasInteractionPoint;
	compatibleElements: readonly CanvasAlignableElement[];
	orientation: VideoOrientation;
	/** Displayed CSS pixels per normalized composition unit at the current zoom. */
	screenScale: CanvasInteractionPoint;
	tolerancePx?: number;
}

export interface CanvasDragSnapResult {
	delta: CanvasInteractionPoint;
	guides: CanvasSnapGuide[];
}

interface CanvasSnapLineTarget {
	axis: CanvasSnapGuideAxis;
	kind: CanvasSnapGuideKind;
	position: number;
	start: number;
	end: number;
	stableKey: string;
	kindPriority: number;
	targetSelectionKey?: CanvasElementSelectionKey;
}

interface CanvasSnapCandidate {
	axis: CanvasSnapGuideAxis;
	correction: number;
	distancePx: number;
	sourcePriority: number;
	target: CanvasSnapLineTarget;
}

const DEFAULT_CANVAS_SNAP_TOLERANCE_PX = 6;
const CANVAS_SNAP_AXIS_ACTIVATION_PX = 1;
const CANVAS_SNAP_PRECISION = 1_000_000;

const CANVAS_SNAP_KIND_PRIORITY: Record<CanvasSnapGuideKind, number> = {
	'canvas-center': 0,
	'safe-area': 1,
	'canvas-edge': 2,
	'element-bound': 3
};

function roundCanvasSnapValue(value: number): number {
	const rounded = Math.round(value * CANVAS_SNAP_PRECISION) / CANVAS_SNAP_PRECISION;
	return Object.is(rounded, -0) ? 0 : rounded;
}

function isFiniteCanvasSnapPoint(point: CanvasInteractionPoint): boolean {
	return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isFiniteCanvasSnapBounds(bounds: CanvasInteractionRect): boolean {
	return (
		Number.isFinite(bounds.left) &&
		Number.isFinite(bounds.top) &&
		Number.isFinite(bounds.width) &&
		Number.isFinite(bounds.height) &&
		bounds.width >= 0 &&
		bounds.height >= 0
	);
}

function globalCanvasSnapTargets(orientation: VideoOrientation): CanvasSnapLineTarget[] {
	const safeArea = getLayoutSafeArea(orientation);
	const targets: CanvasSnapLineTarget[] = [];
	const add = (
		axis: CanvasSnapGuideAxis,
		kind: CanvasSnapGuideKind,
		position: number,
		stableKey: string
	): void => {
		targets.push({
			axis,
			kind,
			position,
			start: 0,
			end: 1,
			stableKey,
			kindPriority: CANVAS_SNAP_KIND_PRIORITY[kind]
		});
	};

	add('x', 'canvas-center', 0.5, 'x:center');
	add('x', 'safe-area', safeArea.left, 'x:safe-start');
	add('x', 'safe-area', 1 - safeArea.right, 'x:safe-end');
	add('x', 'canvas-edge', 0, 'x:edge-start');
	add('x', 'canvas-edge', 1, 'x:edge-end');
	add('y', 'canvas-center', 0.5, 'y:center');
	add('y', 'safe-area', safeArea.top, 'y:safe-start');
	add('y', 'safe-area', 1 - safeArea.bottom, 'y:safe-end');
	add('y', 'canvas-edge', 0, 'y:edge-start');
	add('y', 'canvas-edge', 1, 'y:edge-end');
	return targets;
}

function elementCanvasSnapTargets(
	movingSelectionKey: CanvasElementSelectionKey,
	elements: readonly CanvasAlignableElement[]
): CanvasSnapLineTarget[] {
	const targets: CanvasSnapLineTarget[] = [];
	const stableElements = [...elements]
		.filter(
			(element) =>
				element.selectionKey !== movingSelectionKey && isFiniteCanvasSnapBounds(element.bounds)
		)
		.sort((first, second) => first.selectionKey.localeCompare(second.selectionKey));

	for (const { selectionKey, bounds } of stableElements) {
		const right = bounds.left + bounds.width;
		const bottom = bounds.top + bounds.height;
		const add = (
			axis: CanvasSnapGuideAxis,
			position: number,
			start: number,
			end: number,
			anchor: string
		): void => {
			targets.push({
				axis,
				kind: 'element-bound',
				position,
				start,
				end,
				stableKey: `${axis}:${selectionKey}:${anchor}`,
				kindPriority: CANVAS_SNAP_KIND_PRIORITY['element-bound'],
				targetSelectionKey: selectionKey
			});
		};

		add('x', bounds.left + bounds.width / 2, bounds.top, bottom, 'center');
		add('x', bounds.left, bounds.top, bottom, 'start');
		add('x', right, bounds.top, bottom, 'end');
		add('y', bounds.top + bounds.height / 2, bounds.left, right, 'center');
		add('y', bounds.top, bounds.left, right, 'start');
		add('y', bottom, bounds.left, right, 'end');
	}
	return targets;
}

function shiftedCanvasBounds(
	bounds: CanvasInteractionRect,
	delta: CanvasInteractionPoint
): CanvasInteractionRect {
	return {
		left: bounds.left + delta.x,
		top: bounds.top + delta.y,
		width: bounds.width,
		height: bounds.height
	};
}

function canvasSnapSourcePositions(
	bounds: CanvasInteractionRect,
	axis: CanvasSnapGuideAxis
): readonly number[] {
	return axis === 'x'
		? [bounds.left + bounds.width / 2, bounds.left, bounds.left + bounds.width]
		: [bounds.top + bounds.height / 2, bounds.top, bounds.top + bounds.height];
}

function compareCanvasSnapCandidates(
	first: CanvasSnapCandidate,
	second: CanvasSnapCandidate
): number {
	const distanceDifference = first.distancePx - second.distancePx;
	if (distanceDifference !== 0) return distanceDifference;
	const kindDifference = first.target.kindPriority - second.target.kindPriority;
	if (kindDifference !== 0) return kindDifference;
	const sourceDifference = first.sourcePriority - second.sourcePriority;
	if (sourceDifference !== 0) return sourceDifference;
	return first.target.stableKey.localeCompare(second.target.stableKey);
}

function nearestCanvasSnapCandidate(
	axis: CanvasSnapGuideAxis,
	bounds: CanvasInteractionRect,
	targets: readonly CanvasSnapLineTarget[],
	screenScale: CanvasInteractionPoint,
	tolerancePx: number
): CanvasSnapCandidate | null {
	const scale = axis === 'x' ? screenScale.x : screenScale.y;
	const candidates: CanvasSnapCandidate[] = [];
	for (const target of targets) {
		if (target.axis !== axis) continue;
		for (const [sourcePriority, sourcePosition] of canvasSnapSourcePositions(
			bounds,
			axis
		).entries()) {
			const correction = target.position - sourcePosition;
			const distancePx = Math.abs(correction * scale);
			if (distancePx <= tolerancePx) {
				candidates.push({ axis, correction, distancePx, sourcePriority, target });
			}
		}
	}
	return candidates.sort(compareCanvasSnapCandidates)[0] ?? null;
}

function clampedCanvasGuideExtent(start: number, end: number): { start: number; end: number } {
	return {
		start: roundCanvasSnapValue(Math.max(0, Math.min(1, start))),
		end: roundCanvasSnapValue(Math.max(0, Math.min(1, end)))
	};
}

function canvasSnapGuide(
	candidate: CanvasSnapCandidate,
	finalBounds: CanvasInteractionRect
): CanvasSnapGuide {
	const target = candidate.target;
	if (target.kind !== 'element-bound') {
		return {
			axis: candidate.axis,
			kind: target.kind,
			position: roundCanvasSnapValue(target.position),
			start: 0,
			end: 1
		};
	}
	const movingStart = candidate.axis === 'x' ? finalBounds.top : finalBounds.left;
	const movingEnd =
		candidate.axis === 'x'
			? finalBounds.top + finalBounds.height
			: finalBounds.left + finalBounds.width;
	const extent = clampedCanvasGuideExtent(
		Math.min(target.start, movingStart),
		Math.max(target.end, movingEnd)
	);
	return {
		axis: candidate.axis,
		kind: target.kind,
		position: roundCanvasSnapValue(target.position),
		...extent,
		targetSelectionKey: target.targetSelectionKey
	};
}

/** Primary-platform modifier temporarily bypasses snapping during an active drag. */
export function isCanvasSnapBypassGesture(
	gesture: Pick<MouseEvent, 'metaKey' | 'ctrlKey'>
): boolean {
	return gesture.metaKey || gesture.ctrlKey;
}

/**
 * Resolve one drag from its immutable origin. Tolerance is measured in current
 * display pixels while the returned translation and guides stay in normalized
 * composition coordinates, so zoom changes cannot accumulate authored error.
 */
export function resolveCanvasDragSnapping(input: CanvasDragSnapInput): CanvasDragSnapResult {
	const proposedDelta = {
		x: roundCanvasSnapValue(input.proposedDelta.x),
		y: roundCanvasSnapValue(input.proposedDelta.y)
	};
	const tolerancePx = input.tolerancePx ?? DEFAULT_CANVAS_SNAP_TOLERANCE_PX;
	if (
		!isFiniteCanvasSnapBounds(input.movingElement.bounds) ||
		!isFiniteCanvasSnapPoint(input.proposedDelta) ||
		!isFiniteCanvasSnapPoint(input.screenScale) ||
		input.screenScale.x <= 0 ||
		input.screenScale.y <= 0 ||
		!Number.isFinite(tolerancePx) ||
		tolerancePx < 0
	) {
		return { delta: proposedDelta, guides: [] };
	}

	const proposedBounds = shiftedCanvasBounds(input.movingElement.bounds, proposedDelta);
	const targets = [
		...globalCanvasSnapTargets(input.orientation),
		...elementCanvasSnapTargets(input.movingElement.selectionKey, input.compatibleElements)
	];
	const xCandidate =
		Math.abs(proposedDelta.x * input.screenScale.x) >= CANVAS_SNAP_AXIS_ACTIVATION_PX
			? nearestCanvasSnapCandidate('x', proposedBounds, targets, input.screenScale, tolerancePx)
			: null;
	const yCandidate =
		Math.abs(proposedDelta.y * input.screenScale.y) >= CANVAS_SNAP_AXIS_ACTIVATION_PX
			? nearestCanvasSnapCandidate('y', proposedBounds, targets, input.screenScale, tolerancePx)
			: null;
	const delta = {
		x: roundCanvasSnapValue(proposedDelta.x + (xCandidate?.correction ?? 0)),
		y: roundCanvasSnapValue(proposedDelta.y + (yCandidate?.correction ?? 0))
	};
	const finalBounds = shiftedCanvasBounds(input.movingElement.bounds, delta);
	const guides = [xCandidate, yCandidate]
		.filter((candidate): candidate is CanvasSnapCandidate => candidate !== null)
		.map((candidate) => canvasSnapGuide(candidate, finalBounds));
	return { delta, guides };
}
