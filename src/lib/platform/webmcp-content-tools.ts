/**
 * The `content` family's WebMCP tools: the words, values, and data an author
 * writes into the piece
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Two shapes of argument appear here, and which one a tool takes is decided by
 * where the shape is declared rather than by how big it is.
 *
 * - **Named arguments** where the composition schema fixes the shape: the
 *   Surface slots, a chat transcript, a checklist, the caption track, a diagram
 *   primitive's body. Every field is declared and every enum is read from the
 *   schema that owns it, so an agent can author one without a second call.
 * - **JSON text** where the shape is decided at call time by a schema this
 *   registration cannot see: an Overlay's content belongs to that Overlay's
 *   Pipeline, and a chart Block's body belongs to the chart type the Block
 *   already is. A frozen guess at either would be wrong for every other variant,
 *   so the value travels as text and the owning schema answers a wrong body with
 *   findings naming the exact field.
 *
 * A Mark span is content and is written through the Surface body here; the
 * Annotation Layer entry that gives that span its own colour and window is
 * `gfx_layer_add_annotation_mark`. A diagram primitive's numbers look like
 * content and are not — `/state/surface/diagram/<id>/from` is geometry, so
 * `gfx_placement_set_diagram_geometry` writes it and this family refuses it.
 */
import {
	CAPTION_STYLES,
	CHAT_MESSAGE_RECEIPTS,
	CHAT_MESSAGE_SIDES,
	CHAT_MESSAGE_TAPBACKS,
	DIAGRAM_ARROW_DIRECTIONS,
	DIAGRAM_EDGE_ROUTES,
	DIAGRAM_INK_ROLES,
	DIAGRAM_LABEL_ROLES,
	DIAGRAM_LABEL_WRAP_MODES,
	DIAGRAM_NODE_FORMS,
	DIAGRAM_STAT_FORMATS,
	SOUND_EVENTS,
	type Captions,
	type CaptionCue,
	type ChecklistItem,
	type Ease,
	type SoundOverride
} from './engine-schema';
import { COMPOSITION_MOTION_EASES } from './composition-motion-timing-operations';
import {
	readWebmcpBooleanArgument,
	readWebmcpClearableStringArgument,
	readWebmcpJsonArgument,
	readWebmcpJsonRecordArgument,
	readWebmcpLiteralArgument,
	readWebmcpNumberArgument,
	readWebmcpObservedRevisionArgument,
	readWebmcpOptionalBooleanArgument,
	readWebmcpOptionalLiteralArgument,
	readWebmcpOptionalNumberArgument,
	readWebmcpOptionalRecordArgument,
	readWebmcpOptionalStringArgument,
	readWebmcpRecordArgument,
	readWebmcpRecordArrayArgument,
	readWebmcpStringArgument,
	runWebmcpToolOperation,
	WebmcpArgumentError
} from './webmcp-tool-arguments';
import {
	describeDiagramContentFieldOwner,
	runClearCompositionCaptionsOperation,
	runSetCompositionCaptionsOperation,
	runSetCompositionChartBlockOperation,
	runSetCompositionChatTranscriptOperation,
	runSetCompositionChecklistEntriesOperation,
	runSetCompositionDiagramPrimitiveOperation,
	runSetCompositionOverlayContentOperation,
	runSetCompositionSurfaceContentOperation,
	SURFACE_CONTENT_SLOTS
} from './composition-content-operations';
import {
	webmcpClearableTextProperty,
	webmcpDerivedEnumProperty,
	webmcpEntityIdProperty,
	webmcpFractionProperty,
	webmcpObservedRevisionProperty
} from './webmcp-derived-tool-schemas';

import type {
	ChatTranscriptEntry,
	DiagramPrimitiveContentPatch,
	SurfaceContentSlot
} from './composition-content-operations';
import type { WebmcpSchemaProperty } from './webmcp-derived-tool-schemas';
import type { WebmcpToolDefinition } from './webmcp-tool-controller';

interface ContentTimedWindow {
	start: number;
	duration: number;
	ease?: Ease;
}

