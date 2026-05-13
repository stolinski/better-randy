<script lang="ts">
	import ToolRunner from '$lib/platform/ToolRunner.svelte';

	import QuoteFocusCanvasSource from './QuoteFocusCanvasSource.svelte';
	import QuoteFocusControls from './QuoteFocusControls.svelte';
	import QuoteFocusTrackInspector from './QuoteFocusTrackInspector.svelte';
	import { quoteFocusTool } from './quote-focus-tool.svelte';

	let sourceElement = $state<HTMLElement | null>(null);
</script>

<ToolRunner tool={quoteFocusTool} bind:sourceElement>
	{#snippet source()}
		<QuoteFocusCanvasSource bind:element={sourceElement} />
	{/snippet}

	{#snippet controlsPanel()}
		<QuoteFocusControls />
	{/snippet}

	{#snippet trackInspector(selection)}
		<QuoteFocusTrackInspector {selection} />
	{/snippet}
</ToolRunner>
