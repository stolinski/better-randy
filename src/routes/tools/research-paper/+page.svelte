<script lang="ts">
	import ToolRunner from '$lib/platform/ToolRunner.svelte';
	import ResearchPaperCanvasSource from '$lib/tools/research-paper/ResearchPaperCanvasSource.svelte';
	import ResearchPaperControls from '$lib/tools/research-paper/ResearchPaperControls.svelte';
	import { researchPaperTool } from '$lib/tools/research-paper/research-paper-tool.svelte';

	let sourceElement = $state<HTMLElement | null>(null);
</script>

<ToolRunner tool={researchPaperTool} bind:sourceElement>
	{#snippet source()}
		<ResearchPaperCanvasSource bind:element={sourceElement} />
	{/snippet}

	{#snippet controlsPanel()}
		<ResearchPaperControls />
	{/snippet}
</ToolRunner>
