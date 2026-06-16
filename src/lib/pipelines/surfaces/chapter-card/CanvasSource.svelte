<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));

	const content = $derived(engineState.surface.content);
	const hasKicker = $derived((content.kicker ?? '').trim().length > 0);
	const hasTitle = $derived((content.title ?? '').trim().length > 0);
</script>

<article
	bind:this={element}
	class="chapter-card-source surface"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
	style:opacity={animState.paperVisibility}
>
	{#if hasKicker}
		{#key content.kicker}
			<span
				class="chapter-card-source__kicker"
				data-text-anim-slot="kicker"
				style:font-size={`${frame.width * 0.011}px`}
			>
				{content.kicker}
			</span>
		{/key}
	{/if}

	{#if hasTitle}
		{#key content.title}
			<h2
				class="chapter-card-source__title"
				data-text-anim-slot="title"
				style:font-size={`${frame.width * 0.033}px`}
			>
				{content.title}
			</h2>
		{/key}
	{/if}

	<div class="chapter-card-source__rule"></div>
</article>

<style>
	/*
	 * Chapter-card Surface — layout only. Backdrop (camera push, parallax,
	 * vignette, grain, warm corner light) lives in the shaderPass
	 * (chapter-card-backdrop). This CanvasSource paints a centred kicker
	 * ("CHAPTER 03"-style mono caps), a huge serif title beneath, and a
	 * thin horizontal rule as a typographic anchor between them.
	 */
	.chapter-card-source {
		background-color: transparent;
		box-sizing: border-box;
		color: var(--base, #f4ecdc);
		display: block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: relative;
	}

	.chapter-card-source__kicker {
		color: var(--kicker, #fabf47);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-weight: 500;
		inset-block-start: 38%;
		inset-inline-start: 50%;
		letter-spacing: 0.22em;
		opacity: 0.9;
		padding-inline-start: 0.22em;
		position: absolute;
		text-shadow: -0.035em 0.025em 0.10em rgba(0, 0, 0, 0.8);
		text-transform: uppercase;
		transform: translate(-50%, -50%);
	}

	.chapter-card-source__rule {
		background-color: var(--rule, rgba(216, 196, 160, 0.62));
		block-size: 3px;
		inset-block-start: 46%;
		inset-inline-start: 50%;
		inline-size: 3.6%;
		position: absolute;
		transform: translate(-50%, -50%);
	}

	.chapter-card-source__title {
		color: var(--ink, #ffffff);
		font-family: 'EB Garamond', 'Charter', 'Iowan Old Style', Georgia, serif;
		font-style: normal;
		font-weight: 700;
		inline-size: 60%;
		inset-block-start: 56%;
		inset-inline-start: 50%;
		line-height: 1.05;
		margin: 0;
		position: absolute;
		text-align: center;
		text-shadow: -0.045em 0.035em 0.14em rgba(0, 0, 0, 0.85);
		text-wrap: balance;
		transform: translate(-50%, -50%);
	}
</style>