function timedWindowFields(): Readonly<Record<string, WebmcpSchemaProperty>> {
	return {
		start: webmcpFractionProperty('Where the window opens, as a fraction of the clip.'),
		duration: webmcpFractionProperty('How long it runs, as a fraction of the clip.'),
		ease: webmcpDerivedEnumProperty('motion-ease', 'The curve the window runs on.')
	};
}

/** A window a content entry carries: when it runs, and on what curve. */
function timedWindowProperty(description: string): WebmcpSchemaProperty {
	return {
		type: 'object',
		description,
		properties: timedWindowFields(),
		required: ['start', 'duration'],
		additionalProperties: false
	};
}

/**
 * The same window plus the cue it emits. The cue lives inside the entry rather
 * than beside it, so it is written here — `sound` owns the overrides that hang
 * off a Layer's own motion, not the ones inside authored content.
 */
function cuedWindowProperty(description: string): WebmcpSchemaProperty {
	return {
		type: 'object',
		description,
		properties: {
			...timedWindowFields(),
			sound: {
				type: 'object',
				description: 'The cue this window emits, in place of the one it would derive.',
				properties: {
					mute: { type: 'boolean', description: 'Emit nothing at all.' },
					event: webmcpDerivedEnumProperty('sound-event', 'A different motion event.'),
					sample: {
						type: 'string',
						description: 'An explicit bundled audio asset slug.',
						minLength: 1
					}
				},
				additionalProperties: false
			}
		},
		required: ['start', 'duration'],
		additionalProperties: false
	};
}

function readTimedWindowFields(window: Record<string, unknown>): ContentTimedWindow {
	return {
		start: readWebmcpNumberArgument(window, 'start'),
		duration: readWebmcpNumberArgument(window, 'duration'),
		ease: readWebmcpOptionalLiteralArgument(window, 'ease', COMPOSITION_MOTION_EASES)
	};
}

function readTimedWindow(args: unknown, name: string): ContentTimedWindow | undefined {
	const window = readWebmcpOptionalRecordArgument(args, name);
	return window ? readTimedWindowFields(window) : undefined;
}

function readCuedWindow(
	args: unknown,
	name: string
): (ContentTimedWindow & { sound?: SoundOverride }) | undefined {
	const window = readWebmcpOptionalRecordArgument(args, name);
	if (!window) return undefined;
	const sound = readWebmcpOptionalRecordArgument(window, 'sound');
	if (!sound) return readTimedWindowFields(window);
	return {
		...readTimedWindowFields(window),
		sound: {
			mute: readWebmcpOptionalBooleanArgument(sound, 'mute'),
			event: readWebmcpOptionalLiteralArgument(sound, 'event', SOUND_EVENTS),
			sample: readWebmcpOptionalStringArgument(sound, 'sample')
		}
	};
}

/**
 * Every Surface content slot the engine writes as a string, each one clearable.
 * Built from the slot list rather than named here, so a Surface family that
 * declares a new slot reaches an agent without an edit. Which of them the active
 * Surface actually renders is the operation's answer, not this schema's.
 */
function surfaceContentSlotsProperty(): WebmcpSchemaProperty {
	return {
		type: 'object',
		description:
			'The slots to write. Only the slots the active Surface declares are accepted; it names its own when one is not.',
		properties: Object.fromEntries(
			SURFACE_CONTENT_SLOTS.map((slot) => [
				slot,
				webmcpClearableTextProperty(`The ${slot} slot.`)
			])
		),
		additionalProperties: false
	};
}

/**
 * The slots a caller named. A key no Surface in this engine has is refused here
 * against the whole slot list; a key some Surface has but this one does not is
 * the operation's refusal, which names the slots the active Surface renders.
 */
function readSurfaceContentSlots(
	args: unknown
): Partial<Record<SurfaceContentSlot, string | null>> | undefined {
	const slots = readWebmcpOptionalRecordArgument(args, 'slots');
	if (slots === undefined) return undefined;
	const written: Partial<Record<SurfaceContentSlot, string | null>> = {};
	for (const key of Object.keys(slots)) {
		const slot = SURFACE_CONTENT_SLOTS.find((candidate) => candidate === key);
		if (!slot) {
			throw new WebmcpArgumentError(
				'invalid_argument',
				`"${key}" is not a Surface content slot this engine writes.`,
				{ rejected: key, alternatives: SURFACE_CONTENT_SLOTS }
			);
		}
		written[slot] = readWebmcpClearableStringArgument(slots, slot) ?? null;
	}
	return written;
}

