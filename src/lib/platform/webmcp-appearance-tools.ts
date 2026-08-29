/**
 * The `appearance` family's WebMCP tools: how the piece looks under its Pack
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Binding a Pack is one argument and re-dresses everything. The rest of the
 * family is departures from what that Pack resolved, and each one is clearable
 * for the same reason: `null` gives a decision back to the Pack, where leaving a
 * value in place would freeze whatever the Pack happened to resolve at the time
 * and quietly break the next Pack the composition is shown under (ADR-0039).
 *
 * An Effect's parameters travel as JSON text. Their shape belongs to the
 * Effect's own Pipeline and is only knowable once the caller has named which
 * Effect it means, so a schema frozen at registration would be a guess that is
 * wrong for every other Effect; the Pipeline answers a wrong body with findings
 * naming the exact field instead.
 */
import { ANNOTATION_MARK_STYLES } from '../annotations/annotation-mark-styles';
import {
	readWebmcpClearableStringArgument,
	readWebmcpJsonArgument,
	readWebmcpNumberArgument,
	readWebmcpObservedRevisionArgument,
	readWebmcpOptionalNumberArgument,
	readWebmcpOptionalRecordArgument,
	readWebmcpOptionalStringArgument,
	readWebmcpStringArgument,
	runWebmcpToolOperation,
	WebmcpArgumentError
} from './webmcp-tool-arguments';
import {
	runSetCompositionBackdropVisibilityOperation,
	runSetCompositionEffectParamsOperation,
	runSetCompositionMarkDefaultsOperation,
	runSetCompositionPackOperation,
	runSetCompositionStageOperation,
	runSetCompositionTypographyOperation
} from './composition-appearance-operations';
import {
	webmcpClearableTextProperty,
	webmcpDerivedEnumProperty,
	webmcpEntityIdProperty,
	webmcpFractionProperty,
	webmcpObservedRevisionProperty
} from './webmcp-derived-tool-schemas';

import type { CompositionMarkAppearancePatch } from './composition-appearance-operations';
import type { AnnotationMarkStyle } from '../annotations/annotation-mark-styles';
import type { WebmcpSchemaProperty } from './webmcp-derived-tool-schemas';
import type { WebmcpToolDefinition } from './webmcp-tool-controller';

/** One mark style's dressing, or `null` to hand the style back to the Pack. */
function markAppearanceProperty(style: string): WebmcpSchemaProperty {
	return {
		description: `How a ${style} Mark is dressed by default.`,
		oneOf: [
			{
				type: 'object',
				description: 'The colour and strength to draw it with.',
				properties: {
					color: { type: 'string', description: 'A #RRGGBB hex.', minLength: 7, maxLength: 7 },
					intensity: webmcpFractionProperty('How strongly the mark lands.')
				},
				additionalProperties: false
			},
			{ type: 'null', description: 'Drop this style back to the Pack default.' }
		]
	};
}

function readMarkDefaults(
	args: unknown
): Partial<Record<AnnotationMarkStyle, CompositionMarkAppearancePatch | null>> {
	const defaults = readWebmcpOptionalRecordArgument(args, 'defaults') ?? {};
	const written: Partial<Record<AnnotationMarkStyle, CompositionMarkAppearancePatch | null>> = {};
	for (const key of Object.keys(defaults)) {
		const style = ANNOTATION_MARK_STYLES.find((candidate) => candidate === key);
		if (!style) {
			throw new WebmcpArgumentError(
				'invalid_argument',
				`"${key}" is not an Annotation Mark style this engine registers.`,
				{ rejected: key, alternatives: ANNOTATION_MARK_STYLES }
			);
		}
		if (defaults[style] === null) {
			written[style] = null;
			continue;
		}
		const patch = readWebmcpOptionalRecordArgument(defaults, style) ?? {};
		written[style] = {
			color: readWebmcpOptionalStringArgument(patch, 'color'),
			intensity: readWebmcpOptionalNumberArgument(patch, 'intensity')
		};
	}
	return written;
}

/**
 * The whole dimensional stage. Written whole rather than merged, so every field
 * a caller leaves out takes the stage schema's own default and a read-back says
 * what the piece composites.
 */
