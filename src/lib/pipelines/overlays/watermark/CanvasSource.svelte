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
	/* --cqmin (inherited from Composition) = 1% of the smaller composition axis.
	   cqmin CSS units are not reliable inside the canvas layoutsubtree. */
	.watermark {
		display: grid;
		gap: var(--gap, calc(0.5 * var(--cqmin)));
		grid-template-columns: calc(0.2 * var(--cqmin)) auto;
		grid-template-rows: auto auto;
		align-items: center;
		background-color: rgba(10, 10, 10, 0.74);
		color: var(--ink); /* Q17: sub-maximum contrast against the dark plate (mount-guaranteed, ADR-0024) */
		padding: var(--pad, calc(2 * var(--cqmin)) calc(2.5 * var(--cqmin)) calc(2 * var(--cqmin)) calc(2.25 * var(--cqmin)));
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		/* Pack FORM dress (ADR-0023 appearance): a Pack may turn the corner chip
		   into a bezelled terminal status tag (`watermark.border` / `.radius`,
		   tighter `.pad`). Silent → today's borderless chip (border none, radius 0
		   → byte-identical; syntax unchanged). */
		border: var(--border, none);
		border-radius: var(--radius, 0);
	}

	.watermark__accent {
		grid-column: 1;
		grid-row: 1 / -1;
		align-self: stretch;
		background-color: var(--accent);
		border-radius: calc(0.1 * var(--cqmin));
	}

	.watermark__handle {
		grid-column: 2;
		font-family: var(--font, 'SFMono-Regular', Consolas, 'Liberation Mono', monospace);
		font-size: calc(3 * var(--cqmin));
		font-weight: var(--weight, 600);
		letter-spacing: var(--tracking, normal);
		line-height: var(--leading, 1);
		text-transform: var(--case, none);
	}

	.watermark__label {
		grid-column: 2;
		color: rgba(237, 237, 237, 0.7);
		font-size: calc(1.5 * var(--cqmin));
		font-weight: 500;
		letter-spacing: var(--tracking, 0.18em);
		line-height: var(--leading, 1);
		text-transform: var(--case, uppercase);
	}
</style>
