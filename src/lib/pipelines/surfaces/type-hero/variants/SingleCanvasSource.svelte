<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const content = $derived(engineState.surface.content);
	const hasTitle = $derived((content.title ?? '').trim().length > 0);
	const hasSubtitle = $derived((content.author ?? '').trim().length > 0);
	// Subtitle meets the surface-label cap-height floor per orientation:
	//   horizontal (3840w): 0.012 × 3840 = 46.1px → cap ≈ 32.3px ≥ 24px ✓
	//   vertical (2160w):   0.022 × 2160 = 47.5px → cap ≈ 33.3px ≥ 32px ✓
	const subtitleFontSize = $derived(
		frame.width * (engineState.transport.orientation === 'vertical' ? 0.022 : 0.012)
	);
</script>

<article
	bind:this={element}
	class="type-hero-source surface"
	data-variant="single"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
>
	{#if hasTitle}
		{#key content.title}
			<h2
				class="type-hero-source__hero"
				data-text-anim-slot="title"
				style:font-size={`${frame.width * 0.16}px`}
			>
				{content.title}
			</h2>
		{/key}
	{/if}

	<div class="type-hero-source__rule"></div>

	{#if hasSubtitle}
		{#key content.author}
			<cite
				class="type-hero-source__subtitle"
				data-text-anim-slot="author"
				style:font-size={`${subtitleFontSize}px`}
			>
				{content.author}
			</cite>
		{/key}
	{/if}
</article>

<style>
	.type-hero-source {
		background-color: transparent;
		box-sizing: border-box;
		color: var(--text-base, #fff8ec);
		display: block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: relative;
	}

	.type-hero-source__hero {
		color: var(--ink, #fffaf2);
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		font-stretch: condensed;
		font-style: normal;
		font-weight: 900;
		inset-block-start: 50%;
		inset-inline-start: 7%;
		letter-spacing: -0.038em;
		line-height: 0.85;
		margin: 0;
		position: absolute;
		text-transform: uppercase;
		transform: translateY(-50%);
		white-space: nowrap;
	}

	.type-hero-source__rule {
		background-color: var(--accent, #f4a85e);
		block-size: 22%;
		inset-block-start: 50%;
		inset-inline-end: 14%;
		inline-size: 2px;
		position: absolute;
		transform: translateY(-50%);
	}

	.type-hero-source__subtitle {
		color: var(--byline, #d8c4a0);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-style: normal;
		font-weight: 500;
		inset-block-end: 9%;
		inset-inline-end: 7%;
		letter-spacing: 0.32em;
		position: absolute;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: uppercase;
	}
</style>
