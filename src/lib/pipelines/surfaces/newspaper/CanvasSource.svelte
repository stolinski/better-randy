<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import { hashStringToUnitInterval, seededRange } from '$lib/utils/seeded';
	import { NEWSPRINT_INK_HEX, NEWSPRINT_PAPER_HEX } from './newsprint-substrate';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// Newspaper card occupies 88% × 62% of the frame. At 3840 × 2160 that's
	// 3379 × 1339, centred — bbox area 54.6% (inside T1's 45–75% horizontal-
	// landscape band), longer-dim occupancy 88% (≥ T1's 85% paper floor). Enter
	// is a vertical settle-in driven by `animState.paperVisibility` (0 → 1).
	const CARD_WIDTH_RATIO = 0.88;
	const CARD_HEIGHT_RATIO = 0.62;
	// Brief: 1–3° rotation seeded from the preset id.
	const ROTATION_MIN_DEG = 1;
	const ROTATION_MAX_DEG = 3;

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const metadataSizeRatio = $derived(
		engineState.transport.orientation === 'vertical' ? 0.024 : 0.02
	);

	// Seed the per-instance rotation from the title so two newspaper cards
	// in one session don't share angle (Q6 / G9, deterministic at render
	// time, no Math.random).
	const seedKey = $derived(
		`${engineState.surface.content.title ?? ''}|${engineState.surface.content.kicker ?? ''}`
	);
	const seed = $derived(hashStringToUnitInterval(seedKey));
	// Centre the deg range on zero by flipping half the time, so headlines
	// don't all tilt the same way.
	const rotationDeg = $derived(
		(seed < 0.5 ? -1 : 1) * seededRange(seed, ROTATION_MIN_DEG, ROTATION_MAX_DEG)
	);

	const layout = $derived.by(() => {
		const width = frame.width * CARD_WIDTH_RATIO;
		const height = frame.height * CARD_HEIGHT_RATIO;
		const restingX = (frame.width - width) / 2;
		const restingY = (frame.height - height) / 2;
		// Enter from below; settle at the resting position as paperVisibility
		// climbs from 0 → 1. Identical pattern to paper/CanvasSource.svelte.
		const startY = frame.height + height * 0.08;
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const y = startY + (restingY - startY) * visibility;

		return { x: restingX, y, width, height };
	});

	// No CSS depth shadow: the clipping's edge is intrinsically torn (partial
	// substrate immunity, ADR-0039 §2 — `newsprint-substrate.ts`), and displaced
	// edge modes hand the depth rig to the shared edge-treatment ShaderPass,
	// which synthesizes the Pack's claimable `newspaper.depth` chrome against
	// the TORN silhouette (`prepareFramePackTreatments`): an offset duplicate
	// for hard-offset rigs, a centered bloom halo for glow rigs. A CSS
	// box-shadow here would bake a straight card/shadow seam into the flat
	// HTML-in-Canvas capture that no alpha treatment can cross.

	const sourceLabel = $derived.by(() => {
		const url = engineState.surface.content.sourceUrl?.trim() ?? '';

		if (url.length === 0) {
			return engineState.surface.content.source ?? '';
		}

		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return url;
		}
	});

	// Detect non-title slot presence so the title can scale into a
	// display-headline role when the card is title-only (the title-card
	// preset family) and shrink back into a Surface-title role when chrome
	// is present (newspaper-clipping with kicker/byline/dateline + body).
	const content = $derived(engineState.surface.content);
	const hasKicker = $derived((content.kicker ?? '').trim().length > 0);
	const hasByline = $derived((content.author ?? '').trim().length > 0);
	const hasDate = $derived((content.dateLabel ?? '').trim().length > 0);
	const hasBody = $derived(
		Array.isArray(content.body) &&
			content.body.some((paragraph) =>
				paragraph.segments?.some((segment) => (segment.text ?? '').trim().length > 0)
			)
	);
	const hasFooterContent = $derived(
		hasByline || hasDate || (!hasByline && !hasDate && sourceLabel.length > 0)
	);

	const secondarySlotCount = $derived(
		(hasKicker ? 1 : 0) + (hasByline ? 1 : 0) + (hasDate ? 1 : 0) + (hasBody ? 1 : 0)
	);

	// G4's Surface-title cap-height band (60–110 px horizontal) covers the
	// chrome-present case. The title-only case takes the Display-headline
	// role the rubric doesn't yet codify — Critic-filed rubric-gap. Presets
	// using the bigger scale note the deviation in their `description`.
	const titleSizeRatio = $derived(
		secondarySlotCount === 0
			? 0.115
			: secondarySlotCount === 1
				? 0.085
				: secondarySlotCount === 2
					? 0.07
					: 0.058
	);

	const density = $derived(secondarySlotCount === 0 ? 'title-only' : 'default');
