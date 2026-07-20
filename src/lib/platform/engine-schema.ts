import { z } from 'zod';

import { parseAnnotationBodyText } from '../annotations/annotation-body-text.ts';
import { NTSC_FRACTIONAL_FPS } from '../utils/composition-timing.ts';
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

// Per-property default the enter/exit SUGAR expansion applies to opacity
// fade-outs (ADR-0035 §5 — the old getEaseGsap opacity-exit special case,
// made explicit at the expansion site). A `.out` curve on a 1→0 alpha tween
// HEAD-LOADS the fade (alpha drops fast then tails), so the subject vanishes
// early and the frame holds on empty — the "subjectless tail". A `.in` curve
// instead snaps off in the final frame. So sugar opacity fade-outs take a
// symmetric `.inOut`: hold, fade, land at the window end with neither
// head-load nor snap. Transform exits keep the named curve — direction is
// encoded in from/to values, and a `.out` curve decelerating into rest is
// what G7/L5 mean by "decelerate out". Authored keyframe channels are NOT
// subject to this default: the composition holds the pen, segments run the
// ease they declare.
export const SUGAR_OPACITY_EXIT_EASES: Record<Ease, string> = {
	smooth: 'power2.inOut',
	settled: 'power2.inOut',
	sharp: 'power3.inOut',
	bouncy: 'power2.inOut'
};

