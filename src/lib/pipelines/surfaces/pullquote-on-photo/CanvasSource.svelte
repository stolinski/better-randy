<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));

	const content = $derived(engineState.surface.content);
	const hasQuote = $derived((content.title ?? '').trim().length > 0);
	const hasAttribution = $derived((content.author ?? '').trim().length > 0);
</script>

<article
	bind:this={element}
	class="pullquote-source surface"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
>
	<div class="pullquote-source__scrim"></div>

	{#if hasQuote}
		{#key content.title}
			<blockquote
				class="pullquote-source__quote"
				data-text-anim-slot="title"
				style:font-size={`${frame.width * 0.034}px`}
			>
				{content.title}
			</blockquote>
		{/key}
	{/if}

	{#if hasAttribution}
		{#key content.author}
			<cite
				class="pullquote-source__attribution"
				data-text-anim-slot="author"
				style:font-size={`${frame.width * 0.0125}px`}
			>
				{content.author}
			</cite>
		{/key}
	{/if}
</article>

<style>
	/*
	 * Pullquote-on-photo Surface — layout only. The atmospheric dark
	 * substrate, fine film grain, entrance light sweep, and rack-focus
	 * disc-bokeh blur on the captured text all live in the shaderPass
	 * (pullquote-photo-backdrop). This CanvasSource paints a static
	 * centred quote + attribution that the shader composites and animates.
	 */
	.pullquote-source {
		background-color: transparent;
		box-sizing: border-box;
		color: #ffffff;
		display: block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: relative;
	}

	/*
	 * Scrim: horizontal band centred vertically. Dark centre fades to
	 * transparent at top/bottom so text contrast holds against the
	 * shader-painted backdrop without boxing the frame.
	 */
	.pullquote-source__scrim {
		background: linear-gradient(
			180deg,
			rgba(4, 4, 8, 0) 0%,
			rgba(4, 4, 8, 0.72) 30%,
			rgba(4, 4, 8, 0.72) 70%,
			rgba(4, 4, 8, 0) 100%
		);
		block-size: 64%;
		inset-block-start: 18%;
		inset-inline: 0;
		position: absolute;
	}

	.pullquote-source__quote {
		font-family: 'EB Garamond', 'Charter', 'Iowan Old Style', Georgia, serif;
		font-style: normal;
		font-weight: 600;
		inline-size: 65%;
		inset-block-start: 46%;
		inset-inline-start: 50%;
		line-height: 1.12;
		margin: 0;
		position: absolute;
		text-align: center;
		text-shadow: 0 0.04em 0.10em rgba(0, 0, 0, 0.7);
		text-wrap: balance;
		transform: translate(-50%, -50%);
	}

	.pullquote-source__attribution {
		color: #f4ecdc;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-style: normal;
		font-weight: 500;
		inset-block-end: 12%;
		inset-inline: 0;
		letter-spacing: 0.24em;
		margin: 0 auto;
		position: absolute;
		text-align: center;
		text-shadow: 0 0.04em 0.10em rgba(0, 0, 0, 0.8);
		text-transform: uppercase;
	}
</style>
