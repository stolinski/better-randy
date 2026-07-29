<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { calculateWebsiteShowcaseLayout, websiteImageState } from '$lib/utils/website-showcase';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();
	let loadedUrl = $state('');
	let failedUrl = $state('');

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const layout = $derived(
		calculateWebsiteShowcaseLayout(engineState.transport.orientation, frame.width, frame.height)
	);
	const imageUrl = $derived(engineState.surface.content.imageUrl);
	const imageState = $derived(websiteImageState(imageUrl, loadedUrl, failedUrl));
	const travel = $derived(frame.height - layout.browser.y + 24);
	const translateY = $derived((1 - animState.paperVisibility) * travel);
	const attachSurface: Attachment<HTMLElement> = (node) => {
		element = node;
		return () => {
			if (element === node) element = null;
		};
	};

	function handleImageLoad(): void {
		loadedUrl = imageUrl ?? '';
		failedUrl = '';
	}

	function handleImageError(): void {
		failedUrl = imageUrl ?? '';
		loadedUrl = '';
	}
</script>

<article
	{@attach attachSurface}
	class="website-screenshot surface"
	data-image-state={imageState}
	style:block-size={`${layout.browser.height}px`}
	style:inline-size={`${layout.browser.width}px`}
	style:left={`${layout.browser.x}px`}
	style:top={`${layout.browser.y}px`}
	style:transform={`translateY(${translateY}px)`}
>
	<header class="website-screenshot__chrome" style:block-size={`${layout.browser.chromeHeight}px`}>
		<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
	</header>
	<div
		class="website-screenshot__viewport"
		style:block-size={`${layout.browser.screenshotHeight}px`}
	>
		{#if imageUrl}
			<img
				alt=""
				crossorigin="anonymous"
				data-export-resource="required"
				onerror={handleImageError}
				onload={handleImageLoad}
				src={imageUrl}
			/>
		{/if}
		{#if imageState !== 'ready'}
			<p>{imageState === 'broken' ? 'Screenshot unavailable' : 'Awaiting website capture'}</p>
		{/if}
	</div>
</article>

<style>
	.website-screenshot {
		background: #0d1117;
		border-radius: 24px;
		box-sizing: border-box;
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		position: absolute;
		transform-origin: center;
	}

	.website-screenshot__chrome {
		align-items: center;
		background: #25272b;
		display: flex;
		gap: 18px;
		padding-inline: 34px;
	}

	.website-screenshot__chrome span {
		background: #6f737b;
		block-size: 22px;
		border-radius: 50%;
		inline-size: 22px;
	}

	.website-screenshot__viewport {
		background: #15171a;
		display: grid;
		overflow: hidden;
		place-items: center;
		position: relative;
	}

	.website-screenshot__viewport img {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		object-fit: contain;
	}

	.website-screenshot__viewport p {
		color: #a8adb5;
		font-family: ui-monospace, monospace;
		font-size: 52px;
		inset: 0;
		margin: 0;
		place-content: center;
		position: absolute;
		text-align: center;
	}
</style>