function chatMessageProperty(): WebmcpSchemaProperty {
	return {
		type: 'object',
		description: 'One bubble in the transcript.',
		properties: {
			from: webmcpDerivedEnumProperty('chat-message-side', 'Which side of the thread it sits on.'),
			text: {
				type: 'string',
				description: 'The bubble body, including any [style]…[/style] Mark spans.',
				minLength: 1
			},
			tapback: webmcpDerivedEnumProperty('chat-message-tapback', 'An optional reaction.'),
			status: webmcpDerivedEnumProperty(
				'chat-message-receipt',
				'An optional delivery receipt under a sent bubble.'
			),
			enter: cuedWindowProperty(
				'When the bubble pops in. Absent rides the Surface staggered cadence.'
			),
			typing: {
				type: 'object',
				description: 'A typing indicator that resolves into this bubble.',
				properties: {
					duration: {
						type: 'number',
						description: 'How long it plays, as a fraction of the clip.',
						minimum: 0,
						maximum: 1
					}
				},
				required: ['duration'],
				additionalProperties: false
			}
		},
		required: ['from', 'text'],
		additionalProperties: false
	};
}

function readChatTranscript(args: unknown): readonly ChatTranscriptEntry[] {
	return readWebmcpRecordArrayArgument(args, 'messages').map((message) => {
		const typing = readWebmcpOptionalRecordArgument(message, 'typing');
		return {
			from: readWebmcpLiteralArgument(message, 'from', CHAT_MESSAGE_SIDES),
			text: readWebmcpStringArgument(message, 'text'),
			tapback: readWebmcpOptionalLiteralArgument(message, 'tapback', CHAT_MESSAGE_TAPBACKS),
			status: readWebmcpOptionalLiteralArgument(message, 'status', CHAT_MESSAGE_RECEIPTS),
			enter: readCuedWindow(message, 'enter'),
			typing: typing ? { duration: readWebmcpNumberArgument(typing, 'duration') } : undefined
		};
	});
}

function readChecklistEntries(args: unknown): readonly ChecklistItem[] {
	return readWebmcpRecordArrayArgument(args, 'items').map((item) => ({
		text: readWebmcpStringArgument(item, 'text'),
		checked: readWebmcpBooleanArgument(item, 'checked'),
		enter: readTimedWindow(item, 'enter'),
		strike: readCuedWindow(item, 'strike')
	}));
}

function captionsProperty(): WebmcpSchemaProperty {
	return {
		type: 'object',
		description: 'The whole caption track, written as one unit.',
		properties: {
			style: webmcpDerivedEnumProperty('caption-style', 'How a caption line is dressed.'),
			accent: {
				type: 'string',
				description: 'The active-word accent as a #RRGGBB hex. Absent takes the style default.',
				minLength: 7,
				maxLength: 7
			},
			y: {
				type: 'number',
				description:
					'The band centre as a fraction of frame height. Absent is orientation-aware.',
				minimum: 0,
				maximum: 1
			},
			scale: {
				type: 'number',
				description: 'A size multiplier on the style natural scale.',
				minimum: 0.25,
				maximum: 4
			},
			cues: {
				type: 'array',
				description: 'The timed lines, in milliseconds from the clip start.',
				items: {
					type: 'object',
					description: 'One caption line.',
					properties: {
						id: webmcpEntityIdProperty('A stable id, unique within the track.'),
						startMs: { type: 'number', description: 'When the line appears.', minimum: 0 },
						endMs: { type: 'number', description: 'When it leaves; after startMs.', minimum: 0 },
						text: { type: 'string', description: 'The line itself.', minLength: 1 }
					},
					required: ['id', 'startMs', 'endMs', 'text'],
					additionalProperties: false
				}
			}
		},
		required: ['style', 'cues'],
		additionalProperties: false
	};
}

