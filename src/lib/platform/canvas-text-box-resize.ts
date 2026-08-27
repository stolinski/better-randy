import type { VideoOrientation } from '$lib/utils/video-frame';
import {
	cloneDiagramPrimitiveGeometry,
	resolveDiagramPrimitiveGeometry
} from '$lib/utils/diagram-geometry';
import { clampNumber } from '$lib/utils/math';

import type { DiagramLabel, DiagramLabelGeometry, EngineState } from './engine-schema';
import {
	DIAGRAM_LABEL_TEXT_BOX_MAX_WIDTH,
	DIAGRAM_LABEL_TEXT_BOX_MIN_WIDTH
} from './engine-schema';

export type CanvasTextBoxResizeSide = 'west' | 'east';
export type CanvasTextBoxAuthoringState = Pick<EngineState, 'surface' | 'transport'>;

type DiagramLabelGeometrySource = 'base' | 'orientation-override';

export interface DiagramLabelTextBoxSnapshot {
	labelId: string;
	orientation: VideoOrientation;
	source: DiagramLabelGeometrySource;
	geometry: DiagramLabelGeometry;
}

export interface DiagramLabelTextBoxResizeRequest {
	side: CanvasTextBoxResizeSide;
	/** Pointer movement in normalized composition-width units. */
	deltaX: number;
	/** Rendered width at gesture start when the Preset still uses intrinsic width. */
	intrinsicWidth: number;
}

const CANVAS_TEXT_BOX_AUTHORING_PRECISION = 1_000_000;

function roundedCanvasTextBoxValue(value: number): number {
	const rounded =
		Math.round(value * CANVAS_TEXT_BOX_AUTHORING_PRECISION) / CANVAS_TEXT_BOX_AUTHORING_PRECISION;
	return Object.is(rounded, -0) ? 0 : rounded;
}

function findDiagramLabel(
	state: CanvasTextBoxAuthoringState,
	labelId: string
): DiagramLabel | null {
	const primitive = state.surface.diagram?.find(({ id }) => id === labelId);
	return primitive?.type === 'label' ? primitive : null;
}

/** Capture the exact active-orientation text-box geometry for gesture history. */
export function captureDiagramLabelTextBoxSnapshot(
	state: CanvasTextBoxAuthoringState,
	labelId: string
): DiagramLabelTextBoxSnapshot | null {
	const label = findDiagramLabel(state, labelId);
	if (!label) return null;
	const orientation = state.transport.orientation;
	return {
		labelId,
		orientation,
		source: label.orientationOverrides?.[orientation] ? 'orientation-override' : 'base',
		geometry: cloneDiagramPrimitiveGeometry(resolveDiagramPrimitiveGeometry(label, orientation))
	};
}

/** Restore only position, scale, and width; content, type, and typography stay untouched. */
export function restoreDiagramLabelTextBoxSnapshot(
	state: CanvasTextBoxAuthoringState,
	snapshot: DiagramLabelTextBoxSnapshot
): boolean {
	const label = findDiagramLabel(state, snapshot.labelId);
	if (!label) return false;
	const target =
		snapshot.source === 'base'
			? label
			: (label.orientationOverrides?.[snapshot.orientation] ?? null);
	if (!target) return false;
	target.position.x = snapshot.geometry.position.x;
	target.position.y = snapshot.geometry.position.y;
	target.scale = snapshot.geometry.scale;
	target.maxWidth = snapshot.geometry.maxWidth;
	return true;
}

/**
 * Resolve a side-handle drag from its immutable origin. The opposite edge stays
 * fixed while maxWidth changes, which shifts the label's centre anchor by half
 * the width delta. Scale is copied unchanged: width reflows text and never
 * scales its font.
 */
export function resolveDiagramLabelTextBoxResize(
	origin: DiagramLabelTextBoxSnapshot,
	request: DiagramLabelTextBoxResizeRequest
): DiagramLabelTextBoxSnapshot | null {
	if (!Number.isFinite(request.deltaX) || !Number.isFinite(request.intrinsicWidth)) {
		return null;
	}
	const originWidth = clampNumber(
		origin.geometry.maxWidth ?? request.intrinsicWidth,
		DIAGRAM_LABEL_TEXT_BOX_MIN_WIDTH,
		DIAGRAM_LABEL_TEXT_BOX_MAX_WIDTH
	);
	const widthDelta = request.side === 'east' ? request.deltaX : -request.deltaX;
	const width = roundedCanvasTextBoxValue(
		clampNumber(
			originWidth + widthDelta,
			DIAGRAM_LABEL_TEXT_BOX_MIN_WIDTH,
			DIAGRAM_LABEL_TEXT_BOX_MAX_WIDTH
		)
	);
	const fixedEdge =
		request.side === 'east'
			? origin.geometry.position.x - originWidth / 2
			: origin.geometry.position.x + originWidth / 2;
	const centerX = request.side === 'east' ? fixedEdge + width / 2 : fixedEdge - width / 2;

	return {
		...origin,
		geometry: {
			position: {
				x: roundedCanvasTextBoxValue(clampNumber(centerX, 0, 1)),
				y: origin.geometry.position.y
			},
			scale: origin.geometry.scale,
			maxWidth: width
		}
	};
}

export function diagramLabelTextBoxSnapshotsEqual(
	first: DiagramLabelTextBoxSnapshot,
	second: DiagramLabelTextBoxSnapshot
): boolean {
	return (
		first.labelId === second.labelId &&
		first.orientation === second.orientation &&
		first.source === second.source &&
		first.geometry.position.x === second.geometry.position.x &&
		first.geometry.position.y === second.geometry.position.y &&
		first.geometry.scale === second.geometry.scale &&
		first.geometry.maxWidth === second.geometry.maxWidth
	);
}