function stageProperty(): WebmcpSchemaProperty {
	return {
		type: 'object',
		description: 'The whole stage. Omit it entirely to remove the stage.',
		properties: {
			type: webmcpDerivedEnumProperty('stage-type', 'Which registered stage composites the piece.'),
			camera: {
				type: 'object',
				description: 'How the camera travels over the clip.',
				properties: {
					move: webmcpDerivedEnumProperty('stage-camera-move', 'The move it makes.'),
					amount: webmcpFractionProperty('How far it travels.'),
					ease: webmcpDerivedEnumProperty('motion-ease', 'The curve it travels on.')
				},
				additionalProperties: false
			},
			focus: {
				type: 'object',
				description: 'The focal plane and the lens that renders it.',
				properties: {
					focusZ: webmcpFractionProperty('The in-focus depth, 0 near through 1 far.'),
					aperture: webmcpFractionProperty('How strongly out-of-focus depth melts.'),
					band: webmcpFractionProperty('Depth either side of the plane that stays sharp.'),
					pull: {
						type: 'object',
						description: 'A rack focus: the focal plane travels over its own window.',
						properties: {
							from: webmcpFractionProperty('The depth it starts on.'),
							to: webmcpFractionProperty('The depth it lands on.'),
							start: webmcpFractionProperty('Where the pull opens, as a fraction of the clip.'),
							duration: webmcpFractionProperty('How long it takes.')
						},
						required: ['from', 'to', 'start', 'duration'],
						additionalProperties: false
					}
				},
				additionalProperties: false
			},
			backdrop: {
				type: 'object',
				description: 'What the far plane carries.',
				properties: {
					image: {
						type: 'object',
						description: 'A bundled image on the backdrop plane.',
						properties: {
							asset: webmcpDerivedEnumProperty(
								'stage-backdrop-asset',
								'Which bundled substrate image.'
							)
						},
						required: ['asset'],
						additionalProperties: false
					},
					contrast: webmcpFractionProperty('Centre darkening for near-plane legibility.')
				},
				additionalProperties: false
			}
		},
		required: ['type'],
		additionalProperties: false
	};
}

export function listWebmcpAppearanceToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'appearance.set-pack',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					packSlug: webmcpDerivedEnumProperty(
						'pack-slug',
						'The Pack to dress this composition in. No composition content changes.'
					)
				},
				required: ['expectedRevision', 'packSlug'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('appearance.set-pack', () =>
					runSetCompositionPackOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						packSlug: readWebmcpStringArgument(args, 'packSlug')
					})
				)
		},
		{
			operationId: 'appearance.set-typography',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					fontFamily: webmcpDerivedEnumProperty(
						'font-family',
						'The type voice. A Pack that claims the type treatment still overrules it.'
					),
					paperColor: webmcpClearableTextProperty(
						'A #RRGGBB paper colour that wins over the Pack; null returns the Pack field.'
					),
					inkColor: webmcpClearableTextProperty(
						'A #RRGGBB ink colour that wins over the Pack; null returns the Pack ink.'
					)
				},
				required: ['expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('appearance.set-typography', () =>
					runSetCompositionTypographyOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						fontFamily: readWebmcpOptionalStringArgument(args, 'fontFamily'),
						paperColor: readWebmcpClearableStringArgument(args, 'paperColor'),
						inkColor: readWebmcpClearableStringArgument(args, 'inkColor')
					})
				)
		},
		{
			operationId: 'appearance.set-mark-defaults',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					defaults: {
						type: 'object',
						description: 'The mark styles to dress, one entry per style.',
						properties: Object.fromEntries(
							ANNOTATION_MARK_STYLES.map((style) => [style, markAppearanceProperty(style)])
						),
						additionalProperties: false
					}
				},
				required: ['expectedRevision', 'defaults'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('appearance.set-mark-defaults', () =>
					runSetCompositionMarkDefaultsOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						defaults: readMarkDefaults(args)
					})
				)
		},
		{
			operationId: 'appearance.set-effect-params',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					effectId: webmcpEntityIdProperty('The Effect in the chain to tune.'),
					params: {
						type: 'string',
						description:
							'The parameters as JSON text, in the shape this Effect type declares. A wrong shape is answered with findings naming the field.',
						minLength: 1
					}
				},
				required: ['expectedRevision', 'effectId', 'params'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('appearance.set-effect-params', () =>
					runSetCompositionEffectParamsOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						effectId: readWebmcpStringArgument(args, 'effectId'),
						params: readWebmcpJsonArgument(args, 'params')
					})
				)
		},
		{
			operationId: 'appearance.set-stage',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					stage: stageProperty()
				},
				required: ['expectedRevision'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('appearance.set-stage', () =>
					runSetCompositionStageOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						stage: readWebmcpOptionalRecordArgument(args, 'stage') ?? null
					})
				)
		},
		{
			operationId: 'appearance.set-backdrop-visibility',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					visibility: webmcpFractionProperty(
						'0 hides the Surface backdrop entirely; 1 shows all of it.'
					)
				},
				required: ['expectedRevision', 'visibility'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('appearance.set-backdrop-visibility', () =>
					runSetCompositionBackdropVisibilityOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						visibility: readWebmcpNumberArgument(args, 'visibility')
					})
				)
		}
	];
}
