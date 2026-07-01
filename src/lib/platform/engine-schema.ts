import { z } from 'zod';

import { parseAnnotationBodyText } from '../annotations/annotation-body-text.ts';
import {
	EFFECT_CATALOG,
	LAYOUT_AWARE_RENDERERS,
	TITLE_SCALE_SLOTS
} from '../text-animations/catalog.ts';
import { SOUND_KIT_REGISTRY } from './sound-kits/registry.ts';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import type { AnnotationBody } from '$lib/annotations/annotation-marks';

export type FontFamily = 'serif' | 'sans' | 'mono' | 'condensed';
export type Ease = 'smooth' | 'settled' | 'sharp' | 'bouncy';
export type ExportFormat = 'webm' | 'prores';

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
export type EaseProperty = 'transform' | 'opacity';

// Opacity fade-OUT curves (see getEaseGsap for why opacity exits differ).
const OPACITY_EXIT_EASES: Record<Ease, string> = {
	smooth: 'power2.inOut',
	settled: 'power2.inOut',
	sharp: 'power3.inOut',
	bouncy: 'power2.inOut'
};

export function getEaseGsap(
	ease: Ease,
	direction: EaseDirection,
	property: EaseProperty = 'transform'
): string {
	// TRANSFORM tweens keep the named curve in both directions: direction is encoded
	// in the from/to values (enter 0→1, exit 1→0), and a `.out` curve decelerates a
	// slide into its rest/off position — what G7/L5 mean by "decelerate out".
	//
	// OPACITY EXITS are the exception. A `.out` curve on a 1→0 alpha tween HEAD-LOADS
	// the fade (alpha drops fast then tails), so the subject vanishes early and the
	// frame holds on empty — the "subjectless tail". A `.in` curve instead snaps off
	// in the final frame. So opacity fade-outs use a symmetric `.inOut`: it holds,
	// fades, and lands at the window end with neither head-load nor snap. Resolves the
	// long-standing exit-ease tension (Critic "head-loaded fade" vs the earlier
	// reverted blanket `.out→.in` "snap-off"); transform exits are untouched.
	if (direction === 'exit' && property === 'opacity') {
		return OPACITY_EXIT_EASES[ease];
	}
	return ENGINE_EASES[ease].gsap;
}

const FontFamilySchema = z.enum(['serif', 'sans', 'mono', 'condensed']);
const EaseSchema = z.enum(['smooth', 'settled', 'sharp', 'bouncy']);
const ExportFormatSchema = z.enum(['webm', 'prores']);
const VideoOrientationSchema = z.enum(['horizontal', 'vertical']);

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex color');
const FractionSchema = z.number().min(0).max(1);

// ---- Sound design (ADR-0033) ----
// Sound is a timed-cue orchestration domain, peer to `textAnimations[]` /
// `marks.timings[]` — not a sixth Layer (it renders no pixels). Motion
// primitives emit semantic sound events at their own frame; a per-Layer Sound
// kit resolves events → samples with ADR-0024 core fallback.

// Core sound-event vocabulary the engine pins (ADR-0033 §8). Kits supply
// samples per event; motions declare which event they emit via the default
// per-primitive mapping, swappable per motion through `sound.event` below.
export const SOUND_EVENTS = [
	'whoosh-in',
	'whoosh-out',
	'impact',
	'tick',
	'pop',
	'sub-drop',
	'sting'
] as const;
export const SoundEventSchema = z.enum(SOUND_EVENTS);
export type SoundEvent = z.infer<typeof SoundEventSchema>;

// Per-motion sound override (ADR-0033 §5) — the second cascade level beneath
// the Layer's kit, carried as optional `sound` on a motion window (surface /
// overlay / text-animation Transition, mark timing, chat-message enter).
// `mute` silences this one motion; `event` swaps which sound event it emits;
// `sample` locks a specific audio-asset slug, bypassing kit resolution (for
// signature animations). Absent → the motion's default event resolves through
// the Layer's kit.
const SoundOverrideSchema = z.object({
	mute: z.boolean().optional(),
	event: SoundEventSchema.optional(),
	sample: z.string().min(1).optional()
});
export type SoundOverride = z.infer<typeof SoundOverrideSchema>;