export function getEaseGsap(ease: Ease): string {
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
// primitives emit semantic sound events at their own frame; each event plays
// its engine-default sample unless the motion overrides it.

// Sound-event vocabulary the engine pins (ADR-0033 §8 — a starter set, grown
// deliberately). Each event names a motion kind and carries ONE engine
// default sample (`DEFAULT_EVENT_SAMPLES` in sound-cues.ts); motions declare
// which event they emit via the default per-primitive mapping, swappable per
// motion through `sound.event` below. There is no kit/palette bundle — that
// indirection was removed 2026-07-02 after GUI testing (see ADR-0033
// amendments): sound is engine defaults + per-motion overrides.
export const SOUND_EVENTS = [
	'whoosh-in',
	'whoosh-out',
	'impact',
	'tick',
	'click',
	'pop',
	'send',
	'swipe',
	'scratch',
	'draw',
	'sub-drop',
	'sting'
] as const;
export const SoundEventSchema = z.enum(SOUND_EVENTS);
export type SoundEvent = z.infer<typeof SoundEventSchema>;

// Per-motion sound override (ADR-0033 §5) — carried as optional `sound` on a
// motion window (surface / overlay / text-animation Transition, mark timing,
// chat-message enter). `mute` silences this one motion; `event` swaps which
// sound event it emits; `sample` locks a specific audio-asset slug directly.
// Absent → the motion's default event plays its engine-default sample.
const SoundOverrideSchema = z.object({
	mute: z.boolean().optional(),
	event: SoundEventSchema.optional(),
	sample: z.string().min(1).optional()
});
export type SoundOverride = z.infer<typeof SoundOverrideSchema>;

// ---- Generalized keyframes + Cascade (ADR-0035) ----
// Ordered per-channel keyframes replace the 2-keyframe Transition as the
// GENERAL motion form. Declaring `animation.channels` on an element means the
// composition takes full ownership of that element's motion — the pipeline's
// intrinsic enter/exit form does not run (ADR-0035 §2). An element with no
// keyframes renders exactly as today; `enter`/`exit` stays valid as lossless
// sugar. Keyframe positions are ms from the element's RESOLVED clip start —
// the same welded-absolute reasoning as cascade offsets, so authored motion
// survives re-time without drift.

// `ease` is the curve INTO this keyframe (from the previous one); the first
// keyframe of a track carries none. Stays the constrained enum — no bezier
// values, no curve editor (the taste guardrail survives, ADR-0035 §5).
// The per-channel track schemas below all parse to this one shape; only their
// `value` bounds differ.
export interface Keyframe {
	atMs: number;
	value: number;
	ease?: Ease;
}

// One channel's track. Per-channel value bounds ride in via `value` (opacity
// is a 0..1 fraction; x/y are signed composition-fraction deltas; scale
// mirrors the static field's 0.1..8; rotation is unbounded degrees so authored
// spins stay expressible).
function createKeyframeTrackSchema(value: z.ZodType<number>) {
	return z
		.array(z.strictObject({ atMs: z.number().min(0), value, ease: EaseSchema.optional() }))
		.min(1, 'A declared channel needs at least one keyframe.')
		.superRefine((frames, ctx) => {
			if (frames.length > 0 && frames[0].ease !== undefined) {
				ctx.addIssue({
					code: 'custom',
					path: [0, 'ease'],
					message:
						'The first keyframe carries no ease — ease is the curve INTO a keyframe, and nothing precedes the first.'
				});
			}
			for (let i = 1; i < frames.length; i += 1) {
				if (frames[i].atMs <= frames[i - 1].atMs) {
					ctx.addIssue({
						code: 'custom',
						path: [i, 'atMs'],
						message: `Keyframes must be ordered by strictly ascending atMs (${frames[i].atMs} follows ${frames[i - 1].atMs}).`
					});
				}
			}
		});
}

// Overlay channels (ADR-0035 §3). `x`/`y` are composition-fraction DELTAS from
// the element's `position` anchor/offset (layout keeps its home; motion is
// relative), so they may be negative. `scale`/`rotation` are absolute channel
// values seeded from the static `position.scale` / `position.rotation` fields.
const OverlayChannelKeyframesSchema = z.strictObject({
	opacity: createKeyframeTrackSchema(FractionSchema).optional(),
	x: createKeyframeTrackSchema(z.number()).optional(),
	y: createKeyframeTrackSchema(z.number()).optional(),
	scale: createKeyframeTrackSchema(z.number().min(0.1).max(8)).optional(),
	rotation: createKeyframeTrackSchema(z.number()).optional()
});

// Surface gets `opacity` only — surface transforms are camera territory
// (`stage.camera`, the depth stage); two systems must not fight over the same
// pixels (ADR-0035 §3). Strict so a transform channel fails loudly instead of
// being silently stripped.
const SurfaceChannelKeyframesSchema = z.strictObject({
	opacity: createKeyframeTrackSchema(FractionSchema).optional()
});

// Cascade (ADR-0035 §4): welds this element's ENTER START to another element's
// enter start/end plus a millisecond offset — ms, not fractions, so a 120 ms
// stagger stays 120 ms when the piece re-times. Anchor refs use the same
// identities the timeline rows use. Cycles are a parse-time error (see
// validateCascadeGraph); offsets may be negative (lead an anchor slightly).
const CascadeAnchorSchema = z.union([
	z.literal('surface'),
	z.strictObject({ overlay: z.string().min(1) }),
	z.strictObject({ mark: z.number().int().min(0) }),
	z.strictObject({ textAnimation: z.string().min(1) }),
	// A diagram Block element (ADR-0036) — the id of a `surface.diagram[]`
	// entry. Diagram reveals are cascade chains (node → edge draws to → next
	// node), so elements are anchorable exactly like overlays.
	z.strictObject({ block: z.string().min(1) })
]);
export type CascadeAnchor = z.infer<typeof CascadeAnchorSchema>;

const CascadeSchema = z.strictObject({
	anchor: CascadeAnchorSchema,
	event: z.enum(['start', 'end']),
	offsetMs: z.number()
});
export type Cascade = z.infer<typeof CascadeSchema>;

const OverlayAnimationSchema = z.strictObject({
	channels: OverlayChannelKeyframesSchema.optional(),
	cascade: CascadeSchema.optional()
});

// No cascade on the surface — it is the piece's timing root (marks and text
// animations anchor TO it), and a root that cascades to its own dependents is
// exactly the cycle class the validator rejects.
const SurfaceAnimationSchema = z.strictObject({
	channels: SurfaceChannelKeyframesSchema.optional()
});

export type OverlayChannelKeyframes = z.infer<typeof OverlayChannelKeyframesSchema>;
export type SurfaceChannelKeyframes = z.infer<typeof SurfaceChannelKeyframesSchema>;
export type OverlayAnimation = z.infer<typeof OverlayAnimationSchema>;
export type SurfaceAnimation = z.infer<typeof SurfaceAnimationSchema>;

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

export const BlockTypeSchema = z.enum([
	'paragraph',
	'node',
	'edge-arrow',
	'label',
	'stat-callout',
	'timeline-segment'
]);

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

// One task for the `checklist` Surface (ADR-0040). `checked` is the completion
// state; `strike` is the red marker draw-on window (fractions of the clip) for
// a checked item. A checked item with NO window is STATICALLY struck — the
// rule is fully drawn from frame 0, no draw-on. An unchecked item carries no
// strike at all (the GUI strips a stale window when unchecking). The window is
// a real, draggable timeline clip (`checklist-{index}` rows), like a mark
// timing — never a renderer constant.
const ChecklistItemSchema = z.object({
	text: z.string().min(1),
	checked: z.boolean(),
	// The build-in entrance (fractions of the clip). Present → this item reveals
	// on its own window (opacity + slide-from-right), so a list can build up
	// one item at a time; absent → the item is present from the block's own
	// entrance (the default stable-list behaviour). A real, draggable timeline
	// clip (`checklist-{index}` rows), never a renderer constant.
	enter: z
		.object({
			start: FractionSchema,
			duration: FractionSchema,
			ease: EaseSchema.optional()
		})
		.optional(),
	strike: z
		.object({
			start: FractionSchema,
			duration: FractionSchema,
			ease: EaseSchema.optional(),
			sound: SoundOverrideSchema.optional()
		})
		.optional()
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// `fps` accepts integers 1–120 plus the NTSC fractional literals
// (23.976 | 29.97 | 59.94) so a composition can state a 29.97 NDF edit's true
// rate (ADR-0042). The stored literal is display/authoring value only — every
// frame computation resolves it to an exact rational via `resolveFrameRate`
// (src/lib/utils/composition-timing.ts); ffmpeg receives `30000/1001`, never
// a rounded float. Existing integer-fps presets parse unchanged.
const TransportFpsSchema = z.union([
	z.number().int().min(1).max(120),
	z.literal([...NTSC_FRACTIONAL_FPS])
]);

const TransportSchema = z.object({
	orientation: VideoOrientationSchema,
	durationSeconds: z.number().min(0.1).max(600),
	fps: TransportFpsSchema,
	format: ExportFormatSchema
});

// paperColor / inkColor are OPTIONAL overrides (ADR-0038): absent, surfaces
// resolve the active Pack's core `fill-treatment` / `ink-treatment` through
// the ADR-0024 chain (see resolveTypographyColors in packs/resolve.ts);
// present, the explicit hex is an intentional departure that wins over the
// Pack. Every pre-ADR-0038 preset carries both hexes and parses unchanged.
const TypographySchema = z.object({
	fontFamily: FontFamilySchema,
	paperColor: HexColorSchema.optional(),
	inkColor: HexColorSchema.optional()
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
	sound: SoundOverrideSchema.optional(),
	// Welds this mark's enter start to another element (ADR-0035 §4) — the
	// declarative form of the A1/A2 choreography rules. `start` remains the
	// fallback when absent.
	cascade: CascadeSchema.optional()
});

const MarksStateSchema = z.object({
	defaults: z.partialRecord(AnnotationMarkStyleSchema, MarkAppearanceSchema),
	timings: z.array(MarkTimingSchema)
});

const TransitionSchema = z.object({
	start: FractionSchema,
	duration: FractionSchema,
	ease: EaseSchema,
	sound: SoundOverrideSchema.optional()
});

// ---- Diagram primitives (ADR-0036) ----
// Five Block types for art-directed docu diagrams — node / edge-arrow / label /
// stat-callout / timeline-segment — living in `surface.diagram[]` (the "diagram
// group on the Surface" placement ADR-0036 §3 left to this schema): elements
// share the Surface's coordinate space, and the group is pure JSON so it rides
// `presetToWireFormat`'s surface spread losslessly (the byte-identical
// round-trip gate). Positions are explicit composition-space fractions —
// auto-layout is rejected by the ADR; placement is authored (GUI drag / agent).
// Route is content; STROKE IS NOT — edge/node/arrowhead appearance resolves
// through Pack Roles (ADR-0036 §4).

const DiagramPointSchema = z.strictObject({ x: FractionSchema, y: FractionSchema });

// An edge endpoint: a node ref (`{ node: id }`, validated against the diagram's
// node elements) or an explicit composition-space point (`{ x, y }` — for edges
// that leave the graph, e.g. an arc to a map pin drawn as a raw point).
const DiagramEndpointSchema = z.union([
	z.strictObject({ node: z.string().min(1) }),
	DiagramPointSchema
]);

// DOM-rendered elements (node / label / stat-callout) take the full ADR-0035
// channel set — they are positioned mounts like overlays. `x`/`y` are
// composition-fraction deltas from the element's `position`; `scale` is
// absolute, seeded from the element's static `scale`.
const DiagramChannelKeyframesSchema = z.strictObject({
	opacity: createKeyframeTrackSchema(FractionSchema).optional(),
	x: createKeyframeTrackSchema(z.number()).optional(),
	y: createKeyframeTrackSchema(z.number()).optional(),
	scale: createKeyframeTrackSchema(z.number().min(0.1).max(8)).optional(),
	rotation: createKeyframeTrackSchema(z.number()).optional()
});

// Stroke-drawn elements (edge-arrow / timeline-segment) expose `opacity` only —
// their reveal is the annotation stroke-draw scalar riding the enter window
// (ADR-0036 §4); a transform channel fighting the drawn path is exactly the
// double-motion mystery ADR-0035 §2 bans.
const DiagramStrokeChannelKeyframesSchema = z.strictObject({
	opacity: createKeyframeTrackSchema(FractionSchema).optional()
});

const DiagramAnimationSchema = z.strictObject({
	channels: DiagramChannelKeyframesSchema.optional(),
	cascade: CascadeSchema.optional()
});

const DiagramStrokeAnimationSchema = z.strictObject({
	channels: DiagramStrokeChannelKeyframesSchema.optional(),
	cascade: CascadeSchema.optional()
});

// Shared timed-element fields. `enter`/`exit` are the standard Transition sugar
// (start/duration/ease/sound) and draw as the element's unified timeline clip.
// `ink` is a Role SELECTION, not a colour: 'accent' routes the element (label
// ink, node glyphs, stroke) to the active Pack's core accent-treatment so a
// diagram can carry emphasis hierarchy; absent/'ink' rides the composition ink.
// Packs keep owning what accent looks like (ADR-0036 §4 — appearance is never
// schema); consumers read `?? 'ink'` (never a Zod .default — the
// validateOverlayContents precedent: defaults don't reliably reach runtime).
const diagramElementBase = {
	id: z.string().min(1),
	ink: z.enum(['ink', 'accent']).optional(),
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional()
};

// A labeled point in the diagram. `form` is content (a map wants pins, a
// flowchart wants boxes — the author picks); HOW a pin/box/dot looks is the
// Pack's `node.form`-dimension Role, never schema.
const DiagramNodeSchema = z.strictObject({
	...diagramElementBase,
	type: z.literal('node'),
	position: DiagramPointSchema,
	form: z.enum(['pin', 'box', 'dot']),
	text: z.string().optional(),
	scale: z.number().min(0.25).max(4).optional(),
	animation: DiagramAnimationSchema.optional()
});

// A directed connection. Route is authored, never auto-routed (ADR-0036 §4):
// endpoints plus ONE optional control point select straight / elbow / quadratic
// arc. `control` absent → the renderer's deterministic default (elbow bends at
// (to.x, from.y); arc bows perpendicular from the midpoint). `direction` places
// the arrowhead: forward = at `to` (the default when absent), both, or none
// (a bare connector).
const DiagramEdgeArrowSchema = z.strictObject({
	...diagramElementBase,
	type: z.literal('edge-arrow'),
	from: DiagramEndpointSchema,
	to: DiagramEndpointSchema,
	route: z.enum(['straight', 'elbow', 'arc']),
	control: DiagramPointSchema.optional(),
	direction: z.enum(['forward', 'both', 'none']).optional(),
	animation: DiagramStrokeAnimationSchema.optional()
});

// Free text annotating a position — the diagram's caption voice.
const DiagramLabelSchema = z.strictObject({
	...diagramElementBase,
	type: z.literal('label'),
	position: DiagramPointSchema,
	text: z.string().min(1),
	scale: z.number().min(0.25).max(4).optional(),
	animation: DiagramAnimationSchema.optional()
});

// A number that builds — reuses the counter overlay's roll behaviour. The roll
// runs over [rollStart, rollStart + rollWindow] (fractions of the clip) then
// HOLDS the landed value; absent, renderers read rollStart ?? enter window's
// end and rollWindow ?? 0.5 (never a Zod .default() — the
// validateOverlayContents precedent: defaults don't reliably reach runtime).
const DiagramStatCalloutSchema = z.strictObject({
	...diagramElementBase,
	type: z.literal('stat-callout'),
	position: DiagramPointSchema,
	from: z.number(),
	to: z.number(),
	format: z.enum(['integer', 'currency', 'percent', 'timecode']).optional(),
	label: z.string().optional(),
	scale: z.number().min(0.25).max(4).optional(),
	rollStart: FractionSchema.optional(),
	rollWindow: FractionSchema.optional(),
	animation: DiagramAnimationSchema.optional()
});

// A spanned interval with endpoints — the H↔V reflow stress case, so both ends
// are explicit points (a horizontal band reflows to a vertical rail by
// repositioning, not by schema change).
const DiagramTimelineSegmentSchema = z.strictObject({
	...diagramElementBase,
	type: z.literal('timeline-segment'),
	from: DiagramPointSchema,
	to: DiagramPointSchema,
	label: z.string().optional(),
	animation: DiagramStrokeAnimationSchema.optional()
});

const DiagramElementSchema = z.discriminatedUnion('type', [
	DiagramNodeSchema,
	DiagramEdgeArrowSchema,
	DiagramLabelSchema,
	DiagramStatCalloutSchema,
	DiagramTimelineSegmentSchema
]);

// The diagram group: ids must be unique (they are timeline-row / cascade
// identities), and every edge endpoint node ref must resolve to a `node`
// element in the same group — fail fast at parse time, never a runtime guess.
const DiagramSchema = z.array(DiagramElementSchema).superRefine((elements, ctx) => {
	const ids = new Set<string>();
	for (let i = 0; i < elements.length; i += 1) {
		if (ids.has(elements[i].id)) {
			ctx.addIssue({
				code: 'custom',
				path: [i, 'id'],
				message: `Duplicate diagram[].id "${elements[i].id}"; ids must be unique within a surface.`
			});
		}
		ids.add(elements[i].id);
	}

	const nodeIds = new Set(
		elements.filter((element) => element.type === 'node').map((element) => element.id)
	);
	for (let i = 0; i < elements.length; i += 1) {
		const element = elements[i];
		if (element.type !== 'edge-arrow') {
			continue;
		}
		for (const end of ['from', 'to'] as const) {
			const endpoint = element[end];
			if ('node' in endpoint && !nodeIds.has(endpoint.node)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, end, 'node'],
					message: `edge-arrow "${element.id}" ${end} references node "${endpoint.node}", which is not a node element in this diagram.`
				});
			}
		}
	}
});

