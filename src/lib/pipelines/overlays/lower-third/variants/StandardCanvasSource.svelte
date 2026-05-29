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
	/* Container-query units so the overlay scales with the Composition
	   (3840×2160 horizontal or 2160×3840 vertical). cqmin = 1% of the
	   smaller axis so cap-heights stay constant across orientations. */
	.lower-third--standard {
		display: grid;
		gap: 0.75cqmin;
		background-color: rgba(10, 10, 10, 0.92);
		color: #ededed; /* Q17: sub-maximum contrast against the dark plate */
		padding: 3cqmin 4.5cqmin;
		font-family: 'Avenir Next', Helvetica, Arial, sans-serif;
	}

	.lower-third__kicker {
		font-family: ui-monospace, monospace;
		font-size: 3cqmin;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #ffd642;
	}

	.lower-third__title {
		font-size: 7cqmin;
		font-weight: 600;
		line-height: 1.05;
	}

	.lower-third__subtitle {
		font-size: 4cqmin;
		opacity: 0.78;
	}
</style>