// Sound-kit slug, assigned PER LAYER (ADR-0033 §3) — the kit lives on the
// Layer (`surface.soundKit`, `overlays[].soundKit`, `marks.soundKit`), never
// the composition root: there is no whole-piece sound pack. A Layer with no
// kit is silent — sound is opt-in per Layer. Validated against the kit
// registry at parse time, like textAnimations[].effect against the catalog.
const SoundKitSchema = z
	.string()
	.min(1)
	.refine((slug) => slug in SOUND_KIT_REGISTRY, {
		message: `Unknown Sound kit. Registered kits: ${Object.keys(SOUND_KIT_REGISTRY).join(', ')}.`
	});

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

// One chat bubble for the `imessage` Surface. `from` picks the side/colour
// (received gray, left · sent blue, right); `text` is a body string that may
// carry the hero `[highlight]`; `tapback` is an optional iMessage reaction and
// `status` the delivered/read receipt under a sent bubble. See
// docs/adr/0031-imessage-interactive-surface.md.
const ChatMessageSchema = z.object({
	from: z.enum(['me', 'them']),
	text: AnnotationBodySchema,
	tapback: z.enum(['heart', 'like', 'dislike', 'haha', 'emphasize', 'question']).optional(),
	status: z.enum(['delivered', 'read']).optional(),
	// When this bubble pops in (and how long the spring takes), as a fraction of
	// the clip — the same start/duration shape the timeline draws + edits for
	// every other animation. The bubble's tapback and receipt derive from
	// `enter.start`. Optional: a default staggered cadence applies.
	enter: z
		.object({
			start: FractionSchema,
			duration: FractionSchema,
			ease: EaseSchema.optional(),
			sound: SoundOverrideSchema.optional()
		})
		.optional(),
	// A typing indicator that plays for `duration` (fraction of the clip) right
	// before this bubble's `enter.start`, then resolves into it. Its own draggable
	// timeline clip on the message's rail. Omit for no typing indicator.
	typing: z.object({ duration: FractionSchema }).optional()
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

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
	intensity: FractionSchema.optional(),
	sound: SoundOverrideSchema.optional()
});

const MarksStateSchema = z.object({
	defaults: z.partialRecord(AnnotationMarkStyleSchema, MarkAppearanceSchema),
	timings: z.array(MarkTimingSchema),
	soundKit: SoundKitSchema.optional()
});

const TransitionSchema = z.object({
	start: FractionSchema,
	duration: FractionSchema,
	ease: EaseSchema,
	sound: SoundOverrideSchema.optional()
});

const SurfaceTypeSchema = z.enum([
	'paper',
	'plain',
	'newspaper',
	'pullquote-on-photo',
	'chapter-card',
	'title-sequence',
	'type-hero',
	'web-document',
	'imessage'
]);

// Which site the `web-document` Surface mocks. One Surface, per-site layout =
// content (a captured Svelte mock selected by this field), not per-site
// Surfaces and not a Pack — see docs/adr/0030-web-document-emissive-surface.md.
// Each value selects a per-site mock layout captured via HTML-in-Canvas. Mix of
// dark pages (twitter/reddit/github) and light pages (wikipedia/hackernews); the
// highlight blend mode follows each page's paperColor luminance automatically.
const WebDocumentSiteSchema = z.enum([
	'twitter',
	'reddit',
	'wikipedia',
	'hackernews',
	'github',
	'youtube',
	'news'
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
	counterpoint: z.string().optional(),
	// Avatar image URL for the `web-document` Surface (the tweet author's profile
	// photo). Must be a CORS-accessible URL (X's CDN is; use crossOrigin
	// "anonymous" on the <img> so the HTML-in-Canvas capture isn't tainted).
	// When absent the Surface falls back to the default silhouette SVG.
	avatarUrl: z.string().optional(),
	// Ordered conversation for the `imessage` Surface (ignored by every other
	// surface). The thread-level contact name reuses `author`; each message
	// carries its own side/text/tapback/receipt. Per ADR-0031.
	messages: z.array(ChatMessageSchema).optional()
});

