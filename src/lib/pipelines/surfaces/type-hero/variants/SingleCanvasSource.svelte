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

	// Fit the hero to the title-safe width so a longer title never clips
	// off-frame (e.g. "NEW EPISODE" vs the single-word "DRIFT"). Target the big
	// display size (0.16 W) but clamp it down so the word fits within ~84% of
	// the frame (7% left inset + safety right margin). Condensed Inter 900
	// uppercase advances ~0.6 em/char (conservative, accounting for the negative
	// tracking), so the estimate errs toward fitting. The min() keeps short
	// titles at full display scale (DRIFT is unchanged); the CSS max-inline-size
	// + wrap below is the graceful fail-safe if the estimate is ever slightly
	// short — the hero wraps to two balanced lines instead of clipping.
	const HERO_DISPLAY_RATIO = 0.16;
	const HERO_SAFE_WIDTH_RATIO = 0.84;
	const HERO_AVG_ADVANCE_EM = 0.6;
	const heroLen = $derived(Math.max((content.title ?? '').trim().length, 1));
	const heroFontSize = $derived(
		Math.min(
			frame.width * HERO_DISPLAY_RATIO,
			(frame.width * HERO_SAFE_WIDTH_RATIO) / (heroLen * HERO_AVG_ADVANCE_EM)
		)
	);
	const heroMaxWidth = $derived(frame.width * HERO_SAFE_WIDTH_RATIO);
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
				style:font-size={`${heroFontSize}px`}
				style:max-inline-size={`${heroMaxWidth}px`}
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
		inset-block-end: 9%;
		inset-inline-end: 7%;
		/* Pack label dress (`type-hero.tracking` / `.case`); silent → today's caps. */
		letter-spacing: var(--tracking, 0.32em);
		position: absolute;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: var(--case, uppercase);
	}
</style>
