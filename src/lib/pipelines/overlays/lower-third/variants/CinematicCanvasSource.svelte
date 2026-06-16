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
		grid-template-columns: calc(0.6 * var(--cqmin)) 1fr;
		gap: 0;
		position: relative;
		min-block-size: calc(11 * var(--cqmin));
		min-inline-size: calc(30 * var(--cqmin));
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
		background-color: var(--accent, #f4a85e);
		box-shadow: 0 0 calc(1.4 * var(--cqmin)) rgba(244, 168, 94, 0.45);
		grid-column: 1;
		grid-row: 1;
		position: relative;
	}

	.lower-third--cinematic__content {
		color: var(--ink, #fff8ec);
		display: grid;
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		gap: calc(0.7 * var(--cqmin));
		grid-column: 2;
		grid-row: 1;
		padding: calc(2 * var(--cqmin)) calc(3 * var(--cqmin));
		position: relative;
	}

	.lower-third--cinematic__kicker {
		color: var(--accent, #f4a85e);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: calc(1.9 * var(--cqmin));
		font-weight: 600;
		letter-spacing: 0.26em;
		opacity: 0.95;
		padding-inline-start: 0.26em;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: uppercase;
	}

	.lower-third--cinematic__name {
		font-size: calc(4.7 * var(--cqmin));
		font-weight: 700;
		letter-spacing: -0.008em;
		line-height: 0.96;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.9);
	}

	.lower-third--cinematic__role {
		color: var(--roleInk, #d8c4a0);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		/* Sized for a tasteful corner chip (~63px / ~45px cap at 4K), clearly
		   secondary to the name. NOTE: below the G4 Overlay-secondary 80px floor —
		   that band is calibrated for full-width broadcast lower-thirds and is too
		   large for a corner chip; flagged for recalibration (see quality-roadmap
		   "long tail"). User's eye is the authority here. */
		font-size: calc(2.9 * var(--cqmin));
		font-weight: 500;
		letter-spacing: 0.22em;
		opacity: 0.92;
		text-shadow: 0 0.04em 0.1em rgba(0, 0, 0, 0.85);
		text-transform: uppercase;
	}
</style>
