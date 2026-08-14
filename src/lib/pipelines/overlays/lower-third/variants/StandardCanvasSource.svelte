<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';

	import type { LowerThirdContent } from '../index';

	interface Props {
		content: LowerThirdContent;
	}

	let { content }: Props = $props();
</script>

<aside
	class="lower-third lower-third--standard"
	data-orientation={engineState.transport.orientation}
	data-overlay="lower-third"
	data-variant="standard"
>
	{#if content.kicker}
		{#key content.kicker}
			<span class="lower-third__kicker" data-text-anim-slot="kicker">{content.kicker}</span>
		{/key}
	{/if}
	{#key content.title}
		<strong class="lower-third__title" data-text-anim-slot="title">{content.title}</strong>
	{/key}
	{#if content.subtitle}
		{#key content.subtitle}
			<span class="lower-third__subtitle" data-text-anim-slot="subtitle">{content.subtitle}</span>
		{/key}
	{/if}
</aside>

<style>
	/* --cqmin (inherited from Composition) = 1% of the smaller composition axis
	   (3840×2160 horizontal or 2160×3840 vertical). cqmin CSS units are not
	   reliable inside the canvas layoutsubtree. */
	.lower-third--standard {
		box-sizing: border-box;
		display: grid;
		gap: var(--gap, calc(0.75 * var(--cqmin)));
		isolation: isolate;
		max-inline-size: 2200px;
		position: relative;
		/* Pack plate chrome (`lower-third.plate`). The fallback is a documented
		   NEUTRAL achromatic legibility plate (a Pack that makes no plate claim
		   gets a near-black scrim, never another Pack's colour). */
		background-color: var(--plate, rgb(10 10 10 / 0.92));
		color: var(--ink); /* Q17: sub-maximum contrast against the dark plate (mount-guaranteed, ADR-0024) */
		padding: var(--pad, calc(3 * var(--cqmin)) calc(4.5 * var(--cqmin)));
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		/* Pack FORM dress (ADR-0023 appearance): border + corner radius the Pack
		   may claim via `lower-third.border` / `.radius` — the same roles that bezel
		   the cinematic plate now also frame the standard plate. A Pack silent on
		   them keeps today's borderless square plate (syntax renders unchanged).
		   `lower-third.shadow` carries a claimed depth stack (e.g. the Syntax
		   stepped hard-offset — box-shadow captures in HTML-in-Canvas; CSS filters
		   do not); silent Packs stay flat. */
		border: var(--border, none);
		border-radius: var(--radius, 0);
		box-shadow: var(--shadow, none);
	}

	.lower-third--standard::before {
		background: var(--backing, transparent);
		border-radius: inherit;
		content: '';
		inset: 0;
		position: absolute;
		transform: translate(var(--backingOffset, 0), var(--backingOffset, 0));
		z-index: -1;
	}

	.lower-third--standard[data-orientation='vertical'] {
		max-inline-size: 1770px;
	}

	.lower-third__kicker {
		color: var(--accent);
		/* Label/chrome face (`lower-third.fontLabel`) — distinct from the display
		   face so a Pack can pair a grotesk display with a mono label voice. */
		font-family: var(--fontLabel, var(--font, 'JetBrains Mono', ui-monospace, monospace));
		font-size: calc(2.4 * var(--cqmin));
		line-height: 1;
		letter-spacing: var(--tracking, 0.16em);
		text-transform: var(--case, uppercase);
	}

	.lower-third__title {
		font-size: calc(7 * var(--cqmin));
		font-weight: var(--weight, 600);
		letter-spacing: -0.02em;
		line-height: var(--leading, 0.92);
	}

	.lower-third__subtitle {
		/* Muted byline ink (`lower-third.roleInk`) — a claimed quiet voice beats
		   the translucent-ink fallback so the Pack controls the exact byline
		   colour (the old opacity: 0.78 dim, expressed as a colour so a claim
		   replaces it wholesale). Tracking is NOT the kicker's — a byline reads
		   at body tightness while `--tracking` carries the label/chip spacing. */
		color: var(--roleInk, color-mix(in srgb, currentColor 78%, transparent));
		font-size: calc(4.3 * var(--cqmin));
		letter-spacing: -0.025em;
		line-height: 0.9;
		text-transform: var(--case, none);
	}

	.lower-third--standard[data-orientation='vertical'] .lower-third__title {
		font-size: calc(7.5 * var(--cqmin));
	}

	.lower-third--standard[data-orientation='vertical'] .lower-third__subtitle {
		font-size: calc(5.2 * var(--cqmin));
		letter-spacing: -0.035em;
	}
</style>
