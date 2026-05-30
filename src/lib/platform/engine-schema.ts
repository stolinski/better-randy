import { z } from 'zod';

import { parseAnnotationBodyText } from '../annotations/annotation-body-text.ts';
import {
	EFFECT_CATALOG,
	LAYOUT_AWARE_RENDERERS,
	TITLE_SCALE_SLOTS
} from '../text-animations/catalog.ts';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import type { AnnotationBody } from '$lib/annotations/annotation-marks';

export type FontFamily = 'serif' | 'sans' | 'mono' | 'condensed';
export type Ease = 'smooth' | 'settled' | 'sharp' | 'bouncy';
export type ExportFormat = 'webm' | 'prores';
export type CameraMotion = 'none' | 'push' | 'snap';

export interface FontDefinition {
	label: string;
	stack: string;
}

export const ENGINE_FONT_FAMILIES: Record<FontFamily, FontDefinition> = {
	serif: { label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
	sans: { label: 'Sans', stack: 'Avenir Next, Helvetica, Arial, sans-serif' },
	mono: { label: 'Mono', stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
	condensed: { label: 'Condensed', stack: '"Avenir Next Condensed", "Arial Narrow", sans-serif' }
};

export const ENGINE_EASES: Record<Ease, { label: string; gsap: string }> = {
	smooth: { label: 'Smooth', gsap: 'power3.out' },
	settled: { label: 'Settled', gsap: 'back.out(1.2)' },
	sharp: { label: 'Sharp', gsap: 'expo.out' },
	bouncy: { label: 'Bouncy', gsap: 'elastic.out(1, 0.5)' }
};

export type EaseDirection = 'enter' | 'exit';

export function getEaseGsap(ease: Ease, _direction: EaseDirection): string {
	// Same curve in both directions. Tween direction is encoded in the
	// from/to values (enters tween 0→1, exits tween 1→0); a `.out` curve on
	// an exit produces the head-loaded fade that G7 prescribes. The earlier
	// blanket `.out → .in` swap inverted that and caused perceptual snap-off
	// on exits — see Critic finding "Exit ease produces a perceptual snap-off",
	// docs/animation-rubric.md G7.
	return ENGINE_EASES[ease].gsap;
}

export const CAMERA_MOTION_OPTIONS: { value: CameraMotion; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'push', label: 'Slow push' },
	{ value: 'snap', label: 'Snap zoom' }
];

const FontFamilySchema = z.enum(['serif', 'sans', 'mono', 'condensed']);
const EaseSchema = z.enum(['smooth', 'settled', 'sharp', 'bouncy']);
const ExportFormatSchema = z.enum(['webm', 'prores']);
const VideoOrientationSchema = z.enum(['horizontal', 'vertical']);
const CameraMotionSchema = z.enum(['none', 'push', 'snap']);

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex color');
const FractionSchema = z.number().min(0).max(1);

export const AnnotationMarkStyleSchema = z.enum([
	'highlight',
	'underline',
	'strike',
	'circle',
	'box',
	'side-note',
	'magnify',
	'lift-out',
	'tear-out',
	'isolate'
]);

export const BlockTypeSchema = z.enum(['paragraph']);

const AnnotationBodySchema = z
	.string()
	.transform((text): AnnotationBody => parseAnnotationBodyText(text));

const TransportSchema = z.object({
	orientation: VideoOrientationSchema,
	durationSeconds: z.number().min(0.1).max(600),
	fps: z.number().int().min(1).max(120),
	format: ExportFormatSchema
});

const TypographySchema = z.object({
	fontFamily: FontFamilySchema,
	paperColor: HexColorSchema,
	inkColor: HexColorSchema
});

const MarkAppearanceSchema = z.object({
	color: HexColorSchema,
	intensity: FractionSchema
});

const MarkTimingSchema = z.object({
	start: FractionSchema,
	duration: FractionSchema,
	ease: EaseSchema,
	color: HexColorSchema.optional(),
	intensity: FractionSchema.optional()
});

const MarksStateSchema = z.object({
	defaults: z.partialRecord(AnnotationMarkStyleSchema, MarkAppearanceSchema),
	timings: z.array(MarkTimingSchema)
});

const TransitionSchema = z.object({
	start: FractionSchema,
	duration: FractionSchema,
	ease: EaseSchema
});

const SurfaceTypeSchema = z.enum([
	'paper',
	'plain',
	'newspaper',
	'pullquote-on-photo',
	'chapter-card',
	'title-sequence',
	'type-hero'
]);

const SurfaceContentSchema = z.object({
	body: AnnotationBodySchema,
	title: z.string().optional(),
	sourceUrl: z.string().optional(),
	author: z.string().optional(),
	affiliation: z.string().optional(),
	bodyLabel: z.string().optional(),
	source: z.string().optional(),
	dateLabel: z.string().optional(),
	// Mono kicker / section-name slot used by the `newspaper` Surface (and any
	// future surface that carries a labelled-section chip above the title). Per
	// ADR-0008, lives alongside the existing chrome slots so existing presets
	// remain valid (it's optional everywhere).
	kicker: z.string().optional(),
	// Secondary text slot used by family variants whose composition pairs a
	// primary word with a smaller counterpoint (type-hero `pair` variant per
	// ADR-0020 / motion-primitives Phase 4.1). Optional everywhere; ignored
	// by Surfaces / variants that don\'t declare a counterpoint slot.
	counterpoint: z.string().optional()
});

const SurfaceSchema = z.object({
	type: SurfaceTypeSchema,
	content: SurfaceContentSchema,
	// Optional per-Surface variant id, picked up by Surface families that use
	// the variants-as-data convention per ADR-0020. Unused by single-shape
	// Surfaces. The Surface\'s Pipeline validates the value against its
	// VARIANT_IDS at render time.
	variant: z.string().optional(),
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional(),
	camera: CameraMotionSchema.optional(),
	backgroundVisibility: FractionSchema.optional()
});

const OverlayPositionSchema = z.object({
	anchor: z.enum([
		'top-left',
		'top-right',
		'top-center',
		'bottom-left',
		'bottom-right',
		'bottom-center',
		'center',
		'normalized-rect'
	]),
	// Offsets are fractions of the composition's inline-size / block-size (0..1).
	// `offset: { x: 0.05, y: 0.05 }` = 5% inset from the anchor edge.
	// For offscreen / precise placement use `anchor: 'normalized-rect'` + `rect`.
	offset: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
	rect: z
		.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
		.optional()
});

const OverlaySchema = z.object({
	type: z.string(),
	id: z.string(),
	content: z.unknown(),
	position: OverlayPositionSchema,
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional()
});

const EffectSchema = z.object({
	type: z.string(),
	id: z.string(),
	params: z.unknown()
});

// One composition-wide post-process chain run after the final composite into
// the canvas. Per-target shader work is `shaderPass` on the renderer per
// ADR-0005 / ADR-0008; per-layer effect chains were collapsed by ADR-0018.
const EffectChainSchema = z.array(EffectSchema);

// ---- Text animations (ADR-0011) ----
// Slot enums match the surface / overlay content slots Hiviz ships today plus
// the chrome-only kicker slot the newspaper surface added in ADR-0008. The
// `target` discriminated union is parsed at load time; the rules below
// (per-character → title-scale; layout-aware renderer → title-scale) are
// enforced as a `superRefine` validator so the failure messages reach the
// preset author with a path-indexed string from `parsePreset`.
const SurfaceSlotSchema = z.enum([
	'title',
	'kicker',
	'body',
	'sourceUrl',
	'author',
	'source',
	'dateLabel'
]);

const OverlaySlotSchema = z.enum(['kicker', 'title', 'subtitle']);

const TextAnimationTargetSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('surface'),
		slot: SurfaceSlotSchema
	}),
	z.object({
		kind: z.literal('overlay'),
		overlayId: z.string().min(1),
		slot: OverlaySlotSchema
	})
]);

