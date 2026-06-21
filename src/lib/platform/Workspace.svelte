<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';

	import {
		AnimationManager,
		type AnimationManifest,
		type AnimationTweenSpec
	} from './animation-manager';
	import { TextAnimationManager } from '$lib/text-animations/manager.svelte';
	import { animState, syncProgressArray } from './anim-state.svelte';
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
	import Controls from './Controls.svelte';
	import ControlPanel from './ControlPanel.svelte';
	import ExportPanel from './ExportPanel.svelte';
	import TimelineScrubber from './TimelineScrubber.svelte';
	import TimelineTrackView, { type TimelineTrack } from './TimelineTrackView.svelte';
	import TrackInspector from './TrackInspector.svelte';
	import VideoFrame from './VideoFrame.svelte';
	import { fontsReady } from './fonts';
	import { createGpuHost, type GpuHost } from './gpu-host';
	import {
		clearCanvasPaintHandler,
		requestCanvasPaint,
		setCanvasPaintHandler
	} from './html-in-canvas';
	import { Timeline } from './timeline.svelte';
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
	import { getEaseGsap, resolveMarkForIndex, type Preset, type SurfaceType } from './engine-schema';
	import {
		engineState,
		ensureMarkTimingAtIndex,
		transitionState,
		type ResolvedTransition
	} from './engine-state.svelte';
	import { applyCompositionState } from './preset';
	import { measureOverlayBoundsPx } from '$lib/utils/overlay-bounds';

	import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
	import { createPlainPipeline } from '$lib/pipelines/surfaces/plain/pipeline';
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
	import { clampNumber } from '$lib/utils/math';
	import { hexToRgbaFloat } from '$lib/utils/color';
	import { truncateMiddle } from '$lib/utils/string';
	import { exposeVisualAudit } from './runtime-audit';

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
	let timeline = $state.raw<Timeline | null>(null);
	const animationManager = new AnimationManager();
	const textAnimationManager = new TextAnimationManager();

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

	let isExporting = $state(false);
	let progress = $state(0);
	let status = $state('');

	interface ParsedMark {
		style: AnnotationMarkStyle;
		text: string;
		/** Character offset of the marked run inside the body's plain-text projection. */
		startChar: number;
		/** End char index (exclusive). */
		endChar: number;
	}

	function readMarks(): ParsedMark[] {
		const result: ParsedMark[] = [];
		let cursor = 0;

		for (const block of engineState.surface.content.body) {
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
			// Paragraph break — accounts for "\n\n" between paragraphs in the
			// editor's serialized form. The text-animation manager splits the
			// rendered DOM which may collapse whitespace differently; the
			// marks-coupling min-over-overlapped-units is robust to a one-char
			// drift.
			cursor += 2;
		}

		return result;
	}

	function computeTextAnimAlphaByMarkIndex(marks: readonly ParsedMark[]): number[] | undefined {
		if (typeof window === 'undefined') {
			return undefined;
		}
		const mgr = window.__hivizTextAnimationManager;
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

	function buildAnimationManifest(): AnimationManifest {
		const surface = engineState.surface;
		const parsedMarks = readMarks();

		syncProgressArray('markProgresses', parsedMarks.length);
		syncProgressArray('overlayProgresses', engineState.overlays.length);

		const tweens: AnimationTweenSpec[] = [];

		if (surface.enter) {
			tweens.push({
				key: 'paper-enter',
				start: surface.enter.start,
				duration: surface.enter.duration,
				ease: getEaseGsap(surface.enter.ease, 'enter'),
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
				// Surface fade is element opacity → use the opacity-exit curve so it
				// holds then lands at clip end instead of head-loading (subjectless tail).
				ease: getEaseGsap(surface.exit.ease, 'exit', 'opacity'),
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

		parsedMarks.forEach((mark, index) => {
			const resolved = resolveMarkForIndex(mark.style, index, engineState.marks);

			tweens.push({
				key: `mark-${index}`,
				start: resolved.start,
				duration: resolved.duration,
				ease: getEaseGsap(resolved.ease, 'enter'),
				onUpdate: (value) => {
					animState.markProgresses[index] = value;
				}
			});
		});

		// Text animations: hand the DOM-target slots to the text-anim manager,
		// which splits each slot, compiles its catalog spec, and returns the
		// resulting AnimationTweenSpec[] for the main timeline.
		const textAnimTweens = textAnimationManager.rebuild(
			compositionElement,
			engineState.textAnimations,
			engineState.transport
		);
		for (const tween of textAnimTweens) {
			tweens.push(tween);
		}

		engineState.overlays.forEach((overlay, index) => {
			// Fallback overlay enter — durations sit inside G6, ease defaults to
			// `settled` (the G7 convention for overlay landings). `start` lands the
			// visible portion past the 200 ms floor at any reasonable transport.
			const enter = overlay.enter ?? { start: 0.04, duration: 0.05, ease: 'settled' as const };
			const exit = overlay.exit;

			tweens.push({
				key: `overlay-${overlay.id}-enter`,
				start: enter.start,
				duration: enter.duration,
				ease: getEaseGsap(enter.ease, 'enter'),
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
					ease: getEaseGsap(exit.ease, 'exit'),
					from: 1,
					to: 0,
					onUpdate: (value) => {
						animState.overlayProgresses[index] = value;
					}
				});
			}
		});

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
			markColorsByIndex: getMarkColorsByIndex(),
			markIntensityByIndex: getMarkIntensityByIndex(),
			textAnimAlphaByMarkIndex: computeTextAnimAlphaByMarkIndex(parsedMarks),
			timestamp
		};
	}

	function buildTracks(): TimelineTrack[] {
		const surface = engineState.surface;
		const parsedMarks = readMarks();
		const trackList: TimelineTrack[] = [];

		if (surface.enter || surface.exit) {
			const enter = surface.enter;
			const exit = surface.exit;

			trackList.push({
				id: 'surface',
				label:
					surface.type === 'paper' ? 'Paper' : surface.type === 'newspaper' ? 'Newspaper' : 'Body',
				color: engineState.typography.paperColor,
				transitions: [
					...(enter
						? [
								{
									id: 'enter',
									label: 'In',
									start: enter.start,
									duration: enter.duration,
									ramp: 'in' as const,
									minStart: 0,
									maxStart: 0.9,
									minDuration: 0.05,
									maxDuration: 0.6,
									onUpdate: ({ start, duration }: { start: number; duration: number }) => {
										enter.start = start;
										enter.duration = duration;
									}
								}
							]
						: []),
					...(exit
						? [
								{
									id: 'exit',
									label: 'Out',
									start: exit.start,
									duration: exit.duration,
									ramp: 'out' as const,
									minStart: 0.1,
									maxStart: 0.95,
									minDuration: 0.05,
									maxDuration: 0.6,
									onUpdate: ({ start, duration }: { start: number; duration: number }) => {
										exit.start = start;
										exit.duration = duration;
									}
								}
							]
						: [])
				],
				onTrackMove:
					enter && exit
						? (delta) => {
								const nextEnterStart = clampNumber(enter.start + delta, 0, 0.9);
								const enterDelta = nextEnterStart - enter.start;
								const nextExitStart = clampNumber(exit.start + enterDelta, 0.1, 0.95);
								enter.start = nextEnterStart;
								exit.start = nextExitStart;
							}
						: undefined
			});
		}

		parsedMarks.forEach((mark, index) => {
			const resolved = resolveMarkForIndex(mark.style, index, engineState.marks);
			const label = truncateMiddle(mark.text, 20);

			trackList.push({
				id: `mark-${index}`,
				label,
				color: resolved.color,
				transitions: [
					{
						id: 'enter',
						label,
						start: resolved.start,
						duration: resolved.duration,
						minStart: 0,
						maxStart: 0.95,
						minDuration: 0.05,
						maxDuration: 0.9,
						onUpdate: ({ start, duration }) => {
							const timing = ensureMarkTimingAtIndex(index);
							timing.start = start;
							timing.duration = duration;
						}
					}
				]
			});
		});

		engineState.overlays.forEach((overlay) => {
			const enter = overlay.enter;
			const exit = overlay.exit;

			trackList.push({
				id: `overlay-${overlay.id}`,
				label: overlay.type,
				color: '#1f5aff',
				transitions: [
					...(enter
						? [
								{
									id: 'enter',
									label: 'In',
									start: enter.start,
									duration: enter.duration,
									ramp: 'in' as const,
									minStart: 0,
									maxStart: 0.95,
									minDuration: 0.05,
									maxDuration: 0.6,
									onUpdate: ({ start, duration }: { start: number; duration: number }) => {
										enter.start = start;
										enter.duration = duration;
									}
								}
							]
						: []),
					...(exit
						? [
								{
									id: 'exit',
									label: 'Out',
									start: exit.start,
									duration: exit.duration,
									ramp: 'out' as const,
									minStart: 0.1,
									maxStart: 0.95,
									minDuration: 0.05,
									maxDuration: 0.6,
									onUpdate: ({ start, duration }: { start: number; duration: number }) => {
										exit.start = start;
										exit.duration = duration;
									}
								}
							]
						: [])
				]
			});
		});

		// Text-animation tracks (ADR-0011). One track per entry; enter (and
		// optional exit) appear as draggable transitions on the rail so the
		// author can retune timing without editing JSON.
		engineState.textAnimations.forEach((entry) => {
			const enter = entry.enter;
			const exit = entry.exit;
			const targetLabel =
				entry.target.kind === 'surface'
					? `T · ${entry.target.slot}`
					: `T · ${entry.target.overlayId}.${entry.target.slot}`;

			trackList.push({
				id: `textanim-${entry.id}`,
				label: `${targetLabel} · ${entry.effect}`,
				color: '#7e3aff',
				transitions: [
					{
						id: 'enter',
						label: 'In',
						start: enter.start,
						duration: enter.duration,
						ramp: 'in' as const,
						minStart: 0,
						maxStart: 0.95,
						minDuration: 0.02,
						maxDuration: 0.9,
						onUpdate: ({ start, duration }: { start: number; duration: number }) => {
							enter.start = start;
							enter.duration = duration;
						}
					},
					...(exit
						? [
								{
									id: 'exit',
									label: 'Out',
									start: exit.start,
									duration: exit.duration,
									ramp: 'out' as const,
									minStart: 0.05,
									maxStart: 0.98,
									minDuration: 0.02,
									maxDuration: 0.9,
									onUpdate: ({ start, duration }: { start: number; duration: number }) => {
										exit.start = start;
										exit.duration = duration;
									}
								}
							]
						: [])
				]
			});
		});

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

	function findOverlayRenderer(type: string): OverlayRenderer | null {
		for (const renderer of Object.values(PIPELINE_REGISTRY.overlays)) {
			if (renderer.type === type) {
				return renderer as OverlayRenderer;
			}
		}
		return null;
	}

	// Build the per-frame ShaderPass dispatch list. Surface pass first (ADR-0008),
	// then any declared overlay passes (ADR-0005) in the same document order as
	// `engineState.overlays`. Resolved by ADR-0010.
	function buildShaderPassDispatchList(): ShaderPassDispatchList {
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
		if (surfaceRenderer?.shaderPass) {
			entries.push({
				pass: surfaceRenderer.shaderPass as ShaderPass<unknown>,
				target: engineState.surface,
				bounds: { x: 0, y: 0, width: compositionSize.width, height: compositionSize.height }
			});
		}

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

		return entries;
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
		backdropColor: [number, number, number];
		cameraMove: 'static' | 'push' | 'drift';
		cameraAmount: number;
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
		const backdropColor: [number, number, number] = bg
			? [bg[0], bg[1], bg[2]]
			: [0.1, 0.09, 0.08];
		return {
			focusZ,
			aperture: clampNumber(stage.focus.aperture, 0, 1),
			backdropColor,
			cameraMove: stage.camera.move,
			cameraAmount: clampNumber(stage.camera.amount, 0, 1),
			effects: engineState.effects
		};
	}

	// Which plane texture to present. Default is the back-to-front composite; the
	// `__hivizDofPreviewPlane` debug switch (a verification seam, like
	// `__hivizTimeline`) lets a capture script screenshot a single plane in
	// isolation to confirm the layers separated correctly before the bokeh stage.
	function dofInputTexture(planes: CompositionPlanes, surfacePlane: GPUTexture): GPUTexture {
		if (typeof window !== 'undefined') {
			const sel = window.__hivizDofPreviewPlane;
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
			time: timebase.progress
		});
		const commandEncoder = host.device.createCommandEncoder();
		effectChain.apply({
			commandEncoder,
			effects: dof.otherEffects,
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
		if (!pipeline || !host || !effectChain || !depthStage) {
			return false;
		}
		pipeline.uploadDom();
		pipeline.render(inputs);
		depthStage.render({
			surfacePlaneView: pipeline.getOutputTexture().createView(),
			focusZ: stage.focusZ,
			aperture: stage.aperture,
			backdropColor: stage.backdropColor,
			cameraMove: stage.cameraMove,
			cameraAmount: stage.cameraAmount,
			time: timebase.progress
		});
		const commandEncoder = host.device.createCommandEncoder();
		effectChain.apply({
			commandEncoder,
			effects: stage.effects,
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
			effects: engineState.effects,
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
		// Capturing each state swaps engineState to from/to (whose transports differ
		// from the transition's own). Preserve the transition Preset's transport —
		// it governs the OUTPUT clip (duration = the wipe; orientation/fps/format) —
		// and restore it after both snapshots so the timeline isn't left on `to`.
		const outputTransport = { ...engineState.transport };
		await captureStateSnapshot(active.from, snapshots.fromTarget());
		await captureStateSnapshot(active.to, snapshots.toTarget());
		engineState.transport.orientation = outputTransport.orientation;
		engineState.transport.durationSeconds = outputTransport.durationSeconds;
		engineState.transport.fps = outputTransport.fps;
		engineState.transport.format = outputTransport.format;
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
			// `newspaper` (ADR-0008) reuses the paper compositor — same focal-slot
			// and marks scaffolding, same DOM-to-texture upload, same drop shadow.
			// Newspaper-specific physics (halftone + ink bleed) is carried by the
			// surface's declarative `shaderPass`, invoked from the compose path in a
			// follow-up shipped alongside the equivalent overlay-side wiring for
			// ADR-0005's `OverlayRenderer.shaderPass`.
			const usesPaperPipeline = surfaceType === 'paper' || surfaceType === 'newspaper';
			let nextPipeline: SurfaceRenderInstance;
			try {
				nextPipeline = usesPaperPipeline
					? createPaperPipeline({ host: localHost, sourceElement: localSource })
					: createPlainPipeline({ host: localHost, sourceElement: localSource });
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
					tick: tickTimeline
				});
				if (typeof window !== 'undefined') {
					window.__hivizTimeline = timeline;
					window.__hivizTextAnimationManager = textAnimationManager;
				}
				animationManager.rebuild(buildAnimationManifest());
				animationManager.progress(0);
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
			// Gate the first capture on the active Pack's typefaces so the very first
			// frame rasterizes the channel fonts, not OS fallbacks. Memoized, so this
			// resolves ~immediately once the faces are cached.
			void fontsReady().then(() => requestCanvasPaint(localCanvas));

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
			// `enter/exit.ease` is intentionally NOT tracked: a text animation's
			// easing is intrinsic to its catalog effect (spec.enter.easing), so the
			// per-entry ease can't change the output — tracking it would force a
			// needless rebuild. (The field still drives surface/overlay transitions.)
		}

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
		}

		// --- Marks (manifest tweens) + effects / background (render inputs) ---
		for (const timing of engineState.marks.timings) {
			void timing.color;
			void timing.intensity;
		}
		for (const appearance of Object.values(engineState.marks.defaults)) {
			void appearance?.color;
			void appearance?.intensity;
		}
		void engineState.effects.length;
		for (const entry of engineState.effects) {
			void entry.params;
			void entry.type;
		}
		void engineState.backgroundFill;

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
			window.__hivizTextAnimationManager = undefined;
		}
		timeline?.dispose();
		timeline = null;
		if (typeof window !== 'undefined' && window.__hivizTimeline) {
			window.__hivizTimeline = undefined;
		}
		effectChain?.dispose();
		effectChain = null;
		shaderPassDispatcher?.dispose();
		shaderPassDispatcher = null;
		compositionPlanes?.dispose();
		compositionPlanes = null;
		depthStage?.dispose();
		depthStage = null;
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
					effects: engineState.effects,
					inputTexture: postShaderTexture,
					outputView: host.context.getCurrentTexture().createView(),
					...timebase,
					background: exportBackground
				});
			}
		};

		try {
			if (format === 'prores') {
				const blob = await exportTransparentProRes({
					canvas: activeCanvas,
					durationSeconds,
					fps,
					onProgress: (value) => {
						progress = value;
					},
					renderFrame
				});
				downloadVideoBlob(blob, 'hiviz-overlay.mov');
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
					hasBackground
				});
				downloadVideoBlob(blob, hasBackground ? 'hiviz-bumper.webm' : 'hiviz-overlay.webm');
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

