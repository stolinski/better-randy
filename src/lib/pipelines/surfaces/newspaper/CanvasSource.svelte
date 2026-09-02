<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { clampNumber } from '$lib/utils/math';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import { hashStringToUnitInterval, seededRange } from '$lib/utils/seeded';
	import { NEWSPRINT_INK_HEX, NEWSPRINT_PAPER_HEX } from './newsprint-substrate';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// ----- Page geometry (identity § page-crop, ADR-0056) -----
	//
	// The frame is a tight crop INTO a broadsheet page: the sheet overshoots
	// every frame edge by these fractions of the frame, so no page edge exists
	// inside the canvas under the seeded tilt and the full camera push. The
	// right and bottom overshoots are the largest — that is where the headline's
	// measure, the folio's masthead, and the columns run off the frame.
	const PAGE_OVERSHOOT_LEFT = 0.05;
	const PAGE_OVERSHOOT_RIGHT = 0.09;
	const PAGE_OVERSHOOT_TOP = 0.05;
	const PAGE_OVERSHOOT_BOTTOM = 0.3;
	// Where the printed content starts inside the FRAME: the page's own margin
	// as seen through the crop. Left is a fraction of frame width; top is a
	// fraction of the long side so both transports open on the same blank
	// paper margin above the folio.
	const CONTENT_INSET_LEFT = 0.045;
	const CONTENT_INSET_TOP = 0.055;
	// The page's own right margin (beyond the frame) and the visible measure
	// the headline and folio are laid out within, so they stay readable.
	const PAGE_MARGIN_RIGHT = 0.03;
	const CONTENT_INSET_RIGHT = 0.02;

	// ----- Camera (identity § surface-rotation, § camera-push) -----
	const TILT_MIN_DEG = 0.3;
	const TILT_MAX_DEG = 0.8;
	// Enter: the camera lands from slightly closer with a small drop.
	const CAMERA_LANDING_SCALE = 0.04;
	const CAMERA_LANDING_DROP = 0.012;
	// Whole piece: a continuous push with a hint of leftward drift.
	const CAMERA_PUSH_SCALE = 0.02;
	const CAMERA_PUSH_DRIFT = 0.004;
	// Exit: the push accelerates out.
	const CAMERA_EXIT_SCALE = 0.035;

	// ----- Type (long-side units, so both transports print the same page) -----
	//
	// Mean advance of Inter 700 at −0.035em tracking, used to size the
	// headline against the visible measure: one line when it fits at a
	// display scale (≥ HEADLINE_SINGLE_LINE_RATIO), otherwise two balanced
	// lines, clamped so the headline stays roughly four body cap-heights tall
	// — the plates' headline-to-body ratio, not a poster.
	const GROTESQUE_ADVANCE_EM = 0.56;
	const HEADLINE_LINE_TARGET = 2;
	const HEADLINE_SINGLE_LINE_RATIO = 0.07;
	const HEADLINE_MIN_RATIO = 0.055;
	const HEADLINE_MAX_RATIO = 0.068;
	const FOLIO_RATIO = 0.019;
	const FOLIO_RULE_RATIO = 0.0034;
	const KICKER_RATIO = 0.016;
	const BYLINE_RATIO = 0.019;
	const AFFILIATION_RATIO = 0.0165;
	const BODY_RATIO = 0.021;
	// Column measure ≈ 30–36 characters of the body serif.
	const COLUMN_WIDTH_RATIO = 0.32;
	const COLUMN_GAP_RATIO = 0.02;
	const COLUMN_RULE_RATIO = 0.0008;

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const longSide = $derived(Math.max(frame.width, frame.height));
	const content = $derived(engineState.surface.content);

	// Seed the per-instance tilt from the headline + folio so two newspaper
	// pages in one session don't share an angle (Q6 / G9, deterministic at
	// render time, no Math.random). Centre the range on zero by flipping half
	// the time, so pages don't all tilt the same way.
	const seed = $derived(
		hashStringToUnitInterval(`${content.title ?? ''}|${content.dateLabel ?? ''}`)
	);
	const tiltDeg = $derived((seed < 0.5 ? -1 : 1) * seededRange(seed, TILT_MIN_DEG, TILT_MAX_DEG));

	const page = $derived.by(() => {
		const x = -frame.width * PAGE_OVERSHOOT_LEFT;
		const y = -frame.height * PAGE_OVERSHOOT_TOP;
		const width = frame.width * (1 + PAGE_OVERSHOOT_LEFT + PAGE_OVERSHOOT_RIGHT);
		const height = frame.height * (1 + PAGE_OVERSHOOT_TOP + PAGE_OVERSHOOT_BOTTOM);
		const paddingLeft = -x + frame.width * CONTENT_INSET_LEFT;
		const paddingRight = frame.width * PAGE_MARGIN_RIGHT;
		return {
			x,
			y,
			width,
			height,
			paddingTop: -y + longSide * CONTENT_INSET_TOP,
			paddingLeft,
			paddingRight,
			contentWidth: width - paddingLeft - paddingRight,
			// The measure the headline and folio stay inside so they read whole.
			visibleMeasure: frame.width * (1 - CONTENT_INSET_LEFT - CONTENT_INSET_RIGHT),
			// Scale and tilt about the FRAME centre, not the page centre, so the
			// push reads as a camera move over the visible crop.
			originX: frame.width / 2 - x,
			originY: frame.height / 2 - y
		};
	});

	const titleChars = $derived(Math.max(1, (content.title ?? '').trim().length));
	const titleFontSize = $derived.by(() => {
		const singleLineSize = page.visibleMeasure / (titleChars * GROTESQUE_ADVANCE_EM);
		if (singleLineSize >= longSide * HEADLINE_SINGLE_LINE_RATIO) {
			return Math.min(singleLineSize, longSide * HEADLINE_MAX_RATIO);
		}
		return clampNumber(
			singleLineSize * HEADLINE_LINE_TARGET,
			longSide * HEADLINE_MIN_RATIO,
			longSide * HEADLINE_MAX_RATIO
		);
	});
	const columnCount = $derived(
		Math.max(2, Math.round(page.contentWidth / (longSide * COLUMN_WIDTH_RATIO)))
	);

	// Frame-deterministic camera: every term is a pure function of the
	// timeline's values for this frame. `paperVisibility` is the enter/exit
	// sugar (0→1, hold, 1→0); which window it is in comes from the authored
	// exit start against the global progress.
	const camera = $derived.by(() => {
		const visibility = clampNumber(animState.paperVisibility, 0, 1);
		const progress = clampNumber(animState.globalProgress, 0, 1);
		const isExiting = progress >= (engineState.surface.exit?.start ?? 1);
		const landing = isExiting ? 0 : 1 - visibility;
		const leaving = isExiting ? 1 - visibility : 0;
		const scale =
			(1 + CAMERA_LANDING_SCALE * landing + CAMERA_EXIT_SCALE * leaving) *
			(1 + CAMERA_PUSH_SCALE * progress);
		return {
			scale,
			x: -frame.width * CAMERA_PUSH_DRIFT * progress,
			y: frame.height * CAMERA_LANDING_DROP * landing
		};
	});

	const hasKicker = $derived((content.kicker ?? '').trim().length > 0);
	const hasAuthor = $derived((content.author ?? '').trim().length > 0);
	const hasAffiliation = $derived((content.affiliation ?? '').trim().length > 0);
	const hasDate = $derived((content.dateLabel ?? '').trim().length > 0);
	const hasSource = $derived((content.source ?? '').trim().length > 0);
	const hasBody = $derived(
		Array.isArray(content.body) &&
			content.body.some((paragraph) =>
				paragraph.segments?.some((segment) => (segment.text ?? '').trim().length > 0)
			)
	);
