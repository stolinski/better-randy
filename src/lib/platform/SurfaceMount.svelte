<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { getSurfaceRenderer } from './pipelines';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const renderer = $derived(getSurfaceRenderer(engineState.surface.type));
	const SurfaceCanvasSource = $derived(renderer?.CanvasSource ?? null);
</script>

{#if SurfaceCanvasSource}
	<SurfaceCanvasSource bind:element />
{/if}
