<script lang="ts">
	import type { Timeline } from './timeline.svelte';
	import { engineState } from './engine-state.svelte';

	interface Props {
		timeline: Timeline | null;
		showCheckerboard?: boolean;
		onToggleCheckerboard?: () => void;
		zoom?: number;
		onZoomIn?: () => void;
		onZoomOut?: () => void;
		onZoomFit?: () => void;
	}

	let {
		timeline,
		showCheckerboard = true,
		onToggleCheckerboard,
		zoom = 1,
		onZoomIn,
		onZoomOut,
		onZoomFit
	}: Props = $props();

	const canZoomIn = $derived(zoom < 4 - 1e-6);
	const canZoomOut = $derived(zoom > 0.5 + 1e-6);
	const zoomLabel = $derived(`${Math.round(zoom * 100)}%`);

	const isPlaying = $derived(timeline?.isPlaying ?? false);
	const currentFrame = $derived(
		timeline ? Math.min(
			Math.max(1, Math.round(timeline.durationSeconds * timeline.fps)),
			Math.round(timeline.time * timeline.fps) + 1
		) : 0
	);
	const totalFrames = $derived(
		timeline ? Math.max(1, Math.round(timeline.durationSeconds * timeline.fps)) : 0
	);
	const currentTime = $derived(timeline ? timeline.time : 0);

	function togglePlayPause(): void {
		timeline?.toggle();
	}

	function toggleOrientation(): void {
		engineState.transport.orientation =
			engineState.transport.orientation === 'horizontal' ? 'vertical' : 'horizontal';
	}

	const isHorizontal = $derived(engineState.transport.orientation === 'horizontal');

	function formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = (seconds % 60).toFixed(2).padStart(5, '0');
		return `${m}:${s}`;
	}
</script>

<div class="controls-bar">
	<!-- Left: transport -->
	<div class="controls-bar__cluster">
		<button
			class="controls-bar__btn"
			type="button"
			aria-label={isPlaying ? 'Pause' : 'Play'}
			onclick={togglePlayPause}
		>
			{#if isPlaying}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
					<rect x="4.25" y="2.5" width="3.25" height="13" rx="0.9" fill="currentColor" fill-opacity="0.5" />
					<rect x="10.5" y="2.5" width="3.25" height="13" rx="0.9" fill="currentColor" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
					<path
						d="M15.1 7.478L5.608 2.222C5.055 1.916 4.402 1.925 3.859 2.245C3.321 2.562 3 3.122 3 3.744V14.256C3 14.878 3.321 15.438 3.859 15.755C4.138 15.919 4.445 16.002 4.754 16.002C5.047 16.002 5.34 15.927 5.608 15.779L15.099 10.523C15.655 10.216 16 9.632 16 9.001C16 8.37 15.655 7.785 15.1 7.478Z"
						fill="currentColor"
					/>
				</svg>
			{/if}
		</button>
	</div>

	<!-- Center: time / frame display -->
	<div class="controls-bar__cluster controls-bar__cluster--center">
		<span class="controls-bar__time">{formatTime(currentTime)}</span>
		<span class="controls-bar__sep">·</span>
		<span class="controls-bar__frames">{currentFrame} / {totalFrames}</span>
	</div>

	<!-- Right: canvas framing controls -->
	<div class="controls-bar__cluster controls-bar__cluster--right">
		<button
			class="controls-bar__btn"
			type="button"
			aria-label="Zoom out"
			disabled={!canZoomOut}
			onclick={onZoomOut}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>

		<button
			class="controls-bar__zoom"
			type="button"
			aria-label="Reset zoom to fit"
			onclick={onZoomFit}
		>
			{zoomLabel}
		</button>

		<button
			class="controls-bar__btn"
			type="button"
			aria-label="Zoom in"
			disabled={!canZoomIn}
			onclick={onZoomIn}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		</button>

		<span class="controls-bar__divider" aria-hidden="true"></span>

		<button
			class="controls-bar__btn"
			class:controls-bar__btn--active={showCheckerboard}
			type="button"
			aria-label="Toggle checkerboard"
			onclick={onToggleCheckerboard}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<rect x="0" y="0" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="4" y="4" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="8" y="0" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="12" y="4" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="0" y="8" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="4" y="12" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="8" y="8" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
				<rect x="12" y="12" width="4" height="4" fill="currentColor" fill-opacity="0.7" />
			</svg>
		</button>

		<button
			class="controls-bar__btn controls-bar__btn--orientation"
			type="button"
			aria-label={isHorizontal ? 'Switch to vertical' : 'Switch to horizontal'}
			onclick={toggleOrientation}
		>
			{#if isHorizontal}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
					<rect x="1" y="4" width="14" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
					<rect x="4" y="1" width="8" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
				</svg>
			{/if}
		</button>
	</div>
</div>

<style>
	.controls-bar {
		align-items: center;
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		padding-block: var(--vs-xs);
		padding-inline: var(--vs-xs);
	}

	.controls-bar__cluster {
		display: flex;
		gap: 2px;
	}

	.controls-bar__cluster--center {
		align-items: center;
		gap: var(--vs-xs);
		justify-content: center;
	}

	.controls-bar__cluster--right {
		justify-content: flex-end;
	}

	.controls-bar__btn {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--br-xs);
		color: var(--fg-7);
		cursor: pointer;
		display: inline-flex;
		block-size: 26px;
		inline-size: 28px;
		justify-content: center;
		padding: 0;
		transition: background-color 100ms ease, color 100ms ease;
	}

	.controls-bar__btn:hover {
		background: var(--fg-1);
		color: var(--fg);
	}

	.controls-bar__btn:disabled {
		color: var(--fg-3);
		cursor: default;
	}

	.controls-bar__btn:disabled:hover {
		background: transparent;
		color: var(--fg-3);
	}

	.controls-bar__btn--active {
		color: var(--fg);
	}

	/* Zoom readout doubles as the fit/reset control (click → 100%). */
	.controls-bar__zoom {
		background: transparent;
		border: 0;
		border-radius: var(--br-xs);
		color: var(--fg-6);
		cursor: pointer;
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
		min-inline-size: 3.1rem;
		padding-block: 4px;
		padding-inline: 2px;
		text-align: center;
		transition:
			background-color 100ms ease,
			color 100ms ease;
	}

	.controls-bar__zoom:hover {
		background: var(--fg-1);
		color: var(--fg);
	}

	.controls-bar__divider {
		align-self: center;
		background: var(--fg-2);
		block-size: 16px;
		inline-size: 1px;
		margin-inline: 4px;
	}

	.controls-bar__btn--orientation {
		inline-size: 28px;
	}

	.controls-bar__time {
		color: var(--fg-6);
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
	}

	.controls-bar__sep {
		color: var(--fg-3);
		font-size: 0.72rem;
	}

	.controls-bar__frames {
		color: var(--fg-5);
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
	}
</style>
