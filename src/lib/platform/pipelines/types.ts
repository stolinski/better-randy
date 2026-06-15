import type { z } from 'zod';
import type { Component } from 'svelte';

import type {
	AnnotationFrameLayout,
	AnnotationMarkLayout,
	Block,
	BlockType
} from '$lib/annotations/annotation-marks';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import type {
	Effect,
	Overlay,
	OverlayPosition,
	SurfaceState,
	Transition
} from '$lib/platform/engine-schema';
import type { GpuHost } from '$lib/platform/gpu-host';

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

export interface BlockRenderContext<TBlock extends Block = Block> {
	block: TBlock;
	host: GpuHost;
	timestamp: number;
}

export interface BlockRenderer<TBlock extends Block = Block> {
	type: TBlock['type'];
	schema?: z.ZodType<TBlock>;
	CanvasSource?: Component<{ block: TBlock }>;
	Editor?: Component<{ block: TBlock }>;
	Inspector?: Component<{ block: TBlock }>;
	render?(ctx: BlockRenderContext<TBlock>): void;
}

// ---------------- Surfaces ----------------

export interface PipelineFactoryOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
}

export interface SurfaceRenderInputs {
	timestamp: number;
}

export interface SurfaceRenderInstance {
	dispose(): void;
	render(inputs: SurfaceRenderInputs): void;
	uploadDom(): void;
}

/**
 * Time-driven uniforms forwarded into every per-frame pack function. Used by
 * `EffectPassDefinition.pack` (effect-chain layer) and `ShaderPass.packUniforms`
 * (surface + overlay layer). Both values derive from the same paused-timeline
 * scrub so preview and export agree at every frame.
 *
 *   - `progress`  — 0..1 across the clip
 *   - `timestamp` — seconds elapsed
 */
export interface EffectPackContext {
	progress: number;
	timestamp: number;
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
	uniforms: unknown;
	/** WGSL fragment body. Same calling convention as `EffectPassDefinition.fragmentBody`. */
	wgsl: string;
	/**
	 * Packs target state into the uniform layout's record shape.
	 *
	 * `ctx` carries the timeline-driven `progress` (0..1 across the clip) and
	 * `timestamp` (seconds elapsed), forwarded from the same paused-timeline
	 * scrub the surface render reads, so preview and export agree at every
	 * frame. Mirrors `EffectPackContext` on the effect-chain side.
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
	source?: boolean;
	dateLabel?: boolean;
	kicker?: boolean;
	body?: 'always' | 'optional' | 'never';
	typography?: boolean;
	paperColor?: boolean;
	inkColor?: boolean;
	camera?: boolean;
	backgroundVisibility?: boolean;
	enterExit?: boolean;
}

export interface SurfaceRenderer {
	type: string;
	label: string;
	controls: SurfaceControlsMetadata;
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
	paramsStruct: unknown; // TgpuStruct describing the WGSL uniform layout
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