</script>

<article
	bind:this={element}
	class="newspaper-source surface"
	data-density={density}
	style:block-size={`${layout.height}px`}
	style:inline-size={`${layout.width}px`}
	style:left={`${layout.x}px`}
	style:top={`${layout.y}px`}
	style:transform={`rotate(${rotationDeg}deg)`}
	style:padding={`${layout.width * 0.045}px ${layout.width * 0.06}px`}
	style:background-color={NEWSPRINT_PAPER_HEX}
	style:color={NEWSPRINT_INK_HEX}
>
	<header>
		{#if hasKicker}
			{#key content.kicker}
				<span
					class="newspaper-source__kicker"
					data-text-anim-slot="kicker"
					data-supers-readable-id="surface:newspaper:kicker"
					data-supers-text-role="surface-label"
					style:font-size={`${layout.width * 0.022}px`}
				>
					{content.kicker}
				</span>
			{/key}
		{/if}
		{#if content.title}
			{#key content.title}
				<h2
					data-text-anim-slot="title"
					data-supers-readable-id="surface:newspaper:title"
					data-supers-text-role="surface-title"
					style:font-size={`${layout.width * titleSizeRatio}px`}
				>
					{content.title}
				</h2>
			{/key}
		{/if}
	</header>

	{#if hasBody}
		{#key annotationBodyPlainText(content.body)}
			<section data-text-anim-slot="body" style:font-size={`${layout.width * 0.022}px`}>
				{#each content.body as block, blockIndex (blockIndex)}
					{#if block.type === 'paragraph'}
						<p
							data-supers-readable-id={`surface:newspaper:body:${blockIndex}`}
							data-supers-text-role="surface-body"
						>
							{#each block.segments as segment, segmentIndex (`${blockIndex}:${segmentIndex}:${segment.text}`)}
								{#if segment.markStyles.length > 0}
									{@const innerText = segment.text}
									{@const styles = segment.markStyles}
									{#snippet renderSegment(index: number)}
										{#if index < styles.length}
											<span data-annotation-mark={styles[index]}>
												{@render renderSegment(index + 1)}
											</span>
										{:else}
											{innerText}
										{/if}
									{/snippet}
									{@render renderSegment(0)}
								{:else}
									{segment.text}
								{/if}
							{/each}
						</p>
					{/if}
				{/each}
			</section>
		{/key}
	{/if}

	{#if hasFooterContent}
		<footer>
			{#if hasByline}
				{#key content.author}
					<span
						class="newspaper-source__byline"
						data-text-anim-slot="author"
						data-supers-readable-id="surface:newspaper:author"
						data-supers-text-role="surface-label"
						style:font-size={`${layout.width * metadataSizeRatio}px`}
					>
						{content.author}
					</span>
				{/key}
			{/if}
			{#if hasDate}
				{#key content.dateLabel}
					<span
						class="newspaper-source__date"
						data-text-anim-slot="dateLabel"
						data-supers-readable-id="surface:newspaper:date-label"
						data-supers-text-role="surface-label"
						style:font-size={`${layout.width * metadataSizeRatio}px`}
					>
						{content.dateLabel}
					</span>
				{/key}
			{/if}
			{#if !hasByline && !hasDate && sourceLabel}
				{#key sourceLabel}
					<span
						class="newspaper-source__date"
						data-text-anim-slot="source"
						data-supers-readable-id={`surface:newspaper:${content.sourceUrl?.trim() ? 'source-url' : 'source'}`}
						data-supers-text-role="surface-label"
						style:font-size={`${layout.width * metadataSizeRatio}px`}>{sourceLabel}</span
					>
				{/key}
			{/if}
		</footer>
	{/if}
</article>

<style>
	/*
	 * Immune document body (partial substrate immunity, ADR-0039 §2): the
	 * sheet colour and body ink are the intrinsic newsprint constants
	 * (`newsprint-substrate.ts`), injected as `style:` attributes on the
	 * article — never Pack vars. The former Pack FORM dress on the card
	 * (`newspaper.border` / `.radius` / `.tracking` / `.case` / `.weight`) is
	 * retired for the same reason: a bezeled, tracked-out "newspaper" is not a
	 * newspaper. The Pack's remaining claims on this Surface are the kicker
	 * chip (`--accent` / `--kicker-ink`, filtered through the Identity Spec's
	 * claimable slots) and the depth rig the edge pass synthesizes.
	 */
	.newspaper-source {
		box-sizing: border-box;
		display: grid;
		grid-template-rows: auto 1fr auto;
		gap: 0.6em;
		font-family: 'Old Standard TT', 'Times New Roman', Times, serif;
		overflow: hidden;
		position: relative;
		transform-origin: center;
		will-change: top, transform;
	}

	/*
	 * Title-only density (e.g. the `title-card-newspaper` preset): the
	 * header is the only child — center it vertically in the card so the
	 * headline floats balanced rather than top-aligned with empty space
	 * beneath. Default density keeps the masthead-style top-aligned grid.
	 */
	.newspaper-source[data-density='title-only'] {
		display: flex;
		flex-direction: column;
		justify-content: center;
	}

	/* Opt out of Graffiti's @layer base fluid-typography; this surface
	   sizes everything from inline JS-driven font-size values so the type
	   scale tracks the card's actual canvas-pixel dimensions. The
	   selectors only cover elements this CanvasSource actually renders
	   (h2 + span); the paper/plain Surfaces cover their own. */
	.newspaper-source h2 {
		font-size: inherit;
	}
	.newspaper-source span {
		font-size: inherit;
		line-height: inherit;
	}

	header {
		display: grid;
		gap: 0.6em;
		justify-items: start;
	}

	/*
	 * Body column. aesthetic.md § Newspaper clipping calls for justified
	 * condensed serif in a narrow column (~28–36 chars per line). Width is
	 * capped so the measure (G8) lands in band; line-height 1.32 sits inside
	 * G4-density's 1.28–1.42 serif band.
	 */
	section {
		align-content: start;
		column-count: 1;
		display: grid;
		flex: 1 1 auto;
		gap: 0.7em;
		hyphens: auto;
		line-height: 1.32;
		max-inline-size: 22ch;
		min-block-size: 0;
		overflow: hidden;
		text-align: justify;
	}

	section p {
		margin: 0;
	}

	[data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	.newspaper-source__kicker {
		/* The kicker chip is claimable channel chrome (ADR-0039 §2): plate rides
		   the Pack's `newspaper.accent` → core accent chain; chip ink rides
		   `newspaper.kicker-ink`, falling to the card's intrinsic newsprint ink
		   (currentColor) for a Pack silent on the slot. */
		background-color: var(--accent);
		color: var(--kicker-ink, currentColor);
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-weight: 700;
		letter-spacing: 0.14em;
		line-height: 1;
		padding: 0.5em 0.75em;
		text-transform: uppercase;
	}

	/*
	 * Heavy display serif. Old Standard / Playfair Display / Roboto Slab
	 * give the channel's newspaper-headline read; falling back through the
	 * platform serif chain preserves the shape claim when web fonts aren't
	 * loaded. Ink-wicking / paper-fiber texture is produced by the
	 * newspaper Surface's TypeGPU shaderPass, not CSS / SVG.
	 */
	h2 {
		font-family: 'Playfair Display', 'Old Standard TT', 'Roboto Slab', serif;
		font-weight: 900;
		line-height: 1.02;
		margin: 0;
		text-wrap: balance;
	}

	footer {
		align-items: end;
		/* The footer rule prints in the card's own ink — immune document body,
		   inherited from the article's intrinsic newsprint colour. */
		border-block-start: 0.15em solid currentColor;
		display: flex;
		flex-wrap: wrap;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		gap: 1.5em;
		justify-content: space-between;
		letter-spacing: 0.1em;
		padding-block-start: 0.7em;
		text-transform: uppercase;
	}

	.newspaper-source__byline {
		font-weight: 700;
	}

	.newspaper-source__date {
		font-weight: 500;
		opacity: 0.82;
	}
</style>
