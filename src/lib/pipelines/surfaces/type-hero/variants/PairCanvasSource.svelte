<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const content = $derived(engineState.surface.content);
	const hasPrimary = $derived((content.title ?? '').trim().length > 0);
	const hasCounterpoint = $derived((content.counterpoint ?? '').trim().length > 0);
	const hasSubtitle = $derived((content.author ?? '').trim().length > 0);

	// Pair variant — primary at full type-hero scale, counterpoint at a
	// programmatic ratio. Default ratio 0.06 of primary on horizontal (meets
	// surface-label floor: 3840 × 0.16 × 0.06 × 0.7 = 25.8px ≥ 24px ✓).
	// On vertical the ratio-of-ratio is too small (14.5px cap); use a direct
	// frame-width ratio instead (2160 × 0.022 × 0.7 ≈ 33.3px ≥ 32px ✓).
	const isVertical = $derived(engineState.transport.orientation === 'vertical');
	const primaryFontSize = $derived(frame.width * 0.16);
	const counterpointFontSize = $derived(
		isVertical ? frame.width * 0.022 : primaryFontSize * 0.06
	);
	const subtitleFontSize = $derived(frame.width * (isVertical ? 0.022 : 0.012));
</script>

<article
	bind:this={element}
	class="type-hero-source type-hero-source--pair surface"
	data-variant="pair"
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
>
	{#if hasPrimary}
		{#key content.title}
			<h2
				class="type-hero-source__hero"
				data-text-anim-slot="title"
				style:font-size={`${primaryFontSize}px`}
			>
				{content.title}
			</h2>
		{/key}
	{/if}

	{#if hasCounterpoint}
		{#key content.counterpoint}
			<span
				class="type-hero-source__counterpoint"
				data-text-anim-slot="counterpoint"
				style:font-size={`${counterpointFontSize}px`}
			>
				{content.counterpoint}
			</span>
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
		/* Extra slot → chains to the ink core, never a literal (ADR-0024). */
		color: var(--text-base, var(--ink));
		display: block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: relative;
	}

	.type-hero-source__hero {
		color: var(--ink);
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		font-stretch: condensed;
		font-style: normal;
		/* Pack title weight (`type-hero.weight`); silent → today's 900. */
		font-weight: var(--weight, 900);
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

	/*
	 * Counterpoint slot — small superscript-style annotation positioned at the
	 * primary\'s shoulder (top-right edge). Reads as a numeric or short
	 * label paired with the hero word. Default scale = 6% of primary
	 * cap-height per the plan\'s mo1 reference.
	 */
	.type-hero-source__counterpoint {
		color: var(--accent);
		font-family: var(--fontLabel, var(--font, 'JetBrains Mono', ui-monospace, monospace));
		font-weight: 600;
		inset-block-start: calc(50% - 16%);
		inset-inline-start: calc(7% + 38%);
		/* Pack label dress (`type-hero.tracking` / `.case`); silent → today's caps. */
		letter-spacing: var(--tracking, 0.12em);
		position: absolute;
		text-transform: var(--case, uppercase);
		white-space: nowrap;
	}

	.type-hero-source__rule {
		background-color: var(--accent);
		block-size: 22%;
		inset-block-start: 50%;
		inset-inline-end: 14%;
		inline-size: 2px;
		position: absolute;
		transform: translateY(-50%);
	}

	.type-hero-source__subtitle {
		/* Extra slot → chains to the ink core (byline is a muted ink voice), never a literal (ADR-0024). */
		color: var(--byline, var(--ink));
		font-family: var(--fontLabel, var(--font, 'JetBrains Mono', ui-monospace, monospace));
		font-style: normal;
		font-weight: 500;
		inset-block-end: 9%;
		inset-inline-end: 7%;
		/* Pack label dress (`type-hero.tracking` / `.case`); silent → today's caps. */
		letter-spacing: var(--tracking, 0.32em);
		position: absolute;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: var(--case, uppercase);
	}
</style>
