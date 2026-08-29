/**
 * Where a WebMCP tool's argument vocabulary comes from
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §5).
 *
 * Every enum an agent picks from — Surface, Block, Annotation, Overlay, Effect
 * and transition types, Pack slugs, Starter slugs, sound events, text effects,
 * orientations, rates, formats — is read here from the live registries and the
 * Zod composition schema. A tool that restates one of those lists has copied it,
 * and a copy goes stale silently: the registry gains a variant, the tool keeps
 * offering the old set, and the agent's refusal blames its own argument.
 *
 * Two mechanical guards make that detectable rather than arguable.
 * `readWebmcpSchemaDigest` folds the derived vocabulary and the operation
 * contract into one value the parity gate records, so a registry change that
 * leaves the digest still is a copy somewhere; `findWebmcpHandwrittenEnums`
 * reads a source file and names the enum it duplicated.
 */
import { hashObject } from '../utils/object';
import { NTSC_FRACTIONAL_FPS } from '../utils/composition-timing';
import { TEXT_EFFECT_IDS } from '../text-animations/catalog';
import {
	CAPTION_STYLES,
	DIAGRAM_PRIMITIVE_TYPES,
	ENGINE_FONT_FAMILIES,
	OVERLAY_KEYFRAME_CHANNELS,
	PresetSchema,
	SOUND_EVENTS,
	SURFACE_KEYFRAME_CHANNELS
} from './engine-schema';
import { listPresets } from './preset-catalog';
import { PACK_REGISTRY_SLUGS } from './packs/registry';
import {
	PIPELINE_DEFINITION_REGISTRY,
	REGISTERED_BLOCK_TYPES,
	REGISTERED_EFFECT_TYPES,
	REGISTERED_OVERLAY_TYPES,
	REGISTERED_SURFACE_TYPES
} from './pipelines/definition-registry';
import { transitionEffectTypes } from './pipelines/transition-definition-registry';
import {
	WEBMCP_ALWAYS_REGISTERED_CEILING,
	WEBMCP_OPERATION_ERROR_CODES,
	WEBMCP_OPERATION_INVENTORY,
	WEBMCP_RESULT_CHARACTER_BUDGET,
	WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH,
	WEBMCP_TOOL_NAME_MAX_LENGTH,
	WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET
} from './webmcp-operation-inventory';

/**
 * The vocabularies a tool argument can be drawn from. Each name resolves to a
 * live registry or schema read in `readWebmcpDerivedEnums` — adding a name means
 * naming its source, never its members.
 */
export type WebmcpDerivedEnumName =
	| 'surface-type'
	| 'block-type'
	| 'annotation-style'
	| 'overlay-type'
	| 'effect-type'
	| 'transition-effect'
	| 'text-effect'
	| 'diagram-primitive-type'
	| 'pack-slug'
	| 'starter-slug'
	| 'sound-event'
	| 'caption-style'
	| 'font-family'
	| 'delivery-orientation'
	| 'export-format'
	| 'composition-kind'
	| 'surface-keyframe-channel'
	| 'overlay-keyframe-channel'
	| 'operation-error-code';

/** The JSON Schema fragment one tool argument is described by. */
export type WebmcpSchemaProperty =
	| {
			type: 'string';
			description: string;
			enum?: readonly string[];
			minLength?: number;
			maxLength?: number;
	  }
	| { type: 'integer' | 'number'; description: string; minimum?: number; maximum?: number }
	| { type: 'boolean'; description: string }
	| { type: 'array'; description: string; items: WebmcpSchemaProperty; maxItems?: number }
	| {
			type: 'object';
			description: string;
			properties: Readonly<Record<string, WebmcpSchemaProperty>>;
			required?: readonly string[];
			additionalProperties: false;
	  }
	| { description: string; oneOf: readonly WebmcpSchemaProperty[] };

/** The argument object a registered WebMCP tool accepts. */
export interface WebmcpToolInputSchema {
	type: 'object';
	properties: Readonly<Record<string, WebmcpSchemaProperty>>;
	required: readonly string[];
	additionalProperties: false;
}

/** The Zod `kind` enum, unwrapped past the default the composition schema gives it. */
function readCompositionKinds(): readonly string[] {
	return PresetSchema.shape.kind.def.innerType.options;
}

/**
 * The live vocabulary, read fresh on every call. Nothing here is cached: a
 * cached copy is a copy, and the whole point of this module is that a registry
 * addition reaches an agent's tool list without anyone editing a list.
 */
export function readWebmcpDerivedEnums(): Readonly<
	Record<WebmcpDerivedEnumName, readonly string[]>
> {
	return {
		'surface-type': REGISTERED_SURFACE_TYPES,
		'block-type': REGISTERED_BLOCK_TYPES,
		'annotation-style': Object.values(PIPELINE_DEFINITION_REGISTRY.annotations).map(
			(definition) => definition.style
		),
		'overlay-type': REGISTERED_OVERLAY_TYPES,
		'effect-type': REGISTERED_EFFECT_TYPES,
		'transition-effect': transitionEffectTypes(),
		'text-effect': TEXT_EFFECT_IDS,
		'diagram-primitive-type': DIAGRAM_PRIMITIVE_TYPES,
		'pack-slug': PACK_REGISTRY_SLUGS,
		'starter-slug': listPresets().map((entry) => entry.slug),
		'sound-event': SOUND_EVENTS,
		'caption-style': CAPTION_STYLES,
		'font-family': Object.keys(ENGINE_FONT_FAMILIES),
		'delivery-orientation': PresetSchema.shape.state.shape.transport.shape.orientation.options,
		'export-format': PresetSchema.shape.state.shape.transport.shape.format.options,
		'composition-kind': readCompositionKinds(),
		'surface-keyframe-channel': SURFACE_KEYFRAME_CHANNELS,
		'overlay-keyframe-channel': OVERLAY_KEYFRAME_CHANNELS,
		'operation-error-code': WEBMCP_OPERATION_ERROR_CODES
	};
}