function readCaptions(args: unknown): Captions {
	const captions = readWebmcpRecordArgument(args, 'captions');
	const cues: CaptionCue[] = readWebmcpRecordArrayArgument(captions, 'cues').map((cue) => ({
		id: readWebmcpStringArgument(cue, 'id'),
		startMs: readWebmcpNumberArgument(cue, 'startMs'),
		endMs: readWebmcpNumberArgument(cue, 'endMs'),
		text: readWebmcpStringArgument(cue, 'text')
	}));
	return {
		style: readWebmcpLiteralArgument(captions, 'style', CAPTION_STYLES),
		accent: readWebmcpOptionalStringArgument(captions, 'accent'),
		y: readWebmcpOptionalNumberArgument(captions, 'y'),
		scale: readWebmcpOptionalNumberArgument(captions, 'scale'),
		cues
	};
}

/**
 * A diagram primitive's authored body. Every field of every primitive type is
 * declared, because which of them applies is the Block's type — the operation
 * names the fields that Block accepts when one does not.
 */
function diagramPrimitiveContentFields(): Readonly<Record<string, WebmcpSchemaProperty>> {
	return {
		text: { type: 'string', description: 'The words a node or label carries.' },
		form: webmcpDerivedEnumProperty('diagram-node-form', 'What shape a node takes.'),
		route: webmcpDerivedEnumProperty('diagram-edge-route', 'How an edge travels.'),
		direction: webmcpDerivedEnumProperty(
			'diagram-arrow-direction',
			'Where an edge places its arrowhead.'
		),
		role: webmcpDerivedEnumProperty('diagram-label-role', 'A label voice.'),
		wrap: webmcpDerivedEnumProperty('diagram-label-wrap', 'How a label wraps.'),
		label: { type: 'string', description: 'The caption on a stat callout or timeline segment.' },
		format: webmcpDerivedEnumProperty('diagram-stat-format', 'How a stat callout reads out.'),
		ink: webmcpDerivedEnumProperty(
			'diagram-ink-role',
			'Which Pack ink Role the primitive rides. Never a colour.'
		)
	};
}

function readDiagramPrimitiveContent(args: unknown): DiagramPrimitiveContentPatch {
	const content = readWebmcpRecordArgument(args, 'content');
	const fields = Object.keys(diagramPrimitiveContentFields());
	for (const key of Object.keys(content)) {
		if (fields.includes(key)) continue;
		// A field another family owns is named as such rather than as a typo, so
		// the caller reaches for the tool that can write it.
		throw new WebmcpArgumentError(
			'invalid_argument',
			describeDiagramContentFieldOwner(key) ??
				`"${key}" is not a field a diagram Block authors.`,
			{ rejected: key, alternatives: fields }
		);
	}

	// Only the keys the caller sent are carried, so an absent field stays absent
	// rather than overwriting an authored one with `undefined`.
	const patch: DiagramPrimitiveContentPatch = {};
	if ('text' in content) patch.text = readWebmcpStringArgument(content, 'text');
	if ('form' in content) patch.form = readWebmcpLiteralArgument(content, 'form', DIAGRAM_NODE_FORMS);
	if ('route' in content) {
		patch.route = readWebmcpLiteralArgument(content, 'route', DIAGRAM_EDGE_ROUTES);
	}
	if ('direction' in content) {
		patch.direction = readWebmcpLiteralArgument(content, 'direction', DIAGRAM_ARROW_DIRECTIONS);
	}
	if ('role' in content) patch.role = readWebmcpLiteralArgument(content, 'role', DIAGRAM_LABEL_ROLES);
	if ('wrap' in content) {
		patch.wrap = readWebmcpLiteralArgument(content, 'wrap', DIAGRAM_LABEL_WRAP_MODES);
	}
	if ('label' in content) patch.label = readWebmcpStringArgument(content, 'label');
	if ('format' in content) {
		patch.format = readWebmcpLiteralArgument(content, 'format', DIAGRAM_STAT_FORMATS);
	}
	if ('ink' in content) patch.ink = readWebmcpLiteralArgument(content, 'ink', DIAGRAM_INK_ROLES);
	return patch;
}

