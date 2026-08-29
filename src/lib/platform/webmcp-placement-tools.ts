/**
 * The `placement` family's WebMCP tools: where an element sits in the frame, at
 * each orientation
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Every deliverable composition reflows between horizontal and vertical
 * (ADR-0039), so each of these tools takes a `target`: the shared placement both
 * orientations fall back to, or one orientation's own snapshot. That argument is
 * built from the delivery orientations rather than written down, and it is what
 * makes reflow authorable instead of optional.
 *
 * A snapshot is written whole, never merged, which is why clearing one is its
 * own tool rather than a null argument here: an anchor from one orientation
 * beside an offset from the other is exactly the ambiguity that makes a reflow
 * unpredictable.
 *
 * A stat callout's `from` and `to` are a counted range rather than a position,
 * but they live at a pointer this family owns, so `gfx_placement_set_diagram_geometry`
 * writes them and the content tool points here. Pointer ownership decides, not
 * the field's name.
 */
import { COMPOSITION_ORIENTATIONS } from './composition-transport-operations';
import { OVERLAY_PLACEMENT_ANCHORS, type DiagramEndpoint, type DiagramPoint } from './engine-schema';
import {
	readWebmcpLiteralArgument,
	readWebmcpNumberArgument,
	readWebmcpObservedRevisionArgument,
	readWebmcpOptionalNumberArgument,
	readWebmcpOptionalRecordArgument,
	readWebmcpRecordArgument,
	readWebmcpStringArgument,
	runWebmcpToolOperation,
	WebmcpArgumentError
} from './webmcp-tool-arguments';
import {
	COMPOSITION_PLACEMENT_TARGETS,
	runClearCompositionOrientationOverrideOperation,
	runSetCompositionDiagramGeometryOperation,
	runSetCompositionOverlayDepthOperation,
	runSetCompositionOverlayPlacementOperation
} from './composition-placement-operations';
import {
	webmcpDerivedEnumProperty,
	webmcpEntityIdProperty,
	webmcpFractionProperty,
	webmcpObservedRevisionProperty
} from './webmcp-derived-tool-schemas';

import type { DiagramGeometryPatch } from './composition-placement-operations';
import type { OverlayPlacement } from './engine-schema';
import type { WebmcpSchemaProperty } from './webmcp-derived-tool-schemas';
import type { WebmcpToolDefinition } from './webmcp-tool-controller';

function placementTargetProperty(): WebmcpSchemaProperty {
	return {
		type: 'string',
		description:
			'Which placement to write: the shared one both orientations fall back to, or one orientation snapshot.',
		enum: COMPOSITION_PLACEMENT_TARGETS
	};
}

/** An object every field of which a caller must send, listed from the fields themselves. */
function completeObjectProperty(
	description: string,
	properties: Readonly<Record<string, WebmcpSchemaProperty>>
): WebmcpSchemaProperty {
	return {
		type: 'object',
		description,
		properties,
		required: Object.keys(properties),
		additionalProperties: false
	};
}

function compositionPointProperty(description: string): WebmcpSchemaProperty {
	return completeObjectProperty(description, {
		x: webmcpFractionProperty('Composition-space x, as a fraction of the frame.'),
		y: webmcpFractionProperty('Composition-space y, as a fraction of the frame.')
	});
}

function readCompositionPoint(point: Record<string, unknown>): DiagramPoint {
	return {
		x: readWebmcpNumberArgument(point, 'x'),
		y: readWebmcpNumberArgument(point, 'y')
	};
}

