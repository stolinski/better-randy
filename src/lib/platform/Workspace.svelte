<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';

	import {
		AnimationManager,
		type AnimationManifest,
		type AnimationTweenSpec
	} from './animation-manager';
	import { TextAnimationManager } from '$lib/text-animations/manager.svelte';
	import { animState, syncBlockRecords, syncProgressArray } from './anim-state.svelte';
	import {
		cascadeNodeKey,
		DEFAULT_BLOCK_ENTER,
		DEFAULT_OVERLAY_ENTER,
		resolveCascadeTimings,
		type CascadeWindow
	} from './cascade-timing';
	import Composition from './Composition.svelte';
	import { EffectChain } from './pipelines/effect-chain';
	import { getSurfaceRenderer, PIPELINE_REGISTRY } from './pipelines';
	import {
		ShaderPassDispatcher,
		type ShaderPassDispatchList
	} from './pipelines/shader-pass-runner';
	import type {
		OverlayRenderer,
		ShaderPass,
		SurfaceRenderInstance,
		SurfaceRenderInputs
	} from './pipelines/types';
	import CanvasControlsBar from './CanvasControlsBar.svelte';
	import CanvasEditingOverlay from './CanvasEditingOverlay.svelte';
	import Inspector from './Inspector.svelte';
	import TimelineOutline from './TimelineOutline.svelte';
	import type {
		ClipCascadeLink,
		ClipKeyframe,
		TimelineTrack,
		TimelineTransition
	} from './timeline-track';
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
		getEaseGsap,
		listMarkInstances,
		resolveMarkForIndex,
		SUGAR_OPACITY_EXIT_EASES,
		type Cascade,
		type DiagramElement,
		type DiagramEndpoint,
		type Effect,
		type Keyframe,
		type MarkInstance,
		type Preset,
		type SurfaceType
	} from './engine-schema';
	import {
		engineState,
		ensureMarkTimingAtIndex,
		packState,
		transitionState,
		type ResolvedTransition
	} from './engine-state.svelte';
	import { applyCompositionState } from './preset';
	import { presetBase } from './preset-base.svelte';
	import { serializeCompositionState } from './preset-pure';
	import { compositionMeta } from './composition-meta.svelte';
	import { getPack } from './packs/registry';
	import {
		resolveAppearanceVars,
		resolveDepthTreatment,
		resolveDiagramStroke,
		resolveEdgeTreatment,
		resolveLightTreatment,
		resolveMaterialTreatment,
		resolveTypographyColors,
		type LightTreatment
	} from './packs/resolve';
	import {
		edgeTreatmentPass,
		type EdgeTreatmentTarget
	} from '$lib/pipelines/shader-passes/edge-treatment';
	import { crtScanlinePass } from '$lib/pipelines/shader-passes/crt-scanline';
	import { measureOverlayBoundsPx } from '$lib/utils/overlay-bounds';

	import { TransitionSnapshots } from './pipelines/transition-snapshots';
	import { CompositionPlanes, type CompositeBackdrop } from './pipelines/composition-planes';
	import { DepthStage } from './pipelines/depth-stage';
	import { compileTransitionWipe, type CompiledTransitionWipe } from './pipelines/transition-pass';
	import {
		downloadVideoBlob,
		exportTransparentProRes,
		exportTransparentWebM,
		type TransparentVideoExportOptions
	} from './export-video';
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { renderAudioMix } from './audio-mix';
	import { AudioPreview } from './audio-preview';
	import { deriveSoundCues, isAudibleSoundCue } from './sound-cues';
	import { clampNumber } from '$lib/utils/math';
	import { hexToRgbaFloat, isDarkSurfaceColor } from '$lib/utils/color';
	import { truncateMiddle } from '$lib/utils/string';
	import { computeUnifiedBar, type RampTiming } from '$lib/utils/timeline-clip';
	import { easeLandingFraction } from './ease-landing';
	import { EFFECT_CATALOG, type Phase } from '$lib/text-animations/catalog';
	import { messageEnter, messageTyping } from '$lib/pipelines/surfaces/imessage/schedule';
	import { buildCursorSchedule } from '$lib/pipelines/overlays/cursor-trail/schedule';
	import type { CursorPath } from '$lib/pipelines/overlays/cursor-trail/index';
	import { exposeVisualAudit } from './runtime-audit';
	import { captureCanvasWebp } from '$lib/utils/canvas-capture';
	import { posterExists, putPoster } from './posters';

	// Content key for this composition's poster, supplied by the route (which owns
	// the loaded Preset). When set, the settled frame is captured once and cached
	// server-side so the picker can show a real, always-in-sync preview.
	let { posterKey = null }: { posterKey?: string | null } = $props();
	const capturedPosterKeys = new Set<string>();

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
	let pipelineSurfaceType = $state.raw<SurfaceType | null>(null);
	let effectChain = $state.raw<EffectChain | null>(null);
	let shaderPassDispatcher = $state.raw<ShaderPassDispatcher | null>(null);
	let compositionPlanes = $state.raw<CompositionPlanes | null>(null);
	// Dimensional depth stage (ADR-0028). Built when a Preset declares state.stage;
	// renders the composition through a real 3D compositor instead of the flat path.
	let depthStage = $state.raw<DepthStage | null>(null);
	// Resident GPU texture for the depth stage's backdrop image substrate (dex
	// p20), or null when the active stage declares no backdrop image. Loaded in
	// the pipeline-build effect (gated into first paint alongside fonts) and
	// sampled per frame by renderDepthStage — never decoded/uploaded per frame.
	let substrateTexture = $state.raw<GPUTexture | null>(null);
	let timeline = $state.raw<Timeline | null>(null);
	const animationManager = new AnimationManager();
	const audioPreview = new AudioPreview();
	const textAnimationManager = new TextAnimationManager();

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

	// Multi-state transition (ADR-0026). These are read only imperatively (in
	// renderAt / the snapshot orchestration), never in a tracked effect scope, so
	// they are plain non-reactive `let`s — keeping the render path out of the
	// reactive graph on purpose. `transitionReady` gates renderAt onto the wipe;
	// `preparedFor` / `preparing` guard the async snapshot against re-entrancy
	// (capturing a state swaps engineState, which re-fires the pipeline effect).
	let snapshots: TransitionSnapshots | null = null;
	let transitionWipe: CompiledTransitionWipe | null = null;
	let transitionReady = false;
	let preparedFor: ResolvedTransition | null = null;
	let preparing = false;
	// The frame of each state to snapshot: mid-timeline, settled (after enter,
	// before exit). A later refinement may let the transition name a per-state frame.
	const SNAPSHOT_PROGRESS = 0.5;

	// Where the editor parks the playhead on first load: a settled frame past every
	// enter and before any exit, so the composition + its overlays are visible
	// immediately instead of an empty t=0 canvas (overlays haven't entered yet).
	// Preview-only — export still renders from frame 0.
	const SETTLED_PREVIEW_FRACTION = 0.5;

	let isExporting = $state(false);
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

	// Keep a tween inside the [0, 1] timeline: a start past `1 - duration` would
	// grow the GSAP timeline beyond 1 and desync the progress↔transport mapping
	// for every other tween.
	function clampTweenStart(start: number, duration: number): number {
		return clampNumber(start, 0, Math.max(0, 1 - duration));
	}

	const OVERLAY_CHANNEL_KEYS = ['opacity', 'x', 'y', 'scale', 'rotation'] as const;

	// Emit one tween per keyframe segment per channel (ADR-0035 §5). Each
	// segment runs the ease declared ON its destination keyframe (the curve
	// INTO it); a single-keyframe track pins a constant value. Keyframe atMs
	// are ms from the element's cascade-resolved clip start.
	function pushKeyframeTweens(opts: {
		tweens: AnimationTweenSpec[];
		keyPrefix: string;
		frames: readonly Keyframe[];
		clipStartFraction: number;
		durationMs: number;
		write: (value: number) => void;
	}): void {
		const { tweens, keyPrefix, frames, clipStartFraction, durationMs, write } = opts;
		const toFraction = (ms: number) => ms / durationMs;

		if (frames.length === 1) {
			const only = frames[0];
			tweens.push({
				key: `${keyPrefix}-0`,
				start: clampTweenStart(clipStartFraction + toFraction(only.atMs), 0),
				duration: 0,
				ease: 'none',
				from: only.value,
				to: only.value,
				onUpdate: write
			});
			return;
		}

		for (let i = 1; i < frames.length; i += 1) {
			const prev = frames[i - 1];
			const next = frames[i];
			const duration = Math.min(toFraction(next.atMs - prev.atMs), 1);
			tweens.push({
				key: `${keyPrefix}-${i}`,
				start: clampTweenStart(clipStartFraction + toFraction(prev.atMs), duration),
				duration,
				ease: getEaseGsap(next.ease ?? 'smooth'),
				from: prev.value,
				to: next.value,
				onUpdate: write
			});
		}
	}

	function buildAnimationManifest(): AnimationManifest {
		const surface = engineState.surface;
		const parsedMarks = readMarks();
		const durationMs = engineState.transport.durationSeconds * 1000;

		syncProgressArray('markProgresses', parsedMarks.length);
		syncProgressArray('overlayProgresses', engineState.overlays.length);

		// Cascade welds resolve to absolute starts BEFORE any tween is emitted
		// (ADR-0035 §4); sound cues derive after this same resolution (ADR-0033).
		const cascadeWindows = resolveCascadeTimings(engineState);

		const tweens: AnimationTweenSpec[] = [];

		const surfaceOpacityTrack = surface.animation?.channels?.opacity;
		if (surfaceOpacityTrack && surfaceOpacityTrack.length > 0) {
			// Composition-owned surface opacity (ADR-0035 §2): the authored channel
			// feeds the same paperVisibility uniform the sugar drove; the sugar
			// tweens do not run — ownership replaces, never layers.
			pushKeyframeTweens({
				tweens,
				keyPrefix: 'paper-opacity',
				frames: surfaceOpacityTrack,
				clipStartFraction: surface.enter?.start ?? 0,
				durationMs,
				write: (value) => {
					animState.paperVisibility = value;
				}
			});
		} else {
			if (surface.enter) {
				tweens.push({
					key: 'paper-enter',
					start: surface.enter.start,
					duration: surface.enter.duration,
					ease: getEaseGsap(surface.enter.ease),
					from: 0,
					to: 1,
					onUpdate: (value) => {
						animState.paperVisibility = value;
					}
				});
			}

			if (surface.exit) {
				tweens.push({
					key: 'paper-exit',
					start: surface.exit.start,
					duration: surface.exit.duration,
					// Surface fade is element opacity → the sugar expansion applies the
					// per-property opacity-exit default so it holds then lands at clip
					// end instead of head-loading (subjectless tail). ADR-0035 §5.
					ease: SUGAR_OPACITY_EXIT_EASES[surface.exit.ease],
					from: 1,
					to: 0,
					onUpdate: (value) => {
						animState.paperVisibility = value;
					}
				});
			}

			if (!surface.enter && !surface.exit) {
				animState.paperVisibility = 1;
			}
		}

		parsedMarks.forEach((mark, index) => {
			const resolved = resolveMarkForIndex(mark.style, index, engineState.marks);

			tweens.push({
				key: `mark-${index}`,
				// Cascade-resolved start (welded ms offset from the anchor) when the
				// timing entry declares one; the stored fraction otherwise.
				start: cascadeWindows.get(`mark:${index}`)?.startFraction ?? resolved.start,
				duration: resolved.duration,
				// Marks are STROKE-DRAWS: markProgress drives the ink advancing along
				// the stroke path (highlight width, underline/strike length, circle
				// arc). The named enter eases (`smooth`=power3.out etc.) front-load
				// progress so the stroke snaps to ~full in the first few frames then
				// only fills density — reads as a fade-in stamp, not a pen drag
				// (aesthetic.md § Mark layer: "ink saturates along the stroke path
				// over time, never a faded-in stamp"). Drive the draw on a steady
				// power1.inOut instead: soft start, constant-speed middle, soft
				// landing — a hand laying ink across the phrase. Intrinsic to the
				// stroke-draw motion-form, independent of the preset's `ease`.
				ease: 'power1.inOut',
				onUpdate: (value) => {
					animState.markProgresses[index] = value;
				}
			});
		});

		// Text animations: hand the DOM-target slots to the text-anim manager,
		// which splits each slot, compiles its catalog spec, and returns the
		// resulting AnimationTweenSpec[] for the main timeline. Entries with a
		// cascade get their enter start swapped for the resolved one (cloned —
		// the authored state never mutates).
		const textAnimationsResolved = engineState.textAnimations.map((entry) => {
			const resolvedStart = cascadeWindows.get(`textAnimation:${entry.id}`)?.startFraction;
			if (resolvedStart === undefined || resolvedStart === entry.enter.start) {
				return entry;
			}
			return { ...entry, enter: { ...entry.enter, start: resolvedStart } };
		});
		const textAnimTweens = textAnimationManager.rebuild(
			compositionElement,
			textAnimationsResolved,
			engineState.transport
		);
		for (const tween of textAnimTweens) {
			tweens.push(tween);
		}

		// Channel-owned overlays get live value slots (seeded so the mount is
		// sane even before the first tick); sugar overlays get null and ride
		// overlayProgresses + the intrinsic motion-form, unchanged.
		animState.overlayChannels = engineState.overlays.map((overlay) => {
			const channels = overlay.animation?.channels;
			if (!channels || !OVERLAY_CHANNEL_KEYS.some((key) => (channels[key]?.length ?? 0) > 0)) {
				return null;
			}
			return {
				opacity: channels.opacity?.[0]?.value ?? 1,
				x: channels.x?.[0]?.value ?? 0,
				y: channels.y?.[0]?.value ?? 0,
				scale: channels.scale?.[0]?.value ?? overlay.position.scale ?? 1,
				rotation: channels.rotation?.[0]?.value ?? overlay.position.rotation ?? 0
			};
		});

		engineState.overlays.forEach((overlay, index) => {
			const channelValues = animState.overlayChannels[index];
			const window = cascadeWindows.get(`overlay:${overlay.id}`);

			if (channelValues) {
				// Composition-owned motion (ADR-0035 §2): per-segment channel tweens
				// replace the intrinsic enter/exit fade-through outright — no
				// layering, no hidden motion beneath the authored channels.
				const channels = overlay.animation?.channels;
				const clipStart = window?.startFraction ?? overlay.enter?.start ?? 0;
				for (const channel of OVERLAY_CHANNEL_KEYS) {
					const frames = channels?.[channel];
					if (!frames || frames.length === 0) {
						continue;
					}
					pushKeyframeTweens({
						tweens,
						keyPrefix: `overlay-${overlay.id}-${channel}`,
						frames,
						clipStartFraction: clipStart,
						durationMs,
						write: (value) => {
							const slot = animState.overlayChannels[index];
							if (slot) {
								slot[channel] = value;
							}
						}
					});
				}
				// Park the progress slot fully visible — the mount styles from the
				// channel values, but whole-timeline-aware overlay sources must not
				// see a phantom 0-progress gate.
				animState.overlayProgresses[index] = 1;
				return;
			}

			// Fallback overlay enter — durations sit inside G6, ease defaults to
			// `settled` (the G7 convention for overlay landings). `start` lands the
			// visible portion past the 200 ms floor at any reasonable transport.
			const enter = overlay.enter ?? DEFAULT_OVERLAY_ENTER;
			const exit = overlay.exit;

			tweens.push({
				key: `overlay-${overlay.id}-enter`,
				// Cascade-resolved start when declared; the sugar/fallback otherwise.
				start: window?.startFraction ?? enter.start,
				duration: enter.duration,
				ease: getEaseGsap(enter.ease),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					animState.overlayProgresses[index] = value;
				}
			});

			if (exit) {
				tweens.push({
					key: `overlay-${overlay.id}-exit`,
					start: exit.start,
					duration: exit.duration,
					ease: getEaseGsap(exit.ease),
					from: 1,
					to: 0,
					onUpdate: (value) => {
						animState.overlayProgresses[index] = value;
					}
				});
			}
		});

		// Diagram Block elements (ADR-0036): enter drives `blockProgresses` (the
		// stroke draw-on scalar / DOM entrance form), exit drives `blockAlphas`
		// (a fade — an exit never un-draws a stroke). Channel-owned elements
		// mirror the overlay path: authored channels replace the intrinsic form.
		const diagramElements = surface.diagram ?? [];
		syncBlockRecords(diagramElements.map((element) => element.id));

		for (const element of diagramElements) {
			const channels = element.animation?.channels as
				| Partial<Record<(typeof OVERLAY_CHANNEL_KEYS)[number], Keyframe[]>>
				| undefined;
			const window = cascadeWindows.get(`block:${element.id}`);
			const hasChannels =
				channels !== undefined &&
				OVERLAY_CHANNEL_KEYS.some((key) => (channels[key]?.length ?? 0) > 0);

			if (hasChannels && channels) {
				const staticScale = 'scale' in element ? (element.scale ?? 1) : 1;
				animState.blockChannels[element.id] = {
					opacity: channels.opacity?.[0]?.value ?? 1,
					x: channels.x?.[0]?.value ?? 0,
					y: channels.y?.[0]?.value ?? 0,
					scale: channels.scale?.[0]?.value ?? staticScale,
					rotation: channels.rotation?.[0]?.value ?? 0
				};
				const clipStart = window?.startFraction ?? element.enter?.start ?? 0;
				for (const channel of OVERLAY_CHANNEL_KEYS) {
					const frames = channels[channel];
					if (!frames || frames.length === 0) {
						continue;
					}
					pushKeyframeTweens({
						tweens,
						keyPrefix: `block-${element.id}-${channel}`,
						frames,
						clipStartFraction: clipStart,
						durationMs,
						write: (value) => {
							const slot = animState.blockChannels[element.id];
							if (slot) {
								slot[channel] = value;
							}
						}
					});
				}
				// Park the sugar slots fully visible — the mount/pipeline read the
				// channel values; a phantom 0-progress gate must not hide them.
				animState.blockProgresses[element.id] = 1;
				animState.blockAlphas[element.id] = 1;
				continue;
			}

			animState.blockChannels[element.id] = null;
			animState.blockAlphas[element.id] = 1;
			const enter = element.enter ?? DEFAULT_BLOCK_ENTER;
			const isStrokeElement =
				element.type === 'edge-arrow' || element.type === 'timeline-segment';

			tweens.push({
				key: `block-${element.id}-enter`,
				start: window?.startFraction ?? enter.start,
				duration: enter.duration,
				// Stroke elements are draw-ons: the same steady power1.inOut craft
				// rule as the Marks (a pen drag, never a fading stamp). DOM elements
				// keep their authored enter ease.
				ease: isStrokeElement ? 'power1.inOut' : getEaseGsap(enter.ease),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					animState.blockProgresses[element.id] = value;
				}
			});

			if (element.exit) {
				tweens.push({
					key: `block-${element.id}-exit`,
					start: element.exit.start,
					duration: element.exit.duration,
					// The exit is an opacity fade — the sugar expansion applies the
					// per-property opacity default (hold, fade, land; ADR-0035 §5).
					ease: SUGAR_OPACITY_EXIT_EASES[element.exit.ease],
					from: 1,
					to: 0,
					onUpdate: (value) => {
						animState.blockAlphas[element.id] = value;
					}
				});
			}
		}

		return { tweens };
	}

	function getMarkColorsByIndex(): string[] {
		const parsedMarks = readMarks();
		return parsedMarks.map(
			(mark, index) => resolveMarkForIndex(mark.style, index, engineState.marks).color
		);
	}

	function getMarkIntensityByIndex(): number[] {
		const parsedMarks = readMarks();
		return parsedMarks.map(
			(mark, index) => resolveMarkForIndex(mark.style, index, engineState.marks).intensity
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

	// Diagram stroke inputs (ADR-0036): per-element draw scalar + fade alpha,
	// with the Pack stroke resolved once per frame — the `'ink'` sentinel
	// substitutes the composition's resolved ink (override → Pack core,
	// ADR-0038) so strokes flip with the preset's declared ink over footage.
	// Channel-owned elements render fully drawn at their authored opacity
	// (ownership replaces the draw-on form).
	function buildDiagramInputs(): SurfaceRenderInputs['diagram'] {
		const elements = engineState.surface.diagram;
		if (!elements || elements.length === 0) {
			return undefined;
		}
		const drawProgressById: Record<string, number> = {};
		const alphaById: Record<string, number> = {};
		for (const element of elements) {
			const channels = animState.blockChannels[element.id];
			if (channels) {
				drawProgressById[element.id] = 1;
				alphaById[element.id] = channels.opacity;
			} else {
				drawProgressById[element.id] = animState.blockProgresses[element.id] ?? 0;
				alphaById[element.id] = animState.blockAlphas[element.id] ?? 1;
			}
		}
		const stroke = resolveDiagramStroke(getPack(packState.slug));
		return {
			elements,
			drawProgressById,
			alphaById,
			stroke:
				stroke.color === 'ink'
					? { ...stroke, color: resolvedTypographyColors.inkColor }
					: stroke
		};
	}

	// Whether the surface background reads as dark, from its resolved paper
	// (override → Pack core fill, ADR-0038 — always a real colour).
	function surfaceHighlightIsDark(): boolean | undefined {
		return isDarkSurfaceColor(resolvedTypographyColors.paperColor);
	}

	// One unified clip bar (ADR-0034 §2a) from a Layer's enter/exit ramps. The
	// geometry is pure (computeUnifiedBar); the writers persist a dragged ramp.
	// Default writers mutate the live enter/exit refs; pass overrides when a Layer
	// stores its timing elsewhere (iMessage typing, mark timing).
	function buildUnifiedBar(opts: {
		id: string;
		label: string;
		color?: string;
		enter?: RampTiming;
		exit?: RampTiming;
		setEnter?: (start: number, duration: number) => void;
		setExit?: (start: number, duration: number) => void;
		/** Resolved ease (gsap or CSS cubic-bezier) the layer's enter/exit motion
		 *  uses; drives the ease-aware ramp fill so it ends where the motion visibly
		 *  lands. */
		enterEase?: string;
		exitEase?: string;
		/** Landing fraction override for composite motion (iMessage pop, staggered
		 *  text-animations) where the landing isn't a single ease. Wins over *Ease. */
		enterLandFrac?: number;
		exitLandFrac?: number;
	}): TimelineTransition {
		const { enter, exit } = opts;
		const resolveLand = (frac: number | undefined, ease: string | undefined): number =>
			frac ?? (ease ? easeLandingFraction(ease) : 1);
		const enterLandFrac = resolveLand(opts.enterLandFrac, opts.enterEase);
		const exitLandFrac = resolveLand(opts.exitLandFrac, opts.exitEase);
		const { barStart, barDuration, enterZone, exitZone } = computeUnifiedBar(
			enter,
			exit,
			enterLandFrac,
			exitLandFrac
		);
		return {
			id: opts.id,
			label: opts.label,
			color: opts.color,
			start: barStart,
			duration: barDuration,
			enterZone,
			exitZone,
			enterLandFrac,
			exitLandFrac,
			unified: {
				enterStart: enter?.start,
				enterDuration: enter?.duration,
				exitStart: exit?.start,
				exitDuration: exit?.duration,
				enterLandFrac,
				exitLandFrac,
				setEnter:
					opts.setEnter ??
					(enter
						? (start, duration) => {
								enter.start = start;
								enter.duration = duration;
							}
						: undefined),
				setExit:
					opts.setExit ??
					(exit
						? (start, duration) => {
								exit.start = start;
								exit.duration = duration;
							}
						: undefined)
			}
		};
	}

	// A staggered text-animation's units fill its enter/exit window, so the whole
	// row lands close to the window end — but a `whole`-target effect is a single
	// front-loaded unit that lands early. The DOM split isn't known at build time;
	// these representative unit counts estimate where the last unit lands (a few
	// units off only shifts the ramp a couple of pixels).
	const TEXT_ANIM_REP_UNITS: Record<string, number> = {
		whole: 1,
		'per-line': 3,
		'per-word': 7,
		'per-character': 16
	};

	function textAnimLandFrac(target: string, phase: Phase): number {
		const n = TEXT_ANIM_REP_UNITS[target] ?? 8;
		const stagger = phase.stagger_ms ?? 0;
		const total = phase.duration_ms + (n - 1) * stagger;
		if (total <= 0) return 1;
		// Last unit starts at (n-1)·stagger and lands `easeLand` into its duration.
		return ((n - 1) * stagger + phase.duration_ms * easeLandingFraction(phase.easing)) / total;
	}

	// ── Cascade + keyframe timeline adapters (ADR-0035 §7) ──

	// Anchor ref → the timeline row that renders it (same identities buildTracks uses).
	function cascadeAnchorTrackId(anchor: Cascade['anchor']): string {
		if (anchor === 'surface') {
			return 'surface';
		}
		if ('overlay' in anchor) {
			return `overlay-${anchor.overlay}`;
		}
		if ('mark' in anchor) {
			return `mark-${anchor.mark}`;
		}
		if ('block' in anchor) {
			return `block-${anchor.block}`;
		}
		return `textanim-${anchor.textAnimation}`;
	}

	// The resolved anchor event (leader start or end) as a timeline fraction.
	function cascadeAnchorFraction(cascade: Cascade, windows: Map<string, CascadeWindow>): number {
		const anchor = windows.get(cascadeNodeKey(cascade.anchor));
		if (!anchor) {
			return 0;
		}
		return cascade.event === 'end'
			? anchor.startFraction + anchor.durationFraction
			: anchor.startFraction;
	}

	function cascadeLinkFor(
		cascade: Cascade | undefined,
		windows: Map<string, CascadeWindow>
	): ClipCascadeLink | undefined {
		if (!cascade) {
			return undefined;
		}
		return {
			anchorTrackId: cascadeAnchorTrackId(cascade.anchor),
			anchorFraction: cascadeAnchorFraction(cascade, windows)
		};
	}

	// Dragging a FOLLOWER edits offsetMs — the weld is never silently broken.
	// The anchor event recomputes fresh per write so a moved leader doesn't
	// leave a stale offset behind.
	function writeCascadeStart(cascade: Cascade, startFraction: number): void {
		const durationMs = engineState.transport.durationSeconds * 1000;
		const anchorFraction = cascadeAnchorFraction(cascade, resolveCascadeTimings(engineState));
		cascade.offsetMs = (startFraction - anchorFraction) * durationMs;
	}

	type ChannelTrackMap = Partial<Record<string, Keyframe[] | undefined>>;

	function clipKeyframes(channels: ChannelTrackMap, clipStartFraction: number): ClipKeyframe[] {
		const durationMs = engineState.transport.durationSeconds * 1000;
		const markers: ClipKeyframe[] = [];
		for (const [channel, frames] of Object.entries(channels)) {
			frames?.forEach((frame, index) => {
				markers.push({ channel, index, fraction: clipStartFraction + frame.atMs / durationMs });
			});
		}
		return markers.sort((a, b) => a.fraction - b.fraction);
	}

	// Delete one keyframe (timeline Delete/Backspace). A drained track is
	// removed so the element returns to its intrinsic motion-form; a new first
	// keyframe drops its ease (nothing precedes it).
	function makeKeyframeDeleter(
		channels: ChannelTrackMap
	): (channel: string, index: number) => void {
		return (channel, index) => {
			const track = channels[channel];
			if (!track || !track[index]) {
				return;
			}
			track.splice(index, 1);
			if (track.length > 0) {
				delete track[0].ease;
			} else {
				delete channels[channel];
			}
		};
	}

	// Marker drag → retime atMs, clamped between neighbours so tracks stay
	// strictly ascending through any drag. Write-through to engineState (the
	// fork/autosave machinery rides every mutation).
	function makeKeyframeRetimer(
		channels: ChannelTrackMap,
		clipStartFraction: number
	): (channel: string, index: number, fraction: number) => void {
		return (channel, index, fraction) => {
			const frames = channels[channel];
			const frame = frames?.[index];
			if (!frames || !frame) {
				return;
			}
			const durationMs = engineState.transport.durationSeconds * 1000;
			const min = index > 0 ? frames[index - 1].atMs + 1 : 0;
			const max =
				index < frames.length - 1
					? frames[index + 1].atMs - 1
					: (1 - clipStartFraction) * durationMs;
			frame.atMs = clampNumber((fraction - clipStartFraction) * durationMs, min, Math.max(min, max));
		};
	}

	// Row label per diagram element: the type voice plus its content hook.
	function diagramEndpointName(endpoint: DiagramEndpoint): string {
		return 'node' in endpoint ? endpoint.node : '•';
	}

	function diagramTrackLabel(element: DiagramElement): string {
		switch (element.type) {
			case 'node':
				return `node · ${truncateMiddle(element.text ?? element.form, 14)}`;
			case 'edge-arrow':
				return `edge · ${diagramEndpointName(element.from)} → ${diagramEndpointName(element.to)}`;
			case 'label':
				return `label · ${truncateMiddle(element.text, 14)}`;
			case 'stat-callout':
				return `stat · ${element.to.toLocaleString('en-US')}`;
			case 'timeline-segment':
				return element.label ? `span · ${truncateMiddle(element.label, 14)}` : 'span';
		}
	}

	function buildTracks(): TimelineTrack[] {
		const surface = engineState.surface;
		const parsedMarks = readMarks();
		const trackList: TimelineTrack[] = [];
		// Cascade-resolved windows: follower clips render at their WELDED starts,
		// so dragging a leader moves them live (they re-derive, nothing is stored).
		const cascadeWindows = resolveCascadeTimings(engineState);

		// The surface row's chip follows the composition's paper — but a dark
		// paper vanishes against the dark timeline chrome, so fall back to the
		// ink, which is legible on dark paper by construction (and keeps the
		// bar's dark label text readable).
		const surfaceTrackColor = isDarkSurfaceColor(resolvedTypographyColors.paperColor)
			? resolvedTypographyColors.inkColor
			: resolvedTypographyColors.paperColor;

		const surfaceChannels = surface.animation?.channels;
		if (surfaceChannels?.opacity?.length) {
			// Channel-owned surface: the clip is the authored envelope with diamond
			// markers; no enter/exit ramps (the composition holds the pen).
			const label =
				surface.type === 'paper' ? 'Paper' : surface.type === 'newspaper' ? 'Newspaper' : 'Surface';
			const clipStart = cascadeWindows.get('surface')?.startFraction ?? 0;
			trackList.push({
				id: 'surface',
				label,
				color: surfaceTrackColor,
				transitions: [
					{
						id: 'clip',
						label,
						color: surfaceTrackColor,
						start: clipStart,
						duration: Math.max(cascadeWindows.get('surface')?.durationFraction ?? 0, 0.02),
						keyframes: clipKeyframes(surfaceChannels, clipStart),
						onKeyframeRetime: makeKeyframeRetimer(surfaceChannels, clipStart),
						onKeyframeDelete: makeKeyframeDeleter(surfaceChannels)
					}
				]
			});
		} else if (surface.enter || surface.exit) {
			const label =
				surface.type === 'paper' ? 'Paper' : surface.type === 'newspaper' ? 'Newspaper' : 'Surface';
			trackList.push({
				id: 'surface',
				label,
				color: surfaceTrackColor,
				transitions: [
					buildUnifiedBar({
						id: 'clip',
						label,
						color: surfaceTrackColor,
						enter: surface.enter,
						exit: surface.exit,
						enterEase: surface.enter ? getEaseGsap(surface.enter.ease) : undefined,
						// Surface exit is an opacity fade → the sugar per-property default.
						exitEase: surface.exit ? SUGAR_OPACITY_EXIT_EASES[surface.exit.ease] : undefined
					})
				]
			});
		}

		parsedMarks.forEach((mark, index) => {
			const resolved = resolveMarkForIndex(mark.style, index, engineState.marks);
			const label = truncateMiddle(mark.text, 20);
			const timing = engineState.marks.timings[index];
			const welded = timing?.cascade
				? (cascadeWindows.get(`mark:${index}`)?.startFraction ?? resolved.start)
				: resolved.start;

			// A mark draws on then holds — enter-only: the bar's left ramp is the
			// draw-on, solid through the rest. Timing is stored per-index.
			const bar = buildUnifiedBar({
				id: 'clip',
				label,
				color: resolved.color,
				enter: { start: welded, duration: resolved.duration },
				// The draw-on always runs on power1.inOut (see buildAnimationManifest),
				// independent of the mark's declared ease.
				enterEase: 'power1.inOut',
				setEnter: (start, duration) => {
					const target = ensureMarkTimingAtIndex(index);
					target.duration = duration;
					if (target.cascade) {
						writeCascadeStart(target.cascade, start);
					} else {
						target.start = start;
					}
				}
			});
			bar.cascade = cascadeLinkFor(timing?.cascade, cascadeWindows);
			trackList.push({ id: `mark-${index}`, label, color: resolved.color, transitions: [bar] });
		});

		// Diagram Block elements (ADR-0036): one row per element, id `block-{id}`
		// — the same identity the cascade anchors and manifest tweens use. Rows
		// mirror overlays: channel-owned elements show the authored envelope with
		// keyframe diamonds; sugar elements the unified clip bar. An element with
		// no authored enter shows the engine default and materialises it on drag
		// (the ensureMarkTimingAtIndex pattern).
		for (const element of engineState.surface.diagram ?? []) {
			const trackId = `block-${element.id}`;
			const label = diagramTrackLabel(element);
			const channels = element.animation?.channels as ChannelTrackMap | undefined;
			const cascade = element.animation?.cascade;
			const window = cascadeWindows.get(`block:${element.id}`);
			const link = cascadeLinkFor(cascade, cascadeWindows);
			const color = '#fabf47';

			if (channels && clipKeyframes(channels, 0).length > 0) {
				const clipStart = window?.startFraction ?? 0;
				const transition: TimelineTransition = {
					id: 'clip',
					label,
					color,
					start: clipStart,
					duration: Math.max(window?.durationFraction ?? 0, 0.02),
					keyframes: clipKeyframes(channels, clipStart),
					onKeyframeRetime: makeKeyframeRetimer(channels, clipStart),
					onKeyframeDelete: makeKeyframeDeleter(channels),
					cascade: link
				};
				if (cascade) {
					transition.minStart = 0;
					transition.maxStart = 0.98;
					transition.onUpdate = ({ start }) => {
						writeCascadeStart(cascade, start);
					};
				} else if (element.enter) {
					const enter = element.enter;
					transition.minStart = 0;
					transition.maxStart = 0.98;
					transition.onUpdate = ({ start }) => {
						enter.start = start;
					};
				}
				trackList.push({ id: trackId, label, color, transitions: [transition] });
				continue;
			}

			const isStrokeElement = element.type === 'edge-arrow' || element.type === 'timeline-segment';
			const enter = element.enter;
			const displayEnter =
				enter && cascade && window
					? { start: window.startFraction, duration: enter.duration }
					: (enter ?? {
							start: window?.startFraction ?? DEFAULT_BLOCK_ENTER.start,
							duration: DEFAULT_BLOCK_ENTER.duration
						});

			const bar = buildUnifiedBar({
				id: 'clip',
				label,
				color,
				enter: displayEnter,
				exit: element.exit,
				// Stroke draw-ons run the Marks' steady power1.inOut; DOM elements
				// their authored (or default) enter ease. Exits are opacity fades.
				enterEase: isStrokeElement
					? 'power1.inOut'
					: getEaseGsap(enter?.ease ?? DEFAULT_BLOCK_ENTER.ease),
				exitEase: element.exit ? SUGAR_OPACITY_EXIT_EASES[element.exit.ease] : undefined,
				setEnter: (start, duration) => {
					const target = (element.enter ??= {
						start: DEFAULT_BLOCK_ENTER.start,
						duration: DEFAULT_BLOCK_ENTER.duration,
						ease: DEFAULT_BLOCK_ENTER.ease
					});
					target.duration = duration;
					if (cascade) {
						writeCascadeStart(cascade, start);
					} else {
						target.start = start;
					}
				}
			});
			bar.cascade = link;
			trackList.push({ id: trackId, label, color, transitions: [bar] });
		}

		// stat-callout: the count roll as a draggable clip (start = rollStart,
		// width = rollWindow), same semantics as the counter overlay's sub-track.
		for (const element of engineState.surface.diagram ?? []) {
			if (element.type !== 'stat-callout') {
				continue;
			}
			const stat = element;
			trackList.push({
				id: `block-${element.id}-roll`,
				label: 'count roll',
				color: '#fabf47',
				transitions: [
					{
						id: 'roll',
						label: 'count',
						start: stat.rollStart ?? stat.enter?.start ?? DEFAULT_BLOCK_ENTER.start,
						duration: stat.rollWindow ?? 0.5,
						ramp: 'in' as const,
						minStart: 0,
						maxStart: 0.95,
						minDuration: 0.05,
						maxDuration: 1,
						onUpdate: ({ start, duration }: { start: number; duration: number }) => {
							stat.rollStart = start;
							stat.rollWindow = Math.min(1, duration);
						}
					}
				]
			});
		}

		engineState.overlays.forEach((overlay) => {
			const trackId = `overlay-${overlay.id}`;
			const channels = overlay.animation?.channels;
			const cascade = overlay.animation?.cascade;
			const window = cascadeWindows.get(`overlay:${overlay.id}`);
			const link = cascadeLinkFor(cascade, cascadeWindows);

			if (channels && clipKeyframes(channels, 0).length > 0) {
				// Channel-owned overlay: the clip is the authored envelope; diamonds
				// are the keyframes. Moving the clip retimes the weld (offsetMs) when
				// cascaded, or the sugar clip anchor when one exists.
				const clipStart = window?.startFraction ?? 0;
				const transition: TimelineTransition = {
					id: 'clip',
					label: overlay.type,
					color: '#1f5aff',
					start: clipStart,
					duration: Math.max(window?.durationFraction ?? 0, 0.02),
					keyframes: clipKeyframes(channels, clipStart),
					onKeyframeRetime: makeKeyframeRetimer(channels, clipStart),
					onKeyframeDelete: makeKeyframeDeleter(channels),
					cascade: link
				};
				if (cascade) {
					transition.minStart = 0;
					transition.maxStart = 0.98;
					transition.onUpdate = ({ start }) => {
						writeCascadeStart(cascade, start);
					};
				} else if (overlay.enter) {
					const enter = overlay.enter;
					transition.minStart = 0;
					transition.maxStart = 0.98;
					transition.onUpdate = ({ start }) => {
						enter.start = start;
					};
				}
				trackList.push({ id: trackId, label: overlay.type, color: '#1f5aff', transitions: [transition] });
				return;
			}

			const enter = overlay.enter;
			const exit = overlay.exit;

			if (!enter && !exit) {
				trackList.push({ id: trackId, label: overlay.type, color: '#1f5aff', transitions: [] });
				return;
			}

			const bar = buildUnifiedBar({
				id: 'clip',
				label: overlay.type,
				color: '#1f5aff',
				// Cascaded enters render at the WELDED start; the writer below keeps
				// the weld and edits offsetMs instead of the (ignored) sugar start.
				enter:
					enter && cascade && window ? { start: window.startFraction, duration: enter.duration } : enter,
				exit,
				enterEase: enter ? getEaseGsap(enter.ease) : undefined,
				exitEase: exit ? getEaseGsap(exit.ease) : undefined,
				setEnter:
					enter && cascade
						? (start, duration) => {
								enter.duration = duration;
								writeCascadeStart(cascade, start);
							}
						: undefined
			});
			bar.cascade = link;
			trackList.push({ id: trackId, label: overlay.type, color: '#1f5aff', transitions: [bar] });
		});

		// instance-stack: the staggered assembly as a draggable clip (start =
		// staggerStart, width = lagWindow), so its entrance timing is composition
		// data, not keyed to the raw clip start.
		engineState.overlays.forEach((overlay) => {
			if (overlay.type !== 'instance-stack') {
				return;
			}
			const stack = overlay.content as { staggerStart?: number; lagWindow?: number };
			trackList.push({
				id: `overlay-${overlay.id}-stack`,
				label: 'stack stagger',
				color: '#f6c945',
				transitions: [
					{
						id: 'stagger',
						label: 'stack',
						start: stack.staggerStart ?? 0,
						duration: stack.lagWindow ?? 0.4,
						ramp: 'in' as const,
						minStart: 0,
						maxStart: 0.95,
						minDuration: 0.02,
						maxDuration: 0.9,
						onUpdate: ({ start, duration }: { start: number; duration: number }) => {
							stack.staggerStart = start;
							stack.lagWindow = Math.min(1, duration);
						}
					}
				]
			});
		});

		// counter: the roll-to-landing as a draggable clip (start = rollStart,
		// width = rollWindow); the landed value holds after.
		engineState.overlays.forEach((overlay) => {
			if (overlay.type !== 'counter') {
				return;
			}
			const roll = overlay.content as { rollStart?: number; rollWindow?: number };
			trackList.push({
				id: `overlay-${overlay.id}-roll`,
				label: 'count roll',
				color: '#1f5aff',
				transitions: [
					{
						id: 'roll',
						label: 'count',
						start: roll.rollStart ?? 0,
						duration: roll.rollWindow ?? 0.78,
						ramp: 'in' as const,
						minStart: 0,
						maxStart: 0.95,
						minDuration: 0.05,
						maxDuration: 1,
						onUpdate: ({ start, duration }: { start: number; duration: number }) => {
							roll.rollStart = start;
							roll.rollWindow = Math.min(1, duration);
						}
					}
				]
			});
		});

		// text-3d: the spin-in to the hero frame as a draggable clip (start =
		// spinStart, width = spinWindow); the word holds + breathes after.
		engineState.overlays.forEach((overlay) => {
			if (overlay.type !== 'text-3d') {
				return;
			}
			const spin = overlay.content as { spinStart?: number; spinWindow?: number };
			trackList.push({
				id: `overlay-${overlay.id}-spin`,
				label: 'spin in',
				color: '#1f5aff',
				transitions: [
					{
						id: 'spin',
						label: 'spin',
						start: spin.spinStart ?? 0,
						duration: spin.spinWindow ?? 0.42,
						ramp: 'in' as const,
						minStart: 0,
						maxStart: 0.95,
						minDuration: 0.05,
						maxDuration: 1,
						onUpdate: ({ start, duration }: { start: number; duration: number }) => {
							spin.spinStart = start;
							spin.spinWindow = Math.min(1, duration);
						}
					}
				]
			});
		});

		// cursor-trail: one clip per waypoint, sized by its authored dwellMs and
		// positioned by the glide schedule (NOT uniform spacing). The clip's start
		// is the arrival time (drag → travelMs into this waypoint); its width is the
		// hold (drag → dwellMs). totalMs is snapshotted per build so the ms↔fraction
		// conversion is stable within a drag.
		engineState.overlays.forEach((overlay) => {
			if (overlay.type !== 'cursor-trail') {
				return;
			}
			const path = (overlay.content as { path?: CursorPath[] }).path ?? [];
			const schedule = buildCursorSchedule(path);
			const totalMs = schedule.totalMs;
			schedule.dwells.forEach((dwell) => {
				const step = path[dwell.index];
				if (!step) {
					return;
				}
				trackList.push({
					id: `overlay-${overlay.id}-cursor-${dwell.index}`,
					label: `↳ ${dwell.targetSlot}`,
					color: '#16b8a6',
					transitions: [
						{
							id: 'dwell',
							label: 'dwell',
							start: dwell.arrivalFraction,
							duration: Math.max(dwell.durationFraction, 0.015),
							ramp: 'in' as const,
							minStart: dwell.hasGlide ? 0 : 0,
							maxStart: dwell.hasGlide ? 0.98 : 0,
							minDuration: 0,
							maxDuration: 1,
							onUpdate: ({ start, duration }: { start: number; duration: number }) => {
								// Width → this waypoint's hold.
								step.dwellMs = Math.max(0, duration * totalMs);
								// Start → the glide INTO this waypoint (time from when the
								// previous hold ended to arrival). First waypoint has no glide.
								if (dwell.hasGlide) {
									step.travelMs = Math.max(0, start * totalMs - dwell.glideStartMs);
								}
							}
						}
					]
				});
			});
		});

		// Text-animation tracks (ADR-0011). One track per entry; enter (and
		// optional exit) appear as draggable transitions on the rail so the
		// author can retune timing without editing JSON.
		engineState.textAnimations.forEach((entry) => {
			const targetLabel =
				entry.target.kind === 'surface'
					? `T · ${entry.target.slot}`
					: `T · ${entry.target.overlayId}.${entry.target.slot}`;
			const label = `${targetLabel} · ${entry.effect}`;

			// Landing comes from the catalog effect's own scheduling (its easing is
			// intrinsic, per spec.enter/exit), not the per-entry ease.
			const spec = EFFECT_CATALOG.get(entry.effect);
			const cascade = entry.cascade;
			const welded = cascade
				? cascadeWindows.get(`textAnimation:${entry.id}`)?.startFraction
				: undefined;

			const bar = buildUnifiedBar({
				id: 'clip',
				label,
				color: '#7e3aff',
				enter:
					welded !== undefined ? { start: welded, duration: entry.enter.duration } : entry.enter,
				exit: entry.exit,
				enterLandFrac: spec ? textAnimLandFrac(spec.target, spec.enter) : 1,
				exitLandFrac: spec?.exit ? textAnimLandFrac(spec.target, spec.exit) : 1,
				setEnter: cascade
					? (start, duration) => {
							entry.enter.duration = duration;
							writeCascadeStart(cascade, start);
						}
					: undefined
			});
			bar.cascade = cascadeLinkFor(cascade, cascadeWindows);
			trackList.push({
				id: `textanim-${entry.id}`,
				label,
				color: '#7e3aff',
				transitions: [bar]
			});
		});

		// iMessage conversation tracks — one draggable clip per bubble, so the
		// per-message choreography lives in the composition (message.enter), not in
		// the renderer. Typing / tapback / receipt derive from the bubble's start.
		if (surface.type === 'imessage') {
			(surface.content.messages ?? []).forEach((message, index) => {
				const timing = messageEnter(message, index);
				const typing = messageTyping(message, index);
				const label = truncateMiddle(annotationBodyPlainText(message.text), 18) || '…';

				// One merged bar per bubble: the typing indicator is the lead-in ramp,
				// the landed bubble is the solid body (holds to the end). The lead-in
				// spans typing.start → bubble landed; setEnter splits it back into the
				// typing window + the bubble slide-in (slide-in length preserved).
				const leadInStart = typing ? typing.start : timing.start;
				const bubbleLanded = timing.start + timing.duration;
				// The bubble pops with a back.out spring over its pop window; within the
				// merged lead-in bar it lands once that spring settles (typing is a
				// static hold before it, so it carries no motion of its own).
				const leadInSpan = bubbleLanded - leadInStart;
				const enterLandFrac =
					leadInSpan > 0
						? (timing.start - leadInStart + timing.duration * easeLandingFraction('back.out')) /
							leadInSpan
						: 1;
				trackList.push({
					id: `imessage-${index}`,
					label,
					color: message.from === 'me' ? '#0a84ff' : '#8e8e93',
					transitions: [
						buildUnifiedBar({
							id: 'clip',
							label,
							color: message.from === 'me' ? '#0a84ff' : '#8e8e93',
							enter: { start: leadInStart, duration: Math.max(0.02, bubbleLanded - leadInStart) },
							enterLandFrac,
							setEnter: (start, duration) => {
								const slideIn = message.enter?.duration ?? timing.duration;
								if (typing) {
									const typingDuration = Math.max(0.01, duration - slideIn);
									message.typing = { duration: typingDuration };
									message.enter = {
										start: start + typingDuration,
										duration: slideIn,
										ease: message.enter?.ease
									};
								} else {
									message.enter = { start, duration, ease: message.enter?.ease };
								}
							}
						})
					]
				});
			});
		}

		// Sound rail (ADR-0033 §9): the bed + every cue — derived from motion AND
		// manual — on one row, so you see where sound fires against the motion.
		// Derived cues are locked to their motion (no drag: re-time the motion and
		// the cue follows for free); manual cues and the bed drag like any clip.
		// Silent cues (muted, or a Layer wearing no kit) render dimmed. No sound
		// anywhere → no rail.
		const soundTransitions: TimelineTransition[] = [];
		for (const cue of deriveSoundCues(engineState)) {
			soundTransitions.push({
				id: `derived-${cue.id}`,
				label: cue.event,
				start: cue.start,
				duration: 0.012,
				ramp: 'in' as const,
				color: isAudibleSoundCue(cue) ? '#2de8ee' : '#4a5560'
			});
		}
		engineState.audioCues.forEach((cue, index) => {
			soundTransitions.push({
				id: `manual-${cue.id}`,
				label: cue.kind === 'bed' ? `bed · ${cue.assetSlug}` : cue.assetSlug,
				start: cue.start,
				duration: Math.max(0.015, cue.duration),
				ramp: 'in' as const,
				color: cue.kind === 'bed' ? '#17727d' : '#2de8ee',
				minStart: 0,
				maxStart: 0.98,
				minDuration: 0.01,
				maxDuration: 1,
				onUpdate: ({ start, duration }: { start: number; duration: number }) => {
					const target = engineState.audioCues[index];
					target.start = start;
					target.duration = Math.min(1, duration);
				}
			});
		});
		if (soundTransitions.length > 0) {
			trackList.push({
				id: 'sound',
				label: 'Sound',
				color: '#2de8ee',
				transitions: soundTransitions
			});
		}

		return trackList;
	}

	const tracks = $derived(buildTracks());

	const backgroundFillFloat = $derived(
		engineState.backgroundFill ? hexToRgbaFloat(engineState.backgroundFill) : undefined
	);

	// Drives the Composition's plane split (ADR-0027): a `depth-of-field` Effect
	// hoists the Overlay layer into a separately-capturable sibling element.
	const dofActive = $derived(
		engineState.effects.some((effect) => effect.type === 'depth-of-field')
	);

	// Surfaces whose own pipeline already applies paperVisibility as a GPU alpha
	// fade — the plane composite must not multiply a second time (α² fades).
	const SELF_FADING_SURFACE_TYPES = new Set(['chapter-card', 'title-sequence', 'pullquote-on-photo']);

	// A composition-owned surface opacity channel (ADR-0035) needs the SURFACE
	// alone on its plane so the authored fade can multiply it on the GPU
	// (copyElementImageToTexture can't rasterize CSS opacity — a DOM fade is
	// binary). Overlays hoist to their own plane exactly like the DOF split.
	const surfaceOpacityOwned = $derived(
		Boolean(engineState.surface.animation?.channels?.opacity?.length) &&
			!SELF_FADING_SURFACE_TYPES.has(engineState.surface.type)
	);
	// The depth stage (ADR-0028) places the Overlay layer on its own 3D plane
	// (overlay-at-depth), so it needs the same split: Surface alone in
	// `.composition`, Overlays hoisted to their separately-captured sibling.
	const stageSplitActive = $derived(
		engineState.stage?.type === 'depth' && engineState.overlays.length > 0
	);
	const planeSplitActive = $derived(dofActive || surfaceOpacityOwned || stageSplitActive);

	// The composition-owned surface fade for this frame; 1 = no fade.
	function surfaceFadeAlpha(): number {
		return surfaceOpacityOwned ? clampNumber(animState.paperVisibility, 0, 1) : 1;
	}

	// The STAGE path's surface fade (ADR-0028). A surface whose fade carrier is
	// an ENVIRONMENT shaderPass loses it there (environment passes are skipped
	// on the stage — every one of them consumes paperVisibility), and
	// composition-owned opacity has no plane composite to ride — the stage's
	// surface plane applies the fade itself (backdrop-reconstruction mix).
	// DOM-driven surfaces (newspaper/paper slide by position) carry their own
	// envelope through the capture and must NOT be faded twice.
	function stageSurfaceFadeAlpha(): number {
		const renderer = getSurfaceRenderer(engineState.surface.type);
		const fadeCarrierSkipped = Boolean(
			(renderer?.shaderPass as ShaderPass<unknown> | undefined)?.environment
		);
		return fadeCarrierSkipped || surfaceOpacityOwned
			? clampNumber(animState.paperVisibility, 0, 1)
			: 1;
	}

	function findOverlayRenderer(type: string): OverlayRenderer | null {
		for (const renderer of Object.values(PIPELINE_REGISTRY.overlays)) {
			if (renderer.type === type) {
				return renderer as OverlayRenderer;
			}
		}
		return null;
	}

	// Build the per-frame ShaderPass dispatch list. Pack edge treatment first
	// (the surface's own physics then operate on the treated silhouette), then
	// the surface pass (ADR-0008), then any declared overlay passes (ADR-0005)
	// in the same document order as `engineState.overlays`. Resolved by ADR-0010.
	//
	// scope 'stage' (ADR-0028): the depth stage runs surface-LOCAL physics on
	// the surface plane texture before staging it, but skips environment passes
	// (the stage's real backdrop plane supersedes a painted backdrop) and
	// overlay passes (overlays live on their own plane, not in this texture).
	function buildShaderPassDispatchList(scope: 'flat' | 'stage' = 'flat'): ShaderPassDispatchList {
		const compositionSize = {
			width: host?.canvas.width ?? 0,
			height: host?.canvas.height ?? 0
		};

		const entries: Array<{
			pass: ShaderPass<unknown>;
			target: unknown;
			bounds: { x: number; y: number; width: number; height: number };
		}> = [];

		const surfaceRenderer = getSurfaceRenderer(engineState.surface.type);

		// Structural edge Role → pixels: a card-silhouette surface (opt-in via
		// `edgeTreatment`) has its outer cut resolved by the active Pack
		// (`<type>.edge` → core `edge-treatment`, ADR-0024). `none` — and any
		// Pack that makes no edge claim — dispatches nothing.
		if (surfaceRenderer?.edgeTreatment) {
			const pack = getPack(packState.slug);
			const treatment = resolveEdgeTreatment(pack, engineState.surface.type);
			if (treatment && treatment.mode !== 'none') {
				// Displaced modes (torn/irregular) take over the Pack's hard-offset
				// depth shadow: the CanvasSource drops its CSS box-shadow (it would
				// bake a straight card/shadow seam into the flat capture) and the
				// edge pass synthesizes the shadow as an offset duplicate of the
				// torn silhouette. Resolve the rig + its ink to shader floats here.
				let shadow: EdgeTreatmentTarget['shadow'] = null;
				if (treatment.mode === 'torn' || treatment.mode === 'irregular') {
					const inkHex =
						resolveAppearanceVars(pack, engineState.surface.type)['--ink'] ?? '#000000';
					const rig = resolveDepthTreatment(pack, engineState.surface.type, inkHex);
					// Only a hard-offset rig synthesizes the offset shadow — a glow rig
					// (emissive packs) claims hard edges by aesthetic, so a displaced
					// edge + glow pairing has no shader-side depth to carry.
					if (rig && rig.kind === 'hardOffset') {
						let rgba: [number, number, number, number];
						try {
							rgba = hexToRgbaFloat(rig.color);
						} catch {
							rgba = [0, 0, 0, 1];
						}
						shadow = { dx: rig.dx, dy: rig.dy, rgb: [rgba[0], rgba[1], rgba[2]] };
					}
				}
				const target: EdgeTreatmentTarget = {
					treatment,
					seedSource: engineState.surface.content.title ?? engineState.surface.type,
					shadow
				};
				entries.push({
					pass: edgeTreatmentPass as ShaderPass<unknown>,
					target,
					bounds: { x: 0, y: 0, width: compositionSize.width, height: compositionSize.height }
				});
			}
		}

		if (
			surfaceRenderer?.shaderPass &&
			!(scope === 'stage' && (surfaceRenderer.shaderPass as ShaderPass<unknown>).environment)
		) {
			entries.push({
				pass: surfaceRenderer.shaderPass as ShaderPass<unknown>,
				target: engineState.surface,
				bounds: { x: 0, y: 0, width: compositionSize.width, height: compositionSize.height }
			});
		}

		if (scope === 'flat') {
			for (const overlay of engineState.overlays) {
				const renderer = findOverlayRenderer(overlay.type);
				if (!renderer?.shaderPass) {
					continue;
				}
				entries.push({
					pass: renderer.shaderPass as ShaderPass<unknown>,
					target: overlay.content,
					bounds: measureOverlayBoundsPx(overlay, compositionElement, compositionSize)
				});
			}
		}

		// Pack material claim (the optional `material-treatment` core): a scanline
		// recipe dispatches the shared crt-scanline pass LAST, over the composited
		// element pixels. The pass is alpha-masked — per-element on transparent
		// overlays; the footage underneath is never treated — so this single
		// full-frame dispatch covers the surface target and every overlay target
		// in the flat capture (they share this texture; a per-overlay re-dispatch
		// would double-raster the same pixels). On the stage path the surface
		// plane keeps its material before staging; overlays at depth ride their
		// own plane, outside the dispatcher (same scope-out as overlay passes).
		const material = resolveMaterialTreatment(getPack(packState.slug));
		if (material) {
			entries.push({
				pass: crtScanlinePass as ShaderPass<unknown>,
				target: material,
				bounds: { x: 0, y: 0, width: compositionSize.width, height: compositionSize.height }
			});
		}

		return entries;
	}

	// Pack chrome (opaque pieces only). When the composition declares a
	// `backgroundFill` — the frame is a full-frame segment/bumper — the active
	// Pack's `chrome` Role (kind:'chrome') appends its effect recipe AFTER the
	// preset's own effects. The chrome is the Pack's dress, not composition
	// content: it never appears in the preset's `effects[]`, and transparent
	// overlays never receive it (the footage is not ours to treat). Chrome
	// entries carry stable synthetic ids so the effect chain's compiled cache
	// keys stay deterministic.
	function withPackChrome(effects: readonly Effect[]): readonly Effect[] {
		if (!engineState.backgroundFill) {
			return effects;
		}
		const role = getPack(packState.slug).roles['chrome'];
		if (!role || role.kind !== 'chrome' || role.effects.length === 0) {
			return effects;
		}
		return [
			...effects,
			...role.effects.map((entry, index) => ({
				type: entry.type,
				id: `pack-chrome-${index}`,
				params: entry.params ?? {}
			}))
		];
	}

	function effectChainTimebase(timestamp: number): { progress: number; timestamp: number } {
		const duration = engineState.transport.durationSeconds;
		return {
			progress: duration > 0 ? Math.max(0, Math.min(1, timestamp / duration)) : 0,
			timestamp
		};
	}

	// Depth-of-field (ADR-0027). A `depth-of-field` Effect switches the render
	// from the single merged composite to the multiplane path: capture the Surface
	// and Overlay layers as separate depth planes and composite them back-to-front.
	// Resolve its authored params (focusZ / aperture) and the per-layer focal-
	// distance scalars; the remaining effects run as an ordinary post-chain after.
	interface ResolvedDof {
		focusZ: number;
		aperture: number;
		surfaceZ: number;
		overlayZ: number;
		backdrop: CompositeBackdrop;
		otherEffects: typeof engineState.effects;
	}

	const NO_BACKDROP: CompositeBackdrop = {
		strength: 0,
		edgeBlur: 0,
		vignette: 0,
		speckle: 0,
		color: [0, 0, 0],
		grain: 0
	};

	function resolveDof(progress: number): ResolvedDof | null {
		const dofEffect = engineState.effects.find((effect) => effect.type === 'depth-of-field');
		if (!dofEffect) {
			// No DOF, but a composition-owned surface fade still needs the plane
			// composite (surface alone on its plane → GPU alpha-multiply). Zero
			// aperture degenerates the bokeh gather to a passthrough OVER.
			if (surfaceOpacityOwned) {
				return {
					focusZ: 0,
					aperture: 0,
					surfaceZ: 0,
					overlayZ: clampNumber(engineState.overlays[0]?.z ?? 0.7, 0, 1),
					backdrop: NO_BACKDROP,
					otherEffects: engineState.effects
				};
			}
			return null;
		}
		const raw = (dofEffect.params ?? {}) as {
			focusZ?: unknown;
			aperture?: unknown;
			focusPull?: { from?: unknown; to?: unknown; start?: unknown; duration?: unknown };
			backdrop?: {
				strength?: unknown;
				edgeBlur?: unknown;
				vignette?: unknown;
				speckle?: unknown;
				color?: unknown;
				grain?: unknown;
			};
		};
		const aperture = Math.max(0, typeof raw.aperture === 'number' ? raw.aperture : 0);
		let focusZ = clampNumber(typeof raw.focusZ === 'number' ? raw.focusZ : 0, 0, 1);
		// Optional animated rack focus: the focal plane ramps `from`→`to` across
		// [start, start+duration] in clip progress, eased smooth (smoothstep), so
		// focus pulls between the Surface and Overlay planes over the timeline — the
		// cinematic rack. Driven by the same paused-timeline progress as everything
		// else, so preview and export agree frame for frame.
		const pull = raw.focusPull;
		if (pull && typeof pull.from === 'number' && typeof pull.to === 'number') {
			const start = typeof pull.start === 'number' ? pull.start : 0;
			const duration = typeof pull.duration === 'number' && pull.duration > 0 ? pull.duration : 1;
			const local = clampNumber((progress - start) / duration, 0, 1);
			const eased = local * local * (3 - 2 * local);
			focusZ = clampNumber(pull.from + (pull.to - pull.from) * eased, 0, 1);
		}
		// v1: the Surface sits at the focal default (z 0.0); all overlays collapse
		// into one Overlay plane at the first overlay's z (schema default 0.7).
		// Per-overlay-instance planes by z are the documented extension.
		const overlayZ = clampNumber(engineState.overlays[0]?.z ?? 0.7, 0, 1);
		// Optional procedural backdrop (tabletop/macro depth) behind the Surface.
		const bd = raw.backdrop;
		let backdrop: CompositeBackdrop = NO_BACKDROP;
		if (bd && typeof bd.strength === 'number' && bd.strength > 0) {
			const rgb = typeof bd.color === 'string' ? hexToRgbaFloat(bd.color) : [0.06, 0.06, 0.08, 1];
			backdrop = {
				strength: clampNumber(bd.strength, 0, 1),
				edgeBlur: clampNumber(typeof bd.edgeBlur === 'number' ? bd.edgeBlur : 1, 0, 1),
				vignette: clampNumber(typeof bd.vignette === 'number' ? bd.vignette : 0.5, 0, 1),
				speckle: clampNumber(typeof bd.speckle === 'number' ? bd.speckle : 0.5, 0, 1),
				color: [rgb[0], rgb[1], rgb[2]],
				grain: Math.max(0, typeof bd.grain === 'number' ? bd.grain : 0.02)
			};
		}
		return {
			focusZ,
			aperture,
			surfaceZ: 0,
			overlayZ,
			backdrop,
			otherEffects: engineState.effects.filter((effect) => effect.type !== 'depth-of-field')
		};
	}

	interface ResolvedStage {
		focusZ: number;
		aperture: number;
		focusBand: number;
		backdropColor: [number, number, number];
		backdropAsset: string | null;
		backdropContrast: number;
		cameraMove: 'static' | 'push' | 'drift';
		cameraAmount: number;
		/** Overlay-at-depth: true when the Overlay layer is hoisted to its own
		 *  plane for the stage (any overlays present). */
		hasOverlayPlane: boolean;
		/** The Overlay plane's ADR-0021 z (0 = Surface distance, 1 = backdrop). */
		overlayZ: number;
		/** The active Pack's scene light (light-treatment Role); null = unlit. */
		light: LightTreatment | null;
		effects: typeof engineState.effects;
	}

	// Resolve the dimensional depth stage (ADR-0028) for this frame. focusZ animates
	// the same way the multiplane DOF rack does (from→to over [start,start+duration],
	// eased), so preview and export agree. The backdrop plane takes the composition's
	// backgroundFill (the surface composite stays card-on-transparent; the fill is the
	// depth backdrop, not baked into the surface plane).
	function resolveStage(progress: number): ResolvedStage | null {
		const stage = engineState.stage;
		if (!stage || stage.type !== 'depth') {
			return null;
		}
		let focusZ = clampNumber(stage.focus.focusZ, 0, 1);
		const pull = stage.focus.pull;
		if (pull) {
			const duration = pull.duration > 0 ? pull.duration : 1;
			const local = clampNumber((progress - pull.start) / duration, 0, 1);
			const eased = local * local * (3 - 2 * local);
			focusZ = clampNumber(pull.from + (pull.to - pull.from) * eased, 0, 1);
		}
		const bg = backgroundFillFloat;
		const backdropColor: [number, number, number] = bg ? [bg[0], bg[1], bg[2]] : [0.1, 0.09, 0.08];
		return {
			focusZ,
			aperture: clampNumber(stage.focus.aperture, 0, 1),
			focusBand: clampNumber(stage.focus.band, 0, 1),
			backdropColor,
			backdropAsset: stage.backdrop?.image?.asset ?? null,
			backdropContrast: clampNumber(stage.backdrop?.contrast ?? 0, 0, 1),
			cameraMove: stage.camera.move,
			cameraAmount: clampNumber(stage.camera.amount, 0, 1),
			hasOverlayPlane: engineState.overlays.length > 0,
			overlayZ: clampNumber(engineState.overlays[0]?.z ?? 0.7, 0, 1),
			// The scene light is the Pack's appearance claim (ADR-0028: the inert
			// light Role reaching pixels); geometry/motion stays the Preset's via
			// the camera + plane z's. No light-treatment Role ⇒ an unlit stage.
			light: resolveLightTreatment(getPack(packState.slug)),
			effects: engineState.effects
		};
	}

	// Which plane texture to present. Default is the back-to-front composite; the
	// `__supersDofPreviewPlane` debug switch (a verification seam, like
	// `__supersTimeline`) lets a capture script screenshot a single plane in
	// isolation to confirm the layers separated correctly before the bokeh stage.
	function dofInputTexture(planes: CompositionPlanes, surfacePlane: GPUTexture): GPUTexture {
		if (typeof window !== 'undefined') {
			const sel = window.__supersDofPreviewPlane;
			if (sel === 'surface') {
				return surfacePlane;
			}
			if (sel === 'overlay') {
				return planes.overlayPlaneTexture();
			}
		}
		return planes.compositeTexture();
	}

	// The multiplane DOF render, shared by preview (`renderCompositeTo`) and
	// export (`renderFrame`). Surface plane = the pipeline output read against the
	// Surface-layer element only; Overlay plane = the Overlay-layer DOM. Composite
	// back-to-front, then run the remaining effects + present.
	function renderDofPlanes(
		dof: ResolvedDof,
		inputs: SurfaceRenderInputs,
		timebase: { progress: number; timestamp: number },
		outputView: GPUTextureView,
		background: [number, number, number, number] | undefined
	): boolean {
		if (!pipeline || !host || !effectChain || !compositionPlanes || !overlayRootElement) {
			return false;
		}
		const planes = compositionPlanes;
		// Surface plane: `.composition` is surface-only while the plane split is on,
		// so the pipeline's default DOM capture is the Surface plane. Overlay plane:
		// the hoisted Overlay-root sibling, captured on its own.
		pipeline.uploadDom();
		pipeline.render(inputs);
		const surfaceOutput = pipeline.getOutputTexture();
		planes.captureOverlay(overlayRootElement);
		planes.composite({
			surfacePlaneView: surfaceOutput.createView(),
			focusZ: dof.focusZ,
			aperture: dof.aperture,
			surfaceZ: dof.surfaceZ,
			overlayZ: dof.overlayZ,
			backdrop: dof.backdrop,
			time: timebase.progress,
			surfaceAlpha: surfaceFadeAlpha()
		});
		const commandEncoder = host.device.createCommandEncoder();
		effectChain.apply({
			commandEncoder,
			effects: withPackChrome(dof.otherEffects),
			inputTexture: dofInputTexture(planes, surfaceOutput),
			outputView,
			...timebase,
			background
		});
		return true;
	}

	// The dimensional depth stage render (ADR-0028), shared by preview and export.
	// The Surface composite (card on transparent) is placed on a 3D plane over the
	// backdrop plane; the stage outputs an opaque, defocused composite that the
	// effect chain presents. No `background` fill — the backdrop plane is the
	// background, so the stage output is already opaque to the frame edges.
	function renderDepthStage(
		stage: ResolvedStage,
		inputs: SurfaceRenderInputs,
		timebase: { progress: number; timestamp: number },
		outputView: GPUTextureView
	): boolean {
		if (!pipeline || !host || !effectChain || !depthStage || !shaderPassDispatcher) {
			return false;
		}
		pipeline.uploadDom();
		pipeline.render(inputs);
		// Surface-local shader physics (edge treatment, the surface pass) run on
		// the surface plane texture BEFORE staging — a surface keeps its declared
		// physics on the stage. Environment + overlay passes are scoped out (see
		// buildShaderPassDispatchList).
		const stagedSurfaceTexture = shaderPassDispatcher.apply({
			commandEncoder: host.device.createCommandEncoder(),
			passes: buildShaderPassDispatchList('stage'),
			inputTexture: pipeline.getOutputTexture(),
			ctx: timebase
		});
		// Overlay-at-depth: capture the hoisted Overlay layer into its own
		// premultiplied plane texture (the ADR-0027 capture seam), handed to the
		// stage as a 3D plane at its ADR-0021 z.
		let overlayPlaneView: GPUTextureView | undefined;
		if (stage.hasOverlayPlane && compositionPlanes && overlayRootElement) {
			compositionPlanes.captureOverlay(overlayRootElement);
			compositionPlanes.premultiplyOverlay();
			overlayPlaneView = compositionPlanes.overlayPlaneTexture().createView();
		}
		depthStage.render({
			surfacePlaneView: stagedSurfaceTexture.createView(),
			overlayPlaneView,
			overlayZ: stage.overlayZ,
			focusZ: stage.focusZ,
			aperture: stage.aperture,
			focusBand: stage.focusBand,
			backdropColor: stage.backdropColor,
			backdropTextureView:
				stage.backdropAsset && substrateTexture ? substrateTexture.createView() : undefined,
			backdropContrast: stage.backdropContrast,
			cameraMove: stage.cameraMove,
			cameraAmount: stage.cameraAmount,
			light: stage.light,
			surfaceFadeAlpha: stageSurfaceFadeAlpha(),
			time: timebase.progress
		});
		const commandEncoder = host.device.createCommandEncoder();
		effectChain.apply({
			commandEncoder,
			effects: withPackChrome(stage.effects),
			inputTexture: depthStage.outputTexture(),
			outputView,
			...timebase,
			background: undefined
		});
		return true;
	}

	// Composite the current composition (surface → shaderPass → effect chain) into
	// `outputView`. The single render seam: `renderAt` points it at the canvas;
	// the transition snapshot path (ADR-0026) points it at an offscreen texture so
	// a state's finished frame can be captured and reused by the wipe.
	function renderCompositeTo(outputView: GPUTextureView, timestamp: number): void {
		if (!pipeline || !host || !effectChain || !shaderPassDispatcher) {
			return;
		}

		const timebase = effectChainTimebase(timestamp);

		// Dimensional depth stage (ADR-0028) takes precedence when declared; else the
		// flat multiplane DOF (ADR-0027); else the plain flat composite.
		const stage = resolveStage(timebase.progress);
		if (stage && renderDepthStage(stage, buildRenderInputs(timestamp), timebase, outputView)) {
			return;
		}

		const dof = resolveDof(timebase.progress);
		if (
			dof &&
			renderDofPlanes(dof, buildRenderInputs(timestamp), timebase, outputView, backgroundFillFloat)
		) {
			return;
		}

		pipeline.render(buildRenderInputs(timestamp));

		const commandEncoder = host.device.createCommandEncoder();

		const postShaderTexture = shaderPassDispatcher.apply({
			commandEncoder,
			passes: buildShaderPassDispatchList(),
			inputTexture: pipeline.getOutputTexture(),
			ctx: timebase
		});

		effectChain.apply({
			commandEncoder,
			effects: withPackChrome(engineState.effects),
			inputTexture: postShaderTexture,
			outputView,
			...timebase,
			background: backgroundFillFloat
		});
	}

	function renderAt(timestamp: number): void {
		if (!host) {
			return;
		}
		const outputView = host.context.getCurrentTexture().createView();
		// Transition mode (ADR-0026): once both states are snapshotted, composite
		// the wipe over them instead of the live composition. The timeline drives
		// the wipe's local progress (0 = from, 1 = to).
		if (transitionReady && snapshots && transitionWipe) {
			const duration = engineState.transport.durationSeconds;
			const progress = duration > 0 ? Math.max(0, Math.min(1, timestamp / duration)) : 0;
			transitionWipe.apply({
				fromView: snapshots.fromTexture().createView(),
				toView: snapshots.toTexture().createView(),
				outputView,
				progress
			});
			return;
		}
		renderCompositeTo(outputView, timestamp);
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

	// --- Multi-state transition snapshots (ADR-0026) ---

	// Capture one state's settled composite into `target`. Swap the live
	// composition to `preset`, let content + pipeline effects flush, drive the
	// animation to the settled frame, flush the DOM that produces, then re-upload
	// and composite that frame into the snapshot texture. The explicit uploadDom
	// immediately before the capture makes it deterministic regardless of the
	// reactive paint loop running underneath.
	function nextFrame(): Promise<void> {
		return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}

	async function captureStateSnapshot(preset: Preset, target: GPUTextureView): Promise<void> {
		applyCompositionState(preset);
		await tick();
		await fontsReady();
		// Let the new composition's content + pipeline effects fully lay out before
		// driving to the settled frame — overlays (e.g. per-glyph 3D text) mount and
		// size against --frame-w/h over a couple of frames, and capturing too early
		// grabs an un-laid-out (blank) DOM.
		await nextFrame();
		await nextFrame();
		animationManager.rebuild(buildAnimationManifest());
		animationManager.progress(SNAPSHOT_PROGRESS);
		animState.globalProgress = SNAPSHOT_PROGRESS;
		await tick();
		await nextFrame();
		await nextFrame();
		if (!pipeline) {
			return;
		}
		pipeline.uploadDom();
		renderCompositeTo(target, SNAPSHOT_PROGRESS * preset.state.transport.durationSeconds);
	}

	async function prepareTransition(active: ResolvedTransition): Promise<void> {
		if (!host || !canvas) {
			return;
		}
		transitionReady = false;
		if (!snapshots) {
			snapshots = new TransitionSnapshots({ host, width: canvas.width, height: canvas.height });
		}
		if (!transitionWipe) {
			// `mask-wipe` is the only transition Effect today; the validator already
			// confirmed `active.effect` is registered.
			transitionWipe = compileTransitionWipe(host);
		}
		// Capturing each state swaps engineState/packState to from/to. Freeze the
		// transition Preset's own composition first and restore ALL of it after
		// both snapshots — engineState must never be left holding a snapshot
		// scratch state (persistence would autosave it as a user edit), and
		// `transitionState.capturing` marks the swap window so the autosave path
		// ignores the scratch states in flight.
		const sourceComposition = serializeCompositionState(
			presetBase,
			$state.snapshot(engineState),
			packState.slug
		);
		transitionState.capturing = true;
		try {
			await captureStateSnapshot(active.from, snapshots.fromTarget());
			await captureStateSnapshot(active.to, snapshots.toTarget());
		} finally {
			applyCompositionState(sourceComposition);
			transitionState.capturing = false;
		}
		// The recipe may have been cleared or replaced while the captures were in
		// flight — only arm the wipe if this run still services the active one.
		if (transitionState.active !== active) {
			return;
		}
		transitionReady = true;
		// Reset to the wipe's start; seek() drives tickTimeline → the wipe renders.
		timeline?.seek(0);
	}

	$effect(() => {
		// Trigger when a transition activates AND the GPU host + pipeline exist;
		// reading host/canvas/pipeline here re-runs once they become available.
		const active = transitionState.active;
		const ready = host && canvas && pipeline;
		if (!active) {
			transitionReady = false;
			preparedFor = null;
			return;
		}
		if (!ready || preparedFor === active || preparing) {
			return;
		}
		preparedFor = active;
		untrack(() => {
			preparing = true;
			void prepareTransition(active).finally(() => {
				preparing = false;
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
			pipelineSurfaceType = surfaceType;

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
				}
				// The inspector's keyframe rows navigate the playhead through this
				// handle (prev/next jumps + add-at-playhead).
				timelineHandle.current = timeline;
				animationManager.rebuild(buildAnimationManifest());
				// Park on a settled frame so the composition is visible on open (the
				// seek drives the manifest to that frame and requests the first paint).
				timeline.seek(engineState.transport.durationSeconds * SETTLED_PREVIEW_FRACTION);
			}

			setCanvasPaintHandler(localCanvas, () => {
				// A paint re-uploads the current DOM and composites it. The seek/play
				// tick already applied the GSAP state (and wrote animState) before
				// requesting this paint, so we only composite here — renderAt(), not
				// tickTimeline(), to avoid re-driving the animation on every paint.
				nextPipeline.uploadDom();
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
					pipelineSurfaceType = null;
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
			void overlay.position.anchor;
			void overlay.position.offset?.x;
			void overlay.position.offset?.y;
			void overlay.position.rect?.x;
			void overlay.position.rect?.y;
			void overlay.position.rect?.width;
			void overlay.position.rect?.height;
			void overlay.position.scale;
			void overlay.position.rotation;
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
		// A deep read of every element — positions, routes, timing, channels,
		// cascades — via stringify, so any authored field change (including ones
		// the schema grows later) rebuilds + repaints. The hand-enumeration trap
		// (lost `counterpoint`) is exactly what this avoids; the cost is a few
		// hundred bytes per authoring change, not per frame.
		void engineState.surface.diagram?.length;
		for (const element of engineState.surface.diagram ?? []) {
			void JSON.stringify(element);
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
			// Effect Editors mutate params fields in place (bind on nested values),
			// so subscribe to every field — a read of the object reference alone
			// leaves the canvas stale until the next timeline tick.
			if (entry.params && typeof entry.params === 'object') {
				for (const value of Object.values(entry.params)) {
					void value;
				}
			}
		}
		void engineState.backgroundFill;

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
			animationManager.rebuild(buildAnimationManifest());
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
			window.removeEventListener('pointermove', onTimelineResizeMove);
			window.removeEventListener('pointerup', onTimelineResizeEnd);
		}
		timeline?.dispose();
		timeline = null;
		timelineHandle.current = null;
		audioPreview.dispose();
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
		snapshots?.dispose();
		snapshots = null;
		transitionWipe = null;
		transitionReady = false;
		preparedFor = null;
		host?.dispose();
		host = null;
	});

	async function handleExport(): Promise<void> {
		if (!canvas || !pipeline) {
			status = 'Stage is unavailable.';
			return;
		}

		const activePipeline = pipeline;
		const activeCanvas = canvas;
		const exportManager = new AnimationManager();

		timeline?.pause();
		isExporting = true;
		progress = 0;
		status = '';

		exportManager.rebuild(buildAnimationManifest());

		const durationSeconds = engineState.transport.durationSeconds;
		const fps = engineState.transport.fps;
		const format = engineState.transport.format;
		const markColorsByIndex = getMarkColorsByIndex();
		const markIntensityByIndex = getMarkIntensityByIndex();
		const exportBackground = engineState.backgroundFill
			? hexToRgbaFloat(engineState.backgroundFill)
			: undefined;

		const renderFrame: TransparentVideoExportOptions['renderFrame'] = (_frame, timestamp) => {
			const fraction = durationSeconds > 0 ? timestamp / durationSeconds : 0;
			exportManager.progress(fraction);
			const parsedMarksForExport = readMarks();
			const inputs: SurfaceRenderInputs = {
				animState: { markProgresses: animState.markProgresses },
				backgroundVisibility: engineState.surface.backgroundVisibility ?? 0,
				highlightDarkSurface: surfaceHighlightIsDark(),
				markColorsByIndex,
				markIntensityByIndex,
				textAnimAlphaByMarkIndex: computeTextAnimAlphaByMarkIndex(parsedMarksForExport),
				timestamp
			};
			const timebase = { progress: fraction, timestamp };

			// Dimensional depth stage (ADR-0028): owns its per-frame DOM upload + render,
			// same as the preview path, so export == preview.
			const stage = resolveStage(timebase.progress);
			if (
				stage &&
				host &&
				renderDepthStage(stage, inputs, timebase, host.context.getCurrentTexture().createView())
			) {
				return;
			}

			// Multiplane DOF (ADR-0027): captures the layers and composites itself,
			// so it owns the per-frame DOM upload (Surface-layer + Overlay-layer).
			const dof = resolveDof(timebase.progress);
			if (
				dof &&
				host &&
				renderDofPlanes(
					dof,
					inputs,
					timebase,
					host.context.getCurrentTexture().createView(),
					exportBackground
				)
			) {
				return;
			}

			// Re-capture the DOM into domTexture for THIS frame's progress. The export
			// loop pauses the preview paint loop, so without this the pipeline samples a
			// stale domTexture and freezes every DOM-driven visual (split-text kinetic
			// typography, the surface enter/exit slide) at whatever progress preview was
			// last scrubbed to. uploadDom() is synchronous and queue-ordered ahead of
			// render()'s sample — mirroring the preview onpaint handler (uploadDom then
			// render, no await). Must run after progress() (DOM now at this frame) and
			// before render(). Not requestCanvasPaint (that re-enters the preview manager).
			activePipeline.uploadDom();
			activePipeline.render(inputs);

			if (host && effectChain && shaderPassDispatcher) {
				const commandEncoder = host.device.createCommandEncoder();

				const postShaderTexture = shaderPassDispatcher.apply({
					commandEncoder,
					passes: buildShaderPassDispatchList(),
					inputTexture: activePipeline.getOutputTexture(),
					ctx: timebase
				});

				effectChain.apply({
					commandEncoder,
					effects: withPackChrome(engineState.effects),
					inputTexture: postShaderTexture,
					outputView: host.context.getCurrentTexture().createView(),
					...timebase,
					background: exportBackground
				});
			}
		};

		try {
			// The composition's baked audio track (ADR-0033 §6): a deterministic
			// offline mix of motion-derived cues + manual cues + bed. null when the
			// piece schedules no sound — the export then stays video-only.
			const audio = await renderAudioMix(engineState);

			if (format === 'prores') {
				const blob = await exportTransparentProRes({
					canvas: activeCanvas,
					durationSeconds,
					fps,
					onProgress: (value) => {
						progress = value;
					},
					renderFrame,
					audio
				});
				downloadVideoBlob(blob, 'supers-overlay.mov');
			} else {
				const hasBackground = exportBackground !== undefined;
				const blob = await exportTransparentWebM({
					canvas: activeCanvas,
					durationSeconds,
					fps,
					onProgress: (value) => {
						progress = value;
					},
					renderFrame,
					hasBackground,
					audio
				});
				downloadVideoBlob(blob, hasBackground ? 'supers-bumper.webm' : 'supers-overlay.webm');
			}
		} catch (error) {
			console.error('Unable to export overlay.', error);
			status = error instanceof Error ? error.message : 'Unable to export overlay.';
		} finally {
			exportManager.dispose();
			isExporting = false;
		}
	}
</script>

<svelte:window
	onkeydown={handleKeydown}
	bind:innerWidth={viewportWidth}
	bind:innerHeight={viewportHeight}
/>

<main class="workspace" style:--timeline-h="{effectiveTimelineHeight}px">
	<header class="workspace__topbar">
		<a class="topbar__back" href="/" aria-label="Back to presets">
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
		<span class="topbar__name">{compositionMeta.userSlug ?? 'Untitled'}</span>
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
		<Inspector {handleExport} {isExporting} {progress} {status} />
	</div>
</main>

<style>
	.workspace {
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
