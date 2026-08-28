<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const isVertical = $derived(engineState.transport.orientation === 'vertical');

	const content = $derived(engineState.surface.content);
	const hasQuote = $derived((content.title ?? '').trim().length > 0);
	const hasAttribution = $derived((content.author ?? '').trim().length > 0);
</script>

<!--
	No style:opacity here. copyElementImageToTexture cannot capture a DOM element's
	CSS opacity<1 (captures transparent — see docs/critic-captures/text-fade-bug-investigation.md);
	the article stays opaque and the pullquote-photo-backdrop shaderPass fades the captured
	surface by paperVisibility on the GPU.
-->
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
				data-gfx-readable-id="surface:pullquote-on-photo:title"
				data-gfx-text-role="surface-title"
				style:font-size={`${frame.width * (isVertical ? 0.0505 : 0.034)}px`}
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
				data-gfx-readable-id="surface:pullquote-on-photo:author"
				data-gfx-text-role="surface-label"
				style:font-size={`${frame.width * (isVertical ? 0.0213 : 0.0125)}px`}
				style:inset-block-end={`${isVertical ? 18 : 12}%`}
				style:inset-inline-end={`${isVertical ? 10 : 7}%`}
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
		color: var(--ink);
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
		/*
		 * Soft radial darkening centred behind the quote — gives text contrast
		 * over a photographic substrate WITHOUT a heavy full-width band that hides
		 * the photo (the point of "pullquote on photo" is to see the photo). The
		 * ellipse peaks behind the text and fades to transparent toward the edges,
		 * so the substrate breathes around it.
		 */
		background: radial-gradient(
			ellipse 68% 46% at 50% 48%,
			rgba(4, 4, 8, 0.44) 0%,
			rgba(4, 4, 8, 0.3) 50%,
			rgba(4, 4, 8, 0) 82%
		);
		inset: 0;
		position: absolute;
	}

	.pullquote-source__quote {
		font-family: var(--font, 'EB Garamond', 'Charter', 'Iowan Old Style', Georgia, serif);
		font-style: normal;
		/* Pack title weight (`pullquote-on-photo.weight`); silent → today's 600. */
		font-weight: var(--weight, 600);
		inline-size: 65%;
		inset-block-start: 46%;
		inset-inline-start: 50%;
		line-height: 1.35;
		margin: 0;
		position: absolute;
		text-align: center;
		text-wrap: balance;
		transform: translate(-50%, -50%);
	}

	.pullquote-source__attribution {
		/* Extra slot → chains to the ink core (byline is a muted ink voice), never a literal (ADR-0024). */
		color: var(--byline, var(--ink));
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		font-style: normal;
		font-weight: 500;
		/* Pack label dress (`pullquote-on-photo.tracking` / `.case`); silent → today's caps. */
		letter-spacing: var(--tracking, 0.24em);
		position: absolute;
		text-align: end;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.8);
		text-transform: var(--case, uppercase);
	}
</style>