function overlayPlacementProperty(): WebmcpSchemaProperty {
	return {
		type: 'object',
		description: 'The complete placement. What it leaves out, this placement does not carry.',
		properties: {
			anchor: webmcpDerivedEnumProperty(
				'overlay-anchor',
				'Where in the frame the Overlay pins. Use normalized-rect with a rect for offscreen or exact placement.'
			),
			offset: compositionPointProperty(
				'Inset from the anchor, as fractions of the frame. 0.05 is a 5% inset.'
			),
			rect: completeObjectProperty('An explicit normalized rect, for the normalized-rect anchor.', {
				x: { type: 'number', description: 'Left edge, as a fraction of the frame.' },
				y: { type: 'number', description: 'Top edge, as a fraction of the frame.' },
				width: { type: 'number', description: 'Width, as a fraction of the frame.' },
				height: { type: 'number', description: 'Height, as a fraction of the frame.' }
			}),
			scale: {
				type: 'number',
				description: 'A uniform multiplier on the natural size, about the anchor point.',
				minimum: 0.1,
				maximum: 8
			},
			rotation: {
				type: 'number',
				description: 'A static rotation in degrees about the anchor point.',
				minimum: -360,
				maximum: 360
			}
		},
		required: ['anchor'],
		additionalProperties: false
	};
}

function readOverlayPlacement(args: unknown): OverlayPlacement {
	const placement = readWebmcpRecordArgument(args, 'placement');
	const offset = readWebmcpOptionalRecordArgument(placement, 'offset');
	const rect = readWebmcpOptionalRecordArgument(placement, 'rect');
	return {
		anchor: readWebmcpLiteralArgument(placement, 'anchor', OVERLAY_PLACEMENT_ANCHORS),
		offset: offset ? readCompositionPoint(offset) : undefined,
		rect: rect
			? {
					x: readWebmcpNumberArgument(rect, 'x'),
					y: readWebmcpNumberArgument(rect, 'y'),
					width: readWebmcpNumberArgument(rect, 'width'),
					height: readWebmcpNumberArgument(rect, 'height')
				}
			: undefined,
		scale: readWebmcpOptionalNumberArgument(placement, 'scale'),
		rotation: readWebmcpOptionalNumberArgument(placement, 'rotation')
	};
}

/**
 * An edge or timeline endpoint: a node this diagram already holds, or an
 * explicit composition-space point for an edge that leaves the graph.
 */
function diagramEndpointProperty(description: string): WebmcpSchemaProperty {
	return {
		description,
		oneOf: [
			{
				type: 'object',
				description: 'A node in this diagram, by id.',
				properties: { node: webmcpEntityIdProperty('The node this end attaches to.') },
				required: ['node'],
				additionalProperties: false
			},
			compositionPointProperty('An explicit composition-space point.'),
			{
				type: 'number',
				description: 'One end of a stat callout counted range, which sits at the same field.'
			}
		]
	};
}

function readDiagramEndpoint(
	geometry: Record<string, unknown>,
	name: string
): DiagramEndpoint | number {
	const value = geometry[name];
	if (typeof value === 'number') return value;
	const endpoint = readWebmcpRecordArgument(geometry, name);
	if ('node' in endpoint) return { node: readWebmcpStringArgument(endpoint, 'node') };
	return readCompositionPoint(endpoint);
}

/**
 * The geometry a diagram Block can carry, declared once so the schema an agent
 * reads and the refusal an unknown field earns name the same set. Which of them
 * a given Block actually carries is its type, and the operation answers that.
 */
function diagramGeometryProperties(): Readonly<Record<string, WebmcpSchemaProperty>> {
	return {
		position: compositionPointProperty('Where a placed primitive sits.'),
		from: diagramEndpointProperty('Where an edge or segment starts, or a counted range start.'),
		to: diagramEndpointProperty('Where it ends, or the counted range end.'),
		control: compositionPointProperty('The single control point an elbow or arc bends through.'),
		scale: {
			type: 'number',
			description: 'A uniform multiplier on the primitive natural size.',
			minimum: 0.25,
			maximum: 4
		},
		maxWidth: {
			type: 'number',
			description: 'A label text box width, as a fraction of the composition width.',
			minimum: 0.03,
			maximum: 1
		}
	};
}

