<script lang="ts">
	import { onDestroy } from 'svelte';

	import { resolveFrameRate, secondsToFrames } from '$lib/utils/composition-timing';
	import {
		createVideoClipDragOrigin,
		type VideoClipDragMode,
		type VideoClipDragOrigin
	} from '$lib/utils/video-clip-edit';

	import { compositionMediaInspection } from './composition-media-inspection.svelte';
	import type { Media, VideoClip } from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import { inspectorRailMode } from './inspector-rail-mode.svelte';
	import { MEDIA_LIBRARY_ASSET_MIME } from './media-library-drag-transfer';
	import { layerSelection, selectVideoClip } from './selection.svelte';
	import type { Timeline } from './timeline.svelte';
	import type {
		VideoTimelineClip,
		VideoTimelineTrack as VideoTimelineTrackModel
	} from './timeline-track';
	import {
		formatVideoTimelineSourceRange,
		resolveVideoTimelineDrop,
		resolveVideoTimelinePointerEdit,
		snapshotVideoTimelineClips
	} from './video-timeline-authoring';

	interface Props {
		track: VideoTimelineTrackModel;
		timeline: Timeline;
	}

	interface VideoClipPointerDragState {
		pointerId: number;
		captureElement: HTMLElement;
		originMedia: Media;
		clipId: string;
		mode: VideoClipDragMode;
		origin: VideoClipDragOrigin;
		pointerStartX: number;
		laneWidth: number;
		originalClips: VideoClip[];
		currentClip: VideoClip;
	}

	let { track, timeline }: Props = $props();
	let pointerDrag = $state.raw<VideoClipPointerDragState | null>(null);
	const frameRate = $derived(resolveFrameRate(engineState.transport.fps));
	const compositionFrameCount = $derived(
		Math.max(1, secondsToFrames(engineState.transport.durationSeconds, frameRate))
	);

	function selectClip(clip: VideoTimelineClip): void {
		selectVideoClip(clip.clipId);
		inspectorRailMode.switchToInspector();
		const asset = engineState.media.assets.find((candidate) => candidate.id === clip.assetId);
		if (asset && compositionMediaInspection.read(asset.assetUrl).status !== 'ready') {
			void compositionMediaInspection.ensure(asset.assetUrl);
		}
	}

	function currentPlayheadFrame(): number {
		return Math.min(compositionFrameCount, Math.max(0, secondsToFrames(timeline.time, frameRate)));
	}

	function removePointerListeners(): void {
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		window.removeEventListener('pointercancel', handlePointerCancel);
	}

	function finishPointerDrag(shouldRollback: boolean): void {
		const state = pointerDrag;
		if (!state) return;
		const isOriginMediaActive = engineState.media === state.originMedia;
		pointerDrag = null;
		removePointerListeners();
		if (shouldRollback && isOriginMediaActive) {
			state.originMedia.videoTrack.clips = snapshotVideoTimelineClips(state.originalClips);
		}
		if (state.captureElement.hasPointerCapture(state.pointerId)) {
			state.captureElement.releasePointerCapture(state.pointerId);
		}
	}

	function handlePointerMove(event: PointerEvent): void {
		const state = pointerDrag;
		if (!state || event.pointerId !== state.pointerId) return;
		event.preventDefault();
		if (engineState.media !== state.originMedia) {
			finishPointerDrag(false);
			return;
		}
		const result = resolveVideoTimelinePointerEdit({
			clips: state.originalClips,
			origin: state.origin,
			mode: state.mode,
			pointerStartX: state.pointerStartX,
			pointerClientX: event.clientX,
			laneWidth: state.laneWidth,
			playheadFrame: currentPlayheadFrame()
		});
		state.originMedia.videoTrack.clips = result.clips;
		pointerDrag = { ...state, currentClip: result.clip };
	}

	function handlePointerUp(event: PointerEvent): void {
		if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
		finishPointerDrag(false);
	}

	function handlePointerCancel(event: PointerEvent): void {
		if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
		finishPointerDrag(true);
	}

	function handleLostPointerCapture(event: PointerEvent): void {
		if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
		finishPointerDrag(true);
	}

	function startClipPointerDrag(
		event: PointerEvent,
		clip: VideoTimelineClip,
		mode: VideoClipDragMode
	): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectClip(clip);
		const asset = engineState.media.assets.find((candidate) => candidate.id === clip.assetId);
		if (!asset) return;
		const inspection = compositionMediaInspection.read(asset.assetUrl);
		if (inspection.status !== 'ready') return;

		if (pointerDrag) finishPointerDrag(true);
		const captureElement = event.currentTarget as HTMLElement;
		const laneElement = captureElement.closest<HTMLElement>('.video-timeline-lane');
		if (!laneElement) return;
		const laneRect = laneElement.getBoundingClientRect();
		if (laneRect.width <= 0) return;
		const originMedia = engineState.media;
		const originalClips = snapshotVideoTimelineClips(originMedia.videoTrack.clips);
		const origin = createVideoClipDragOrigin({
			clips: originalClips,
			clipId: clip.clipId,
			compositionFrameCount,
			sourceDurationSeconds: inspection.metadata.durationSeconds,
			frameRate
		});
		pointerDrag = {
			pointerId: event.pointerId,
			captureElement,
			originMedia,
			clipId: clip.clipId,
			mode,
			origin,
			pointerStartX: event.clientX,
			laneWidth: laneRect.width,
			originalClips,
			currentClip: { ...origin.clip, audio: { ...origin.clip.audio } }
		};
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
		window.addEventListener('pointercancel', handlePointerCancel);
		captureElement.setPointerCapture(event.pointerId);
	}

	function startClipInteriorDrag(event: PointerEvent, clip: VideoTimelineClip): void {
		startClipPointerDrag(event, clip, event.altKey ? 'slip' : 'move');
	}

	function handleDragOver(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes(MEDIA_LIBRARY_ASSET_MIME)) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = 'copy';
	}

	function handleDrop(event: DragEvent): void {
		if (!event.dataTransfer) return;
		event.preventDefault();
		event.stopPropagation();
		const laneElement = event.currentTarget as HTMLElement;
		const laneRect = laneElement.getBoundingClientRect();
		if (laneRect.width <= 0) return;
		const result = resolveVideoTimelineDrop({
			dataTransfer: event.dataTransfer,
			assets: engineState.media.assets,
			clips: engineState.media.videoTrack.clips,
			readInspection: (assetUrl) => compositionMediaInspection.read(assetUrl),
			pointerClientX: event.clientX,
			lane: { left: laneRect.left, width: laneRect.width },
			compositionFrameCount,
			playheadFrame: currentPlayheadFrame(),
			frameRate
		});
		if (result.status === 'metadata-not-ready') {
			void compositionMediaInspection.ensure(result.asset.assetUrl);
			return;
		}
		if (result.status !== 'created') return;
		engineState.media.videoTrack.clips = result.clips;
		selectVideoClip(result.selectedClipId);
		inspectorRailMode.switchToInspector();
	}

	onDestroy(() => finishPointerDrag(true));
