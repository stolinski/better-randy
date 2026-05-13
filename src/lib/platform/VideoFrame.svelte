<script lang="ts">
	import type { Snippet } from 'svelte';

	import {
		getVideoFrameAspectRatio,
		getVideoFrameSize,
		type VideoOrientation
	} from '$lib/utils/video-frame';

	interface Props {
		canvas?: HTMLCanvasElement | null;
		orientation?: VideoOrientation;
		label?: string;
		children: Snippet;
	}

	let {
		canvas = $bindable(null),
		orientation = 'horizontal',
		label = 'Composition',
		children
	}: Props = $props();

	const frameSize = $derived(getVideoFrameSize(orientation));
	const aspectRatio = $derived(getVideoFrameAspectRatio(orientation));
</script>

<figure
	class="video-frame"
	style:--frame-aspect={aspectRatio}
	style:--frame-w={frameSize.width}
	style:--frame-h={frameSize.height}
>
	<div class="video-frame__fit">
		<div class="video-frame__viewport">
			<canvas
				aria-label={label}
				bind:this={canvas}
				class="video-frame__canvas"
				height={frameSize.height}
				layoutsubtree
				width={frameSize.width}
			>
				{@render children()}
			</canvas>
		</div>
	</div>

	<figcaption>
		<span>{frameSize.width}x{frameSize.height}</span>
	</figcaption>
</figure>

<style>
	.video-frame {
		align-items: center;
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		gap: var(--vs-s);
		inline-size: 100%;
		margin: 0;
		min-block-size: 0;
	}

	.video-frame__fit {
		container-type: size;
		display: grid;
		flex: 1 1 0;
		inline-size: 100%;
		min-block-size: 0;
		place-items: center;
	}

	.video-frame__viewport {
		aspect-ratio: var(--frame-aspect);
		background:
			linear-gradient(45deg, var(--fg-05) 25%, transparent 25% 75%, var(--fg-05) 75%),
			linear-gradient(45deg, var(--fg-05) 25%, transparent 25% 75%, var(--fg-05) 75%);
		background-position:
			0 0,
			0.5rem 0.5rem;
		background-size: 1rem 1rem;
		border: var(--border-1);
		border-radius: var(--br-m);
		inline-size: min(100cqw, 76rem, calc(100cqh * var(--frame-w) / var(--frame-h)));
		overflow: hidden;
		position: relative;
	}

	.video-frame__canvas {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		inset: 0;
		position: absolute;
	}

	figcaption {
		color: var(--fg-6);
		font-size: 0.75rem;
		inline-size: min(100%, 76rem);
		margin: 0;
		text-align: end;
	}
</style>
