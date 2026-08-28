<script lang="ts">
	import { packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import {
		requireCoreColor,
		resolveColorChannels,
		resolveLowerThirdKicker
	} from '$lib/platform/packs/resolve';

	import type { LowerThirdContent } from '../index';

	interface Props {
		content: LowerThirdContent;
	}

	let { content }: Props = $props();

	const pack = $derived(getPack(packState.slug));

	// Scrim plate — one Pack colour (`lower-third.scrim`) composed at several
	// alphas along the gradient, so it rides an rgb-channel var
	// (resolveColorChannels). The inner fallback is a documented NEUTRAL
	// achromatic near-black (legibility plate, never another Pack's colour) —
	// it only runs for a Pack that makes no scrim claim.
	const scrimRgb = $derived(resolveColorChannels(pack, 'lower-third.scrim', '#0a0a0a'));

	// Accent glow — the accent rule's soft bloom is the same Pack colour at
	// 0.45 alpha, so it needs channels too. Resolution chains specific → core
	// with no literal at the end (ADR-0024): `lower-third.accent` → the Pack's
	// mandatory `accent-treatment`. Keeps the DOM glow consistent with the
	// pass-side flare rim, which is already Pack-routed.
	const accentRgb = $derived(
		resolveColorChannels(pack, 'lower-third.accent', requireCoreColor(pack, 'accent-treatment'))
	);

	// Kicker dress (`lower-third.kicker`, ADR-0023): plain tracked text unless
	// the Pack claims a chip — a small plate behind the kicker (the zine kicker
	// chip). The 'accent' plate sentinel rides the accent channel above so chip
	// and rule stay one colour family.
	const kicker = $derived(resolveLowerThirdKicker(pack));
	const kickerPlate = $derived(
		kicker.form === 'chip'
			? kicker.plate === 'accent'
				? `rgb(${accentRgb})`
				: kicker.plate
			: undefined
	);
</script>

<aside
	class="lower-third lower-third--cinematic"
	data-overlay="lower-third"
	data-variant="cinematic"
	style:--scrim-rgb={scrimRgb}
	style:--accent-rgb={accentRgb}
>
	<div class="lower-third--cinematic__scrim"></div>
	<div class="lower-third--cinematic__accent" data-gfx-shadow-owner="accent"></div>
	<div class="lower-third--cinematic__content">
		{#if content.kicker}
			{#key content.kicker}
				<span
					class="lower-third--cinematic__kicker"
					class:lower-third--cinematic__kicker--chip={kicker.form === 'chip'}
					style:--kicker-plate={kickerPlate}
					style:--kicker-ink={kicker.form === 'chip' ? kicker.ink : undefined}
					data-text-anim-slot="kicker"
					data-gfx-readable-id="kicker"
					data-gfx-text-role="overlay-cinematic-secondary"
				>
					{content.kicker}
				</span>
			{/key}
		{/if}
		{#key content.title}
			<strong
				class="lower-third--cinematic__name"
				data-text-anim-slot="title"
				data-gfx-readable-id="title"
				data-gfx-text-role="overlay-cinematic-primary"
			>
				{content.title}
			</strong>
		{/key}
		{#if content.subtitle}
			{#key content.subtitle}
				<span
					class="lower-third--cinematic__role"
					data-text-anim-slot="subtitle"
					data-gfx-readable-id="subtitle"
					data-gfx-text-role="overlay-cinematic-secondary"
				>
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
		/* Pack FORM dress (ADR-0023 appearance): border + corner radius the Pack
		   may claim via `lower-third.border` / `.radius`. A Pack silent on them
		   falls back to the borderless square plate — syntax renders unchanged. */
		border: var(--border, none);
		border-radius: var(--radius, 0);
	}

	/* Pack scrim colour at three alphas — --scrim-rgb is always set inline by
	   the script's channel resolution above. The plate holds ≥0.9 alpha through
	   88% — past the tracked subtitle's text extent — before fading, so no
	   glyph ever sits in the fade-to-zero zone over worst-case footage (G5;
	   the 70%-stop geometry let the subtitle tail run into scrim α≈0.4). */
	.lower-third--cinematic__scrim {
		background: linear-gradient(
			90deg,
			rgb(var(--scrim-rgb) / 0.94) 0%,
			rgb(var(--scrim-rgb) / 0.9) 88%,
			rgb(var(--scrim-rgb) / 0) 100%
		);
		grid-column: 1 / -1;
		grid-row: 1;
		inset: 0;
		position: absolute;
	}

	.lower-third--cinematic__accent {
		background-color: var(--accent);
		box-shadow: 0 0 calc(1.4 * var(--cqmin)) rgb(var(--accent-rgb) / 0.5);
		grid-column: 1;
		grid-row: 1;
		position: relative;
	}

	.lower-third--cinematic__content {
		color: var(--ink);
		display: grid;
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		gap: var(--gap, calc(0.7 * var(--cqmin)));
		grid-column: 2;
		grid-row: 1;
		/* Pack padding dress (`lower-third.pad`); silent → today's 2×3 plate. */
		padding: var(--pad, calc(2 * var(--cqmin)) calc(3 * var(--cqmin)));
		position: relative;
	}

	.lower-third--cinematic__kicker {
		/* Extra slot → chains to the accent core, never a literal (ADR-0024):
		   a Pack whose chrome eats small-text luminance lifts the kicker's
		   excitation without repainting the accent bar. */
		color: var(--kickerInk, var(--accent));
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		font-size: calc(1.9 * var(--cqmin));
		font-weight: 600;
		letter-spacing: var(--tracking, 0.26em);
		/* Pack status-voice drive (`lower-third.kickerDim`): an emissive Pack
		   whose chrome eats small-text luminance runs the kicker at full drive
		   to hold the G5 floor; silent → today's. */
		opacity: var(--kickerDim, 0.95);
		padding-inline-start: var(--tracking, 0.26em);
		text-shadow: var(--textShadow, 0 0.04em 0.1em rgba(0, 0, 0, 0.85));
		text-transform: uppercase;
	}

	/* Pack-claimed kicker chip (`lower-third.kicker` form 'chip'): the zine
	   kicker — mono caps on a brand plate. Square corners (zine cuts, never
	   rounds), fit-content so the plate hugs the word, tighter tracking than
	   the floating-text form (the plate does the separating work). */
	.lower-third--cinematic__kicker--chip {
		background: var(--kicker-plate);
		color: var(--kicker-ink);
		justify-self: start;
		letter-spacing: 0.14em;
		opacity: 1;
		padding: calc(0.45 * var(--cqmin)) calc(0.9 * var(--cqmin)) calc(0.38 * var(--cqmin))
			calc(1 * var(--cqmin));
		text-shadow: none;
	}

	.lower-third--cinematic__name {
		font-size: calc(4.7 * var(--cqmin));
		/* Pack name weight (`lower-third.weight`); silent → today's 700. */
		font-weight: var(--weight, 700);
		letter-spacing: -0.008em;
		line-height: 0.96;
		text-shadow: var(--textShadow, 0 0.04em 0.1em rgba(0, 0, 0, 0.9));
	}

	.lower-third--cinematic__role {
		/* Extra per-Pipeline slot → chains to the semantically-right core
		   (a muted label voice is ink-family) — never a literal (ADR-0024). */
		color: var(--roleInk, var(--ink));
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		/* Sized for a tasteful corner chip (~63px / ~45px cap at 4K), clearly
		   secondary to the name. In band: G4 "Overlay cinematic corner plate
		   secondary" (36–60 horizontal), added for exactly this register —
		   span measured on the overlay's laid-out rect, Pack-invariant. */
		font-size: calc(2.9 * var(--cqmin));
		font-weight: 500;
		letter-spacing: var(--tracking, 0.22em);
		/* Pack status-voice drive (`lower-third.subtitleDim`); silent → today's. */
		opacity: var(--subtitleDim, 0.92);
		text-shadow: var(--textShadow, 0 0.04em 0.1em rgba(0, 0, 0, 0.85));
		text-transform: uppercase;
	}
</style>
