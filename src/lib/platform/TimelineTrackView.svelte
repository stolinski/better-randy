<script lang="ts" module>
	export interface TimelineTrack {
		id: string;
		label: string;
		color?: string;
		start: number;
		duration: number;
		minStart?: number;
		maxStart?: number;
		minDuration?: number;
		maxDuration?: number;
		onUpdate: (next: { start: number; duration: number }) => void;
	}

	type BandDragMode = 'move' | 'left' | 'right';

	interface BandDragState {
		kind: 'band';
		trackId: string;
		mode: BandDragMode;
		origin: { start: number; duration: number };
		pointerStartX: number;
		containerWidth: number;
		containerLeft: number;
	}

	interface SeekDragState {
		kind: 'seek';
		containerWidth: number;
		containerLeft: number;
	}

	type DragState = BandDragState | SeekDragState;
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

	import type { Timeline } from './timeline.svelte';

	interface Props {
		timeline: Timeline;
		tracks: TimelineTrack[];
	}

	let { timeline, tracks }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let dragState: DragState | null = null;

	const playheadFraction = $derived(
		timeline.durationSeconds > 0 ? timeline.time / timeline.durationSeconds : 0
	);

	function clampFraction(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	function getContainerRect(): { width: number; left: number } | null {
		if (!container) {
			return null;
		}

		const rect = container.getBoundingClientRect();

		return { width: rect.width, left: rect.left };
	}

	function applyBandDrag(state: BandDragState, event: PointerEvent): void {
		const track = tracks.find((candidate) => candidate.id === state.trackId);

		if (!track) {
			return;
		}

		const delta = (event.clientX - state.pointerStartX) / state.containerWidth;
		const origin = state.origin;
		const minStart = track.minStart ?? 0;
		const maxStart = track.maxStart ?? 1;
		const minDuration = track.minDuration ?? 0.05;
		const maxDuration = track.maxDuration ?? 1;
		let nextStart = origin.start;
		let nextDuration = origin.duration;

		if (state.mode === 'move') {
			nextStart = origin.start + delta;
		} else if (state.mode === 'left') {
			nextStart = origin.start + delta;
			nextDuration = origin.duration - delta;
		} else {
			nextDuration = origin.duration + delta;
		}

		nextStart = clampFraction(nextStart, minStart, maxStart);
		nextDuration = clampFraction(nextDuration, minDuration, maxDuration);

		if (nextStart + nextDuration > 1) {
			if (state.mode === 'left') {
				nextStart = 1 - nextDuration;
			} else {
				nextDuration = 1 - nextStart;
			}
		}

		track.onUpdate({ start: nextStart, duration: nextDuration });
	}

	function applySeekDrag(state: SeekDragState, event: PointerEvent): void {
		const fraction = clampFraction((event.clientX - state.containerLeft) / state.containerWidth, 0, 1);

		timeline.seek(fraction * timeline.durationSeconds);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!dragState) {
			return;
		}

		if (dragState.kind === 'band') {
			applyBandDrag(dragState, event);
		} else {
			applySeekDrag(dragState, event);
		}
	}

	function handlePointerUp(): void {
		dragState = null;
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
	}

	function startBandDrag(event: PointerEvent, track: TimelineTrack, mode: BandDragMode): void {
		const rect = getContainerRect();

		if (!rect) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		dragState = {
			kind: 'band',
			trackId: track.id,
			mode,
			origin: { start: track.start, duration: track.duration },
			pointerStartX: event.clientX,
			containerWidth: rect.width,
			containerLeft: rect.left
		};
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	function startSeekDrag(event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}

		const rect = getContainerRect();

		if (!rect) {
			return;
		}

		const target = event.target as HTMLElement | null;

		if (target?.closest('.track-view__band')) {
			return;
		}

		event.preventDefault();
		dragState = {
			kind: 'seek',
			containerWidth: rect.width,
			containerLeft: rect.left
		};
		applySeekDrag(dragState, event);
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	onDestroy(() => {
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
	});
</script>

<div
	bind:this={container}
	class="track-view"
	onpointerdown={startSeekDrag}
	role="presentation"
>
	<div class="track-view__ruler" aria-hidden="true"></div>

	{#each tracks as track (track.id)}
		<div class="track-view__lane">
			<div
				class="track-view__band"
				onpointerdown={(event) => startBandDrag(event, track, 'move')}
				role="presentation"
				style:--track-color={track.color ?? 'var(--fg-2)'}
				style:left="{track.start * 100}%"
				style:width="{track.duration * 100}%"
			>
				<button
					aria-label="Trim {track.label} start"
					class="track-view__handle track-view__handle--left"
					onpointerdown={(event) => startBandDrag(event, track, 'left')}
					type="button"
				></button>
				<span class="track-view__label">{track.label}</span>
				<button
					aria-label="Trim {track.label} end"
					class="track-view__handle track-view__handle--right"
					onpointerdown={(event) => startBandDrag(event, track, 'right')}
					type="button"
				></button>
			</div>
		</div>
	{/each}

	<div class="track-view__playhead" style:left="{playheadFraction * 100}%"></div>
</div>

<style>
	.track-view {
		border: var(--border-1);
		border-radius: var(--br-s);
		cursor: pointer;
		display: grid;
		gap: 4px;
		inline-size: min(100%, 76rem);
		padding: 0;
		position: relative;
		touch-action: none;
	}

	.track-view__ruler {
		background:
			linear-gradient(to right, transparent calc(10% - 1px), var(--fg-2) 10%, transparent calc(10% + 1px)),
			linear-gradient(to right, transparent calc(20% - 1px), var(--fg-2) 20%, transparent calc(20% + 1px)),
			linear-gradient(to right, transparent calc(30% - 1px), var(--fg-2) 30%, transparent calc(30% + 1px)),
			linear-gradient(to right, transparent calc(40% - 1px), var(--fg-2) 40%, transparent calc(40% + 1px)),
			linear-gradient(to right, transparent calc(50% - 1px), var(--fg-2) 50%, transparent calc(50% + 1px)),
			linear-gradient(to right, transparent calc(60% - 1px), var(--fg-2) 60%, transparent calc(60% + 1px)),
			linear-gradient(to right, transparent calc(70% - 1px), var(--fg-2) 70%, transparent calc(70% + 1px)),
			linear-gradient(to right, transparent calc(80% - 1px), var(--fg-2) 80%, transparent calc(80% + 1px)),
			linear-gradient(to right, transparent calc(90% - 1px), var(--fg-2) 90%, transparent calc(90% + 1px));
		block-size: 14px;
		border-block-end: var(--border-1);
	}

	.track-view__lane {
		background: var(--fg-05);
		block-size: 28px;
		margin-inline: 4px;
		border-radius: var(--br-xs);
		position: relative;
	}

	.track-view__lane:last-of-type {
		margin-block-end: 4px;
	}

	.track-view__band {
		align-items: center;
		background: var(--track-color);
		border-radius: var(--br-xs);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
		color: rgba(0, 0, 0, 0.78);
		cursor: grab;
		display: flex;
		inset-block: 0;
		justify-content: space-between;
		padding-inline: 2px;
		position: absolute;
		touch-action: none;
	}

	.track-view__band:active {
		cursor: grabbing;
	}

	.track-view__handle {
		background: transparent;
		block-size: 100%;
		border: 0;
		border-radius: 0;
		cursor: ew-resize;
		flex: 0 0 8px;
		padding: 0;
		touch-action: none;
	}

	.track-view__handle:hover {
		background: rgba(0, 0, 0, 0.2);
	}

	.track-view__label {
		color: inherit;
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-view__playhead {
		background: var(--fg-9);
		block-size: 100%;
		inline-size: 2px;
		inset-block: 0;
		pointer-events: none;
		position: absolute;
		transform: translateX(-50%);
	}
</style>