export type DiagramPoint = z.infer<typeof DiagramPointSchema>;
export type DiagramEndpoint = z.infer<typeof DiagramEndpointSchema>;
export type DiagramChannelKeyframes = z.infer<typeof DiagramChannelKeyframesSchema>;
export type DiagramStrokeChannelKeyframes = z.infer<typeof DiagramStrokeChannelKeyframesSchema>;
export type DiagramAnimation = z.infer<typeof DiagramAnimationSchema>;
export type DiagramStrokeAnimation = z.infer<typeof DiagramStrokeAnimationSchema>;
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;
export type DiagramEdgeArrow = z.infer<typeof DiagramEdgeArrowSchema>;
export type DiagramLabel = z.infer<typeof DiagramLabelSchema>;
export type DiagramStatCallout = z.infer<typeof DiagramStatCalloutSchema>;
export type DiagramTimelineSegment = z.infer<typeof DiagramTimelineSegmentSchema>;
export type DiagramElement = z.infer<typeof DiagramElementSchema>;

const SurfaceTypeSchema = z.enum([
	'paper',
	'plain',
	'newspaper',
	'pullquote-on-photo',
	'chapter-card',
	'title-sequence',
	'type-hero',
	'web-document',
	'website-screenshot',
	'imessage',
	'checklist'
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
export const WEB_DOCUMENT_SITES = WebDocumentSiteSchema.options;

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
	// Persisted screenshot bytes for the website-screenshot Surface. The live
	// page is author-time input only; preview/export read this content-addressed
	// user-assets URL.
	imageUrl: z.string().optional(),
	// Ordered conversation for the `imessage` Surface (ignored by every other
	// surface). The thread-level contact name reuses `author`; each message
	// carries its own side/text/tapback/receipt. Per ADR-0031.
	messages: z.array(ChatMessageSchema).optional(),
	// Optional logo lockup for the `checklist` Surface (ignored by every other
	// surface): an uploaded-image URL (the `/api/user-assets/…` shape, like
	// `avatarUrl`) rendered LARGE in a white circular chip in place of the
	// panel title. When it fails to load the renderer falls back to `title`.
	logoUrl: z.string().optional(),
	// Ordered task list for the `checklist` Surface (ignored by every other
	// surface). The panel title reuses `title`; each item carries its own
	// checked state + strike draw-on window. Per ADR-0040.
	items: z.array(ChecklistItemSchema).optional()
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
	// Chrome mode for the `imessage` and `checklist` Surfaces (ignored by every
	// other Surface). 'window' (the default) is the full-chrome presentation —
	// the faithful Messages window on imessage; the bordered card plate on
	// checklist. 'none' is the chromeless presentation: bare bubbles (imessage,
	// with a substrate-darken vignette) or bare numbered type with a hard
	// legibility shadow (checklist) floating directly over footage. Absent means
	// 'window'; renderers MUST read `chrome ?? 'window'` — a Zod `.default()` is
	// not reliably applied to pre-existing runtime state (the
	// `validateOverlayContents` precedent). See docs/adr/0037-imessage-chrome-mode.md
	// and docs/adr/0040-checklist-surface.md.
	chrome: z.enum(['window', 'none']).optional(),
	// Optional per-Surface variant id, picked up by Surface families that use
	// the variants-as-data convention per ADR-0020. Unused by single-shape
	// Surfaces. The Surface\'s Pipeline validates the value against its
	// VARIANT_IDS at render time.
	variant: z.string().optional(),
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional(),
	// Composition-owned motion channels (ADR-0035). When `animation.channels`
	// is present the surface's intrinsic enter/exit motion-form does not run.
	animation: SurfaceAnimationSchema.optional(),
	backgroundVisibility: FractionSchema.optional(),
	// Diagram Block elements on this Surface (ADR-0036) — explicit
	// composition-space placement, revealed with stroke-draw + Cascade. Works
	// full-frame (paper / chapter-card) and over footage (a transparent surface
	// carrying only diagram Blocks). Every Surface may carry a diagram group.
	diagram: DiagramSchema.optional()
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
	scale: z.number().min(0.1).max(8).optional(),
	// Static rotation in degrees about the anchor point (ADR-0035; absorbs task
	// 5vcak6og). The base value the `rotation` keyframe channel seeds from —
	// authored spins beyond a full turn live in the channel, not here.
	rotation: z.number().min(-360).max(360).optional()
});