/** One tool argument drawn from a live vocabulary rather than a restated list. */
export function webmcpDerivedEnumProperty(
	name: WebmcpDerivedEnumName,
	description: string
): WebmcpSchemaProperty {
	const members = readWebmcpDerivedEnums()[name];
	if (members.length === 0) {
		throw new TypeError(`The WebMCP vocabulary "${name}" resolved to no members.`);
	}
	return { type: 'string', description, enum: members };
}

/**
 * The frame rate argument, derived from the transport schema's own two accepted
 * shapes: a whole rate, or one of the NTSC fractional rates an edit can carry.
 */
export function webmcpTransportRateProperty(description: string): WebmcpSchemaProperty {
	return {
		description,
		oneOf: [
			{ type: 'integer', description: 'A whole frame rate.', minimum: 1, maximum: 120 },
			{
				type: 'number',
				description: `An NTSC fractional rate: ${NTSC_FRACTIONAL_FPS.join(', ')}.`,
				minimum: Math.min(...NTSC_FRACTIONAL_FPS),
				maximum: Math.max(...NTSC_FRACTIONAL_FPS)
			}
		]
	};
}

/**
 * The revision argument every mutating, history, and destructive operation
 * takes. Derived from the transaction contract rather than restated per tool, so
 * one wording reaches every agent (ADR-0054 §3).
 */
export function webmcpObservedRevisionProperty(): WebmcpSchemaProperty {
	return {
		type: 'integer',
		description:
			'The Composition revision you last observed. A mismatch fails with stale_revision and applies nothing.',
		minimum: 0
	};
}

/**
 * The digest the parity gate records. It folds the live vocabulary together with
 * the operation contract and the text budgets, so a registry gaining a variant
 * moves it — and a tool list that did not move alongside a registry change is
 * carrying a copy.
 */
export function readWebmcpSchemaDigest(): string {
	return hashObject({
		vocabulary: readWebmcpDerivedEnums(),
		operations: WEBMCP_OPERATION_INVENTORY.map((row) => ({
			id: row.id,
			toolName: row.toolName,
			effect: row.effect,
			precondition: row.precondition,
			requiresExpectedRevision: row.requiresExpectedRevision,
			cancellable: row.cancellable,
			focus: row.focus,
			writes: row.writes
		})),
		budgets: {
			toolName: WEBMCP_TOOL_NAME_MAX_LENGTH,
			description: WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH,
			result: WEBMCP_RESULT_CHARACTER_BUDGET,
			wholeDocument: WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET,
			coldPageCeiling: WEBMCP_ALWAYS_REGISTERED_CEILING
		}
	});
}

/** A vocabulary a source file restated instead of reading from its registry. */
export interface WebmcpHandwrittenEnumFinding {
	enumName: WebmcpDerivedEnumName;
	/** The members the file spelled out, in the order they appeared. */
	duplicated: readonly string[];
}

/**
 * How many members of one vocabulary a literal list may share before it is a
 * copy rather than a coincidence. Two unrelated string literals landing in one
 * array is a coincidence; two members of the same registry is a restated enum.
 */
const HANDWRITTEN_ENUM_MEMBER_THRESHOLD = 2;

/** Array literals whose entries are nothing but quoted strings. */
const STRING_ARRAY_LITERAL_PATTERN =
	/\[\s*(?:'[^'\n]*'|"[^"\n]*")\s*(?:,\s*(?:'[^'\n]*'|"[^"\n]*")\s*)*,?\s*\]/g;

const QUOTED_STRING_PATTERN = /'([^'\n]*)'|"([^"\n]*)"/g;

/**
 * The vocabularies a source file spells out. Reads array literals only: a
 * description that happens to name two Overlay types is prose an author wrote
 * on purpose, while `['lowerThird', 'watermark']` is the registry, copied.
 */
export function findWebmcpHandwrittenEnums(
	source: string
): readonly WebmcpHandwrittenEnumFinding[] {
	const vocabulary = readWebmcpDerivedEnums();
	const findings: WebmcpHandwrittenEnumFinding[] = [];

	for (const literal of source.match(STRING_ARRAY_LITERAL_PATTERN) ?? []) {
		const entries = [...literal.matchAll(QUOTED_STRING_PATTERN)].map(
			(match) => match[1] ?? match[2]
		);
		for (const [name, members] of Object.entries(vocabulary)) {
			const duplicated = entries.filter((entry) => members.includes(entry));
			if (duplicated.length >= HANDWRITTEN_ENUM_MEMBER_THRESHOLD) {
				findings.push({ enumName: name as WebmcpDerivedEnumName, duplicated });
			}
		}
	}

	return findings;
}
