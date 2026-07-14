<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { ENGINE_FONT_FAMILIES } from '$lib/platform/engine-schema';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolveTypographyColors } from '$lib/platform/packs/resolve';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import { getLayoutSafeArea } from '$lib/utils/safe-area';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// Aspect ratio is orientation-aware. On vertical (9:16) the canonical
	// "research paper" portrait A4 (√2) fits naturally. On horizontal (16:9)
	// strict A4 produces a postage-stamp card; a near-square "notebook page"
	// aspect lets the card fill the frame height while reading wide enough
	// for body measure (G4-density) and substantial presence (T1).
	const PAPER_ASPECT_RATIO_HORIZONTAL = 1.1;
	const PAPER_ASPECT_RATIO_VERTICAL = Math.SQRT2;
	const HEIGHT_RATIO = 0.9; // card spans ~90% of frame height

	const fontFamily = $derived(ENGINE_FONT_FAMILIES[engineState.typography.fontFamily]);
	// Paper/ink resolve override → Pack core (ADR-0038): an authored
	// typography colour wins; absent, the active Pack's fill/ink-treatment
	// paints the sheet — so a pack switch re-dresses the paper live.
	const typographyColors = $derived(
		resolveTypographyColors(getPack(packState.slug), engineState.typography)
	);
	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));

	const layout = $derived.by(() => {
		const portrait = frame.height > frame.width;
		const orientation = portrait ? 'vertical' as const : 'horizontal' as const;
		const safeArea = getLayoutSafeArea(orientation);
		const aspect = portrait ? PAPER_ASPECT_RATIO_VERTICAL : PAPER_ASPECT_RATIO_HORIZONTAL;
		const height = frame.height * HEIGHT_RATIO;
		const width = height / aspect;
		const x = frame.width * 0.5 - width / 2;
		// Anchor the article at its settled vertical position; the enter / exit
		// motion is expressed as a translate offset (see translateY below) so
		// the property animated is `transform`, a compositor-only property.
		// Animating `top` would promote the article into its own paint layer
		// in Chrome, and that layer-promotion excludes the element from the
		// WICG `copyElementImageToTexture` capture path (ADR-0017).
		const y = frame.height * safeArea.top;
		const startTranslate = frame.height + height * 0.08 - y;
		const endTranslate = 0;
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const translateY = startTranslate + (endTranslate - startTranslate) * visibility;
		// Small X arc during entry — card drifts leftward while rising from below,
		// then tracks to its centred rest position. Composite diagonal path satisfies
		// G8c (arc / secondary action required; pure Y-slide does not).
		const translateX = (1 - visibility) * (frame.width * -0.003);

		return { x, y, width, height, translateX, translateY };
	});

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

	const hasHeader = $derived(
		Boolean(
			engineState.surface.content.title ||
				engineState.surface.content.sourceUrl ||
				engineState.surface.content.author ||
				engineState.surface.content.affiliation
		)
	);
	const hasFooter = $derived(
		Boolean(engineState.surface.content.source || engineState.surface.content.dateLabel)
	);

	// Soft photographic drop shadow lifting the sheet off the frame — the
	// "paper on a desk" read, not a flat Figma artboard. A research paper is an
	// underlying surface, so it carries the photographic multi-zone shadow
	// (contact + mid + soft ambient), not the hard-offset collage shadow the
	// Pack reserves for torn cards. Warm-dark tint (matches a paper cast shadow)
	// and scaled to frame width so the lift holds on 4K horizontal and vertical.
	const cardShadow = $derived.by(() => {
		const s = frame.width / 3840;
		return [
			`0 ${2 * s}px ${5 * s}px rgba(20, 18, 14, 0.18)`,
			`0 ${9 * s}px ${22 * s}px rgba(20, 18, 14, 0.2)`,
			`0 ${26 * s}px ${52 * s}px rgba(20, 18, 14, 0.18)`
		].join(', ');
	});
</script>

<article
	bind:this={element}
	class="paper-source surface"
	style:background-color={typographyColors.paperColor}
		style:box-shadow={cardShadow}
	style:block-size={`${layout.height}px`}
	style:color={typographyColors.inkColor}
	style:font-family={fontFamily.stack}
	style:inline-size={`${layout.width}px`}
	style:left={`${layout.x}px`}
	style:padding-block={`${layout.width * 0.05}px`}
	style:padding-inline={`${layout.width * 0.07}px`}
	style:top={`${layout.y}px`}
	style:transform={`translate3d(${layout.translateX}px, ${layout.translateY}px, 0)`}
