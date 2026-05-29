<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import OverlayMount from './OverlayMount.svelte';
	import SurfaceMount from './SurfaceMount.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
		surfaceElement?: HTMLElement | null;
	}

	let {
		element = $bindable<HTMLElement | null>(null),
		surfaceElement = $bindable<HTMLElement | null>(null)
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
	<OverlayMount />
</div>

<style>
	.composition {
		background-color: transparent;
		box-sizing: border-box;
		container-type: size;
		display: block;
		overflow: hidden;
		position: relative;
		transform-origin: top left;
	}

	.composition :global(.surface) {
		position: absolute;
	}
</style>