const SurfaceSchema = z.object({
	type: SurfaceTypeSchema,
	content: SurfaceContentSchema,
	// Which site the `web-document` Surface renders (twitter | reddit |
	// wikipedia). Ignored by every other Surface. The per-site mock reuses the
	// shared content slots: `author` = display name, `source` = handle /
	// subreddit / article kicker, `dateLabel` = timestamp, `sourceUrl` = the URL
	// shown in the browser address bar, `body` = the post text carrying the hero
	// `[highlight]` span.
	site: WebDocumentSiteSchema.optional(),
	// Optional per-Surface variant id, picked up by Surface families that use
	// the variants-as-data convention per ADR-0020. Unused by single-shape
	// Surfaces. The Surface\'s Pipeline validates the value against its
	// VARIANT_IDS at render time.
	variant: z.string().optional(),
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional(),
	backgroundVisibility: FractionSchema.optional(),
	soundKit: SoundKitSchema.optional()
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
		.optional(),
	// Uniform scale multiplier applied to the overlay's natural size, about the
	// anchor point (so the anchored edge/corner stays pinned as it grows). 1 =
	// natural size. Driven by the canvas scale handles + the inspector Scale field.
	// Aspect-preserving on purpose — overlays keep their designed proportions.
	scale: z.number().min(0.1).max(8).optional()
});

