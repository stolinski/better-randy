<script lang="ts">
	import { onDestroy } from 'svelte';

	import { EFFECT_IDS } from '$lib/text-animations/catalog';
	import { compositionMeta } from './composition-meta.svelte';
	import {
		engineState,
		addOverlay,
		addTextAnimation,
		removeOverlay,
		removeTextAnimation
	} from './engine-state.svelte';
	import { PIPELINE_REGISTRY } from './pipelines';
	import { layerSelection, selectLayer, deselectLayer } from './selection.svelte';
	import type { Timeline } from './timeline.svelte';
	import type { TimelineTrack, TimelineTransition } from './timeline-track';
	import {
		resolveUnifiedDrag,
		type UnifiedDragMode,
		type UnifiedDragOrigin
	} from '$lib/utils/timeline-clip';

	interface Props {
		timeline: Timeline;
		tracks: TimelineTrack[];
	}

	let { timeline, tracks }: Props = $props();

	// ─── Track area drag state ──────────────────────────────────────────────────
	// Simple window clips use `left`/`right`/`move`; unified bars use the five
	// `trim-start`/`enter-zone`/`move`/`exit-zone`/`trim-end` handles (ADR-0034 §2a).

	type TransitionDragMode = 'move' | 'left' | 'right' | UnifiedDragMode;

	interface TransitionDragState {
		kind: 'transition';
		trackId: string;
		transitionId: string;
		mode: TransitionDragMode;
		origin: { start: number; duration: number };
		/** Captured at drag start for unified bars; absent for simple window clips. */
		unifiedOrigin?: UnifiedDragOrigin;
		pointerStartX: number;
		containerWidth: number;
	}

	interface SeekDragState {
		kind: 'seek';
		containerWidth: number;
		containerLeft: number;
	}

	type DragState = TransitionDragState | SeekDragState;

	// gutterBodyEl = the scrollable rows section (excludes the fixed header above)
	let gutterBodyEl = $state<HTMLDivElement | null>(null);
	let trackAreaEl = $state<HTMLDivElement | null>(null);
	let dragState: DragState | null = null;

	const playheadFraction = $derived(
		timeline.durationSeconds > 0 ? timeline.time / timeline.durationSeconds : 0
	);

	const compositionName = $derived(compositionMeta.userSlug ?? 'Untitled');

	// ─── Gutter classification helpers ──────────────────────────────────────────

	function isMainOverlayTrack(trackId: string): boolean {
		if (!trackId.startsWith('overlay-')) return false;
		const overlayId = trackId.slice('overlay-'.length);
		return engineState.overlays.some((o) => o.id === overlayId);
	}

	function canRemoveTrack(trackId: string): boolean {
		return isMainOverlayTrack(trackId) || trackId.startsWith('textanim-');
	}

	function gutterIndent(trackId: string): number {
		if (trackId === 'surface') return 0;
		// Sub-tracks (stack, roll, spin, cursor waypoints) sit under a main overlay
		if (trackId.startsWith('overlay-') && !isMainOverlayTrack(trackId)) return 2;
		return 1;
	}

	function handleRemoveTrack(trackId: string): void {
		if (isMainOverlayTrack(trackId)) {
			removeOverlay(trackId.slice('overlay-'.length));
		} else if (trackId.startsWith('textanim-')) {
			removeTextAnimation(trackId.slice('textanim-'.length));
		}
		deselectLayer();
	}

	// ─── Add controls ────────────────────────────────────────────────────────────

	const overlayRenderers = Object.values(PIPELINE_REGISTRY.overlays);

	function handleAddOverlay(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const type = select.value;
		select.value = '';
		if (!type) return;
		const renderer = overlayRenderers.find((r) => r.type === type);
		if (!renderer) return;
		const def = renderer.defaults();
		const id = addOverlay({
			type,
			content: def.content,
			position: def.position,
			enter: def.enter,
			exit: def.exit
		});
		selectLayer(`overlay-${id}`);
	}

	function handleAddTextAnimation(): void {
		const firstEffect = EFFECT_IDS[0];
		if (!firstEffect) return;
		addTextAnimation({
			target: { kind: 'surface', slot: 'body' },
			effect: firstEffect,
			enter: { start: 0.04, duration: 0.1, ease: 'smooth' }
		});
	}

	// ─── Scroll sync ─────────────────────────────────────────────────────────────
	// gutterBodyEl and trackAreaEl share identical grid structures (ruler + rows
	// with gap:4px, grid-auto-rows:28px), so syncing scrollTop keeps them aligned.

	let suppressGutterScroll = false;
	let suppressTrackScroll = false;

	function onGutterScroll(event: Event): void {
		if (suppressGutterScroll) return;
		suppressTrackScroll = true;
		if (trackAreaEl) trackAreaEl.scrollTop = (event.target as HTMLElement).scrollTop;
		suppressTrackScroll = false;
	}

	function onTrackScroll(event: Event): void {
		if (suppressTrackScroll) return;
		suppressGutterScroll = true;
		if (gutterBodyEl) gutterBodyEl.scrollTop = (event.target as HTMLElement).scrollTop;
		suppressGutterScroll = false;
	}

	// ─── Track area drag ────────────────────────────────────────────────────────

	function clampFraction(value: number, min: number, max: number): number {
		return Math.max(min, Math.min(max, value));
	}

	function getTrackAreaRect(): { width: number; left: number } | null {
		if (!trackAreaEl) return null;
		const rect = trackAreaEl.getBoundingClientRect();
		return { width: rect.width, left: rect.left };
	}

	function applyTransitionDrag(state: TransitionDragState, event: PointerEvent): void {
		const track = tracks.find((c) => c.id === state.trackId);
		const transition = track?.transitions.find((c) => c.id === state.transitionId);
		if (!transition) return;

		const delta = (event.clientX - state.pointerStartX) / state.containerWidth;

		// Unified clip bar: resolve the dragged handle into new enter/exit ramps and
		// persist each through its writer (ADR-0034 §2a).
		if (state.unifiedOrigin && transition.unified) {
			const result = resolveUnifiedDrag(state.mode as UnifiedDragMode, delta, state.unifiedOrigin);
			if (result.enter) transition.unified.setEnter?.(result.enter.start, result.enter.duration);
			if (result.exit) transition.unified.setExit?.(result.exit.start, result.exit.duration);
			return;
		}

		// Simple window clip (stagger / roll / dwell …): move + trim left/right.
		if (!transition.onUpdate) return;
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

	function applySeekDrag(state: SeekDragState, event: PointerEvent): void {
		const fraction = clampFraction(
			(event.clientX - state.containerLeft) / state.containerWidth,
			0,
			1
		);
		timeline.seek(fraction * timeline.durationSeconds);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!dragState) return;
		if (dragState.kind === 'transition') {
			applyTransitionDrag(dragState, event);
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
		if (event.button !== 0) return;
		const rect = getTrackAreaRect();
		if (!rect) return;
		event.preventDefault();
		event.stopPropagation();
		selectLayer(track.id);
		timeline.selectTransition(track.id, transition.id);
		const u = transition.unified;
		dragState = {
			kind: 'transition',
			trackId: track.id,
			transitionId: transition.id,
			mode,
			origin: { start: transition.start, duration: transition.duration },
			unifiedOrigin: u
				? {
						enterStart: u.enterStart,
						enterDuration: u.enterDuration,
						exitStart: u.exitStart,
						exitDuration: u.exitDuration,
						enterLandFrac: u.enterLandFrac,
						exitLandFrac: u.exitLandFrac
					}
				: undefined,
			pointerStartX: event.clientX,
			containerWidth: rect.width
		};
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	function startSeekDrag(event: PointerEvent): void {
		if (event.button !== 0) return;
		const rect = getTrackAreaRect();
		if (!rect) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('.track-transition')) return;
		event.preventDefault();
		deselectLayer();
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
		const sel = timeline.selection;
		return sel !== null && sel.trackId === trackId && sel.transitionId === transitionId;
	}

	onDestroy(() => {
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
	});
</script>

<div class="outline">
	<!-- LEFT: gutter column — fixed header + scrollable rows body -->
	<div class="outline__gutter-col">
		<div class="gutter__header">
			<a class="gutter__back" href="/" aria-label="Back to presets">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 16 16"
					aria-hidden="true"
				>
					<path
						d="M10 3L5 8l5 5"
						stroke="currentColor"
						stroke-width="1.5"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
			<span class="gutter__name">{compositionName}</span>
		</div>

		<!-- Scrollable body — synced with track area -->
		<div
			class="outline__gutter"
			bind:this={gutterBodyEl}
			onscroll={onGutterScroll}
			role="presentation"
		>
			<!-- Ruler-height spacer: aligns with the track ruler so rows stay in sync -->
			<div class="gutter__ruler-spacer" aria-hidden="true"></div>

			{#each tracks as track (track.id)}
				<div
					class="gutter__row"
					class:gutter__row--selected={layerSelection.id === track.id}
					style:--indent={gutterIndent(track.id)}
					role="button"
					tabindex="0"
					onclick={() => selectLayer(track.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') selectLayer(track.id);
					}}
				>
					<span class="gutter__label">{track.label}</span>
					{#if canRemoveTrack(track.id)}
						<button
							class="gutter__remove"
							type="button"
							aria-label="Remove {track.label}"
							onclick={(e) => {
								e.stopPropagation();
								handleRemoveTrack(track.id);
							}}>×</button
						>
					{/if}
				</div>
			{/each}

			<div class="gutter__add">
				<select
					class="gutter__add-select"
					value=""
					onchange={handleAddOverlay}
					aria-label="Add overlay"
				>
					<option value="" disabled>+ Overlay</option>
					{#each overlayRenderers as renderer (renderer.type)}
						<option value={renderer.type}>{renderer.label}</option>
					{/each}
				</select>
				<button class="gutter__add-textanim" type="button" onclick={handleAddTextAnimation}>
					+ Text anim
				</button>
			</div>
		</div>
	</div>

	<!-- RIGHT: track area — ruler + lanes + playhead -->
	<div
		class="outline__tracks"
		bind:this={trackAreaEl}
		onpointerdown={startSeekDrag}
		onscroll={onTrackScroll}
		role="presentation"
	>
		<div class="track-ruler" aria-hidden="true"></div>

		{#each tracks as track (track.id)}
			<div class="track-lane">
				{#each track.transitions as transition (transition.id)}
					{@const isUnified = transition.unified !== undefined}
					{@const hasEnter = transition.unified?.enterStart !== undefined}
					{@const hasExit = transition.unified?.exitStart !== undefined}
					<!-- enterZone / exitZone are the PERCEIVED ramp widths (ADR-0034 §2a):
					     computeUnifiedBar has already collapsed each ease's invisible tail,
					     so the standard ramp gradient + handles land on real motion edges. -->
					{@const enterPct = (transition.enterZone ?? 0) * 100}
					{@const exitPct = (transition.exitZone ?? 0) * 100}
					{@const label = transition.label ?? track.label}
					<div
						class="track-transition"
						class:track-transition--unified={isUnified}
						class:track-transition--selected={isTransitionSelected(track.id, transition.id)}
						class:track-transition--ramp-in={!isUnified && transition.ramp === 'in'}
						class:track-transition--ramp-out={!isUnified && transition.ramp === 'out'}
						onpointerdown={(event) => startTransitionDrag(event, track, transition, 'move')}
						role="presentation"
						style:--track-color={transition.color ?? track.color ?? 'var(--fg-2)'}
						style:--enter-pct="{enterPct}%"
						style:--exit-pct="{exitPct}%"
						style:left="{transition.start * 100}%"
						style:width="{transition.duration * 100}%"
					>
						{#if !isUnified || hasEnter}
							<button
								aria-label="Trim {label} start"
								class="track-handle track-handle--left"
								onpointerdown={(event) =>
									startTransitionDrag(event, track, transition, isUnified ? 'trim-start' : 'left')}
								type="button"
							></button>
						{/if}
						{#if isUnified && hasEnter && enterPct > 0}
							<button
								aria-label="Adjust {label} enter fade"
								class="track-handle track-handle--enter-zone"
								style:left="{enterPct}%"
								onpointerdown={(event) =>
									startTransitionDrag(event, track, transition, 'enter-zone')}
								type="button"
							></button>
						{/if}
						<span class="track-label">{label}</span>
						{#if isUnified && hasExit && exitPct > 0}
							<button
								aria-label="Adjust {label} exit fade"
								class="track-handle track-handle--exit-zone"
								style:right="{exitPct}%"
								onpointerdown={(event) =>
									startTransitionDrag(event, track, transition, 'exit-zone')}
								type="button"
							></button>
						{/if}
						{#if !isUnified || hasExit}
							<button
								aria-label="Trim {label} end"
								class="track-handle track-handle--right"
								onpointerdown={(event) =>
									startTransitionDrag(event, track, transition, isUnified ? 'trim-end' : 'right')}
								type="button"
							></button>
						{/if}
					</div>
				{/each}
			</div>
		{/each}

		<div class="track-playhead" style:left="{playheadFraction * 100}%"></div>
	</div>
</div>

<style>
	/* ── Shell ── */

	.outline {
		block-size: 100%;
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr);
		overflow: hidden;
	}

	/* ── Gutter column: fixed header + scrollable body ── */

	.outline__gutter-col {
		border-inline-end: var(--border-1);
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
	}

	.gutter__header {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
		min-block-size: 36px;
		padding-inline: var(--vs-xs);
	}

	.gutter__back {
		align-items: center;
		border-radius: var(--br-xs);
		color: var(--fg-6);
		display: inline-flex;
		flex-shrink: 0;
		padding: 2px;
		text-decoration: none;
		transition: color 100ms ease;
	}

	.gutter__back:hover {
		color: var(--fg);
	}

	.gutter__name {
		color: var(--fg-6);
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Scrollable gutter body: mirrors track area structure exactly so scrollTop
	   sync keeps rows and lanes aligned frame-perfectly. gap + grid-auto-rows must
	   match .outline__tracks. */
	.outline__gutter {
		display: grid;
		gap: 4px;
		grid-auto-rows: 28px;
		grid-template-rows: auto;
		overflow-y: auto;
	}

	/* Same height + border as .track-ruler so row 1 starts at the same Y. */
	.gutter__ruler-spacer {
		block-size: 14px;
		border-block-end: var(--border-1);
	}

	.gutter__row {
		align-items: center;
		background: transparent;
		border-inline-start: 3px solid transparent;
		cursor: pointer;
		display: flex;
		gap: var(--vs-xs);
		justify-content: space-between;
		padding-inline-end: var(--vs-xs);
		padding-inline-start: calc(var(--vs-xs) + calc(var(--indent, 0) * 12px));
		transition:
			background 100ms ease,
			border-color 100ms ease;
		user-select: none;
	}

	.gutter__row:hover {
		background: var(--fg-05);
	}

	.gutter__row--selected {
		background: color-mix(in srgb, #ffd608 8%, transparent);
		border-inline-start-color: #ffd608;
	}

	.gutter__label {
		color: var(--fg-7);
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.gutter__row--selected .gutter__label {
		color: var(--fg);
	}

	.gutter__remove {
		background: transparent;
		border: 0;
		color: var(--fg-3);
		cursor: pointer;
		flex-shrink: 0;
		font-size: 0.9rem;
		line-height: 1;
		padding: 0 2px;
		transition: color 100ms ease;
	}

	.gutter__remove:hover {
		color: #e6322a;
	}

	.gutter__add {
		align-items: center;
		display: flex;
		flex-direction: column;
		gap: var(--vs-xs);
		padding: var(--vs-xs);
	}

	.gutter__add-select {
		font-size: 0.75rem;
		inline-size: 100%;
	}

	.gutter__add-textanim {
		background: transparent;
		border: var(--border-1);
		border-radius: var(--br-xs);
		color: var(--fg-6);
		cursor: pointer;
		font-size: 0.75rem;
		inline-size: 100%;
		padding: 3px var(--vs-xs);
		text-align: left;
		transition:
			color 100ms ease,
			border-color 100ms ease;
	}

	.gutter__add-textanim:hover {
		border-color: var(--fg-4);
		color: var(--fg);
	}

	/* ── Track area ── */

	.outline__tracks {
		cursor: pointer;
		display: grid;
		gap: 4px;
		grid-auto-rows: 28px;
		grid-template-rows: auto;
		min-block-size: 0;
		overflow-x: hidden;
		overflow-y: auto;
		position: relative;
		touch-action: none;
	}

	.track-ruler {
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

	.track-lane {
		background: var(--fg-05);
		border-radius: var(--br-xs);
		margin-inline: 4px;
		position: relative;
	}

	.track-lane:last-of-type {
		margin-block-end: 4px;
	}

	.track-transition {
		align-items: center;
		background: var(--track-color);
		border-radius: var(--br-xs);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
		color: rgba(0, 0, 0, 0.78);
		cursor: grab;
		display: flex;
		inset-block: 0;
		/* Label centers over the solid middle (best contrast vs. the faded ramp
		   ends) regardless of which trim handles the clip has. */
		justify-content: center;
		padding-inline: 10px;
		position: absolute;
		touch-action: none;
	}

	/* Unified bar: ramp-in on left, solid in middle, ramp-out on right. The zones
	   are the PERCEIVED motion widths (the bar already excludes each ease's tail),
	   so the ramp ends land where the eye sees the motion start/finish. */
	.track-transition--unified {
		background: linear-gradient(
			to right,
			color-mix(in srgb, var(--track-color) 15%, transparent) 0%,
			var(--track-color) var(--enter-pct, 0%),
			var(--track-color) calc(100% - var(--exit-pct, 0%)),
			color-mix(in srgb, var(--track-color) 15%, transparent) 100%
		);
	}

	.track-transition:active {
		cursor: grabbing;
	}

	.track-transition--ramp-in {
		background: linear-gradient(
			to right,
			color-mix(in srgb, var(--track-color) 10%, transparent),
			var(--track-color)
		);
	}

	.track-transition--ramp-out {
		background: linear-gradient(
			to right,
			var(--track-color),
			color-mix(in srgb, var(--track-color) 10%, transparent)
		);
	}

	.track-transition--selected {
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.4),
			0 0 0 2px #ffd608;
	}

	.track-handle {
		background: transparent;
		block-size: 100%;
		border: 0;
		border-radius: 0;
		cursor: ew-resize;
		padding: 0;
		touch-action: none;
	}

	/* Outer trim handles pinned to the bar edges, out of the label's flow. */
	.track-handle--left,
	.track-handle--right {
		inline-size: 8px;
		position: absolute;
		inset-block: 0;
	}

	.track-handle--left {
		inset-inline-start: 0;
	}

	.track-handle--right {
		inset-inline-end: 0;
	}

	.track-handle--left:hover,
	.track-handle--right:hover {
		background: rgba(0, 0, 0, 0.2);
	}

	/* Inner handles sit at absolute positions within the bar */
	.track-handle--enter-zone,
	.track-handle--exit-zone {
		background: transparent;
		block-size: 100%;
		border: 0;
		cursor: ew-resize;
		flex: none;
		padding: 0;
		position: absolute;
		touch-action: none;
		inline-size: 6px;
		transform: translateX(-50%);
	}

	.track-handle--enter-zone::after,
	.track-handle--exit-zone::after {
		background: rgba(0, 0, 0, 0.35);
		block-size: 60%;
		content: '';
		display: block;
		inline-size: 2px;
		margin: auto;
		position: absolute;
		inset: 0;
	}

	.track-handle--enter-zone:hover::after,
	.track-handle--exit-zone:hover::after {
		background: rgba(0, 0, 0, 0.7);
	}

	.track-label {
		color: inherit;
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-playhead {
		background: #2de8ee;
		block-size: 100%;
		inline-size: 2px;
		inset-block: 0;
		pointer-events: none;
		position: absolute;
		transform: translateX(-50%);
	}
</style>
