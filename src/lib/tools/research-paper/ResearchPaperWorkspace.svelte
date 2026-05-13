<script lang="ts">
	import ToolRunner from '$lib/platform/ToolRunner.svelte';

	import ResearchPaperCanvasSource from './ResearchPaperCanvasSource.svelte';
	import ResearchPaperControls from './ResearchPaperControls.svelte';
	import ResearchPaperTrackInspector from './ResearchPaperTrackInspector.svelte';
	import { researchPaperTool } from './research-paper-tool.svelte';

	let sourceElement = $state<HTMLElement | null>(null);
</script>

<ToolRunner tool={researchPaperTool} bind:sourceElement>
	{#snippet source()}
		<ResearchPaperCanvasSource bind:element={sourceElement} />
	{/snippet}

	{#snippet controlsPanel()}
		<ResearchPaperControls />
	{/snippet}

	{#snippet trackInspector(selection)}
		<ResearchPaperTrackInspector {selection} />
	{/snippet}
</ToolRunner>
