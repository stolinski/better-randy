<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const content = $derived(engineState.surface.content);
	const isVertical = $derived(engineState.transport.orientation === 'vertical');
	const hasTitle = $derived((content.title ?? '').trim().length > 0);
	const hasSubtitle = $derived((content.author ?? '').trim().length > 0);
	// Subtitle meets the surface-label cap-height floor per orientation:
	//   horizontal (3840w): 0.012 × 3840 = 46.1px → cap ≈ 32.3px ≥ 24px ✓
	//   vertical (2160w):   0.022 × 2160 = 47.5px → cap ≈ 33.3px ≥ 32px ✓
	const subtitleFontSize = $derived(
		frame.width * (engineState.transport.orientation === 'vertical' ? 0.022 : 0.012)
	);

	// Horizontal keeps its established 0.16 W fit-to-safe-width layout. Vertical
	// reflows to 0.16 H, then condenses the word into the same safe measure below.
	const HERO_DISPLAY_RATIO = 0.16;
	const HERO_SAFE_WIDTH_RATIO = 0.84;
	const HERO_AVG_ADVANCE_EM = 0.6;
	const VERTICAL_HERO_AVG_ADVANCE_EM = 0.66;
	const heroLen = $derived(Math.max((content.title ?? '').trim().length, 1));
	const heroAvailableWidth = $derived(frame.width * HERO_SAFE_WIDTH_RATIO);
	const heroFontSize = $derived(
		isVertical
			? frame.height * HERO_DISPLAY_RATIO
			: Math.min(
					frame.width * HERO_DISPLAY_RATIO,
					heroAvailableWidth / (heroLen * HERO_AVG_ADVANCE_EM)
				)
	);
	// Vertical keeps the full display cap height and condenses only the hero word
	// into its available measure. This is a type treatment, not frame scaling.
	const heroScaleX = $derived(
		isVertical
			? Math.min(1, heroAvailableWidth / (heroFontSize * heroLen * VERTICAL_HERO_AVG_ADVANCE_EM))
			: 1
	);
	const heroMaxWidth = $derived(heroAvailableWidth / heroScaleX);
</script>

<article
	bind:this={element}
	class="type-hero-source surface"
	data-variant="single"
	data-orientation={engineState.transport.orientation}
	style:block-size={`${frame.height}px`}
	style:inline-size={`${frame.width}px`}
>
	{#if hasTitle}
		{#key content.title}
			<h2
				class="type-hero-source__hero"
				data-text-anim-slot="title"
				style:font-size={`${heroFontSize}px`}
				style:max-inline-size={`${heroMaxWidth}px`}
				style:--hero-scale-x={`${heroScaleX}`}
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
				style:inset-block-end={engineState.transport.orientation === 'vertical' ? '18%' : '9%'}
				style:inset-inline-end={isVertical ? '12%' : '7%'}
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
		font-stretch: var(--stretch, condensed);
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
		text-wrap: balance;
		transform: translateY(-50%);
	}

	.type-hero-source[data-orientation='vertical'] .type-hero-source__hero {
		transform: translateY(-50%) scaleX(var(--hero-scale-x));
		transform-origin: left center;
		white-space: nowrap;
	}

	/* The accent gesture: a chunky horizontal bar under the word, left-aligned
	   with it — a confident graphic mark (the brand's marker stub), not the old
	   floating vertical hairline (which read as generic-template chrome). */
	.type-hero-source__rule {
		background-color: var(--accent);
		block-size: 1.6%;
		inset-block-start: 65%;
		inset-inline-start: 7.2%;
		inline-size: 14%;
		position: absolute;
	}

	.type-hero-source__subtitle {
		/* Extra slot → chains to the ink core (byline is a muted ink voice), never a literal (ADR-0024). */
		color: var(--byline, var(--ink));
		/* Label/chrome face (`type-hero.fontLabel`) — distinct from the display
		   face so a Pack pairs a grotesk hero with a mono stamp. */
		font-family: var(--fontLabel, var(--font, 'JetBrains Mono', ui-monospace, monospace));
		font-style: normal;
		font-weight: 500;
		/* Pack label dress (`type-hero.tracking` / `.case`); silent → today's caps. */
		letter-spacing: var(--tracking, 0.32em);
		position: absolute;
		/* Pack glyph armor (`type-hero.textShadow`); silent → today's dark-field
		   legibility shadow. A light-field Pack claims 'none' (a dark halo on
		   white reads as a bug). */
		text-shadow: var(--textShadow, 0 0.04em 0.1em rgba(0, 0, 0, 0.85));
		text-transform: var(--case, uppercase);
	}
</style>
