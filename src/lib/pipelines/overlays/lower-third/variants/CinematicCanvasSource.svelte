<script lang="ts">
	import type { LowerThirdContent } from '../index';

	interface Props {
		content: LowerThirdContent;
	}

	let { content }: Props = $props();
</script>

<aside class="lower-third lower-third--cinematic" data-overlay="lower-third" data-variant="cinematic">
	<div class="lower-third--cinematic__scrim"></div>
	<div class="lower-third--cinematic__accent"></div>
	<div class="lower-third--cinematic__content">
		{#if content.kicker}
			{#key content.kicker}
				<span class="lower-third--cinematic__kicker" data-text-anim-slot="kicker">
					{content.kicker}
				</span>
			{/key}
		{/if}
		{#key content.title}
			<strong class="lower-third--cinematic__name" data-text-anim-slot="title">
				{content.title}
			</strong>
		{/key}
		{#if content.subtitle}
			{#key content.subtitle}
				<span class="lower-third--cinematic__role" data-text-anim-slot="subtitle">
					{content.subtitle}
				</span>
			{/key}
		{/if}
	</div>
</aside>

<style>
	/*
	 * Cinematic lower-third variant — broadcast-grade plate. The anamorphic
	 * flare + rim glow are carried by the family-level shaderPass gated to
	 * this variant only; this CanvasSource paints layout chrome only.
	 */
	.lower-third--cinematic {
		display: grid;
		grid-template-columns: 1cqmin 1fr;
		gap: 0;
		position: relative;
		min-block-size: 18cqmin;
		min-inline-size: 46cqmin;
	}

	.lower-third--cinematic__scrim {
		background: linear-gradient(
			90deg,
			rgba(8, 6, 10, 0.94) 0%,
			rgba(8, 6, 10, 0.9) 70%,
			rgba(8, 6, 10, 0) 100%
		);
		grid-column: 1 / -1;
		grid-row: 1;
		inset: 0;
		position: absolute;
	}

	.lower-third--cinematic__accent {
		background-color: #f4a85e;
		box-shadow: 0 0 1.4cqmin rgba(244, 168, 94, 0.45);
		grid-column: 1;
		grid-row: 1;
		position: relative;
	}

	.lower-third--cinematic__content {
		color: #fff8ec;
		display: grid;
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		gap: 1cqmin;
		grid-column: 2;
		grid-row: 1;
		padding: 3cqmin 4.4cqmin;
		position: relative;
	}

	.lower-third--cinematic__kicker {
		color: #f4a85e;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 3.2cqmin;
		font-weight: 600;
		letter-spacing: 0.26em;
		opacity: 0.95;
		padding-inline-start: 0.26em;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: uppercase;
	}

	.lower-third--cinematic__name {
		font-size: 8cqmin;
		font-weight: 700;
		letter-spacing: -0.008em;
		line-height: 0.96;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.9);
	}

	.lower-third--cinematic__role {
		color: #d8c4a0;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		/* 5.2cqmin lands the role above the G4 Overlay-secondary cap-height floor
		   (≥80px at 4K); 4.2 measured ~68px under the Critic. Stays clearly
		   secondary to the 8cqmin name. */
		font-size: 5.2cqmin;
		font-weight: 500;
		letter-spacing: 0.22em;
		opacity: 0.92;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: uppercase;
	}
</style>
