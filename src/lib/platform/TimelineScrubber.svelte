<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	import type { Timeline } from './timeline.svelte';

	interface Props {
		timeline: Timeline;
	}

	let { timeline }: Props = $props();

	const totalFrames = $derived(Math.max(1, Math.round(timeline.durationSeconds * timeline.fps)));
	const currentFrame = $derived(Math.min(totalFrames, Math.round(timeline.time * timeline.fps)));

	function isEditableTarget(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) {
			return false;
		}

		if (target.isContentEditable) {
			return true;
		}

		const tag = target.tagName;

		return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (isEditableTarget(event.target)) {
			return;
		}

		if (event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}

		switch (event.key) {
			case ' ':
				event.preventDefault();
				timeline.toggle();
				return;
			case 'ArrowLeft':
				event.preventDefault();
				timeline.stepFrames(event.shiftKey ? -10 : -1);
				return;
			case 'ArrowRight':
				event.preventDefault();
				timeline.stepFrames(event.shiftKey ? 10 : 1);
				return;
			case 'Home':
				event.preventDefault();
				timeline.seek(0);
				return;
			case 'End':
				event.preventDefault();
				timeline.seek(timeline.durationSeconds);
				return;
		}
	}

	function jumpToStart(): void {
		timeline.seek(0);
	}

	function jumpToEnd(): void {
		timeline.seek(timeline.durationSeconds);
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="timeline-scrubber">
	<div class="timeline-scrubber__group">
		<button
			aria-label="Jump to start"
			class="timeline-scrubber__icon timeline-scrubber__icon--flip"
			onclick={jumpToStart}
			type="button"
		>
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
			<g fill="currentColor">
				<path
					d="M16.25 3C15.836 3 15.5 3.336 15.5 3.75V14.25C15.5 14.664 15.836 15 16.25 15C16.664 15 17 14.664 17 14.25V3.75C17 3.336 16.664 3 16.25 3Z"
				></path>
				<path
					d="M13.539 7.988L7.983 3.967C7.602 3.691 7.102 3.652 6.681 3.866C6.261 4.08 5.99899 4.507 5.99899 4.979V6.5H2.75C1.785 6.5 1 7.285 1 8.25V9.75C1 10.715 1.785 11.5 2.75 11.5H6V13.021C6 13.493 6.261 13.919 6.681 14.134C6.862 14.226 7.056 14.271 7.25 14.271C7.508 14.271 7.76399 14.191 7.98199 14.033L13.538 10.012C13.862 9.778 14.055 9.399 14.055 8.999C14.055 8.599 13.861 8.221 13.538 7.987L13.539 7.988Z"
					fill-opacity="0.4"
				></path>
			</g>
		</svg>
	</button>

	<button
		aria-label="Previous frame"
		class="timeline-scrubber__icon timeline-scrubber__icon--flip"
		onclick={() => timeline.stepFrames(-1)}
		type="button"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
			<g fill="currentColor">
				<path
					d="M8.12001 2.32795C7.88801 1.98595 7.42102 1.89495 7.07802 2.12995C6.73502 2.36295 6.64602 2.82894 6.88002 3.17194L10.843 8.99994L6.88002 14.8279C6.64702 15.1709 6.73502 15.6369 7.07802 15.8699C7.20702 15.9579 7.35401 15.9999 7.49901 15.9999C7.73901 15.9999 7.97501 15.8849 8.12001 15.6719L12.37 9.42194C12.543 9.16694 12.543 8.83295 12.37 8.57795L8.12001 2.32795Z"
				></path>
			</g>
		</svg>
	</button>

	<button
		aria-label={timeline.isPlaying ? 'Pause' : 'Play'}
		class="timeline-scrubber__icon timeline-scrubber__icon--play"
		onclick={timeline.toggle.bind(timeline)}
		type="button"
	>
		{#if timeline.isPlaying}
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<g fill="currentColor">
					<rect x="4.25" y="2.5" width="3.25" height="13" rx="0.9" fill-opacity="0.4" />
					<rect x="10.5" y="2.5" width="3.25" height="13" rx="0.9" />
				</g>
			</svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<g fill="currentColor">
					<path
						d="M15.1 7.478L5.608 2.222C5.055 1.916 4.402 1.925 3.859 2.245C3.321 2.562 3 3.122 3 3.744V14.256C3 14.878 3.321 15.438 3.859 15.755C4.138 15.919 4.445 16.002 4.754 16.002C5.047 16.002 5.34 15.927 5.608 15.779L15.099 10.523C15.655 10.216 16 9.632 16 9.001C16 8.37 15.655 7.785 15.1 7.478Z"
						fill-opacity="0.4"
					></path>
				</g>
			</svg>
		{/if}
	</button>

	<button
		aria-label="Next frame"
		class="timeline-scrubber__icon"
		onclick={() => timeline.stepFrames(1)}
		type="button"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
			<g fill="currentColor">
				<path
					d="M8.12001 2.32795C7.88801 1.98595 7.42102 1.89495 7.07802 2.12995C6.73502 2.36295 6.64602 2.82894 6.88002 3.17194L10.843 8.99994L6.88002 14.8279C6.64702 15.1709 6.73502 15.6369 7.07802 15.8699C7.20702 15.9579 7.35401 15.9999 7.49901 15.9999C7.73901 15.9999 7.97501 15.8849 8.12001 15.6719L12.37 9.42194C12.543 9.16694 12.543 8.83295 12.37 8.57795L8.12001 2.32795Z"
				></path>
			</g>
		</svg>
	</button>

		<button
			aria-label="Jump to end"
			class="timeline-scrubber__icon"
			onclick={jumpToEnd}
			type="button"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
				<g fill="currentColor">
					<path
						d="M16.25 3C15.836 3 15.5 3.336 15.5 3.75V14.25C15.5 14.664 15.836 15 16.25 15C16.664 15 17 14.664 17 14.25V3.75C17 3.336 16.664 3 16.25 3Z"
					></path>
					<path
						d="M13.539 7.988L7.983 3.967C7.602 3.691 7.102 3.652 6.681 3.866C6.261 4.08 5.99899 4.507 5.99899 4.979V6.5H2.75C1.785 6.5 1 7.285 1 8.25V9.75C1 10.715 1.785 11.5 2.75 11.5H6V13.021C6 13.493 6.261 13.919 6.681 14.134C6.862 14.226 7.056 14.271 7.25 14.271C7.508 14.271 7.76399 14.191 7.98199 14.033L13.538 10.012C13.862 9.778 14.055 9.399 14.055 8.999C14.055 8.599 13.861 8.221 13.538 7.987L13.539 7.988Z"
						fill-opacity="0.4"
					></path>
				</g>
			</svg>
		</button>
	</div>

	<span class="timeline-scrubber__readout">{currentFrame} / {totalFrames}</span>
</div>

<style>
	.timeline-scrubber {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
		inline-size: min(100%, 76rem);
	}

	.timeline-scrubber__group {
		background: var(--fg-05);
		border: var(--border-1);
		border-radius: var(--br-s);
		display: inline-flex;
		gap: 2px;
		padding: 3px;
	}

	.timeline-scrubber__icon {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--br-xs);
		color: var(--fg-9);
		display: inline-flex;
		inline-size: 28px;
		block-size: 28px;
		justify-content: center;
		padding: 0;
		transition: background-color 120ms ease;
	}

	.timeline-scrubber__icon:hover {
		background: var(--fg-2);
	}

	.timeline-scrubber__icon:active {
		background: var(--fg-3, var(--fg-2));
	}

	.timeline-scrubber__icon--flip svg {
		transform: rotate(180deg);
	}

	.timeline-scrubber__icon--play {
		inline-size: 36px;
		block-size: 28px;
	}

	.timeline-scrubber__readout {
		color: var(--fg-6);
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		margin-inline-start: auto;
	}
</style>
