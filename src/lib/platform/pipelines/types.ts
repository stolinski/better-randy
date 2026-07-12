import type { z } from 'zod';
import type { Component } from 'svelte';
import type { d } from 'typegpu';

import type {
	AnnotationFrameLayout,
	AnnotationMarkLayout,
	Block,
	BlockType
} from '$lib/annotations/annotation-marks';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import type {
	DiagramElement,
	Effect,
	Overlay,
	OverlayPosition,
	SurfaceState,
	Transition
} from '$lib/platform/engine-schema';
import type { GpuHost } from '$lib/platform/gpu-host';
import type { ResolvedDiagramStroke } from '$lib/platform/packs/resolve';

// ---------------- Annotations ----------------

export type AnnotationKind = 'decorative' | 'focal';

export interface AnnotationDrawContext {
	bounds: AnnotationFrameLayout;
	canvasHeight: number;
	canvasWidth: number;
	color: string;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	intensity: number;
	layout: AnnotationMarkLayout;
	markIndex: number;
	paperLayout: AnnotationFrameLayout;
	progress: number;
}

export interface AnnotationFocalSlot {
	dim: number;
	magnify: number;
	rect: { x: number; y: number; width: number; height: number };
	style: AnnotationMarkStyle;
	tear: number;
}

export interface AnnotationRenderer {
	appliesTo: readonly (BlockType | 'block')[];
	kind: AnnotationKind;
	style: AnnotationMarkStyle;
	draw?(ctx: AnnotationDrawContext): void;
	computeFocalSlot?(ctx: AnnotationDrawContext): AnnotationFocalSlot;
}

// ---------------- Blocks ----------------

/**
 * The Block layer's full vocabulary: the body-text `paragraph` (living in
 * `content.body`) plus the five diagram primitives (ADR-0036, living in
 * `surface.diagram[]`). `AnnotationBody` stays paragraph-only — diagram
 * elements are positioned Blocks, not text flow.
 */
export type EngineBlock = Block | DiagramElement;

export interface BlockRenderContext<TBlock extends EngineBlock = EngineBlock> {
	block: TBlock;
	host: GpuHost;
	timestamp: number;
}

export interface BlockRenderer<TBlock extends EngineBlock = EngineBlock> {
	type: TBlock['type'];
	schema?: z.ZodType<TBlock>;
	CanvasSource?: Component<{ block: TBlock }>;
	Editor?: Component<{ block: TBlock }>;
	Inspector?: Component<{ block: TBlock }>;
	render?(ctx: BlockRenderContext<TBlock>): void;
}

/**
 * Diagram stroke inputs (ADR-0036 §4), carried in `SurfaceRenderInputs` when
 * the surface declares a diagram. The pipelines draw edge-arrow /
 * timeline-segment into their marks canvas via `drawDiagramStrokes`;
 * `drawProgressById` is the draw-on scalar (1 for channel-owned elements),
 * `alphaById` the visibility fade (exit sugar or authored opacity channel).
 * `stroke.color` arrives resolved — the `'ink'` sentinel is substituted with
 * the composition's resolved ink (the `typography.inkColor` override when
 * authored, else the Pack's core `ink-treatment` — ADR-0038) before render.
 */
export interface DiagramStrokeInputs {
	elements: readonly DiagramElement[];
	drawProgressById: Readonly<Record<string, number>>;
	alphaById: Readonly<Record<string, number>>;
	stroke: ResolvedDiagramStroke;
	/** The Pack's core accent colour — elements declaring `ink: 'accent'` stroke in this. */
	accentColor: string;
}

// ---------------- Surfaces ----------------

export interface PipelineFactoryOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
}

export interface SurfaceAnimState {
	markProgresses: number[];
}

export interface SurfaceRenderInputs {
	animState: SurfaceAnimState;
	backgroundVisibility?: number;
	// Whether the surface background reads as dark (light text on it), derived
	// per-frame from the surface's `paperColor` luminance. Selects the highlight
	// blend mode: dark → punch light text to ink under the amber band; light →
	// multiply (paper). When omitted the pipeline falls back to its creation-time
	// `highlightSurface` default.
	highlightDarkSurface?: boolean;
	markColorsByIndex: readonly string[];
	markIntensityByIndex: readonly number[];
	textAnimAlphaByMarkIndex?: readonly number[];
	timestamp: number;
	// Diagram stroke elements to draw into the marks canvas (ADR-0036); absent
	// when the surface carries no diagram.
	diagram?: DiagramStrokeInputs;
}

export interface SurfaceRenderInstance {
	dispose(): void;
	getOutputTexture(): GPUTexture;
	render(inputs: SurfaceRenderInputs): void;
	uploadDom(): void;
}