<main class="workspace">
	<section class="workspace__stage" aria-label="Composition">
		<VideoFrame bind:canvas orientation={engineState.transport.orientation}>
			<Composition
				bind:element={compositionElement}
				bind:surfaceElement
				splitPlanes={dofActive}
				bind:overlayRootElement
			/>
		</VideoFrame>

		{#if timeline}
			<TimelineScrubber {timeline} />
			<TimelineTrackView {timeline} {tracks} />
		{/if}
	</section>

	<ControlPanel id="workspace-controls">
		<Controls />
		{#if timeline?.selection}
			<TrackInspector selection={timeline.selection} />
		{/if}
		{#snippet footer()}
			<ExportPanel
				bind:durationSeconds={engineState.transport.durationSeconds}
				bind:fps={engineState.transport.fps}
				bind:format={engineState.transport.format}
				bind:orientation={engineState.transport.orientation}
				{isExporting}
				onexport={handleExport}
				{progress}
				{status}
			/>
		{/snippet}
	</ControlPanel>
</main>

<style>
	.workspace {
		block-size: 100dvh;
		display: grid;
		gap: var(--vs-base);
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 24rem);
		grid-template-rows: minmax(0, 1fr);
		min-block-size: 0;
		overflow: hidden;
		padding: var(--pad-l);
	}

	.workspace__stage {
		align-items: center;
		block-size: 100%;
		container-type: size;
		display: flex;
		flex-direction: column;
		gap: var(--vs-s);
		min-block-size: 0;
	}

	@media (max-width: 900px) {
		.workspace {
			block-size: auto;
			grid-template-columns: 1fr;
			min-block-size: 100dvh;
			overflow: visible;
		}
	}
</style>