const TextAnimationParamsSchema = z
	.object({
		speedMultiplier: z.number().positive().optional(),
		holdMs: z.number().nonnegative().optional(),
		gapMs: z.number().nonnegative().optional(),
		yTravelMultiplier: z.number().optional(),
		initialDelayMs: z.number().nonnegative().optional()
	})
	.optional();

const TextAnimationSchema = z.object({
	id: z.string().min(1),
	target: TextAnimationTargetSchema,
	effect: z.string().min(1),
	enter: TransitionSchema,
	exit: TransitionSchema.optional(),
	params: TextAnimationParamsSchema
});

export type TextAnimationTarget = z.infer<typeof TextAnimationTargetSchema>;
export type TextAnimationParams = NonNullable<z.infer<typeof TextAnimationParamsSchema>>;
export type TextAnimation = z.infer<typeof TextAnimationSchema>;

function targetSlotKey(target: TextAnimationTarget): string {
	if (target.kind === 'surface') {
		return target.slot;
	}
	return `overlay:${target.slot}`;
}

function targetUniqueKey(target: TextAnimationTarget): string {
	if (target.kind === 'surface') {
		return `surface:${target.slot}`;
	}
	return `overlay:${target.overlayId}:${target.slot}`;
}

const TextAnimationsSchema = z
	.array(TextAnimationSchema)
	.default([])
	.superRefine((entries, ctx) => {
		const ids = new Set<string>();
		const targets = new Set<string>();

		for (let i = 0; i < entries.length; i += 1) {
			const entry = entries[i];
			const spec = EFFECT_CATALOG.get(entry.effect);

			if (!spec) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'effect'],
					message: `Unknown text-animation effect "${entry.effect}". Known: ${[...EFFECT_CATALOG.keys()].join(', ')}.`
				});
				continue;
			}

			if (ids.has(entry.id)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'id'],
					message: `Duplicate textAnimations[].id "${entry.id}"; ids must be unique within a preset.`
				});
			}
			ids.add(entry.id);

			const uniqueKey = targetUniqueKey(entry.target);
			if (targets.has(uniqueKey)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'target'],
					message: `Two textAnimations[] entries target the same slot (${uniqueKey}). Only one entry per slot is supported in v1.`
				});
			}
			targets.add(uniqueKey);

			const slotKey = targetSlotKey(entry.target);

			if (spec.target === 'per-character' && !TITLE_SCALE_SLOTS.has(slotKey)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'target', 'slot'],
					message: `Per-character effect "${entry.effect}" can only target title-scale slots (title, kicker, overlay title/kicker). Slot "${slotKey}" is body-scale.`
				});
			}

			if (LAYOUT_AWARE_RENDERERS.has(spec.renderer) && !TITLE_SCALE_SLOTS.has(slotKey)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'target', 'slot'],
					message: `Layout-aware renderer "${spec.renderer}" can only target title-scale slots. Slot "${slotKey}" is body-scale.`
				});
			}
		}
	});