/**
 * Per-frame context forwarded into every pack function. Used by
 * `EffectPassDefinition.pack` (effect-chain layer) and `ShaderPass.packUniforms`
 * (surface + overlay layer). The time values derive from the same
 * paused-timeline scrub so preview and export agree at every frame.
 *
 *   - `progress`  — 0..1 across the clip
 *   - `timestamp` — seconds elapsed
 *   - `canvasWidth` / `canvasHeight` — composition dimensions in pixels, for
 *     resolution-dependent shaders (pixel grids, px-sized kernels) and for
 *     converting pixel-space bounds to UV without hardcoding the resolution
 *     (ADR-0012 amendment)
 */
export interface EffectPackContext {
	progress: number;
	timestamp: number;
	canvasWidth: number;
	canvasHeight: number;
}

/**
 * Declarative single-pass fragment work, used by both `OverlayRenderer.shaderPass`
 * (per ADR-0005) and `SurfaceRenderer.shaderPass` (per ADR-0008).
 *
 * The pass runs once between the host's texture upload and the final composite.
 * It is intentionally limited to a single fragment pass with self-contained
 * uniforms — no cross-layer reads, no multi-pass dependencies. The first
 * consumers are `newspaper-physics` on the newspaper Surface (halftone + ink
 * bleed) and the `tear-edge` pass on collage-card overlays.
 *
 * `TContent` carries the per-target content used when packing uniforms (the
 * Overlay's `content` shape for overlays, the `SurfaceState` for surfaces).
 */
export interface ShaderPass<TContent = unknown> {
	/** TypeGPU `d.struct(...)` describing the WGSL uniform layout. */
	uniforms: d.WgslStruct;
	/**
	 * True when the pass paints the composition's ENVIRONMENT (a full-frame
	 * backdrop behind the content) rather than surface-local physics. The depth
	 * stage (ADR-0028) supersedes environment passes with its real scene — a
	 * backdrop plane at depth — so the stage render path skips them; the flat
	 * path runs them unchanged.
	 */
	environment?: boolean;
	/** WGSL fragment body. Same calling convention as `EffectPassDefinition.fragmentBody`. */
	wgsl: string;
	/**
	 * Packs target state into the uniform layout's record shape.
	 *
	 * `ctx` carries the timeline-driven `progress` (0..1 across the clip) and
	 * `timestamp` (seconds elapsed), forwarded from the same paused-timeline
	 * scrub the surface render reads, so preview and export agree at every
	 * frame — plus the composition's canvas dimensions. Same
	 * `EffectPackContext` shape as the effect-chain side.
	 */
	packUniforms(
		target: TContent,
		bounds: { x: number; y: number; width: number; height: number },
		ctx: EffectPackContext
	): Record<string, unknown>;
}

// What input rows the Controls panel should render for this surface.
// The panel only shows a row if the surface declares it AND the state has a
// value (or, for `body`, the surface is always-body).
export interface SurfaceControlsMetadata {
	title?: boolean;
	sourceUrl?: boolean;
	author?: boolean;
	/** Author affiliation chip (e.g. "Google Brain"), rendered beside the author. */
	affiliation?: boolean;
	source?: boolean;
	dateLabel?: boolean;
	kicker?: boolean;
	/** Small label above the body (e.g. "Abstract"). */
	bodyLabel?: boolean;
	/**
	 * Secondary text slot paired with the title by family variants (type-hero
	 * `pair` per ADR-0020). The inspector shows the row only while the active
	 * variant actually renders the slot.
	 */
	counterpoint?: boolean;
	/**
	 * Author avatar image URL (the `web-document` twitter mock's profile photo).
	 * Only the twitter site consumes it, so the inspector gates the row on
	 * `surface.site`.
	 */
	avatarUrl?: boolean;
	body?: 'always' | 'optional' | 'never';
	/**
	 * Surface renders a per-site mock selected by `surface.site` (ADR-0030) —
	 * the inspector shows a Site select.
	 */
	site?: boolean;
	/**
	 * Surface content is an ordered `content.messages[]` conversation
	 * (ADR-0031) — the inspector shows the Messages editor (per-bubble text /
	 * side / tapback / receipt / typing). Per-bubble timing stays on the
	 * timeline's message tracks.
	 */
	messages?: boolean;
	/**
	 * Surface supports the `chrome: 'window' | 'none'` mode (ADR-0037) — the
	 * inspector shows a Window / None select bound to `surface.chrome`.
	 */
	chrome?: boolean;
	typography?: boolean;
	paperColor?: boolean;
	inkColor?: boolean;
	backgroundVisibility?: boolean;
	enterExit?: boolean;
}

