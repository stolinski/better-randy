<script lang="ts">
	import ToolRunner from '$lib/platform/ToolRunner.svelte';
	import QuoteFocusCanvasSource from '$lib/tools/quote-focus/QuoteFocusCanvasSource.svelte';
	import QuoteFocusControls from '$lib/tools/quote-focus/QuoteFocusControls.svelte';
	import { quoteFocusTool } from '$lib/tools/quote-focus/quote-focus-tool.svelte';

	let sourceElement = $state<HTMLElement | null>(null);
</script>

<ToolRunner tool={quoteFocusTool} bind:sourceElement>
	{#snippet source()}
		<QuoteFocusCanvasSource bind:element={sourceElement} />
	{/snippet}

	{#snippet controlsPanel()}
		<QuoteFocusControls />
	{/snippet}
</ToolRunner>