const OverlaySchema = z.object({
	type: z.string(),
	id: z.string(),
	content: z.unknown(),
	position: OverlayPositionSchema,
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional(),
	// Focal-distance plane for depth-of-field (ADR-0021 semantics / ADR-0027 v1).
	// 0 = focal plane (sharp), 1 = max defocus. Absent → the Overlay-Layer default
	// (0.7) is applied at render; a per-instance value overrides it so one overlay
	// can sit nearer the focal plane than another. Only consulted when a
	// depth-of-field Effect is present; inert otherwise.
	z: FractionSchema.optional(),
	soundKit: SoundKitSchema.optional()
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

// Multi-state composition (ADR-0022). A Preset MAY declare a top-level
// `transition` recipe naming two other Presets by slug (`from`, `to`) and a
// transition Effect. The engine renders `from` and `to` into separate
// (color, depth) target pairs and hands both to the transition Effect, whose
// mask shape selects per pixel at the wipe's local progress. `durationMs` is
// the wipe's own duration, distinct from each state's `transport.durationSeconds`
// (which drives that state's internal animation). Structural validation only
// here; slug resolution + "effect is a registered transition Effect" are
// cross-reference checks done in `preset.ts` against the catalog + registry.
const CompositionTransitionSchema = z.object({
	from: z.string().min(1, 'transition.from must name a Preset slug'),
	to: z.string().min(1, 'transition.to must name a Preset slug'),
	effect: z.string().min(1, 'transition.effect must name a transition Effect'),
	durationMs: z.number().positive('transition.durationMs must be greater than 0')
});

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

// ---- Dimensional depth stage (ADR-0028) ----
// OPTIONAL composition-wide selector. Absent ⇒ the flat multiplane path (ADR-0027),
// unchanged. When present, the engine composites the Layer textures on real 3D planes
// at their ADR-0021 z through a perspective camera with a real lens DOF. `type` is an
// open string validated against the stage registry at load time (like Effect/Overlay
// types, in preset.ts). Camera + focus drive frame-deterministically off the timeline.
const StageCameraSchema = z.object({
	move: z.enum(['static', 'push', 'drift']).default('static'),
	amount: FractionSchema.default(0.5), // dolly / lateral parallax strength
	ease: EaseSchema.default('smooth')
});

// Rack-focus pull: focusZ travels from→to over [start, start+duration] (timeline
// fractions), mirroring the Transition window shape. Absent ⇒ fixed focus.
const StageFocusPullSchema = z.object({
	from: FractionSchema,
	to: FractionSchema,
	start: FractionSchema,
	duration: FractionSchema
});

const StageFocusSchema = z.object({
	focusZ: FractionSchema.default(0), // in-focus depth (ADR-0021 scalar; 0 near … 1 far)
	aperture: FractionSchema.default(0.6), // max circle-of-confusion / blur strength
	// Hyperfocal half-width (depth01): content within this depth distance of the
	// focal plane stays fully sharp. Lets a foreshortened plane (e.g. text) hold
	// crisp edge-to-edge while the backdrop still melts to bokeh. 0 = pinpoint.
	band: FractionSchema.default(0),
	pull: StageFocusPullSchema.optional()
});

// Optional image on the depth stage's backdrop plane (the far plane). `asset`
// is a slug into the registered substrate asset map (src/lib/platform/
// substrate-textures.ts) — a bundled, deterministic in-repo image, resolved to
// a GPU texture and sampled by the backdrop plane's `textured` branch. Absent →
// the backdrop stays a solid colour (backgroundFill). This is the image-
// substrate input (dex p20) realised as a depth-stage backdrop: a real photo on
// the far plane, the Surface (e.g. a pullquote) floating on the near plane, the
// camera push reprojecting them at different rates for true parallax.
const StageBackdropSchema = z.object({
	image: z.object({ asset: z.string().min(1) }).optional(),
	// Center darkening of the backdrop image (0..1) for near-plane text legibility:
	// the backdrop plane is opaque, so a soft central darken composites cleanly
	// (no alpha-discard artifacts) and gives floating text contrast without a
	// scrim — which can't ride the depth stage's near plane. 0 = no darken.
	contrast: z.number().min(0).max(1).default(0)
});
const StageSchema = z.object({
	type: z.string().min(1),
	// prefault (not default): zod v4 `.default()` short-circuits without parsing,
	// so an absent camera/focus would land as a bare `{}` with none of the inner
	// field defaults applied. `.prefault({})` parses `{}` through the object,
	// filling move/amount/ease and focusZ/aperture/band.
	camera: StageCameraSchema.prefault({}),
	focus: StageFocusSchema.prefault({}),
	backdrop: StageBackdropSchema.optional()
});

// ---- Audio cues (ADR-0033 §4, §5) ----
// Automatic cues are DERIVED from motion at render time — never stored here
// (storing them would duplicate the motion's source of truth and desync on
// re-time). `audioCues[]` holds only what has no motion to ride: manual
// free-standing cues (an outro sting) and the optional single music/ambient
// bed. `start` / `duration` are timeline fractions like every other timed
// window; `volume` absent → full scale at mix time. `assetSlug` names a
// bundled audio asset directly — manual cues are not kit-resolved.
const AudioCueSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(['cue', 'bed']).default('cue'),
	assetSlug: z.string().min(1),
	start: FractionSchema,
	duration: FractionSchema,
	volume: FractionSchema.optional()
});
export type AudioCue = z.infer<typeof AudioCueSchema>;

const AudioCuesSchema = z
	.array(AudioCueSchema)
	.default([])
	.superRefine((cues, ctx) => {
		const ids = new Set<string>();
		let hasBed = false;

		for (let i = 0; i < cues.length; i += 1) {
			const cue = cues[i];

			if (ids.has(cue.id)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'id'],
					message: `Duplicate audioCues[].id "${cue.id}"; ids must be unique within a preset.`
				});
			}
			ids.add(cue.id);

			if (cue.kind === 'bed') {
				if (hasBed) {
					ctx.addIssue({
						code: 'custom',
						path: [i, 'kind'],
						message: 'A composition carries at most one bed (ADR-0033 §1).'
					});
				}
				hasBed = true;
			}
		}
	});