export const EngineStateSchema = z.object({
	transport: TransportSchema,
	typography: TypographySchema,
	marks: MarksStateSchema,
	surface: SurfaceSchema,
	textAnimations: TextAnimationsSchema,
	overlays: z.array(OverlaySchema).default([]),
	effects: EffectChainSchema.default([])
});

export type Transport = z.infer<typeof TransportSchema>;
export type Typography = z.infer<typeof TypographySchema>;
export type MarkAppearance = z.infer<typeof MarkAppearanceSchema>;
export type MarkTiming = z.infer<typeof MarkTimingSchema>;
export type MarksState = z.infer<typeof MarksStateSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type SurfaceContent = z.infer<typeof SurfaceContentSchema>;
export type SurfaceState = z.infer<typeof SurfaceSchema>;
export type SurfaceType = z.infer<typeof SurfaceTypeSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type EffectChain = z.infer<typeof EffectChainSchema>;
export type EngineState = z.infer<typeof EngineStateSchema>;

const DEFAULT_BODY: AnnotationBody = [
	{
		type: 'paragraph',
		segments: [
			{
				text: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.',
				markStyles: []
			}
		]
	},
	{
		type: 'paragraph',
		segments: [
			{
				text: 'The Transformer allows for significantly more parallelization and can reach ',
				markStyles: []
			},
			{
				text: 'a new state of the art in translation quality after being trained for as little as twelve hours',
				markStyles: ['highlight']
			},
			{ text: '.', markStyles: [] }
		]
	},
	{
		type: 'paragraph',
		segments: [
			{
				text: 'Self-attention connects all positions with a constant number of sequentially executed operations, whereas recurrent layers require a number of operations proportional to sequence length.',
				markStyles: []
			}
		]
	}
];