/** The geometry fields a caller named. Which of them a Block carries is the operation's answer. */
function readDiagramGeometry(args: unknown): DiagramGeometryPatch {
	const geometry = readWebmcpRecordArgument(args, 'geometry');
	const fields = Object.keys(diagramGeometryProperties());
	for (const key of Object.keys(geometry)) {
		if (fields.includes(key)) continue;
		throw new WebmcpArgumentError(
			'invalid_argument',
			`"${key}" is not a geometry field this engine authors.`,
			{ rejected: key, alternatives: fields }
		);
	}

	const patch: DiagramGeometryPatch = {};
	if ('position' in geometry) {
		patch.position = readCompositionPoint(readWebmcpRecordArgument(geometry, 'position'));
	}
	if ('from' in geometry) patch.from = readDiagramEndpoint(geometry, 'from');
	if ('to' in geometry) patch.to = readDiagramEndpoint(geometry, 'to');
	if ('control' in geometry) {
		patch.control = readCompositionPoint(readWebmcpRecordArgument(geometry, 'control'));
	}
	if ('scale' in geometry) patch.scale = readWebmcpNumberArgument(geometry, 'scale');
	if ('maxWidth' in geometry) patch.maxWidth = readWebmcpNumberArgument(geometry, 'maxWidth');
	return patch;
}

export function listWebmcpPlacementToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'placement.set-overlay-placement',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					overlayId: webmcpEntityIdProperty('The Overlay to place.'),
					target: placementTargetProperty(),
					placement: overlayPlacementProperty()
				},
				required: ['expectedRevision', 'overlayId', 'target', 'placement'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('placement.set-overlay-placement', () =>
					runSetCompositionOverlayPlacementOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						overlayId: readWebmcpStringArgument(args, 'overlayId'),
						target: readWebmcpLiteralArgument(args, 'target', COMPOSITION_PLACEMENT_TARGETS),
						placement: readOverlayPlacement(args)
					})
				)
		},
		{
			operationId: 'placement.clear-orientation-override',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					overlayId: webmcpEntityIdProperty('The Overlay whose snapshot to drop.'),
					orientation: webmcpDerivedEnumProperty(
						'delivery-orientation',
						'The orientation that falls back to the shared placement again.'
					)
				},
				required: ['expectedRevision', 'overlayId', 'orientation'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('placement.clear-orientation-override', () =>
					runClearCompositionOrientationOverrideOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						overlayId: readWebmcpStringArgument(args, 'overlayId'),
						orientation: readWebmcpLiteralArgument(args, 'orientation', COMPOSITION_ORIENTATIONS)
					})
				)
		},
		{
			operationId: 'placement.set-overlay-depth',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					overlayId: webmcpEntityIdProperty('The Overlay to move in depth.'),
					z: webmcpFractionProperty(
						'0 sits on the focal plane, 1 is fully defocused. Omit it to return the Layer default.'
					)
				},
				required: ['expectedRevision', 'overlayId'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('placement.set-overlay-depth', () =>
					runSetCompositionOverlayDepthOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						overlayId: readWebmcpStringArgument(args, 'overlayId'),
						z: readWebmcpOptionalNumberArgument(args, 'z') ?? null
					})
				)
		},
		{
			operationId: 'placement.set-diagram-geometry',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					blockId: webmcpEntityIdProperty('The diagram Block to place.'),
					target: placementTargetProperty(),
					geometry: {
						type: 'object',
						description:
							'The geometry to write. Which fields a Block carries is its type; the operation names them when one does not fit.',
						properties: diagramGeometryProperties(),
						additionalProperties: false
					}
				},
				required: ['expectedRevision', 'blockId', 'target', 'geometry'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('placement.set-diagram-geometry', () =>
					runSetCompositionDiagramGeometryOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						blockId: readWebmcpStringArgument(args, 'blockId'),
						target: readWebmcpLiteralArgument(args, 'target', COMPOSITION_PLACEMENT_TARGETS),
						geometry: readDiagramGeometry(args)
					})
				)
		}
	];
}