export const EngineStateSchema = z
	.object({
		transport: TransportSchema,
		typography: TypographySchema,
		marks: MarksStateSchema,
		surface: SurfaceSchema,
		textAnimations: TextAnimationsSchema,
		overlays: z.array(OverlaySchema).default([]),
		effects: EffectChainSchema.default([]),
		audioCues: AudioCuesSchema,
		backgroundFill: HexColorSchema.optional(),
		stage: StageSchema.optional()
	})
	.superRefine((state, ctx) => {
		// A bed is for self-contained segments / bumpers only — a transparent
		// Overlay keeps the footage's own audio (ADR-0033 §1). `backgroundFill`
		// is the schema-level signal that the piece renders full-frame.
		if (state.backgroundFill) {
			return;
		}
		const bedIndex = state.audioCues.findIndex((cue) => cue.kind === 'bed');
		if (bedIndex >= 0) {
			ctx.addIssue({
				code: 'custom',
				path: ['audioCues', bedIndex, 'kind'],
				message:
					"A bed requires a full-frame piece (backgroundFill); transparent overlays keep the footage's own audio (ADR-0033 §1)."
			});
		}
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
export type WebDocumentSite = z.infer<typeof WebDocumentSiteSchema>;
export type Overlay = z.infer<typeof OverlaySchema>;
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type EffectChain = z.infer<typeof EffectChainSchema>;
export type StageCamera = z.infer<typeof StageCameraSchema>;
export type StageFocus = z.infer<typeof StageFocusSchema>;
export type Stage = z.infer<typeof StageSchema>;
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
		effects: createDefaultEffectChain(),
		audioCues: []
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

export interface MarkInstance {
	style: AnnotationMarkStyle;
	text: string;
	/** Character offset of the marked run inside the body's plain-text projection. */
	startChar: number;
	/** End char index (exclusive). */
	endChar: number;
}

/**
 * Every mark instance a Surface's content produces, in document order — one
 * per (segment, style) pair, matching how `marks.timings[]` is indexed. The
 * body slot first, then any per-message bodies (the `imessage` Surface carries
 * its highlight inside `content.messages[].text`, not `content.body`); that
 * order matches DOM order — body renders first, then the message bubbles
 * top-to-bottom — so these indices align with `getAnnotationMarkLayouts`.
 * Character offsets count a "\n\n" paragraph break, mirroring the editor's
 * serialized form.
 */
export function listMarkInstances(content: SurfaceContent): MarkInstance[] {
	const result: MarkInstance[] = [];
	let cursor = 0;

	const bodies = [content.body];
	for (const message of content.messages ?? []) {
		bodies.push(message.text);
	}

	for (const body of bodies) {
		for (const block of body) {
			if (block.type !== 'paragraph') {
				continue;
			}

			for (const segment of block.segments) {
				const start = cursor;
				const end = cursor + segment.text.length;
				for (const style of segment.markStyles) {
					result.push({ style, text: segment.text, startChar: start, endChar: end });
				}
				cursor = end;
			}
			cursor += 2;
		}
	}

	return result;
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
	/**
	 * Catalog classification. `deliverable` (default) is a curated, shippable
	 * Preset — held to the R/Q/G rubric floors (`verify-presets`) and listed in
	 * the app catalog (`listPresets`). `fixture` is a demo / showcase / test /
	 * motion-primitive verifier: schema-checked but exempt from the deliverable
	 * rubric floors and excluded from the catalog. Fixtures stay loadable by
	 * slug (`getPresetBySlug`) for development.
	 */
	kind: z.enum(['deliverable', 'fixture']).default('deliverable'),
	state: EngineStateSchema,
	// Optional multi-state transition recipe (ADR-0022). When present, the
	// engine renders `from`/`to` and composites them through the named transition
	// Effect; this Preset's own `state` supplies the output transport (orientation,
	// fps, duration) and any background fill. Absent on ordinary single-state Presets.
	transition: CompositionTransitionSchema.optional()
});

export type CompositionTransition = z.infer<typeof CompositionTransitionSchema>;
export type Preset = z.infer<typeof PresetSchema>;