</script>

<div
	class="video-timeline-lane"
	role="group"
	aria-label="Video timeline track"
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	{#each track.clips as clip (clip.clipId)}
		{@const activeClip = pointerDrag?.clipId === clip.clipId ? pointerDrag.currentClip : null}
		{@const isSlipping = pointerDrag?.clipId === clip.clipId && pointerDrag.mode === 'slip'}
		<div
			class="video-timeline-clip"
			class:video-timeline-clip--selected={layerSelection.id === clip.id}
			data-video-timeline-clip
			style:left="{(clip.timelineStartFrame / compositionFrameCount) * 100}%"
			style:width="{(clip.durationFrames / compositionFrameCount) * 100}%"
		>
			<button
				class="video-timeline-clip__handle video-timeline-clip__handle--left"
				type="button"
				aria-label={`Trim ${clip.label} video clip start`}
				onpointerdown={(event) => startClipPointerDrag(event, clip, 'trim-left')}
				onlostpointercapture={handleLostPointerCapture}
				onclick={() => selectClip(clip)}
			></button>
			<button
				class="video-timeline-clip__body"
				type="button"
				aria-label={`Move ${clip.label} video clip. Hold Alt or Option to slip source.`}
				aria-pressed={layerSelection.id === clip.id}
				onpointerdown={(event) => startClipInteriorDrag(event, clip)}
				onlostpointercapture={handleLostPointerCapture}
				onclick={() => selectClip(clip)}
			>
				<span class:video-timeline-clip__source={isSlipping}>
					{isSlipping && activeClip
						? formatVideoTimelineSourceRange(activeClip, frameRate)
						: clip.label}
				</span>
			</button>
			<button
				class="video-timeline-clip__handle video-timeline-clip__handle--right"
				type="button"
				aria-label={`Trim ${clip.label} video clip end`}
				onpointerdown={(event) => startClipPointerDrag(event, clip, 'trim-right')}
				onlostpointercapture={handleLostPointerCapture}
				onclick={() => selectClip(clip)}
			></button>
		</div>
	{/each}
</div>

<style>
	.video-timeline-lane {
		background: var(--fg-05);
		border-radius: var(--br-xs);
		margin-inline: var(--lane-gap);
		position: relative;
	}

	.video-timeline-clip {
		background: #1f5aff;
		border-radius: var(--br-xs);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.4);
		inset-block: 0;
		min-inline-size: 1px;
		position: absolute;
		touch-action: none;
	}

	.video-timeline-clip--selected {
		box-shadow:
			inset 0 0 0 1px rgb(0 0 0 / 0.4),
			0 0 0 1px #ffd608;
	}

	.video-timeline-clip__body {
		align-items: center;
		background: transparent;
		block-size: 100%;
		border: 1px solid transparent;
		border-radius: var(--br-xs);
		color: rgb(0 0 0 / 0.78);
		cursor: grab;
		display: flex;
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		inline-size: 100%;
		justify-content: center;
		overflow: hidden;
		padding-inline: 10px;
		touch-action: none;
		transition:
			border-color 100ms ease,
			opacity 100ms ease;
	}

	.video-timeline-clip__body:hover {
		opacity: 0.88;
	}

	.video-timeline-clip__body:focus-visible {
		border-color: #e8e8ea;
		outline: none;
	}

	.video-timeline-clip__body:active {
		cursor: grabbing;
	}

	.video-timeline-clip__body span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.video-timeline-clip__source {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
	}

	.video-timeline-clip__handle {
		background: transparent;
		block-size: 100%;
		border: 0 solid transparent;
		cursor: ew-resize;
		inline-size: 8px;
		inset-block: 0;
		padding: 0;
		position: absolute;
		touch-action: none;
		transition:
			border-color 100ms ease,
			opacity 100ms ease;
		z-index: 1;
	}

	.video-timeline-clip__handle:hover,
	.video-timeline-clip__handle:focus-visible {
		border-color: rgb(0 0 0 / 0.65);
		opacity: 0.78;
		outline: none;
	}

	.video-timeline-clip__handle--left {
		border-inline-end-width: 1px;
		inset-inline-start: 0;
	}

	.video-timeline-clip__handle--right {
		border-inline-start-width: 1px;
		inset-inline-end: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.video-timeline-clip__body,
		.video-timeline-clip__handle {
			transition-duration: 0ms;
		}
	}
</style>
