<script lang="ts">
	import type { LowerThirdContent } from '../index';

	interface Props {
		content: LowerThirdContent;
	}

	let { content }: Props = $props();
</script>

<aside class="lower-third lower-third--standard" data-overlay="lower-third" data-variant="standard">
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
		display: grid;
		gap: calc(0.75 * var(--cqmin));
		/* Pack plate chrome (`lower-third.plate`). The fallback is a documented
		   NEUTRAL achromatic legibility plate (a Pack that makes no plate claim
		   gets a near-black scrim, never another Pack's colour). */
		background-color: var(--plate, rgb(10 10 10 / 0.92));
		color: var(--ink); /* Q17: sub-maximum contrast against the dark plate (mount-guaranteed, ADR-0024) */
		padding: calc(3 * var(--cqmin)) calc(4.5 * var(--cqmin));
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
	}

	.lower-third__kicker {
		color: var(--accent);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: calc(3 * var(--cqmin));
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.lower-third__title {
		font-size: calc(7 * var(--cqmin));
		font-weight: 600;
		line-height: 1.05;
	}

	.lower-third__subtitle {
		font-size: calc(4 * var(--cqmin));
		opacity: 0.78;
	}
</style>
