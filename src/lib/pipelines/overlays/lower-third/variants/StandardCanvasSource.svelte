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
		background-color: rgba(10, 10, 10, 0.92);
		color: #ededed; /* Q17: sub-maximum contrast against the dark plate */
		padding: calc(3 * var(--cqmin)) calc(4.5 * var(--cqmin));
		font-family: 'Avenir Next', Helvetica, Arial, sans-serif;
	}

	.lower-third__kicker {
		font-family: ui-monospace, monospace;
		font-size: calc(3 * var(--cqmin));
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #ffd642;
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
