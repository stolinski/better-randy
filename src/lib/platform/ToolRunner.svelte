<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Snippet } from 'svelte';

	import { AnimationManager } from './animation-manager';
	import ControlPanel from './ControlPanel.svelte';
	import ExportPanel from './ExportPanel.svelte';
	import TimelineScrubber from './TimelineScrubber.svelte';
	import TimelineTrackView from './TimelineTrackView.svelte';
	import ToolWorkspace from './ToolWorkspace.svelte';
	import VideoFrame from './VideoFrame.svelte';
	import { createGpuHost, type GpuHost } from './gpu-host';
	import {
		clearCanvasPaintHandler,
		requestCanvasPaint,
		setCanvasPaintHandler
	} from './html-in-canvas';
	import { Timeline, type TimelineSelection } from './timeline.svelte';
	import type { Tool, ToolPipeline } from './tool';

	interface Props {
		tool: Tool;
		sourceElement?: HTMLElement | null;
		source: Snippet;
		controlsPanel: Snippet;
		trackInspector?: Snippet<[TimelineSelection]>;
	}

	let {
		tool,
		sourceElement = $bindable(null),
		source,
		controlsPanel,
		trackInspector
	}: Props = $props();

	let canvas = $state.raw<HTMLCanvasElement | null>(null);
	let host = $state.raw<GpuHost | null>(null);
	let pipeline = $state.raw<ToolPipeline | null>(null);
	let timeline = $state.raw<Timeline | null>(null);
	const animationManager = new AnimationManager();

	let isExporting = $state(false);
	let progress = $state(0);
	let status = $state('');

	const tracks = $derived(tool.buildTracks());

	function renderAt(timestamp: number): void {
		if (!pipeline) {
			return;
		}

		pipeline.render(tool.buildRenderInputs(timestamp));
	}

	function tickTimeline(timestamp: number): void {
		const duration = tool.transport.durationSeconds;
		const fraction = duration > 0 ? timestamp / duration : 0;

		animationManager.progress(fraction);
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
				console.error(`Unable to initialize ${tool.title} GPU host.`, error);
				status = error instanceof Error ? error.message : 'Unable to initialize the GPU host.';
			});
	});

	$effect(() => {
		if (!host || !sourceElement || !canvas) {
			return;
		}

		void tool.transport.orientation;

		const localHost = host;
		const localSource = sourceElement;
		const localCanvas = canvas;

		const nextPipeline = tool.createPipeline({
			host: localHost,
			sourceElement: localSource
		});

		pipeline = nextPipeline;

		if (!timeline) {
			timeline = new Timeline({
				durationSeconds: tool.transport.durationSeconds,
				fps: tool.transport.fps,
				tick: tickTimeline
			});
			animationManager.rebuild(tool.buildAnimationManifest());
			animationManager.progress(0);
		}

		setCanvasPaintHandler(localCanvas, () => {
			nextPipeline.uploadDom();
			if (timeline) {
				tickTimeline(timeline.time);
			}
		});
		requestCanvasPaint(localCanvas);

		return () => {
			clearCanvasPaintHandler(localCanvas);
			nextPipeline.dispose();

			if (pipeline === nextPipeline) {
				pipeline = null;
			}
		};
	});

	$effect(() => {
		tool.syncDerived?.();
	});

	$effect(() => {
		tool.touchDomState?.();

		if (canvas) {
			requestCanvasPaint(canvas);
		}
	});

	$effect(() => {
		animationManager.rebuild(tool.buildAnimationManifest());

		if (timeline) {
			tickTimeline(timeline.time);
		}
	});

	$effect(() => {
		tool.touchRenderState?.();

		if (timeline) {
			renderAt(timeline.time);
		}
	});

	$effect(() => {
		if (!timeline) {
			return;
		}

		timeline.durationSeconds = tool.transport.durationSeconds;
		timeline.fps = tool.transport.fps;

		if (timeline.time > tool.transport.durationSeconds) {
			timeline.seek(tool.transport.durationSeconds);
		}
	});

	onDestroy(() => {
		animationManager.dispose();
		timeline?.dispose();
		timeline = null;
		host?.dispose();
		host = null;
	});

	async function handleExport(): Promise<void> {
		if (!canvas || !pipeline) {
			status = `${tool.title} stage is unavailable.`;
			return;
		}

		const activePipeline = pipeline;
		const activeCanvas = canvas;

		timeline?.pause();
		isExporting = true;
		progress = 0;
		status = '';

		try {
			await tool.exportToFile({
				canvas: activeCanvas,
				pipeline: activePipeline,
				onProgress: (nextProgress) => {
					progress = nextProgress;
				}
			});
		} catch (error) {
			console.error(`Unable to export ${tool.title}.`, error);
			status = error instanceof Error ? error.message : `Unable to export ${tool.title}.`;
		} finally {
			isExporting = false;
		}
	}
</script>

<ToolWorkspace>
	{#snippet stage()}
		<VideoFrame bind:canvas orientation={tool.transport.orientation}>
			{@render source()}
		</VideoFrame>

		{#if timeline}
			<TimelineScrubber {timeline} />
			<TimelineTrackView {timeline} {tracks} />
		{/if}
	{/snippet}

	{#snippet controls()}
		<ControlPanel id={tool.controlsId}>
			{@render controlsPanel()}
			{#if timeline?.selection && trackInspector}
				{@render trackInspector(timeline.selection)}
			{/if}
			{#snippet footer()}
				<ExportPanel
					bind:durationSeconds={tool.transport.durationSeconds}
					bind:fps={tool.transport.fps}
					bind:format={tool.transport.format}
					bind:orientation={tool.transport.orientation}
					{isExporting}
					onexport={handleExport}
					{progress}
					{status}
				/>
			{/snippet}
		</ControlPanel>
	{/snippet}
</ToolWorkspace>
