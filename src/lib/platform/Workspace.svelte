<script lang="ts">
	import { onDestroy } from 'svelte';

	import { AnimationManager, type AnimationManifest, type AnimationTweenSpec } from './animation-manager';
	import { TextAnimationManager } from '$lib/text-animations/manager.svelte';
	import { animState, syncProgressArray } from './anim-state.svelte';
	import Composition from './Composition.svelte';
	import { EffectChain } from './pipelines/effect-chain';
	import { getSurfaceRenderer, PIPELINE_REGISTRY } from './pipelines';
	import {
		ShaderPassDispatcher,
		type ShaderPassDispatchList
	} from './pipelines/shader-pass-runner';
	import type { OverlayRenderer, ShaderPass } from './pipelines/types';
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
	import { getEaseGsap, resolveMarkForIndex, type SurfaceType } from './engine-schema';
	import { engineState, ensureMarkTimingAtIndex } from './engine-state.svelte';
	import { measureOverlayBoundsPx } from '$lib/utils/overlay-bounds';

	import {
		createPaperPipeline,
		type PaperPipeline,
		type PaperRenderInputs
	} from '$lib/pipelines/surfaces/paper/pipeline';
	import {
		createPlainPipeline,
		type PlainPipeline,
		type PlainRenderInputs
	} from '$lib/pipelines/surfaces/plain/pipeline';
	import {
		downloadVideoBlob,
		exportTransparentProRes,
		exportTransparentWebM,
		type TransparentVideoExportOptions
	} from './export-video';
	import { clampNumber } from '$lib/utils/math';
	import { truncateMiddle } from '$lib/utils/string';
	import { exposeVisualAudit } from './runtime-audit';

	let compositionElement = $state<HTMLElement | null>(null);
	let surfaceElement = $state<HTMLElement | null>(null);
	let canvas = $state.raw<HTMLCanvasElement | null>(null);
	let host = $state.raw<GpuHost | null>(null);
	let pipeline = $state.raw<PaperPipeline | PlainPipeline | null>(null);
	let pipelineSurfaceType = $state.raw<SurfaceType | null>(null);
	let effectChain = $state.raw<EffectChain | null>(null);
	let shaderPassDispatcher = $state.raw<ShaderPassDispatcher | null>(null);
	let timeline = $state.raw<Timeline | null>(null);
	const animationManager = new AnimationManager();
	const textAnimationManager = new TextAnimationManager();

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
				ease: getEaseGsap(surface.exit.ease, 'exit'),
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

	function buildRenderInputs(timestamp: number): PaperRenderInputs | PlainRenderInputs {
		const parsedMarks = readMarks();
		return {
			animState: {
				paperVisibility: animState.paperVisibility,
				bodyVisibility: animState.paperVisibility,
				markProgresses: animState.markProgresses
			},
			backgroundVisibility: engineState.surface.backgroundVisibility ?? 0,
			markColorsByIndex: getMarkColorsByIndex(),
			markIntensityByIndex: getMarkIntensityByIndex(),
			textAnimAlphaByMarkIndex: computeTextAnimAlphaByMarkIndex(parsedMarks),
			timestamp
		};
	}

	function rebuildAndRender(): void {
		animationManager.rebuild(buildAnimationManifest());

		if (timeline) {
			tickTimeline(timeline.time);
		}
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
					surface.type === 'paper'
						? 'Paper'
						: surface.type === 'newspaper'
							? 'Newspaper'
							: 'Body',
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
				onTrackMove: enter && exit
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

		const entries: Array<{ pass: ShaderPass<unknown>; target: unknown; bounds: { x: number; y: number; width: number; height: number } }> = [];

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

	function renderAt(timestamp: number): void {
		if (!pipeline || !host || !effectChain || !shaderPassDispatcher) {
			return;
		}

		pipeline.render(buildRenderInputs(timestamp) as PaperRenderInputs & PlainRenderInputs);

		const commandEncoder = host.device.createCommandEncoder();

		const timebase = effectChainTimebase(timestamp);

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
			outputView: host.context.getCurrentTexture().createView(),
			...timebase
		});
	}

	function tickTimeline(timestamp: number): void {
		const duration = engineState.transport.durationSeconds;
		const fraction = duration > 0 ? timestamp / duration : 0;
		animationManager.progress(fraction);
		animState.globalProgress = fraction;
		renderAt(timestamp);
	}

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
		if (!host || !compositionElement || !canvas) {
			return;
		}

		const surfaceType = engineState.surface.type;
		void engineState.transport.orientation;

		const localHost = host;
		const localSource = compositionElement;
		const localCanvas = canvas;

		// `newspaper` (ADR-0008) reuses the paper compositor — same focal-slot
		// and marks scaffolding, same DOM-to-texture upload, same drop shadow.
		// Newspaper-specific physics (halftone + ink bleed) is carried by the
		// surface's declarative `shaderPass`, invoked from the compose path in a
		// follow-up shipped alongside the equivalent overlay-side wiring for
		// ADR-0005's `OverlayRenderer.shaderPass`.
		const usesPaperPipeline = surfaceType === 'paper' || surfaceType === 'newspaper';
		const nextPipeline: PaperPipeline | PlainPipeline = usesPaperPipeline
			? createPaperPipeline({ host: localHost, sourceElement: localSource })
			: createPlainPipeline({ host: localHost, sourceElement: localSource });

		pipeline = nextPipeline;
		pipelineSurfaceType = surfaceType;

		if (!effectChain) {
			effectChain = new EffectChain({
				host: localHost,
				width: localCanvas.width,
				height: localCanvas.height
			});
		}

		if (!shaderPassDispatcher) {
			shaderPassDispatcher = new ShaderPassDispatcher({
				host: localHost,
				width: localCanvas.width,
				height: localCanvas.height
			});
		}

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
			nextPipeline.uploadDom();
			if (timeline) {
				tickTimeline(timeline.time);
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

	$effect(() => {
		// Re-upload DOM when fields that affect the source HTML change.
		void engineState.surface.content.body;
		void engineState.surface.content.title;
		void engineState.surface.content.sourceUrl;
		void engineState.surface.content.author;
		void engineState.surface.content.source;
		void engineState.surface.content.dateLabel;
		void engineState.surface.content.kicker;
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
		void animState.overlayProgresses.length;
		for (const progress of animState.overlayProgresses) {
			void progress;
		}

		if (canvas) {
			requestCanvasPaint(canvas);
		}
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

	$effect(() => {
		// Tracked so text-animation rebuilds when entries change.
		void engineState.textAnimations.length;
		for (const entry of engineState.textAnimations) {
			void entry.id;
			void entry.effect;
			void entry.target;
			void entry.enter.start;
			void entry.enter.duration;
			void entry.exit?.start;
			void entry.exit?.duration;
			// `enter/exit.ease` is intentionally NOT tracked here: a text
			// animation's easing is intrinsic to its catalog effect
			// (spec.enter.easing), so the per-entry ease is a no-op for text
			// anims — tracking it would force a needless rebuild on a value that
			// can't change the output. (The field still drives surface/overlay
			// transitions, where ease is meaningful.)
		}

		// Slot content. Each CanvasSource wraps its text-anim slots in `{#key
		// value}` so changing the engine-state text replaces the DOM element
		// the manager last split. The rebuild here notices the new element
		// (`existing.split.root !== element`) and re-splits with current text.
		// Without this tracking, SplitText would keep its grip on the previous
		// element and authored title / body edits would never reach the
		// composition.
		void engineState.surface.content.title;
		void engineState.surface.content.kicker;
		void engineState.surface.content.sourceUrl;
		void engineState.surface.content.author;
		void engineState.surface.content.source;
		void engineState.surface.content.dateLabel;
		void engineState.surface.content.body;
		void engineState.surface.content.counterpoint;
		void engineState.surface.variant;
		for (const overlay of engineState.overlays) {
			void overlay.content;
		}

		animationManager.rebuild(buildAnimationManifest());

		if (timeline) {
			tickTimeline(timeline.time);
		}
	});

	$effect(() => {
		for (const timing of engineState.marks.timings) {
			void timing.color;
			void timing.intensity;
		}
		for (const appearance of Object.values(engineState.marks.defaults)) {
			void appearance?.color;
			void appearance?.intensity;
		}
		// Re-render when effect entries change so the chain runs with the latest state.
		void engineState.effects.length;
		for (const entry of engineState.effects) {
			void entry.params;
			void entry.type;
		}

		if (timeline) {
			renderAt(timeline.time);
		}
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

		const renderFrame: TransparentVideoExportOptions['renderFrame'] = (_frame, timestamp) => {
			const fraction = durationSeconds > 0 ? timestamp / durationSeconds : 0;
			exportManager.progress(fraction);
			// Re-capture the DOM into domTexture for THIS frame's progress. The export
			// loop pauses the preview paint loop, so without this the pipeline samples a
			// stale domTexture and freezes every DOM-driven visual (split-text kinetic
			// typography, the surface enter/exit slide) at whatever progress preview was
			// last scrubbed to. uploadDom() is synchronous and queue-ordered ahead of
			// render()'s sample — mirroring the preview onpaint handler (uploadDom then
			// render, no await). Must run after progress() (DOM now at this frame) and
			// before render(). Not requestCanvasPaint (that re-enters the preview manager).
			activePipeline.uploadDom();
			const parsedMarksForExport = readMarks();
			activePipeline.render({
				animState: {
					paperVisibility: animState.paperVisibility,
					bodyVisibility: animState.paperVisibility,
					markProgresses: animState.markProgresses
				},
				backgroundVisibility: engineState.surface.backgroundVisibility ?? 0,
				markColorsByIndex,
				markIntensityByIndex,
				textAnimAlphaByMarkIndex: computeTextAnimAlphaByMarkIndex(parsedMarksForExport),
				timestamp
			} as PaperRenderInputs & PlainRenderInputs);

			if (host && effectChain && shaderPassDispatcher) {
				const commandEncoder = host.device.createCommandEncoder();
				const timebase = { progress: fraction, timestamp };

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
					...timebase
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
				const blob = await exportTransparentWebM({
					canvas: activeCanvas,
					durationSeconds,
					fps,
					onProgress: (value) => {
						progress = value;
					},
					renderFrame
				});
				downloadVideoBlob(blob, 'hiviz-overlay.webm');
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
			<Composition bind:element={compositionElement} bind:surfaceElement />
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
