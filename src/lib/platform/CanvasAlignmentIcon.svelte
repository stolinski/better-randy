<script lang="ts">
	import type { CanvasAlignmentCommand, CanvasDistributionCommand } from './canvas-alignment';

	interface Props {
		command: CanvasAlignmentCommand | CanvasDistributionCommand;
	}

	let { command }: Props = $props();
</script>

<svg
	class="canvas-alignment-icon"
	width="16"
	height="16"
	viewBox="0 0 16 16"
	fill="none"
	aria-hidden="true"
>
	{#if command === 'left'}
		<path d="M2.5 1.5v13M5 3.5h8v3H5zM5 9.5h5v3H5z" />
	{:else if command === 'horizontal-center'}
		<path d="M8 1.5v13M4 3.5h8v3H4zM5.5 9.5h5v3h-5z" />
	{:else if command === 'right'}
		<path d="M13.5 1.5v13M3 3.5h8v3H3zM6 9.5h5v3H6z" />
	{:else if command === 'top'}
		<path d="M1.5 2.5h13M3.5 5h3v8H3.5zM9.5 5h3v5H9.5z" />
	{:else if command === 'vertical-middle'}
		<path d="M1.5 8h13M3.5 4h3v8H3.5zM9.5 5.5h3v5h-3z" />
	{:else if command === 'bottom'}
		<path d="M1.5 13.5h13M3.5 3h3v8H3.5zM9.5 6h3v5h-3z" />
	{:else if command === 'horizontal'}
		<path d="M1.5 2.5v11M6.5 2.5v11M14.5 2.5v11M3.5 8h1M9 8h3" />
	{:else}
		<path d="M2.5 1.5h11M2.5 6.5h11M2.5 14.5h11M8 3.5v1M8 9v3" />
	{/if}
</svg>

<style>
	.canvas-alignment-icon {
		display: block;
		shape-rendering: geometricPrecision;
		stroke: currentColor;
		stroke-width: 1.25;
		vector-effect: non-scaling-stroke;
	}
</style>
