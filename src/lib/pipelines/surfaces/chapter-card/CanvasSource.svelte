<script lang="ts">
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

<!--
	No style:opacity here. copyElementImageToTexture cannot capture a DOM element's
	CSS opacity<1 (captures transparent — see docs/critic-captures/text-fade-bug-investigation.md);
	the article stays opaque and the chapter-card-backdrop shaderPass fades the captured
	surface by paperVisibility on the GPU.
-->
<article
	bind:this={element}
	class="chapter-card-source surface"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
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
		/* Extra slot → chains to the ink core (base is the card's resting text ink), never a literal (ADR-0024). */
		color: var(--base, var(--ink));
		display: block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: relative;
	}

	/*
	 * Off-centre staging: the text block anchors to the lower-left third as a
	 * left-aligned L (kicker → rule → title share one left edge at 30%), leaving
	 * the upper-right quadrant — where the warm key glow sits (lightOrigin
	 * 0.82, 0.18) — as intentional negative space. Directional shadows fall
	 * down-left, agreeing with the upper-right key.
	 */
	.chapter-card-source__kicker {
		/* Extra slot → chains to the accent core (kicker is accent-family), never a literal (ADR-0024). */
		color: var(--kicker, var(--accent));
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-weight: 500;
		inset-block-start: 50.5%;
		inset-inline-start: 30%;
		letter-spacing: 0.18em;
		opacity: 0.92;
		position: absolute;
		text-shadow: -0.02em 0.03em 0.06em rgba(0, 0, 0, 0.6);
		text-transform: uppercase;
		transform: translateY(-50%);
	}

	.chapter-card-source__rule {
		/* Extra slot → chains to the accent core (the rule underlines the kicker's accent voice), never a literal (ADR-0024). */
		background-color: var(--rule, var(--accent));
		block-size: 5px;
		inset-block-start: 54.5%;
		inset-inline-start: 30%;
		inline-size: 8%;
		position: absolute;
		transform: translateY(-50%);
	}

	.chapter-card-source__title {
		color: var(--ink);
		font-family: 'EB Garamond', 'Charter', 'Iowan Old Style', Georgia, serif;
		font-style: normal;
		font-weight: 700;
		inline-size: 50%;
		inset-block-start: 62%;
		inset-inline-start: 30%;
		line-height: 1.05;
		margin: 0;
		position: absolute;
		text-align: left;
		text-shadow: -0.02em 0.03em 0.06em rgba(0, 0, 0, 0.6);
		text-wrap: balance;
		transform: translateY(-50%);
	}
</style>