</script>

<article
	bind:this={element}
	class="newspaper-page surface"
	lang="en"
	style:block-size={`${page.height}px`}
	style:inline-size={`${page.width}px`}
	style:left={`${page.x}px`}
	style:top={`${page.y}px`}
	style:padding={`${page.paddingTop}px ${page.paddingRight}px 0 ${page.paddingLeft}px`}
	style:transform-origin={`${page.originX}px ${page.originY}px`}
	style:transform={`translate(${camera.x}px, ${camera.y}px) rotate(${tiltDeg}deg) scale(${camera.scale})`}
	style:background-color={NEWSPRINT_PAPER_HEX}
	style:color={NEWSPRINT_INK_HEX}
	style:--visible-measure={`${page.visibleMeasure}px`}
	style:--column-count={columnCount}
	style:--column-gap={`${longSide * COLUMN_GAP_RATIO}px`}
	style:--column-rule-width={`${Math.max(2, longSide * COLUMN_RULE_RATIO)}px`}
>
	{#if hasDate || hasSource}
		<header
			style:font-size={`${longSide * FOLIO_RATIO}px`}
			style:border-block-end-width={`${longSide * FOLIO_RULE_RATIO}px`}
		>
			{#if hasDate}
				{#key content.dateLabel}
					<span
						data-text-anim-slot="dateLabel"
						data-gfx-readable-id="surface:newspaper:date-label"
						data-gfx-text-role="surface-label"
					>
						{content.dateLabel}
					</span>
				{/key}
			{/if}
			{#if hasSource}
				{#key content.source}
					<span
						class="newspaper-page__source"
						data-text-anim-slot="source"
						data-gfx-readable-id="surface:newspaper:source"
						data-gfx-text-role="surface-label"
					>
						{content.source}
					</span>
				{/key}
			{/if}
		</header>
	{/if}

	{#if hasKicker}
		{#key content.kicker}
			<span
				class="newspaper-page__kicker"
				data-text-anim-slot="kicker"
				data-gfx-readable-id="surface:newspaper:kicker"
				data-gfx-text-role="surface-label"
				style:font-size={`${longSide * KICKER_RATIO}px`}
			>
				{content.kicker}
			</span>
		{/key}
	{/if}

	{#if content.title}
		{#key content.title}
			<h2
				data-text-anim-slot="title"
				data-gfx-readable-id="surface:newspaper:title"
				data-gfx-text-role="surface-title"
				style:font-size={`${titleFontSize}px`}
			>
				{content.title}
			</h2>
		{/key}
	{/if}

	{#if hasAuthor || hasAffiliation}
		<p class="newspaper-page__byline">
			{#if hasAuthor}
				{#key content.author}
					<span
						class="newspaper-page__author"
						data-text-anim-slot="author"
						data-gfx-readable-id="surface:newspaper:author"
						data-gfx-text-role="surface-label"
						style:font-size={`${longSide * BYLINE_RATIO}px`}
					>
						{content.author}
					</span>
				{/key}
			{/if}
			{#if hasAffiliation}
				{#key content.affiliation}
					<span
						class="newspaper-page__affiliation"
						data-text-anim-slot="affiliation"
						data-gfx-readable-id="surface:newspaper:affiliation"
						data-gfx-text-role="surface-label"
						style:font-size={`${longSide * AFFILIATION_RATIO}px`}
					>
						{content.affiliation}
					</span>
				{/key}
			{/if}
		</p>
	{/if}

	{#if hasBody}
		{#key annotationBodyPlainText(content.body)}
			<section data-text-anim-slot="body" style:font-size={`${longSide * BODY_RATIO}px`}>
				{#each content.body as block, blockIndex (blockIndex)}
					{#if block.type === 'paragraph'}
						<p
							data-gfx-readable-id={`surface:newspaper:body:${blockIndex}`}
							data-gfx-text-role="surface-body"
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
</article>

<style>
	/*
	 * Immune document (ADR-0056): sheet colour, ink, and every typeface are
	 * the intrinsic newsprint constants — never Pack vars. The faces are
	 * substrate physics: the grotesque a 1990s broadsheet set its headlines,
	 * folio, and bylines in, and the Times-cut serif of its columns. Ink
	 * bleed, halftone, and the camera optics are produced by the Surface's
	 * TypeGPU shaderPass, not CSS.
	 */
	.newspaper-page {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		font-family: 'Old Standard TT', 'Times New Roman', Times, serif;
		overflow: hidden;
		position: absolute;
		will-change: transform;
	}

	/* Opt out of Graffiti's @layer base fluid-typography; this surface sizes
	   everything from inline JS-driven font-size values so the type scale
	   tracks the frame's actual canvas-pixel dimensions. */
	.newspaper-page h2,
	.newspaper-page p,
	.newspaper-page span {
		font-size: inherit;
		line-height: inherit;
	}

	/*
	 * Folio line: date at the left, masthead at the right, a heavy rule
	 * beneath. The rule spans the whole page (it runs off the frame); the
	 * labels are laid out inside the visible measure so both read whole.
	 */
	header {
		align-items: baseline;
		border-block-end-style: solid;
		border-block-end-color: currentColor;
		display: flex;
		font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-weight: 700;
		justify-content: space-between;
		letter-spacing: -0.01em;
		line-height: 1;
		margin-block-end: 0.7em;
		max-inline-size: 100%;
		padding-block-end: 0.34em;
		padding-inline-end: calc(100% - var(--visible-measure));
	}

	.newspaper-page__source {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.newspaper-page__kicker {
		font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-weight: 700;
		letter-spacing: 0.08em;
		line-height: 1;
		margin-block-end: 0.55em;
		text-transform: uppercase;
	}

	/*
	 * The headline: a tight bold grotesque, sized to fill the visible measure
	 * on two lines. `max-inline-size` keeps every line inside the frame so the
	 * headline reads whole; the columns beneath still use the full page width
	 * and run off the crop.
	 */
	h2 {
		font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-weight: 700;
		letter-spacing: -0.035em;
		line-height: 0.9;
		margin: 0 0 0.22em;
		max-inline-size: var(--visible-measure);
		text-wrap: balance;
	}

	.newspaper-page__byline {
		display: grid;
		font-family: 'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif;
		gap: 0.14em;
		justify-items: start;
		line-height: 1.1;
		margin: 0 0 0.8em;
	}

	.newspaper-page__author {
		font-weight: 700;
	}

	.newspaper-page__affiliation {
		font-weight: 400;
		opacity: 0.86;
	}

	/*
	 * Body columns: justified Times-cut serif in a 30–36 character measure,
	 * paragraph indents with no paragraph spacing, thin column rules. The
	 * multicol container fills the rest of the page (`column-fill: auto`) so
	 * the copy flows column by column and runs off the bottom of the crop.
	 */
	section {
		column-count: var(--column-count);
		column-fill: auto;
		column-gap: var(--column-gap);
		column-rule: var(--column-rule-width) solid color-mix(in srgb, currentColor 30%, transparent);
		flex: 1 1 auto;
		hyphens: auto;
		line-height: 1.2;
		min-block-size: 0;
		overflow: hidden;
		text-align: justify;
	}

	section p {
		margin: 0;
		text-indent: 1.4em;
	}

	[data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
</style>
