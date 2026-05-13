<script lang="ts" module>
	export type TimelineTransitionRamp = 'in' | 'out';

	export interface TimelineTransition {
		id: string;
		label?: string;
		start: number;
		duration: number;
		color?: string;
		ramp?: TimelineTransitionRamp;
		minStart?: number;
		maxStart?: number;
		minDuration?: number;
		maxDuration?: number;
		onUpdate: (next: { start: number; duration: number }) => void;
	}

	export interface TimelineTrack {
		id: string;
		label: string;
		color?: string;
		transitions: TimelineTransition[];
		onTrackMove?: (delta: number) => void;
	}

	type TransitionDragMode = 'move' | 'left' | 'right';

	interface TransitionDragState {
		kind: 'transition';
		trackId: string;
		transitionId: string;
		mode: TransitionDragMode;
		origin: { start: number; duration: number };
		pointerStartX: number;
		containerWidth: number;
	}

	interface TrackDragState {
		kind: 'track';
		trackId: string;
		pointerStartX: number;
		containerWidth: number;
	}

	interface SeekDragState {
		kind: 'seek';
		containerWidth: number;
		containerLeft: number;
	}

	type DragState = TransitionDragState | TrackDragState | SeekDragState;
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

	function getTrackBounds(track: TimelineTrack): { start: number; end: number } | null {
		if (track.transitions.length === 0) {
			return null;
		}

		let start = Number.POSITIVE_INFINITY;
		let end = Number.NEGATIVE_INFINITY;

		for (const transition of track.transitions) {
			start = Math.min(start, transition.start);
			end = Math.max(end, transition.start + transition.duration);
		}

		return { start, end };
	}

	function applyTransitionDrag(state: TransitionDragState, event: PointerEvent): void {
		const track = tracks.find((candidate) => candidate.id === state.trackId);
		const transition = track?.transitions.find((candidate) => candidate.id === state.transitionId);

		if (!transition) {
			return;
		}

		const delta = (event.clientX - state.pointerStartX) / state.containerWidth;
		const origin = state.origin;
		const minStart = transition.minStart ?? 0;
		const maxStart = transition.maxStart ?? 1;
		const minDuration = transition.minDuration ?? 0.02;
		const maxDuration = transition.maxDuration ?? 1;
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

		transition.onUpdate({ start: nextStart, duration: nextDuration });
	}

	function applyTrackDrag(state: TrackDragState, event: PointerEvent): void {
		const track = tracks.find((candidate) => candidate.id === state.trackId);

		if (!track?.onTrackMove) {
			return;
		}

		const delta = (event.clientX - state.pointerStartX) / state.containerWidth;
		track.onTrackMove(delta);
	}

	function applySeekDrag(state: SeekDragState, event: PointerEvent): void {
		const fraction = clampFraction(
			(event.clientX - state.containerLeft) / state.containerWidth,
			0,
			1
		);

		timeline.seek(fraction * timeline.durationSeconds);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!dragState) {
			return;
		}

		if (dragState.kind === 'transition') {
			applyTransitionDrag(dragState, event);
		} else if (dragState.kind === 'track') {
			applyTrackDrag(dragState, event);
		} else {
			applySeekDrag(dragState, event);
		}
	}

	function handlePointerUp(): void {
		dragState = null;
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
	}

	function startTransitionDrag(
		event: PointerEvent,
		track: TimelineTrack,
		transition: TimelineTransition,
		mode: TransitionDragMode
	): void {
		if (event.button !== 0) {
			return;
		}

		const rect = getContainerRect();

		if (!rect) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		timeline.selectTransition(track.id, transition.id);
		dragState = {
			kind: 'transition',
			trackId: track.id,
			transitionId: transition.id,
			mode,
			origin: { start: transition.start, duration: transition.duration },
			pointerStartX: event.clientX,
			containerWidth: rect.width
		};
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	function startTrackDrag(event: PointerEvent, track: TimelineTrack): void {
		if (event.button !== 0) {
			return;
		}

		const rect = getContainerRect();

		if (!rect) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		timeline.selectTrack(track.id);

		if (!track.onTrackMove) {
			return;
		}

		dragState = {
			kind: 'track',
			trackId: track.id,
			pointerStartX: event.clientX,
			containerWidth: rect.width
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

		if (target?.closest('.track-view__transition') || target?.closest('.track-view__connector')) {
			return;
		}

		event.preventDefault();
		timeline.clearSelection();
		dragState = {
			kind: 'seek',
			containerWidth: rect.width,
			containerLeft: rect.left
		};
		applySeekDrag(dragState, event);
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	function isTransitionSelected(trackId: string, transitionId: string): boolean {
		const selection = timeline.selection;
		return (
			selection !== null && selection.trackId === trackId && selection.transitionId === transitionId
		);
	}

	function isTrackBodySelected(trackId: string): boolean {
		const selection = timeline.selection;
		return selection !== null && selection.trackId === trackId && selection.transitionId === null;
	}

	onDestroy(() => {
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
	});
</script>

<div bind:this={container} class="track-view" onpointerdown={startSeekDrag} role="presentation">
	<div class="track-view__ruler" aria-hidden="true"></div>

	{#each tracks as track (track.id)}
		{@const bounds = getTrackBounds(track)}
		<div class="track-view__lane">
			{#if bounds && track.transitions.length > 1}
				<div
					class="track-view__connector"
					class:track-view__connector--selected={isTrackBodySelected(track.id)}
					onpointerdown={(event) => startTrackDrag(event, track)}
					role="presentation"
					style:left="{bounds.start * 100}%"
					style:width="{(bounds.end - bounds.start) * 100}%"
				></div>
			{/if}

			{#each track.transitions as transition (transition.id)}
				<div
					class="track-view__transition"
					class:track-view__transition--selected={isTransitionSelected(track.id, transition.id)}
					class:track-view__transition--ramp-in={transition.ramp === 'in'}
					class:track-view__transition--ramp-out={transition.ramp === 'out'}
					onpointerdown={(event) => startTransitionDrag(event, track, transition, 'move')}
					role="presentation"
					style:--track-color={transition.color ?? track.color ?? 'var(--fg-2)'}
					style:left="{transition.start * 100}%"
					style:width="{transition.duration * 100}%"
				>
					<button
						aria-label="Trim {transition.label ?? track.label} start"
						class="track-view__handle track-view__handle--left"
						onpointerdown={(event) => startTransitionDrag(event, track, transition, 'left')}
						type="button"
					></button>
					<span class="track-view__label">{transition.label ?? track.label}</span>
					<button
						aria-label="Trim {transition.label ?? track.label} end"
						class="track-view__handle track-view__handle--right"
						onpointerdown={(event) => startTransitionDrag(event, track, transition, 'right')}
						type="button"
					></button>
				</div>
			{/each}
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
		grid-auto-rows: minmax(28px, 1fr);
		grid-template-rows: auto;
		inline-size: min(100%, 76rem);
		min-block-size: 0;
		padding: 0;
		position: relative;
		touch-action: none;
	}

	.track-view__ruler {
		background:
			linear-gradient(
				to right,
				transparent calc(10% - 1px),
				var(--fg-2) 10%,
				transparent calc(10% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(20% - 1px),
				var(--fg-2) 20%,
				transparent calc(20% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(30% - 1px),
				var(--fg-2) 30%,
				transparent calc(30% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(40% - 1px),
				var(--fg-2) 40%,
				transparent calc(40% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(50% - 1px),
				var(--fg-2) 50%,
				transparent calc(50% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(60% - 1px),
				var(--fg-2) 60%,
				transparent calc(60% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(70% - 1px),
				var(--fg-2) 70%,
				transparent calc(70% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(80% - 1px),
				var(--fg-2) 80%,
				transparent calc(80% + 1px)
			),
			linear-gradient(
				to right,
				transparent calc(90% - 1px),
				var(--fg-2) 90%,
				transparent calc(90% + 1px)
			);
		block-size: 14px;
		border-block-end: var(--border-1);
	}

	.track-view__lane {
		background: var(--fg-05);
		margin-inline: 4px;
		border-radius: var(--br-xs);
		position: relative;
	}

	.track-view__lane:last-of-type {
		margin-block-end: 4px;
	}

	.track-view__connector {
		background: color-mix(in srgb, var(--fg-9) 18%, transparent);
		block-size: 4px;
		border-radius: 2px;
		cursor: grab;
		inset-block-start: 50%;
		position: absolute;
		transform: translateY(-50%);
	}

	.track-view__connector:active {
		cursor: grabbing;
	}

	.track-view__connector--selected {
		background: var(--fg-9);
	}

	.track-view__transition {
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

	.track-view__transition:active {
		cursor: grabbing;
	}

	.track-view__transition--ramp-in {
		background: linear-gradient(
			to right,
			color-mix(in srgb, var(--track-color) 10%, transparent),
			var(--track-color)
		);
	}

	.track-view__transition--ramp-out {
		background: linear-gradient(
			to right,
			var(--track-color),
			color-mix(in srgb, var(--track-color) 10%, transparent)
		);
	}

	.track-view__transition--selected {
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.4),
			0 0 0 2px var(--fg-9);
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
