<script lang="ts">
	import { resolve } from '$app/paths';
	import { onDestroy, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import { AnimationManager } from './animation-manager';
	import { TextAnimationManager } from '$lib/text-animations/manager.svelte';
	import { animState } from './anim-state.svelte';
	import { buildCompositionAnimationManifest } from './composition-animation-manifest';
	import {
		CompositionExportController,
		type CompositionExportUiState
	} from './composition-export-controller';
	import { buildCompositionTimelineTracks } from './composition-timeline-tracks';
	import Composition from './Composition.svelte';
	import {
		renderCompositionFrameTo,
		shouldSplitCompositionPlanes,
		type CompositionFrameRenderRequest
	} from './composition-frame-renderer';
	import { EffectChain } from './pipelines/effect-chain';
	import { getSurfaceRenderer } from './pipelines';
	import { ShaderPassDispatcher } from './pipelines/shader-pass-runner';
	import type { SurfaceRenderInstance, SurfaceRenderInputs } from './pipelines/types';
	import CanvasControlsBar from './CanvasControlsBar.svelte';
	import CanvasEditingOverlay from './CanvasEditingOverlay.svelte';
	import Inspector from './Inspector.svelte';
	import TimelineOutline from './TimelineOutline.svelte';
	import VideoFrame from './VideoFrame.svelte';
	import { fontsReady } from './fonts';
	import { createGpuHost, type GpuHost } from './gpu-host';
	import { disposeSubstrateTextures, getSubstrateTexture } from './substrate-textures';
	import {
		clearCanvasPaintHandler,
		requestCanvasPaint,
		setCanvasPaintHandler
	} from './html-in-canvas';
	import { Timeline } from './timeline.svelte';
	import { timelineHandle } from './timeline-handle.svelte';
	import {
		listMarkInstances,
		resolveMarkForIndex,
		type Cascade,
		type Keyframe,
		type MarkInstance
	} from './engine-schema';
	import { engineState, packState, readMarkColor, transitionState } from './engine-state.svelte';
	import { applyCompositionState } from './preset';
	import { presetBase } from './preset-base.svelte';
	import { serializeCompositionState } from './preset-pure';
	import { compositionMeta } from './composition-meta.svelte';
	import { getPack } from './packs/registry';
	import { requireCoreColor, resolveDiagramStroke, resolveTypographyColors } from './packs/resolve';

	import { CompositionPlanes } from './pipelines/composition-planes';
	import { DepthStage } from './pipelines/depth-stage';
	import { TransitionSnapshotController } from './transition-snapshot-controller';
	import type { SyncExportRequest } from './export-video';
	import { AudioPreview } from './audio-preview';
	import { resolveDiagramPrimitiveForRender } from '$lib/utils/diagram-geometry';
	import { clampNumber } from '$lib/utils/math';
	import { resolveOverlayPlacement } from '$lib/utils/overlay-placement';
	import { isDarkSurfaceColor } from '$lib/utils/color';
	import { exposeVisualAudit } from './runtime-audit';
	import { captureCanvasWebp } from '$lib/utils/canvas-capture';
	import { posterExists, putPoster } from './posters';

	// Content key for this composition's poster, supplied by the route (which owns
	// the loaded Preset). When set, the settled frame is captured once and cached
	// server-side so the picker can show a real, always-in-sync preview.
	let { posterKey = null }: { posterKey?: string | null } = $props();
	const capturedPosterKeys = new SvelteSet<string>();

	let compositionElement = $state<HTMLElement | null>(null);
	let surfaceElement = $state<HTMLElement | null>(null);
	// Depth-of-field plane split (ADR-0027). When a `depth-of-field` Effect is
	// present the Overlay layer is hoisted into this frame-sized sibling of
	// `.composition` so it can be captured on its own as the Overlay plane; the
	// Surface plane is then `.composition` (surface-only). Null otherwise.
	let overlayRootElement = $state<HTMLElement | null>(null);
	let canvas = $state.raw<HTMLCanvasElement | null>(null);
	let host = $state.raw<GpuHost | null>(null);
	let pipeline = $state.raw<SurfaceRenderInstance | null>(null);
	let effectChain = $state.raw<EffectChain | null>(null);
	let shaderPassDispatcher = $state.raw<ShaderPassDispatcher | null>(null);
	let compositionPlanes = $state.raw<CompositionPlanes | null>(null);
	// Dimensional depth stage (ADR-0028). Built when a Preset declares state.stage;
	// renders the composition through a real 3D compositor instead of the flat path.
	let depthStage = $state.raw<DepthStage | null>(null);
	// Resident GPU texture for the depth stage's backdrop image substrate (dex
	// p20), or null when the active stage declares no backdrop image. Loaded in
	// the pipeline-build effect (gated into first paint alongside fonts) and
	// sampled per frame by the composition frame renderer — never decoded/uploaded per frame.
	let substrateTexture = $state.raw<GPUTexture | null>(null);
	let timeline = $state.raw<Timeline | null>(null);
	const animationManager = new AnimationManager();
	const audioPreview = new AudioPreview();
	const textAnimationManager = new TextAnimationManager();
	const transitionSnapshotController = new TransitionSnapshotController();
	const compositionExportController = new CompositionExportController();

	// Poster capture (see ./posters). Once the composition has mounted its GPU
	// host and the route has resolved a content key, force one settled paint and
	// snapshot the canvas to a content-keyed WebP. Runs identically for the live
	// editor and the picker's hidden generator iframe; guarded to once per key.
	$effect(() => {
		const key = posterKey;
		const localCanvas = canvas;
		if (!key || !localCanvas || !host) return;
		if (typeof window !== 'undefined') window.__supersPosterKey = key;
		if (capturedPosterKeys.has(key)) return;
		capturedPosterKeys.add(key);
		void capturePoster(localCanvas, key);
	});

	async function capturePoster(targetCanvas: HTMLCanvasElement, key: string): Promise<void> {
		// The composition already parks at the settled frame on load. Wait for fonts
		// and give the animated DOM (counter values, typeset text) time to land, then
		// composite the current settled DOM once more and capture it — without
		// re-seeking, so the parked state isn't disturbed.
		await fontsReady();
		await new Promise((resolve) => setTimeout(resolve, 900));
		requestCanvasPaint(targetCanvas);
		await nextFrame();
		await nextFrame();
		if (await posterExists(key)) return; // another client already generated it
		try {
			const blob = await captureCanvasWebp(targetCanvas);
			if (blob) await putPoster(key, blob);
		} catch (err) {
			console.error('Poster capture failed', err);
		}
	}

	// Where the editor parks the playhead on first load: a settled frame past every
	// enter and before any exit, so the composition + its overlays are visible
	// immediately instead of an empty t=0 canvas (overlays haven't entered yet).
	// Preview-only — export still renders from frame 0.
	const SETTLED_PREVIEW_FRACTION = 0.5;

	let isExporting = $state(false);
	let separateWav = $state(false);
	let progress = $state(0);
	let status = $state('');
	let showCheckerboard = $state(true);
	// Preview-only reference still behind the transparent canvas (ADR-0034 §7) —
	// judges an overlay over real footage. Never part of the composition or the
	// export. Overrides the checkerboard while set.
	let backdropUrl = $state<string | null>(null);

	// Display zoom — a multiplier on the fit-to-window size (1 = fit = 100%). It
	// is a CSS transform on the displayed canvas only; the native render
	// resolution is untouched (3840×2160). The drag/scale/click geometry reads
	// getBoundingClientRect, which already reflects the transform, so coordinates
	// stay correct at any zoom without threading the factor through.
	let zoom = $state(1);
	// Pan offset (display px) applied with the zoom transform. Only meaningful when
	// zoomed in (zoom > 1); reset to centre whenever we return to fit.
	let panX = $state(0);
	let panY = $state(0);
	// True while a pan drag is in flight, so the canvas tracks the cursor without
	// the zoom transition's float.
	let isPanning = $state(false);
	const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

	function zoomIn(): void {
		const next = ZOOM_LEVELS.find((level) => level > zoom + 1e-6);
		if (next !== undefined) zoom = next;
	}

	function zoomOut(): void {
		const lower = [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 1e-6);
		if (lower !== undefined) {
			zoom = lower;
			if (zoom <= 1) {
				panX = 0;
				panY = 0;
			}
		}
	}

	function zoomFit(): void {
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	// Timeline panel height. Fixed 220px in portrait; drag-resizable in landscape
	// (ADR-0034 §7), where it shares vertical space with the canvas. The chosen
	// landscape height persists in state across orientation flips.
	const DEFAULT_TIMELINE_H = 220;
	let timelineHeight = $state(DEFAULT_TIMELINE_H);
	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	const isLandscape = $derived(viewportWidth > viewportHeight);
	const effectiveTimelineHeight = $derived(isLandscape ? timelineHeight : DEFAULT_TIMELINE_H);

	let timelineResizeStart: { startY: number; startHeight: number } | null = null;

	function onTimelineResizeStart(event: PointerEvent): void {
		if (event.button !== 0 || !isLandscape) return;
		event.preventDefault();
		timelineResizeStart = { startY: event.clientY, startHeight: timelineHeight };
		window.addEventListener('pointermove', onTimelineResizeMove);
		window.addEventListener('pointerup', onTimelineResizeEnd);
	}

	function onTimelineResizeMove(event: PointerEvent): void {
		if (!timelineResizeStart) return;
		// Drag up grows the timeline (and shrinks the canvas), down shrinks it.
		const delta = timelineResizeStart.startY - event.clientY;
		const max = Math.max(DEFAULT_TIMELINE_H, viewportHeight - 220);
		timelineHeight = clampNumber(timelineResizeStart.startHeight + delta, 140, max);
	}

	function onTimelineResizeEnd(): void {
		timelineResizeStart = null;
		window.removeEventListener('pointermove', onTimelineResizeMove);
		window.removeEventListener('pointerup', onTimelineResizeEnd);
	}

	// Spacebar toggles play/pause — unless the focus is in a field, a button, or
	// editable content (where Space has its own meaning).
	function handleKeydown(event: KeyboardEvent): void {
		if (event.code !== 'Space' || event.repeat) return;
		const target = event.target as HTMLElement | null;
		const tag = target?.tagName;
		if (
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			tag === 'SELECT' ||
			tag === 'BUTTON' ||
			target?.isContentEditable
		) {
			return;
		}
		event.preventDefault();
		timeline?.toggle();
	}

	function readMarks(): MarkInstance[] {
		return listMarkInstances(engineState.surface.content);
	}

	function computeTextAnimAlphaByMarkIndex(marks: readonly MarkInstance[]): number[] | undefined {
		if (typeof window === 'undefined') {
			return undefined;
		}
		const mgr = window.__supersTextAnimationManager;
		if (!mgr) {
			return undefined;
		}
		// Only the `surface:body` slot can contain marks today.
		const slotKey = 'surface:body';
		const hasBodyEntry = engineState.textAnimations.some(
			(entry) => entry.target.kind === 'surface' && entry.target.slot === 'body'
		);
		if (!hasBodyEntry) {
			return undefined;
		}
		const result: number[] = new Array(marks.length).fill(1);
		for (let i = 0; i < marks.length; i += 1) {
			const range = mgr.unitRangeFor(slotKey, marks[i].startChar, marks[i].endChar);
			if (!range) {
				continue;
			}
			let min = 1;
			for (let u = range.from; u <= range.to; u += 1) {
				min = Math.min(min, mgr.unitAlphaAt(slotKey, u));
			}
			result[i] = min;
		}
		return result;
	}

	// Checklist item strikes (window-carrying instances) never consume a
	// marks.timings[] entry — resolve their appearance with an out-of-range
	// index so only marks.defaults[style] / the Pack chain applies (the
	// RootInspector markDefaultAppearance idiom).
	function markTimingIndex(mark: MarkInstance, index: number): number {
		return mark.window === undefined ? index : engineState.marks.timings.length;
	}

	function getMarkColorsByIndex(): string[] {
		const parsedMarks = readMarks();
		return parsedMarks.map(
			(mark, index) =>
				resolveMarkForIndex(
					mark.style,
					markTimingIndex(mark, index),
					engineState.marks,
					readMarkColor(mark.style)
				).color
		);
	}

	function getMarkIntensityByIndex(): number[] {
		const parsedMarks = readMarks();
		return parsedMarks.map(
			(mark, index) =>
				resolveMarkForIndex(
					mark.style,
					markTimingIndex(mark, index),
					engineState.marks,
					readMarkColor(mark.style)
				).intensity
		);
	}

	function buildRenderInputs(timestamp: number): SurfaceRenderInputs {
		const parsedMarks = readMarks();
		return {
			animState: { markProgresses: animState.markProgresses },
			backgroundVisibility: engineState.surface.backgroundVisibility ?? 0,
			highlightDarkSurface: surfaceHighlightIsDark(),
			markColorsByIndex: getMarkColorsByIndex(),
			markIntensityByIndex: getMarkIntensityByIndex(),
			textAnimAlphaByMarkIndex: computeTextAnimAlphaByMarkIndex(parsedMarks),
			// The checklist fades its completion strikes with the card's own
			// visibility ramp, so a static strike enters WITH its item instead of
			// popping in after the fade (the marks canvas is a separate layer the
			// DOM opacity fade doesn't reach). Every other surface leaves it at 1.
			markAlpha:
				engineState.surface.type === 'checklist'
					? Math.max(0, Math.min(1, animState.paperVisibility))
					: undefined,
			timestamp,
			diagram: buildDiagramInputs()
		};
	}

	// The composition's resolved paper/ink (ADR-0038): explicit typography
	// override → active Pack's core fill/ink-treatment. Derived from
	// engineState.typography + packState.slug, so a pack switch restyles
	// every consumer before the re-capture.
	const resolvedTypographyColors = $derived(
		resolveTypographyColors(getPack(packState.slug), engineState.typography)
	);

	// Diagram stroke inputs (ADR-0036): per-primitive draw scalar + fade alpha,
	// with the Pack stroke resolved once per frame — the `'ink'` sentinel
	// substitutes the composition's resolved ink (override → Pack core,
	// ADR-0038) so strokes flip with the preset's declared ink over footage.
	// Channel-owned primitives render fully drawn at their authored opacity
	// (ownership replaces the draw-on form).
	function buildDiagramInputs(): SurfaceRenderInputs['diagram'] {
		const authoredPrimitives = engineState.surface.diagram;
		if (!authoredPrimitives || authoredPrimitives.length === 0) {
			return undefined;
		}
		const primitives = authoredPrimitives.map((primitive) =>
			resolveDiagramPrimitiveForRender(primitive, engineState.transport.orientation)
		);
		const drawProgressById: Record<string, number> = {};
		const alphaById: Record<string, number> = {};
		for (const primitive of primitives) {
			const channels = animState.blockChannels[primitive.id];
			if (channels) {
				drawProgressById[primitive.id] = 1;
				alphaById[primitive.id] = channels.opacity;
			} else {
				drawProgressById[primitive.id] = animState.blockProgresses[primitive.id] ?? 0;
				alphaById[primitive.id] = animState.blockAlphas[primitive.id] ?? 1;
			}
		}
		const pack = getPack(packState.slug);
		const stroke = resolveDiagramStroke(pack);
		return {
			primitives,
			drawProgressById,
			alphaById,
			stroke:
				stroke.color === 'ink' ? { ...stroke, color: resolvedTypographyColors.inkColor } : stroke,
			// Primitives declaring `ink: 'accent'` stroke in the Pack's core accent.
			accentColor: requireCoreColor(pack, 'accent-treatment')
		};
	}

	// Whether the surface background reads as dark, from its resolved paper
	// (override → Pack core fill, ADR-0038 — always a real colour).
	function surfaceHighlightIsDark(): boolean | undefined {
		return isDarkSurfaceColor(resolvedTypographyColors.paperColor);
	}

	const tracks = $derived(
		buildCompositionTimelineTracks(engineState, {
			paperColor: resolvedTypographyColors.paperColor,
			inkColor: resolvedTypographyColors.inkColor,
			resolveMarkColor: readMarkColor
		})
	);

	const planeSplitActive = $derived(shouldSplitCompositionPlanes(engineState));

	// Workspace owns every live DOM/GPU reference. The renderer receives an
	// explicit per-call snapshot of those dependencies; it does not subscribe to
	// Svelte state or create a second lifecycle around them.
	function buildCompositionFrameRenderRequest(
		outputView: GPUTextureView,
		timestamp: number
	): CompositionFrameRenderRequest {
		return {
			outputView,
			timestamp,
			state: engineState,
			pack: getPack(packState.slug),
			paperVisibility: animState.paperVisibility,
			compositionElement,
			overlayRootElement,
			substrateTexture,
			resources: {
				host,
				pipeline,
				effectChain,
				shaderPassDispatcher,
				compositionPlanes,
				depthStage
			},
			cachedTransition: transitionSnapshotController.cachedFrame(),
			buildSurfaceInputs: buildRenderInputs
		};
	}

	function renderAt(timestamp: number): void {
		if (!host) {
			return;
		}
		renderCompositionFrameTo(
			buildCompositionFrameRenderRequest(host.context.getCurrentTexture().createView(), timestamp)
		);
	}

	// The single per-frame driver. Called by the Timeline's tick (play + seek)
	// and by the composition-sync effect after an authoring change. Advances the
	// GSAP playhead (which applies DOM transforms + writes animState), then asks
	// the canvas to paint — the paint handler re-uploads the now-current DOM and
	// composites it (uploadDom + renderAt). Going through requestCanvasPaint keeps
	// capture on the browser's paint tick, after Svelte has flushed the DOM the
	// new progress produced; a synchronous renderAt here would composite a stale
	// DOM texture. This is imperative on purpose — rendering is a side effect of
	// time/authoring changes, not a reactive derivation.
	function tickTimeline(timestamp: number): void {
		const duration = engineState.transport.durationSeconds;
		const fraction = duration > 0 ? timestamp / duration : 0;
		animationManager.progress(fraction);
		animState.globalProgress = fraction;
		if (canvas) {
			requestCanvasPaint(canvas);
		}
	}

	function nextFrame(): Promise<void> {
		return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}

	$effect(() => {
		const active = transitionState.active;
		if (!active) {
			transitionSnapshotController.invalidate();
			return;
		}
		if (!host || !canvas || !pipeline) {
			return;
		}

		const localHost = host;
		const localCanvas = canvas;
		untrack(() => {
			void transitionSnapshotController
				.update(active, {
					host: localHost,
					width: localCanvas.width,
					height: localCanvas.height,
					captureCompositionState: () =>
						serializeCompositionState(presetBase, $state.snapshot(engineState), packState.slug),
					applyCompositionState,
					readCapturing: () => transitionState.capturing,
					writeCapturing: (value) => {
						transitionState.capturing = value;
					},
					flushDom: tick,
					waitForFonts: fontsReady,
					waitForLayout: async () => {
						await nextFrame();
						await nextFrame();
					},
					settleAnimation: (snapshotProgress) => {
						animationManager.rebuild(
							buildCompositionAnimationManifest({
								state: engineState,
								runtime: animState,
								textAnimationRoot: compositionElement,
								textAnimationCompiler: textAnimationManager,
								resolveMarkColor: readMarkColor
							})
						);
						animationManager.progress(snapshotProgress);
						animState.globalProgress = snapshotProgress;
					},
					renderFrame: (outputView, timestamp) =>
						renderCompositionFrameTo(buildCompositionFrameRenderRequest(outputView, timestamp)),
					isActiveTransition: (candidate) => transitionState.active === candidate,
					seekTimeline: (timestamp) => timeline?.seek(timestamp)
				})
				.catch((error) => {
					console.error('Transition snapshot preparation failed.', error);
					status =
						error instanceof Error ? error.message : 'Transition snapshot preparation failed.';
				});
		});
	});

	$effect(() => {
		if (!canvas || host) {
			return;
		}

		const targetCanvas = canvas;

		createGpuHost(targetCanvas)
			.then((nextHost) => {
				host = nextHost;
			})
			.catch((error) => {
				console.error('Unable to initialize the GPU host.', error);
				status = error instanceof Error ? error.message : 'Unable to initialize the GPU host.';
			});
	});

	$effect(() => {
		// Triggers (tracked): rebuild the pipeline only when the GPU host, the
		// composition/canvas elements, or the surface type/orientation change.
		if (!host || !compositionElement || !canvas) {
			return;
		}

		const surfaceType = engineState.surface.type;
		void engineState.transport.orientation;

		const localHost = host;
		const localSource = compositionElement;
		const localCanvas = canvas;

		// Everything below is imperative engine wiring. It is wrapped in untrack()
		// because it both READS and WRITES `effectChain` / `shaderPassDispatcher`
		// (dispose the old instance, assign a fresh one) — without untrack the
		// effect subscribes to the very state it reassigns and re-runs forever
		// (effect_update_depth_exceeded). The sibling render effects likewise read
		// those instances via renderAt(); untrack keeps this effect from coupling
		// to them. Triggers above stay tracked; the body does not subscribe.
		return untrack(() => {
			// Each Surface declares its own Pipeline factory + options in the registry:
			// `newspaper` (ADR-0008) and `web-document` reuse the paper compositor (the
			// latter with the dark-surface highlight), the rest use the plain compositor.
			// Route through the registry's `createPipeline` rather than hardcoding surface
			// types here, so a Surface's declared pipeline + options are honored without
			// editing this wiring. (Surface-specific physics rides the declarative
			// `shaderPass`, dispatched separately ahead of the effect chain.)
			const surfaceRenderer = getSurfaceRenderer(surfaceType);
			let nextPipeline: SurfaceRenderInstance;
			try {
				if (!surfaceRenderer) {
					throw new Error(`No Surface renderer registered for "${surfaceType}".`);
				}
				nextPipeline = surfaceRenderer.createPipeline({
					host: localHost,
					sourceElement: localSource
				});
			} catch (error) {
				console.error('Surface pipeline initialization failed.', error);
				status = error instanceof Error ? error.message : 'Surface pipeline unavailable.';
				return;
			}

			pipeline = nextPipeline;

			// Always recreate EffectChain and ShaderPassDispatcher — their ping-pong
			// textures are sized to the canvas at construction. When orientation
			// changes (2160×3840 ↔ 3840×2160), the canvas resizes before this effect
			// fires, so localCanvas.width/height already reflect the new dimensions.
			if (effectChain) {
				effectChain.dispose();
			}
			effectChain = new EffectChain({
				host: localHost,
				width: localCanvas.width,
				height: localCanvas.height
			});

			if (shaderPassDispatcher) {
				shaderPassDispatcher.dispose();
			}
			shaderPassDispatcher = new ShaderPassDispatcher({
				host: localHost,
				width: localCanvas.width,
				height: localCanvas.height
			});

			// Multiplane DOF capture (ADR-0027) — sized to the canvas like the chain
			// above, so an orientation change recreates it at the new dimensions.
			if (compositionPlanes) {
				compositionPlanes.dispose();
			}
			compositionPlanes = new CompositionPlanes({
				host: localHost,
				width: localCanvas.width,
				height: localCanvas.height
			});

			// Dimensional depth stage (ADR-0028) — sized to the canvas like the chain
			// above, so an orientation change recreates it at the new dimensions.
			if (depthStage) {
				depthStage.dispose();
			}
			depthStage = new DepthStage({
				host: localHost,
				width: localCanvas.width,
				height: localCanvas.height
			});

			if (!timeline) {
				timeline = new Timeline({
					durationSeconds: engineState.transport.durationSeconds,
					fps: engineState.transport.fps,
					tick: tickTimeline,
					// Preview audio rides the transport (ADR-0033 §6): cues schedule on
					// play from the playhead, reschedule on loop wrap, cancel on pause.
					// Scrub stays silent — seek has no hook by design.
					onPlay: () => {
						audioPreview
							.start(engineState, () => timeline?.time ?? 0)
							.catch((error) => console.error('Preview audio failed to start.', error));
					},
					onPause: () => audioPreview.stop(),
					onLoop: () => {
						audioPreview
							.start(engineState, () => timeline?.time ?? 0)
							.catch((error) => console.error('Preview audio failed to restart.', error));
					}
				});
				if (typeof window !== 'undefined') {
					window.__supersTimeline = timeline;
					window.__supersTextAnimationManager = textAnimationManager;
					// Agent-facing export seam (ADR-0042) — the sync loop drives the
					// real export path with a start timecode + sync filename.
					window.__supersExport = performExport;
				}
				// The inspector's keyframe rows navigate the playhead through this
				// handle (prev/next jumps + add-at-playhead).
				timelineHandle.current = timeline;
				animationManager.rebuild(
					buildCompositionAnimationManifest({
						state: engineState,
						runtime: animState,
						textAnimationRoot: compositionElement,
						textAnimationCompiler: textAnimationManager,
						resolveMarkColor: readMarkColor
					})
				);
				// Park on a settled frame so the composition is visible on open (the
				// seek drives the manifest to that frame and requests the first paint).
				timeline.seek(engineState.transport.durationSeconds * SETTLED_PREVIEW_FRACTION);
			}

			setCanvasPaintHandler(localCanvas, () => {
				// A paint composites the current DOM through the shared seam. The seek/play
				// tick already applied the GSAP state (and wrote animState) before
				// requesting this paint, so we only composite here — renderAt(), not
				// tickTimeline(), to avoid re-driving the animation on every paint.
				if (timeline) {
					renderAt(timeline.time);
				}
			});
			// Load the depth-stage backdrop image substrate (dex p20), if the active
			// stage declares one — decode + GPU upload once here, resident thereafter.
			// Gated into first paint with fonts so the very first frame (and export)
			// has the photo, not a blank/solid backdrop.
			const stageAsset =
				engineState.stage?.type === 'depth'
					? (engineState.stage.backdrop?.image?.asset ?? null)
					: null;
			const substrateReady: Promise<unknown> = stageAsset
				? getSubstrateTexture(localHost, stageAsset).then((texture) => {
						substrateTexture = texture;
					})
				: Promise.resolve((substrateTexture = null));

			// Gate the first capture on the active Pack's typefaces (so the very first
			// frame rasterizes the channel fonts, not OS fallbacks) and on the substrate
			// texture. Both memoized, so this resolves ~immediately once cached.
			void Promise.all([fontsReady(), substrateReady]).then(() => requestCanvasPaint(localCanvas));

			return () => {
				clearCanvasPaintHandler(localCanvas);
				nextPipeline.dispose();
				if (pipeline === nextPipeline) {
					pipeline = null;
				}
			};
		});
	});

	$effect(() => {
		// Re-run the visual audit whenever the surface has settled, so DOM
		// positions reflect what the viewer sees at rest, not at frame 0.
		void engineState.surface.content.body;
		void engineState.surface.content.title;
		void engineState.surface.content.counterpoint;
		void engineState.surface.variant;
		void engineState.surface.content.sourceUrl;
		void engineState.typography.fontFamily;
		void engineState.transport.orientation;
		void animState.paperVisibility;
		const id = requestAnimationFrame(() => {
			if (animState.paperVisibility >= 0.99) {
				exposeVisualAudit(engineState);
			}
		});

		return () => cancelAnimationFrame(id);
	});

	// Void-reads every field of an ADR-0035 keyframe channel set so the
	// composition sync re-fires on any keyframe edit (same void-pattern as
	// enter/exit — NO new $effect).
	function trackKeyframeChannels(
		channels: Partial<Record<string, readonly Keyframe[] | undefined>> | undefined
	): void {
		if (!channels) {
			return;
		}
		for (const track of Object.values(channels)) {
			if (!track) {
				continue;
			}
			void track.length;
			for (const frame of track) {
				void frame.atMs;
				void frame.value;
				void frame.ease;
			}
		}
	}

	// Void-reads a cascade weld (anchor ref, event edge, ms offset) — each
	// drives resolved starts in the manifest.
	function trackCascade(cascade: Cascade | undefined): void {
		if (!cascade) {
			return;
		}
		void cascade.event;
		void cascade.offsetMs;
		const anchor = cascade.anchor;
		if (typeof anchor !== 'string') {
			if ('overlay' in anchor) {
				void anchor.overlay;
			} else if ('mark' in anchor) {
				void anchor.mark;
			} else if ('block' in anchor) {
				void anchor.block;
			} else {
				void anchor.textAnimation;
			}
		}
	}

	// Composition sync — the single reactive bridge from authoring state to the
	// imperative canvas. It tracks every input that changes WHAT the composition
	// is (content, marks, effects, overlays, typography, background) and, when any
	// changes, rebuilds the animation manifest and repaints the current frame. It
	// is NOT a per-frame driver — it must not read per-frame state (animState
	// progresses); the timeline tick owns time. The rebuild+tick is untracked so
	// this effect never subscribes to the animState / pipeline / timeline.time it
	// touches — that self-subscription is exactly what made the render effects
	// loop. Rendering is a side effect of authoring changes, expressed once, here.
	$effect(() => {
		// --- Transport (manifest tweens) ---
		// Keyframe `atMs` is converted to a progress fraction via `durationMs`
		// (buildCompositionAnimationManifest), so a duration change must rebuild — otherwise
		// absolute keyframe motion would run at the wrong fraction. Fraction-timed
		// windows are rescaled on a duration change (composition-timing) and would
		// re-fire this on their own, but a pure-keyframe composition would not.
		void engineState.transport.durationSeconds;
		const activeOrientation = engineState.transport.orientation;

		// --- Text animations (manifest tweens) ---
		void engineState.textAnimations.length;
		for (const entry of engineState.textAnimations) {
			void entry.id;
			void entry.effect;
			void entry.target;
			void entry.enter.start;
			void entry.enter.duration;
			void entry.exit?.start;
			void entry.exit?.duration;
			trackCascade(entry.cascade);
			// `enter/exit.ease` is intentionally NOT tracked: a text animation's
			// easing is intrinsic to its catalog effect (spec.enter.easing), so the
			// per-entry ease can't change the output — tracking it would force a
			// needless rebuild. (The field still drives surface/overlay transitions.)
		}

		// --- Surface enter/exit (manifest tweens — the unified clip bar drags) ---
		// Unlike text animations, the surface transition's ease DOES drive the
		// rendered curve (getEaseGsap), so timing AND ease are tracked here.
		void engineState.surface.enter?.start;
		void engineState.surface.enter?.duration;
		void engineState.surface.enter?.ease;
		void engineState.surface.exit?.start;
		void engineState.surface.exit?.duration;
		void engineState.surface.exit?.ease;
		// Composition-owned surface opacity channel (ADR-0035).
		trackKeyframeChannels(engineState.surface.animation?.channels);

		// --- Surface + overlay content (DOM the source HTML rasterizes) ---
		// Each CanvasSource wraps its text-anim slots in `{#key value}` so changing
		// the text replaces the DOM element the manager last split; the rebuild
		// notices the new element (`existing.split.root !== element`) and re-splits.
		void engineState.surface.content.title;
		void engineState.surface.content.kicker;
		void engineState.surface.content.sourceUrl;
		void engineState.surface.content.author;
		void engineState.surface.content.source;
		void engineState.surface.content.dateLabel;
		void engineState.surface.content.body;
		void engineState.surface.content.counterpoint;
		// Ordered-list content (checklist items, chat messages) whose per-item
		// timing drives manifest tweens and/or the DOM the capture rasterizes. A
		// deep stringify (the diagram pattern) so a timeline-clip drag that mutates
		// a nested field — item.strike.start/duration, message.enter — rebuilds the
		// manifest; without this the timeline moves the bar but the render is stale
		// (the timeline-is-truth invariant would break for the strike draw-on).
		for (const item of engineState.surface.content.items ?? []) {
			void JSON.stringify(item);
		}
		for (const message of engineState.surface.content.messages ?? []) {
			void JSON.stringify(message);
		}
		void engineState.surface.variant;
		void engineState.typography.fontFamily;
		void engineState.typography.paperColor;
		void engineState.typography.inkColor;
		void engineState.overlays.length;
		for (const overlay of engineState.overlays) {
			void overlay.id;
			void overlay.type;
			void overlay.content;
			// Spatial position (canvas drag + scale, and the inspector's anchor/offset
			// fields) — a change here must repaint so the overlay moves live.
			void overlay.position.orientationOverrides?.[activeOrientation];
			const placement = resolveOverlayPlacement(overlay.position, activeOrientation);
			void placement.anchor;
			void placement.offset?.x;
			void placement.offset?.y;
			void placement.rect?.x;
			void placement.rect?.y;
			void placement.rect?.width;
			void placement.rect?.height;
			void placement.scale;
			void placement.rotation;
			// Overlay enter/exit timing + ease (the unified clip bar drags).
			void overlay.enter?.start;
			void overlay.enter?.duration;
			void overlay.enter?.ease;
			void overlay.exit?.start;
			void overlay.exit?.duration;
			void overlay.exit?.ease;
			// Composition-owned channels + cascade weld (ADR-0035).
			trackKeyframeChannels(overlay.animation?.channels);
			trackCascade(overlay.animation?.cascade);
		}

		// --- Diagram Blocks (ADR-0036: manifest tweens + DOM + stroke geometry) ---
		// A deep read of every primitive — positions, routes, timing, channels,
		// cascades — via stringify, so any authored field change (including ones
		// the schema grows later) rebuilds + repaints. The hand-enumeration trap
		// (lost `counterpoint`) is exactly what this avoids; the cost is a few
		// hundred bytes per authoring change, not per frame.
		void engineState.surface.diagram?.length;
		for (const primitive of engineState.surface.diagram ?? []) {
			void JSON.stringify(primitive);
		}

		// --- Marks (manifest tweens) + effects / background (render inputs) ---
		// Iterating subscribes to the array, so a drag that lazily pushes a timing
		// (ensureMarkTimingAtIndex) re-fires this. start/duration drive the draw-on.
		void engineState.marks.timings.length;
		for (const timing of engineState.marks.timings) {
			void timing.start;
			void timing.duration;
			void timing.color;
			void timing.intensity;
			trackCascade(timing.cascade);
		}
		for (const appearance of Object.values(engineState.marks.defaults)) {
			void appearance?.color;
			void appearance?.intensity;
		}
		void engineState.effects.length;
		for (const entry of engineState.effects) {
			void entry.type;
			// Effect Editors mutate nested region and melt params in place, so deep-read
			// the full object; its reference alone leaves the canvas stale.
			if (entry.params && typeof entry.params === 'object') {
				void JSON.stringify(entry.params);
			}
		}
		void engineState.backgroundFill;

		// --- Captions (render inputs + rail) --- deep read via stringify so any
		// cue/style edit repaints — the same anti-hand-enumeration posture as
		// the diagram block above.
		if (engineState.captions) {
			void JSON.stringify(engineState.captions);
		}

		// --- Pack (appearance) ---
		// Every CanvasSource resolves its pack Roles from packState reactively, so
		// the DOM restyles on its own — but the GPU composites a captured texture,
		// not the live DOM. Tracking the slug here repaints (uploadDom re-capture)
		// so a pack switch reaches pixels.
		void packState.slug;

		untrack(() => {
			if (!timeline) return;
			// Rebuild is fingerprint-guarded: a no-op when only effects/background
			// changed (those aren't manifest tweens). The tick repaints either way.
			animationManager.rebuild(
				buildCompositionAnimationManifest({
					state: engineState,
					runtime: animState,
					textAnimationRoot: compositionElement,
					textAnimationCompiler: textAnimationManager,
					resolveMarkColor: readMarkColor
				})
			);
			tickTimeline(timeline.time);
		});
	});

	$effect(() => {
		if (!timeline) {
			return;
		}

		timeline.durationSeconds = engineState.transport.durationSeconds;
		timeline.fps = engineState.transport.fps;

		if (timeline.time > engineState.transport.durationSeconds) {
			timeline.seek(engineState.transport.durationSeconds);
		}
	});

	onDestroy(() => {
		animationManager.dispose();
		textAnimationManager.dispose();
		if (typeof window !== 'undefined') {
			window.__supersTextAnimationManager = undefined;
			window.__supersExport = undefined;
			window.removeEventListener('pointermove', onTimelineResizeMove);
			window.removeEventListener('pointerup', onTimelineResizeEnd);
		}
		timeline?.dispose();
		timeline = null;
		timelineHandle.current = null;
		audioPreview.dispose();
		transitionSnapshotController.dispose();
		compositionExportController.dispose();
		if (typeof window !== 'undefined' && window.__supersTimeline) {
			window.__supersTimeline = undefined;
		}
		effectChain?.dispose();
		effectChain = null;
		shaderPassDispatcher?.dispose();
		shaderPassDispatcher = null;
		compositionPlanes?.dispose();
		compositionPlanes = null;
		depthStage?.dispose();
		depthStage = null;
		disposeSubstrateTextures();
		substrateTexture = null;
		host?.dispose();
		host = null;
	});

	// Workspace retains the live Svelte/DOM/GPU ownership required by export.
	// The controller owns planning, deterministic stepping, encoding handoff,
	// downloads, status, cancellation, and cleanup.
	async function performExport(request?: SyncExportRequest): Promise<void> {
		await compositionExportController.export(
			{
				readState: () => engineState,
				readTransition: () => transitionState.active,
				readCanvas: () => canvas,
				isFrameRendererReady: () => canvas !== null && pipeline !== null,
				readSeparateWav: () => separateWav,
				pauseTimeline: () => timeline?.pause(),
				buildAnimationManifest: () =>
					buildCompositionAnimationManifest({
						state: engineState,
						runtime: animState,
						textAnimationRoot: compositionElement,
						textAnimationCompiler: textAnimationManager,
						resolveMarkColor: readMarkColor
					}),
				writeGlobalProgress: (fraction) => {
					animState.globalProgress = fraction;
				},
				flushDom: tick,
				renderCompositionFrame: (timestamp) => {
					if (!host) return 'unavailable';
					return renderCompositionFrameTo(
						buildCompositionFrameRenderRequest(
							host.context.getCurrentTexture().createView(),
							timestamp
						)
					);
				},
				writeExportUiState: (next: CompositionExportUiState) => {
					isExporting = next.isExporting;
					progress = next.progress;
					status = next.status;
				}
			},
			request
		);
	}

	// The GUI export handler — seals arity at the DOM event boundary so a
	// MouseEvent can never leak into `performExport`'s request (the
	// phantom-fork lesson: never bind a possibly-absent param to DOM input).
	function handleExport(): Promise<void> {
		return performExport();
	}
</script>

<svelte:window
	onkeydown={handleKeydown}
	bind:innerWidth={viewportWidth}
	bind:innerHeight={viewportHeight}
/>

<main class="workspace" style:--timeline-h="{effectiveTimelineHeight}px">
	<header class="workspace__topbar">
		<a class="topbar__back" href={resolve('/')} aria-label="Back to presets">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 16 16"
				aria-hidden="true"
			>
				<path
					d="M10 3L5 8l5 5"
					stroke="currentColor"
					stroke-width="1.5"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</a>
		<span class="topbar__name">{compositionMeta.userCompositionSlug ?? 'Untitled'}</span>
	</header>

	<section class="workspace__canvas" aria-label="Composition">
		<VideoFrame
			bind:canvas
			orientation={engineState.transport.orientation}
			{showCheckerboard}
			{backdropUrl}
			{zoom}
			{panX}
			{panY}
			{isPanning}
		>
			<Composition
				bind:element={compositionElement}
				bind:surfaceElement
				splitPlanes={planeSplitActive}
				bind:overlayRootElement
			/>
		</VideoFrame>
		<CanvasEditingOverlay
			{compositionElement}
			{overlayRootElement}
			{canvas}
			compositionSize={{ width: canvas?.width ?? 3840, height: canvas?.height ?? 2160 }}
			{zoom}
			{panX}
			{panY}
			onPan={(x, y) => {
				panX = x;
				panY = y;
			}}
			onPanStart={() => {
				isPanning = true;
			}}
			onPanEnd={() => {
				isPanning = false;
			}}
		/>
	</section>

	<div class="workspace__controls">
		<CanvasControlsBar
			{timeline}
			{showCheckerboard}
			onToggleCheckerboard={() => {
				if (backdropUrl !== null) {
					// The backdrop overrides the checkerboard — toggling the checker
					// back on means "return to checkerboard", so clear the backdrop.
					backdropUrl = null;
					showCheckerboard = true;
				} else {
					showCheckerboard = !showCheckerboard;
				}
			}}
			{backdropUrl}
			onSelectBackdrop={(url) => {
				backdropUrl = url;
			}}
			{zoom}
			onZoomIn={zoomIn}
			onZoomOut={zoomOut}
			onZoomFit={zoomFit}
		/>
	</div>

	<div class="workspace__timeline">
		{#if isLandscape}
			<div
				class="timeline-resize"
				role="separator"
				aria-label="Resize timeline"
				aria-orientation="horizontal"
				onpointerdown={onTimelineResizeStart}
			></div>
		{/if}
		{#if timeline}
			<TimelineOutline {timeline} {tracks} />
		{/if}
	</div>

	<div class="workspace__inspector">
		<Inspector {handleExport} {isExporting} {progress} {status} bind:separateWav />
	</div>
</main>

<style>
	.workspace {
		/* DESIGN.md neutral ladder — defined once here; every editor-chrome
		   surface below reads these instead of Graffiti white-alpha neutrals. */
		--chrome-text: #e8e8ea;
		--chrome-muted: #8a8a90;
		--chrome-deck: #131315;
		--chrome-well: #0c0c0e;
		--chrome-raised: #1a1a1d;
		--chrome-hairline: #26262a;
		/* The canvas surround is a recessed well — the rail and timeline panels
		   step up from it, making the three-zone architecture legible. */
		background: var(--chrome-well);
		block-size: 100dvh;
		display: grid;
		grid-template-areas:
			'topbar    inspector'
			'canvas    inspector'
			'controls  inspector'
			'timeline  timeline';
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
		grid-template-rows: auto minmax(0, 1fr) auto var(--timeline-h, 220px);
		min-block-size: 0;
		overflow: hidden;
	}

	/* Breadcrumb strip above the canvas — back to the picker + the composition
	   name. A navigation affordance belongs here, over the stage, not in the
	   layers panel. Recessive; left-aligned with the canvas content padding. */
	.workspace__topbar {
		align-items: center;
		border-block-end: var(--border-1);
		display: flex;
		gap: var(--vs-xs);
		grid-area: topbar;
		min-block-size: 38px;
		padding-inline: var(--vs-l);
	}

	.topbar__back {
		align-items: center;
		border-radius: var(--br-xs);
		color: var(--fg-5);
		display: inline-flex;
		flex-shrink: 0;
		padding: 3px;
		text-decoration: none;
		transition:
			background 100ms ease,
			color 100ms ease;
	}

	.topbar__back:hover {
		background: var(--fg-05);
		color: var(--fg);
	}

	.topbar__name {
		color: var(--fg-6);
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.workspace__canvas {
		align-items: center;
		container-type: size;
		display: flex;
		grid-area: canvas;
		justify-content: center;
		min-block-size: 0;
		overflow: hidden;
		padding: var(--vs-l) var(--vs-l) 0;
		position: relative;
	}

	.workspace__controls {
		border-block-end: var(--border-1);
		grid-area: controls;
		padding-inline: var(--vs-s);
	}

	.workspace__timeline {
		grid-area: timeline;
		min-block-size: 0;
		overflow: hidden;
		position: relative;
	}

	/* Landscape-only drag handle to resize the timeline against the canvas. */
	.timeline-resize {
		cursor: ns-resize;
		inset-block-start: 0;
		inset-inline: 0;
		block-size: 7px;
		position: absolute;
		touch-action: none;
		z-index: 2;
	}

	.timeline-resize::after {
		background: var(--fg-2);
		content: '';
		inset-block-start: 0;
		inset-inline: 0;
		block-size: 1px;
		position: absolute;
		transition:
			background-color 100ms ease,
			block-size 100ms ease;
	}

	.timeline-resize:hover::after {
		background: var(--fg-4);
		block-size: 2px;
	}

	.workspace__inspector {
		display: flex;
		flex-direction: column;
		grid-area: inspector;
		min-block-size: 0;
		overflow: hidden;
	}
</style>