>
	{#if hasHeader}
		<header style:font-size={`${layout.width * 0.024}px`}>
			{#if engineState.surface.content.sourceUrl}
				{#key sourceLabel}
					<p class="paper-source__kicker" data-text-anim-slot="sourceUrl">{sourceLabel}</p>
				{/key}
			{/if}
			{#if engineState.surface.content.title}
				{#key engineState.surface.content.title}
					<h2 data-text-anim-slot="title" style:font-size={`${layout.width * 0.06}px`}>{engineState.surface.content.title}</h2>
				{/key}
			{/if}
			{#if engineState.surface.content.author}
				{#key `${engineState.surface.content.author}|${engineState.surface.content.affiliation ?? ''}`}
					<p class="paper-source__byline" data-text-anim-slot="author" style:font-size={`${layout.width * 0.026}px`}>
						{engineState.surface.content.author}{#if engineState.surface.content.affiliation}<span class="paper-source__affiliation"> · {engineState.surface.content.affiliation}</span>{/if}
					</p>
				{/key}
			{/if}
		</header>
	{/if}

	{#if engineState.surface.content.bodyLabel}
		<p class="paper-source__body-label" style:font-size={`${layout.width * 0.024}px`}>
			{engineState.surface.content.bodyLabel}
		</p>
	{/if}

	{#key annotationBodyPlainText(engineState.surface.content.body)}
		<section data-text-anim-slot="body" style:font-size={`${layout.width * 0.028}px`}>
			{#each engineState.surface.content.body as block, blockIndex (blockIndex)}
				{#if block.type === 'paragraph'}
					<p>
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

	{#if hasFooter}
		<footer style:font-size={`${layout.width * 0.024}px`}>
			{#if engineState.surface.content.source}
				{#key engineState.surface.content.source}
					<cite data-text-anim-slot="source">{engineState.surface.content.source}</cite>
				{/key}
			{/if}
			{#if engineState.surface.content.dateLabel}
				{#key engineState.surface.content.dateLabel}
					<span data-text-anim-slot="dateLabel">{engineState.surface.content.dateLabel}</span>
				{/key}
			{/if}
		</footer>
	{/if}
</article>

<style>
	.paper-source {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 1em;
		overflow: hidden;
		transform-origin: top left;
	}

	/*
	 * Opt the rendered paper out of Graffiti's @layer base fluid-typography.
	 * Graffiti sets `font-size: clamp(...)` AND `line-height: var(--lh)` on
	 * h1-h6/p/li directly. Headings (h2) keep their own line-height (see h2
	 * rule below), so we only inherit font-size on them. Body p/li get both
	 * inherited so they pick up the section's pipeline-set typography.
	 */
	.paper-source h2 {
		font-size: inherit;
	}
	.paper-source :is(p, span, cite) {
		font-size: inherit;
		line-height: inherit;
	}

	header {
		border-block-end: 0.08em solid currentColor;
		padding-block-end: 0.8em;
		display: flex;
		flex-direction: column;
		gap: 0.4em;
	}

	header p,
	h2,
	section p {
		margin: 0;
	}

	.paper-source__kicker {
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.7;
	}

	h2 {
		line-height: 1.05;
		font-weight: 700;
	}

	.paper-source__byline {
		font-style: italic;
		opacity: 0.78;
	}

	.paper-source__affiliation {
		font-style: normal;
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.85em;
		opacity: 0.62;
	}

	.paper-source__body-label {
		font-family: ui-monospace, monospace;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 700;
		margin: 0.2em 0 0;
		opacity: 0.78;
	}

	section {
		display: grid;
		gap: 0.7em;
		align-content: start;
		flex: 1 1 auto;
		min-block-size: 0;
		overflow: hidden;
		line-height: 1.36;
		text-align: justify;
		hyphens: auto;
	}

	[data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	footer {
		border-block-start: 0.12em solid currentColor;
		display: flex;
		flex-wrap: wrap;
		font-family: ui-monospace, monospace;
		gap: 1.2em;
		padding-block-start: 0.7em;
		text-transform: uppercase;
	}

	footer cite {
		font-style: normal;
	}
</style>