export interface SurfaceRenderer {
	type: string;
	label: string;
	controls: SurfaceControlsMetadata;
	/**
	 * Variant ids for Surface families using the variants-as-data convention
	 * (ADR-0020) — data only, never components. When declared, the inspector
	 * renders a Variant select bound to `surface.variant`; the first id is the
	 * family's effective value when `variant` is absent. Omitted by
	 * single-shape Surfaces.
	 */
	variantIds?: readonly string[];
	CanvasSource: Component<{ element?: HTMLElement | null }>;
	createPipeline(opts: PipelineFactoryOptions): SurfaceRenderInstance;
	defaults(): SurfaceState;
	/**
	 * Optional single-pass fragment work run between DOM upload and final composite
	 * (ADR-0008, invocation wired per ADR-0010). The first consumer is
	 * `newspaper-physics` on the `newspaper` Surface (halftone dot screen + ink
	 * bleed at glyph edges); `Workspace` feeds declared surface passes to the
	 * ShaderPassDispatcher ahead of the effect chain.
	 */
	shaderPass?: ShaderPass<SurfaceState>;
	/**
	 * When true, this surface renders an alpha-silhouetted card/clipping whose
	 * outer edge accepts the active Pack's structural edge Role
	 * (`<type>.edge` → core `edge-treatment`, ADR-0024). `Workspace` resolves
	 * the Role via `resolveEdgeTreatment` and, for any value other than
	 * `none`, dispatches the shared edge-treatment ShaderPass ahead of the
	 * surface's own `shaderPass`. Full-frame surfaces and surfaces whose alpha
	 * boundaries are glyphs (not a card silhouette) must not opt in.
	 */
	edgeTreatment?: boolean;
}

// ---------------- Overlays ----------------

export interface OverlayRenderContext<TContent = unknown> {
	bounds: AnnotationFrameLayout;
	content: TContent;
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	progress: number;
}

export interface OverlayDefaults<TContent = unknown> {
	content: TContent;
	position: OverlayPosition;
	enter?: Transition;
	exit?: Transition;
}

export interface OverlayEditorProps<TContent = unknown> {
	overlay: Overlay & { content: TContent };
}

export interface OverlayCanvasSourceProps<TContent = unknown> {
	content: TContent;
}

export interface OverlayRenderer<TContent = unknown> {
	type: string;
	label: string;
	schema: z.ZodType<TContent>;
	defaults(): OverlayDefaults<TContent>;
	CanvasSource: Component<OverlayCanvasSourceProps<TContent>>;
	Editor: Component<OverlayEditorProps<TContent>>;
	Inspector?: Component<OverlayEditorProps<TContent>>;
	/**
	 * When true, OverlayMount skips the default 32px translateY entry droop.
	 * Set for overlay types whose CanvasSource manages its own per-element
	 * motion (e.g. staggered opacity-only variants) where a container-level
	 * positional offset conflicts with the intended animation.
	 */
	disableEntryOffset?: boolean;
	// Optional pixel-level renderer; the unified render path captures DOM via
	// HTML-in-canvas through the overlay's CanvasSource, so this is reserved
	// for offscreen / worker compositing paths and is not currently invoked.
	render?(ctx: OverlayRenderContext<TContent>): void;
	/**
	 * Optional single-pass fragment work run between this overlay's DOM upload and
	 * the final overlay composite (ADR-0005). Used for torn-edge / fiber / hard
	 * offset shadow chrome on collage-card overlays that can't be expressed in DOM.
	 */
	shaderPass?: ShaderPass<TContent>;
}

// ---------------- Effects ----------------

export interface EffectEditorProps<TParams = unknown> {
	effect: Effect & { params: TParams };
}

// Each effect contributes a self-contained WGSL fragment body that operates on
// a sampled input. The effect-chain executor wraps this body in a full-screen
// pass with three bind-group slots: input texture, sampler, and a `uniforms`
// struct whose layout the effect declares via `paramsStruct`.
//
// The fragment body has access to:
//   - `in.uv: vec2f`              — full-screen UV
//   - `inputSample: vec4f`         — `textureSample(layout.$.inputTexture, layout.$.samp, in.uv)`
//   - `layout.$.uniforms`          — the effect's `paramsStruct` instance
//
// The body must `return vec4f(...);` with the post-effect color.
//
// Effects must preserve alpha for transparent-overlay output (rubric E4):
// don't color-grade the alpha channel.
//
// `pack(params, ctx)` is called once per frame. The `ctx` carries the
// timeline-driven `progress` (0..1 across the clip) and `timestamp` (seconds
// elapsed). Both derive from the same paused-timeline scrub, so preview and
// export produce identical pixels at the same time (frame-determinism
// contract). Time-driven shaders write `ctx.progress` or `ctx.timestamp` into
// a uniform field declared in `paramsStruct`. See `EffectPackContext` above
// for the shared shape with `ShaderPass.packUniforms`.
export interface EffectPassDefinition<TParams> {
	paramsStruct: d.WgslStruct; // A TypeGPU describing the WGSL uniform layout
	fragmentBody: string;
	pack(params: TParams, ctx: EffectPackContext): Record<string, unknown>;
}

export interface EffectRenderer<TParams = unknown> {
	type: string;
	label: string;
	schema: z.ZodType<{ type: string; id: string; params: TParams }>;
	defaults(): { params: TParams };
	pass: EffectPassDefinition<TParams>;
	Editor?: Component<EffectEditorProps<TParams>>;
	Inspector?: Component<EffectEditorProps<TParams>>;
}
