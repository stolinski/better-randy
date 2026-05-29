<script lang="ts">
	import type { WatermarkContent } from './index';

	interface Props {
		content: WatermarkContent;
	}

	let { content }: Props = $props();
</script>

<aside class="watermark" data-overlay="watermark">
	<span class="watermark__accent" aria-hidden="true"></span>
	<span class="watermark__handle">{content.handle}</span>
	{#if content.label}
		<span class="watermark__label">{content.label}</span>
	{/if}
</aside>

<style>
	/* cqmin (1% of the smaller composition axis) so cap-heights stay constant
	   across horizontal/vertical orientations. */
	.watermark {
		display: grid;
		gap: 0.5cqmin;
		grid-template-columns: 0.2cqmin auto;
		grid-template-rows: auto auto;
		align-items: center;
		background-color: rgba(10, 10, 10, 0.74);
		color: #ededed; /* Q17: sub-maximum contrast against the dark plate */
		padding: 2cqmin 2.5cqmin 2cqmin 2.25cqmin;
		font-family: 'Avenir Next', Helvetica, Arial, sans-serif;
	}

	.watermark__accent {
		grid-column: 1;
		grid-row: 1 / -1;
		align-self: stretch;
		background-color: #ffd642;
		border-radius: 0.1cqmin;
	}

	.watermark__handle {
		grid-column: 2;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
		font-size: 3cqmin;
		font-weight: 600;
		line-height: 1;
	}

	.watermark__label {
		grid-column: 2;
		color: rgba(237, 237, 237, 0.7);
		font-size: 1.5cqmin;
		font-weight: 500;
		letter-spacing: 0.18em;
		line-height: 1;
		text-transform: uppercase;
	}
</style>