export function listWebmcpContentToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'content.set-surface-content',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					body: {
						type: 'string',
						description:
							'The body text, including any [style]…[/style] Mark spans the Annotation Layer authors against.'
					},
					slots: surfaceContentSlotsProperty()
				},
				required: ['expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-surface-content', () =>
					runSetCompositionSurfaceContentOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						body: readWebmcpOptionalStringArgument(args, 'body'),
						slots: readSurfaceContentSlots(args)
					})
				)
		},
		{
			operationId: 'content.set-chat-transcript',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					messages: {
						type: 'array',
						description: 'The whole transcript, in the order it reads.',
						items: chatMessageProperty()
					}
				},
				required: ['expectedRevision', 'messages'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-chat-transcript', () =>
					runSetCompositionChatTranscriptOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						messages: readChatTranscript(args)
					})
				)
		},
		{
			operationId: 'content.set-checklist-entries',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					items: {
						type: 'array',
						description: 'The whole checklist, in the order it reads.',
						items: {
							type: 'object',
							description: 'One task.',
							properties: {
								text: { type: 'string', description: 'The task itself.', minLength: 1 },
								checked: { type: 'boolean', description: 'Whether it is done.' },
								enter: timedWindowProperty('When this entry builds in.'),
								strike: cuedWindowProperty(
									'When a checked entry draws its strike. Absent on a checked entry means struck from frame 0.'
								)
							},
							required: ['text', 'checked'],
							additionalProperties: false
						}
					}
				},
				required: ['expectedRevision', 'items'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-checklist-entries', () =>
					runSetCompositionChecklistEntriesOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						items: readChecklistEntries(args)
					})
				)
		},
		{
			operationId: 'content.set-overlay-content',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					overlayId: webmcpEntityIdProperty('The Overlay to write.'),
					content: {
						type: 'string',
						description:
							'The content as JSON text, in the shape this Overlay type declares. A wrong shape is answered with findings naming the field.',
						minLength: 1
					}
				},
				required: ['expectedRevision', 'overlayId', 'content'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-overlay-content', () =>
					runSetCompositionOverlayContentOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						overlayId: readWebmcpStringArgument(args, 'overlayId'),
						content: readWebmcpJsonArgument(args, 'content')
					})
				)
		},
		{
			operationId: 'content.set-diagram-primitive',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					blockId: webmcpEntityIdProperty('The diagram Block to write.'),
					content: {
						type: 'object',
						description:
							'The authored body: text, form, route, arrow direction, label role, ink Role. Which of them a Block carries is its type.',
						properties: diagramPrimitiveContentFields(),
						additionalProperties: false
					}
				},
				required: ['expectedRevision', 'blockId', 'content'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-diagram-primitive', () =>
					runSetCompositionDiagramPrimitiveOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						blockId: readWebmcpStringArgument(args, 'blockId'),
						content: readDiagramPrimitiveContent(args)
					})
				)
		},
		{
			operationId: 'content.set-chart-block',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					blockId: webmcpEntityIdProperty('The chart Block to write.'),
					content: {
						type: 'string',
						description:
							'The whole authored body as JSON text, in the shape this chart type declares. The Block keeps its id, type, and motion.',
						minLength: 1
					}
				},
				required: ['expectedRevision', 'blockId', 'content'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-chart-block', () =>
					runSetCompositionChartBlockOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						blockId: readWebmcpStringArgument(args, 'blockId'),
						content: readWebmcpJsonRecordArgument(args, 'content')
					})
				)
		},
		{
			operationId: 'content.set-captions',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					captions: captionsProperty()
				},
				required: ['expectedRevision', 'captions'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.set-captions', () =>
					runSetCompositionCaptionsOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						captions: readCaptions(args)
					})
				)
		},
		{
			operationId: 'content.clear-captions',
			inputSchema: {
				type: 'object',
				properties: { expectedRevision: webmcpObservedRevisionProperty() },
				required: ['expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('content.clear-captions', () =>
					runClearCompositionCaptionsOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args)
					})
				)
		}
	];
}