export function createDefaultEffectChain(): EffectChain {
	return [];
}

export function createDefaultEngineState(): EngineState {
	return {
		transport: {
			orientation: 'horizontal',
			durationSeconds: 6,
			fps: 30,
			format: 'webm'
		},
		typography: {
			fontFamily: 'serif',
			paperColor: '#ffffff',
			inkColor: '#000000'
		},
		marks: {
			defaults: {
				highlight: { color: '#ffd642', intensity: 0.62 },
				underline: { color: '#1f5aff', intensity: 0.62 },
				strike: { color: '#de263a', intensity: 0.62 },
				circle: { color: '#de263a', intensity: 0.62 }
			},
			timings: [{ start: 0.34, duration: 0.24, ease: 'smooth' }]
		},
		surface: {
			type: 'paper',
			content: {
				title: 'Attention Is All You Need',
				sourceUrl: 'https://arxiv.org/abs/1706.03762',
				body: DEFAULT_BODY
			},
			// Durations land inside the G6 bands at the default 6s transport:
			//   enter 0.05 × 6s = 300 ms (band 250–400 ms)
			//   exit  0.04 × 6s = 240 ms (band 180–280 ms; ~20% shorter than enter)
			enter: { start: 0, duration: 0.05, ease: 'settled' },
			exit: { start: 0.86, duration: 0.04, ease: 'smooth' }
		},
		textAnimations: [],
		overlays: [],
		effects: createDefaultEffectChain()
	};
}

export function isPaperSurface(surface: SurfaceState): surface is SurfaceState & { type: 'paper' } {
	return surface.type === 'paper';
}

export function isPlainSurface(surface: SurfaceState): surface is SurfaceState & { type: 'plain' } {
	return surface.type === 'plain';
}

export function isNewspaperSurface(
	surface: SurfaceState
): surface is SurfaceState & { type: 'newspaper' } {
	return surface.type === 'newspaper';
}

export interface ResolvedMark {
	style: AnnotationMarkStyle;
	start: number;
	duration: number;
	ease: Ease;
	color: string;
	intensity: number;
}

const FALLBACK_TIMING = { start: 0.34, duration: 0.24, ease: 'smooth' as Ease };
const FALLBACK_APPEARANCE: MarkAppearance = { color: '#1f5aff', intensity: 0.62 };

function getMarkDefaults(marks: MarksState, style: AnnotationMarkStyle): MarkAppearance {
	return marks.defaults[style] ?? FALLBACK_APPEARANCE;
}

export function resolveMarkForIndex(
	style: AnnotationMarkStyle,
	index: number,
	marks: MarksState
): ResolvedMark {
	const defaults = getMarkDefaults(marks, style);
	const timing = marks.timings[index];

	if (!timing) {
		return {
			style,
			start: FALLBACK_TIMING.start,
			duration: FALLBACK_TIMING.duration,
			ease: FALLBACK_TIMING.ease,
			color: defaults.color,
			intensity: defaults.intensity
		};
	}

	return {
		style,
		start: timing.start,
		duration: timing.duration,
		ease: timing.ease,
		color: timing.color ?? defaults.color,
		intensity: timing.intensity ?? defaults.intensity
	};
}

export function createMarkTiming(): MarkTiming {
	return {
		start: FALLBACK_TIMING.start,
		duration: FALLBACK_TIMING.duration,
		ease: FALLBACK_TIMING.ease
	};
}

export const PRESET_SCHEMA_ID = 'hiviz@1' as const;

/**
 * Pack the Preset is bound to (ADR-0014). The active Pack manifest resolves
 * every Identity Spec `viaPack` Role the Preset's contributing Pipelines
 * declare (ADR-0019). Required with no default — a Preset must name its Pack
 * explicitly (ADR-0023: there is no privileged default Pack). Every built-in
 * Preset declares `pack`; a Preset that omits it fails validation.
 */
export const PresetSchema = z.object({
	schema: z.literal(PRESET_SCHEMA_ID),
	name: z.string().min(1, 'Preset name is required'),
	description: z.string().optional(),
	pack: z.string().min(1, 'Preset must declare a pack'),
	state: EngineStateSchema
});

export type Preset = z.infer<typeof PresetSchema>;