const OverlaySchema = z.object({
	type: z.string(),
	id: z.string(),
	content: z.unknown(),
	position: OverlayPositionSchema,
	enter: TransitionSchema.optional(),
	exit: TransitionSchema.optional(),
	// Composition-owned motion channels + cascade timing weld (ADR-0035). When
	// `animation.channels` is present the composition takes the pen: the
	// overlay's intrinsic motion-form (Identity Spec `motion-form`) does not run.
	animation: OverlayAnimationSchema.optional(),
	// Focal-distance plane for depth-of-field (ADR-0021 semantics / ADR-0027 v1).
	// 0 = focal plane (sharp), 1 = max defocus. Absent → the Overlay-Layer default
	// (0.7) is applied at render; a per-instance value overrides it so one overlay
	// can sit nearer the focal plane than another. Only consulted when a
	// depth-of-field Effect is present; inert otherwise.
	z: FractionSchema.optional()
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
// Slot enums match the surface / overlay content slots Supers ships today plus
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
	// Welds this text animation's enter start to another element (ADR-0035 §4).
	// `enter.start` remains the fallback when absent.
	cascade: CascadeSchema.optional(),
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

// The timeline-row identity a cascade anchor resolves to — shared by the
// existence check, the cycle walk, and the human-readable cycle message.
function cascadeAnchorKey(anchor: CascadeAnchor): string {
	if (anchor === 'surface') {
		return 'surface';
	}
	if ('overlay' in anchor) {
		return `overlay:${anchor.overlay}`;
	}
	if ('mark' in anchor) {
		return `mark:${anchor.mark}`;
	}
	if ('block' in anchor) {
		return `block:${anchor.block}`;
	}
	return `textAnimation:${anchor.textAnimation}`;
}

// ---- Captions (creator blocks, grilled 2026-07-09) ----
// A time-coded caption track — the SRT domain. Cues carry ABSOLUTE
// milliseconds (SRT's own clock, not clip fractions): captions are welded to
// speech, and re-timing the transport must not stretch them. Per-word timing
// for the karaoke/word-pop styles is DERIVED at render time (proportional to
// word length within each cue) so the schema stays pure SRT data — an
// agent, the CLI importer, and the GUI SRT editor all read/write the same
// shape. Appearance is two-lane: the faithful social styles (karaoke /
// word-pop — the register creators expect, pack-independent) and the `pack`
// style, which dresses the line from the active Pack.
const CaptionCueSchema = z.strictObject({
	id: z.string().min(1),
	startMs: z.number().min(0),
	endMs: z.number().min(0),
	text: z.string().min(1)
});
export type CaptionCue = z.infer<typeof CaptionCueSchema>;

const CaptionsSchema = z.strictObject({
	style: z.enum(['karaoke', 'word-pop', 'pack']),
	// Active-word accent (karaoke pill / word-pop ink). Absent → the style's
	// default, read `?? '#ffd608'` at the consumer (never a Zod .default()).
	accent: HexColorSchema.optional(),
	// Caption band centre as a fraction of frame height. Absent → orientation-
	// aware: 0.8 horizontal, 0.75 vertical (vertical platform UI occludes the
	// bottom ~21% in the expanded-description state — C5's vertical band).
	y: FractionSchema.optional(),
	// Size multiplier on the style's natural scale. Absent → 1.
	scale: z.number().min(0.25).max(4).optional(),
	cues: z.array(CaptionCueSchema).superRefine((cues, ctx) => {
		const ids = new Set<string>();
		for (let i = 0; i < cues.length; i += 1) {
			if (ids.has(cues[i].id)) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'id'],
					message: `Duplicate captions.cues[].id "${cues[i].id}"; ids must be unique.`
				});
			}
			ids.add(cues[i].id);
			if (cues[i].endMs <= cues[i].startMs) {
				ctx.addIssue({
					code: 'custom',
					path: [i, 'endMs'],
					message: `Caption cue "${cues[i].id}" must end after it starts (${cues[i].startMs} → ${cues[i].endMs}).`
				});
			}
		}
	})
});
export type Captions = z.infer<typeof CaptionsSchema>;
export type CaptionStyle = Captions['style'];

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
		stage: StageSchema.optional(),
		captions: CaptionsSchema.optional()
	})
	.superRefine((state, ctx) => {
		// Cascade graph validation (ADR-0035 §4): every anchor ref must resolve
		// to a real element, and anchor chains must be acyclic. Fail fast at
		// parse time — never a runtime guess.
		const edges = new Map<string, { anchor: Cascade['anchor']; path: (string | number)[] }>();

		for (let i = 0; i < state.overlays.length; i += 1) {
			const cascade = state.overlays[i].animation?.cascade;
			if (cascade) {
				edges.set(`overlay:${state.overlays[i].id}`, {
					anchor: cascade.anchor,
					path: ['overlays', i, 'animation', 'cascade']
				});
			}
		}
		for (let i = 0; i < state.marks.timings.length; i += 1) {
			const cascade = state.marks.timings[i].cascade;
			if (cascade) {
				edges.set(`mark:${i}`, {
					anchor: cascade.anchor,
					path: ['marks', 'timings', i, 'cascade']
				});
			}
		}
		for (let i = 0; i < state.textAnimations.length; i += 1) {
			const cascade = state.textAnimations[i].cascade;
			if (cascade) {
				edges.set(`textAnimation:${state.textAnimations[i].id}`, {
					anchor: cascade.anchor,
					path: ['textAnimations', i, 'cascade']
				});
			}
		}
		const diagram = state.surface.diagram ?? [];
		for (let i = 0; i < diagram.length; i += 1) {
			const cascade = diagram[i].animation?.cascade;
			if (cascade) {
				edges.set(`block:${diagram[i].id}`, {
					anchor: cascade.anchor,
					path: ['surface', 'diagram', i, 'animation', 'cascade']
				});
			}
		}

		const overlayIds = new Set(state.overlays.map((overlay) => overlay.id));
		const textAnimationIds = new Set(state.textAnimations.map((entry) => entry.id));
		const blockIds = new Set(diagram.map((element) => element.id));

		for (const edge of edges.values()) {
			const anchor = edge.anchor;
			if (anchor === 'surface') {
				continue;
			}
			if ('overlay' in anchor && !overlayIds.has(anchor.overlay)) {
				ctx.addIssue({
					code: 'custom',
					path: [...edge.path, 'anchor'],
					message: `cascade.anchor overlay "${anchor.overlay}" does not match any overlays[].id.`
				});
			} else if ('mark' in anchor && anchor.mark >= state.marks.timings.length) {
				ctx.addIssue({
					code: 'custom',
					path: [...edge.path, 'anchor'],
					message: `cascade.anchor mark ${anchor.mark} is out of range — marks.timings has ${state.marks.timings.length} entries.`
				});
			} else if ('textAnimation' in anchor && !textAnimationIds.has(anchor.textAnimation)) {
				ctx.addIssue({
					code: 'custom',
					path: [...edge.path, 'anchor'],
					message: `cascade.anchor textAnimation "${anchor.textAnimation}" does not match any textAnimations[].id.`
				});
			} else if ('block' in anchor && !blockIds.has(anchor.block)) {
				ctx.addIssue({
					code: 'custom',
					path: [...edge.path, 'anchor'],
					message: `cascade.anchor block "${anchor.block}" does not match any surface.diagram[].id.`
				});
			}
		}

		// Cycle walk. Each cascading element has exactly one outgoing edge (its
		// anchor), so a cycle is a chain that revisits itself. Report each cycle
		// once, naming the loop.
		const acyclic = new Set<string>();
		const inReportedCycle = new Set<string>();
		for (const start of edges.keys()) {
			if (acyclic.has(start) || inReportedCycle.has(start)) {
				continue;
			}
			const chain: string[] = [];
			const chainSet = new Set<string>();
			let node = start;
			let cycled = false;
			while (edges.has(node) && !acyclic.has(node) && !inReportedCycle.has(node)) {
				if (chainSet.has(node)) {
					const cycle = chain.slice(chain.indexOf(node));
					const edge = edges.get(node);
					if (edge) {
						ctx.addIssue({
							code: 'custom',
							path: edge.path,
							message: `Cascade cycle: ${[...cycle, node].join(' → ')}. Anchor chains must end at an element without a cascade.`
						});
					}
					for (const key of cycle) {
						inReportedCycle.add(key);
					}
					cycled = true;
					break;
				}
				chain.push(node);
				chainSet.add(node);
				node = cascadeAnchorKey(edges.get(node)!.anchor);
			}
			if (!cycled) {
				for (const key of chain) {
					acyclic.add(key);
				}
			}
		}
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
		// No paperColor / inkColor: a fresh composition carries no typography
		// colour overrides and rides the active Pack's core fill/ink (ADR-0038).
		typography: {
			fontFamily: 'serif'
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

function getMarkDefaults(
	marks: MarksState,
	style: AnnotationMarkStyle,
	fallbackColor?: string
): MarkAppearance {
	const authored = marks.defaults[style];
	if (authored) {
		return authored;
	}
	return fallbackColor === undefined
		? FALLBACK_APPEARANCE
		: { ...FALLBACK_APPEARANCE, color: fallbackColor };
}

/**
 * `fallbackColor` is used when neither the timing nor the preset's authored
 * `marks.defaults` carries a colour. Render and inspector call sites pass the
 * active Pack's `<style>.fill` → core-accent chain (`readMarkColor` in
 * engine-state) so an unauthored mark wears the Pack, not a baked literal
 * (ADR-0024/0038). Colour-blind callers (sound cues) may omit it.
 */
export function resolveMarkForIndex(
	style: AnnotationMarkStyle,
	index: number,
	marks: MarksState,
	fallbackColor?: string
): ResolvedMark {
	const defaults = getMarkDefaults(marks, style, fallbackColor);
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
	/**
	 * Checklist item strikes only (ADR-0040): the item's authored draw-on
	 * window, or 'static' for a checked item with no window (the rule is fully
	 * drawn from frame 0 — no tween, no sound cue). Absent on body/message
	 * marks, whose timing lives in `marks.timings[]`.
	 */
	window?: { start: number; duration: number; ease?: Ease } | 'static';
	/** The item strike's per-motion sound override (checklist marks only). */
	sound?: SoundOverride;
	/** Index into `content.items[]` for checklist item strikes. */
	itemIndex?: number;
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

	// Checklist item strikes (ADR-0040): one `strike` instance per CHECKED
	// item, in item order — matching the DOM order of the checklist
	// CanvasSource's data-annotation-mark spans (the title carries no marks;
	// items render after it, and only checked items emit a mark span). Timing
	// lives ON the item (`window` — a draw-on window, or 'static'), never in
	// `marks.timings[]`.
	for (const [itemIndex, item] of (content.items ?? []).entries()) {
		const start = cursor;
		const end = cursor + item.text.length;
		if (item.checked) {
			result.push({
				style: 'strike',
				text: item.text,
				startChar: start,
				endChar: end,
				window: item.strike ?? 'static',
				sound: item.strike?.sound,
				itemIndex
			});
		}
		cursor = end + 2;
	}

	return result;
}

export const PRESET_SCHEMA_ID = 'supers@1' as const;

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
