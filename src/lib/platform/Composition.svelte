<script lang="ts">
	import DiagramMount from './DiagramMount.svelte';
	import { engineState } from './engine-state.svelte';
	import OverlayMount from './OverlayMount.svelte';
	import SurfaceMount from './SurfaceMount.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
		surfaceElement?: HTMLElement | null;
		/**
		 * Depth-of-field plane split (ADR-0027). When true, the Overlay layer is
		 * hoisted into its own frame-sized element that is a *direct* child of the
		 * layoutsubtree canvas — `copyElementImageToTexture` only rasterizes the
		 * canvas's direct children, not nested wrappers, so a separately-capturable
		 * Overlay plane requires a sibling, not a descendant. When false (the
		 * default, no DOF), the Overlay nests inside `.composition` exactly as
		 * before and the merged capture is unchanged.
		 */
		splitPlanes?: boolean;
		overlayRootElement?: HTMLElement | null;
	}

	let {
		element = $bindable<HTMLElement | null>(null),
		surfaceElement = $bindable<HTMLElement | null>(null),
		splitPlanes = false,
		overlayRootElement = $bindable<HTMLElement | null>(null)
	}: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
</script>

<div
	bind:this={element}
	class="composition"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
>
	<SurfaceMount bind:element={surfaceElement} />
	<!-- Diagram Blocks (ADR-0036) live on the SURFACE plane in every render
	     path — inside .composition even when the Overlay plane is hoisted, so
	     a diagram parallaxes with the surface it annotates. -->
	<DiagramMount />
	{#if !splitPlanes}
		<OverlayMount />
	{/if}
</div>
{#if splitPlanes}
	<!-- Overlay plane source: a frame-sized direct child of the canvas, mirroring
	     `.composition`'s container context so overlay sizing (cq units) is identical
	     to the nested case. Captured on its own to become the DOF Overlay plane. -->
	<div
		bind:this={overlayRootElement}
		class="composition overlay-root"
		style:block-size={`${frame.height}px`}
		style:inline-size={`${frame.width}px`}
	>
		<OverlayMount />
	</div>
{/if}

<style>
	.composition {
		background-color: transparent;
		box-sizing: border-box;
		--cqmin: calc(min(var(--frame-w), var(--frame-h)) / 100 * 1px);
		container-type: size;
		display: block;
		overflow: hidden;
		position: relative;
		transform-origin: top left;
	}

	/* Overlaps `.composition` exactly (both are frame-sized direct children of the
	   canvas), so the Overlay plane lands in the same coordinate space as the
	   Surface plane for back-to-front compositing. */
	.overlay-root {
		inset: 0;
		position: absolute;
	}

	.composition :global(.surface) {
		position: absolute;
	}
</style>
