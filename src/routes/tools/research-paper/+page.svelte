<script lang="ts">
	import ControlPanel from '$lib/platform/ControlPanel.svelte';
	import ExportPanel from '$lib/platform/ExportPanel.svelte';
	import ToolWorkspace from '$lib/platform/ToolWorkspace.svelte';
	import VideoFrame from '$lib/platform/VideoFrame.svelte';
	import type { VideoFrameRenderOptions } from '$lib/platform/VideoFrame.svelte';
	import ResearchPaperCanvasSource from '$lib/tools/research-paper/ResearchPaperCanvasSource.svelte';
	import ResearchPaperControls from '$lib/tools/research-paper/ResearchPaperControls.svelte';
	import { exportResearchPaperOverlay } from '$lib/tools/research-paper/export-research-paper';
	import { renderResearchPaperFrame } from '$lib/tools/research-paper/research-paper-renderer';
	import { researchPaperState } from '$lib/tools/research-paper/research-paper-state.svelte';

	let canvas = $state<HTMLCanvasElement | null>(null);
	let sourceElement = $state<HTMLElement | null>(null);
	let stopPlayback = $state<() => void>(() => {});
	let isExporting = $state(false);
	let progress = $state(0);
	let status = $state('');

	function handleRenderFrame({
		canvas: frameCanvas,
		context,
		durationSeconds,
		timestamp
	}: VideoFrameRenderOptions): void {
		if (!sourceElement) {
			throw new Error('Research paper stage is unavailable.');
		}

		renderResearchPaperFrame({
			canvas: frameCanvas,
			context,
			durationSeconds,
			markColors: researchPaperState.markColors,
			markIntensity: researchPaperState.markIntensity,
			sourceElement,
			timestamp
		});
	}

	function handleRenderError(error: unknown): void {
		status = error instanceof Error ? error.message : 'Unable to render research paper frame.';
	}

	async function handleExport(): Promise<void> {
		if (!canvas || !sourceElement) {
			status = 'Research paper stage is unavailable.';
			return;
		}

		stopPlayback();
		isExporting = true;
		progress = 0;
		status = '';

		try {
			await exportResearchPaperOverlay({
				canvas,
				durationSeconds: researchPaperState.durationSeconds,
				fps: researchPaperState.fps,
				markColors: researchPaperState.markColors,
				markIntensity: researchPaperState.markIntensity,
				sourceElement,
				onProgress: (nextProgress) => {
					progress = nextProgress;
				}
			});
		} catch (error) {
			console.error('Unable to export research paper overlay.', error);
			status = error instanceof Error ? error.message : 'Unable to export research paper overlay.';
		} finally {
			isExporting = false;
		}
	}
</script>

<ToolWorkspace kicker="Tool" title="Research Paper">
	{#snippet stage()}
		<VideoFrame
			bind:canvas
			bind:stopPlayback
			disabled={isExporting}
			durationSeconds={researchPaperState.durationSeconds}
			onrendererror={handleRenderError}
			orientation={researchPaperState.orientation}
			renderFrame={handleRenderFrame}
		>
			<ResearchPaperCanvasSource bind:element={sourceElement} />
		</VideoFrame>
	{/snippet}

	{#snippet controls()}
		<ControlPanel id="research-paper-controls" title="Controls">
			<ResearchPaperControls />
			<ExportPanel
				bind:durationSeconds={researchPaperState.durationSeconds}
				bind:fps={researchPaperState.fps}
				bind:orientation={researchPaperState.orientation}
				{isExporting}
				onexport={handleExport}
				{progress}
				{status}
			/>
		</ControlPanel>
	{/snippet}
</ToolWorkspace>
