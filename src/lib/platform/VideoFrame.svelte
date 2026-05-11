<script lang="ts" module>
	export interface VideoFrameRenderOptions {
		canvas: HTMLCanvasElement;
		context: CanvasRenderingContext2D;
		durationSeconds: number;
		timestamp: number;
	}

	export type VideoFrameRenderer = (options: VideoFrameRenderOptions) => void;
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	import {
		getVideoFrameAspectRatio,
		getVideoFrameSize,
		type VideoOrientation
	} from '$lib/utils/video-frame';

	interface Props {
		canvas?: HTMLCanvasElement | null;
		disabled?: boolean;
		durationSeconds?: number;
		orientation?: VideoOrientation;
		label?: string;
		onrendererror?: (error: unknown) => void;
		renderFrame?: VideoFrameRenderer;
		stopPlayback?: () => void;
		children: Snippet;
	}

	let {
		canvas = $bindable(null),
		disabled = false,
		durationSeconds = 6,
		orientation = 'horizontal',
		label = 'Composition',
		onrendererror,
		renderFrame,
		stopPlayback = $bindable(() => {}),
		children
	}: Props = $props();

	let isPlaying = $state(false);
	let playbackFrame = $state<number | null>(null);
	let pendingTimestamp = 0;

	const frameSize = $derived(getVideoFrameSize(orientation));
	const aspectRatio = $derived(getVideoFrameAspectRatio(orientation));

	function stop(): void {
		if (playbackFrame !== null) {
			cancelAnimationFrame(playbackFrame);
			playbackFrame = null;
		}

		isPlaying = false;
	}

	function renderAt(timestamp: number): void {
		if (!canvas || !renderFrame) {
			return;
		}

		const context = canvas.getContext('2d', { alpha: true });

		if (!context) {
			onrendererror?.(new Error('A 2D canvas context is required for playback.'));
			stop();
			return;
		}

		try {
			context.clearRect(0, 0, canvas.width, canvas.height);
			renderFrame({
				canvas,
				context,
				durationSeconds,
				timestamp
			});
		} catch (error) {
			console.error('Unable to render video frame.', error);
			onrendererror?.(error);
			stop();
		}
	}

	function requestFramePaint(timestamp: number): void {
		pendingTimestamp = timestamp;

		if (canvas?.requestPaint) {
			canvas.requestPaint();
			return;
		}

		renderAt(timestamp);
	}

	function handlePlayback(): void {
		if (isPlaying) {
			stop();
			requestFramePaint(0);
			return;
		}

		isPlaying = true;

		const startedAt = performance.now();

		function renderNextFrame(now: number): void {
			const timestamp = Math.min((now - startedAt) / 1000, durationSeconds);

			requestFramePaint(timestamp);

			if (timestamp >= durationSeconds) {
				stop();
				return;
			}

			playbackFrame = requestAnimationFrame(renderNextFrame);
		}

		playbackFrame = requestAnimationFrame(renderNextFrame);
	}

	stopPlayback = stop;

	onDestroy(() => {
		stop();
	});

	onMount(() => {
		if (!canvas) {
			return;
		}

		function handlePaint(): void {
			renderAt(pendingTimestamp);
		}

		canvas.addEventListener('paint', handlePaint);

		return () => {
			canvas?.removeEventListener('paint', handlePaint);
		};
	});
</script>

<figure class="video-frame" style:--frame-aspect={aspectRatio}>
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

	<figcaption>
		{#if renderFrame}
			<button {disabled} onclick={handlePlayback} type="button">{isPlaying ? 'Stop' : 'Play'}</button>
		{/if}

		<span>{frameSize.width}x{frameSize.height}</span>
	</figcaption>
</figure>

<style>
	.video-frame {
		display: grid;
		gap: var(--vs-s);
		inline-size: min(100%, 76rem);
		margin: 0;
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
		align-items: center;
		color: var(--fg-6);
		display: flex;
		font-size: 0.75rem;
		justify-content: space-between;
		margin: 0;
	}

	figcaption button {
		font-size: inherit;
	}
</style>
