<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// A transparent-overlay panel: a browser window (dark) framing a single,
	// isolated X (Twitter) status — the "clean by construction" tweet, no nav /
	// sidebar / ads. Vertically centred; settles up from below as
	// `paperVisibility` climbs 0 → 1. Height is content-driven, so the card is
	// centred via CSS (top:50% + translateY) rather than a measured resting Y.
	// NO CSS filter/glow on the card — it pixelates the HTML-in-Canvas capture;
	// the emissive/screen optical look is a TypeGPU shaderPass (dex f0j654gu).
	const CARD_WIDTH_RATIO_H = 0.44;
	const CARD_WIDTH_RATIO_V = 0.86;
	const ENTER_TRAVEL_RATIO = 0.055;

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const isVertical = $derived(frame.height > frame.width);
	const content = $derived(engineState.surface.content);

	const layout = $derived.by(() => {
		const widthRatio = isVertical ? CARD_WIDTH_RATIO_V : CARD_WIDTH_RATIO_H;
		const width = frame.width * widthRatio;
		const x = Math.round((frame.width - width) / 2);
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const enterOffsetPx = Math.round((1 - visibility) * frame.height * ENTER_TRAVEL_RATIO);
		return { x, width, enterOffsetPx };
	});

	// Address-bar text: the URL being shown, protocol + www stripped.
	const addressLabel = $derived(
		(content.sourceUrl?.trim() ?? '').replace(/^https?:\/\//, '').replace(/^www\./, '')
	);

	const displayName = $derived((content.author ?? '').trim());
	const handle = $derived((content.source ?? '').trim());
	const timestamp = $derived((content.dateLabel ?? '').trim());
	const avatarUrl = $derived((content.avatarUrl ?? '').trim());

	const hasBody = $derived(
		Array.isArray(content.body) &&
			content.body.some((paragraph) =>
				paragraph.segments?.some((segment) => (segment.text ?? '').trim().length > 0)
			)
	);

	// Type + control scale tracks the card's canvas-pixel width, mirroring X's
	// real proportions (status column ≈ 600 px: body 23 / name 15 / meta 15 /
	// avatar 48). Slightly enlarged for 4K-overlay legibility.
	const bodyFontPx = $derived(layout.width * 0.046);
	const nameFontPx = $derived(layout.width * 0.03);
	const metaFontPx = $derived(layout.width * 0.027);
	const chromeFontPx = $derived(layout.width * 0.024);
	const avatarPx = $derived(layout.width * 0.1);
	const iconPx = $derived(layout.width * 0.034);
	const badgePx = $derived(nameFontPx * 1.05);
</script>

<article
	bind:this={element}
	class="web-document surface"
	data-site={engineState.surface.site ?? 'twitter'}
	style:inline-size={`${layout.width}px`}
	style:left={`${layout.x}px`}
	style:transform={`translateY(calc(-50% + ${layout.enterOffsetPx}px))`}
>
	<!-- Dark browser chrome (mac-style) with the x.com URL in the address bar. -->
	<div class="web-document__chrome" style:font-size={`${chromeFontPx}px`}>
		<span class="web-document__dots" aria-hidden="true">
			<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i
				style="background:#28c840"
			></i>
		</span>
		{#if addressLabel}
			<span class="web-document__address">{addressLabel}</span>
		{/if}
	</div>

	<!-- X status (Dim theme). -->
	<div class="web-document__panel" style:padding={`${layout.width * 0.045}px`}>
		<header class="web-document__head" style:gap={`${layout.width * 0.028}px`}>
			<span
				class="web-document__avatar"
				style:inline-size={`${avatarPx}px`}
				style:block-size={`${avatarPx}px`}
				aria-hidden="true"
			>
				{#if avatarUrl}
					<img src={avatarUrl} crossorigin="anonymous" alt="" />
				{:else}
					<svg viewBox="0 0 24 24" fill="#8b98a5"
						><circle cx="12" cy="8.5" r="3.6" /><path
							d="M4.5 20.5c0-3.8 3.4-5.8 7.5-5.8s7.5 2 7.5 5.8z"
						/></svg
					>
				{/if}
			</span>
			<span class="web-document__identity">
				<span class="web-document__nameline">
					{#if displayName}
						<span class="web-document__name" style:font-size={`${nameFontPx}px`}>{displayName}</span>
					{/if}
					<svg
						class="web-document__badge"
						style:inline-size={`${badgePx}px`}
						style:block-size={`${badgePx}px`}
						viewBox="0 0 24 24"
						fill="#1d9bf0"
						aria-hidden="true"
						><path
							d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"
						/></svg
					>
				</span>
				{#if handle}
					<span class="web-document__handle" style:font-size={`${metaFontPx}px`}>{handle}</span>
				{/if}
			</span>
			<span class="web-document__more" style:font-size={`${nameFontPx}px`} aria-hidden="true">···</span>
		</header>

		{#if hasBody}
			{#key annotationBodyPlainText(content.body)}
				<section
					class="web-document__body"
					data-text-anim-slot="body"
					style:font-size={`${bodyFontPx}px`}
				>
					{#each content.body as block, blockIndex (blockIndex)}
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
		{/if}

		{#if timestamp}
			<div class="web-document__meta" style:font-size={`${metaFontPx}px`}>
				{timestamp}<span class="web-document__dot">·</span><span class="web-document__views"
					>1.2M</span
				> Views
			</div>
		{/if}

		<div class="web-document__rule"></div>

		<footer class="web-document__actions" aria-hidden="true">
			<!-- reply -->
			<svg style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} viewBox="0 0 24 24"
				><path
					fill="#71767b"
					d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"
				/></svg
			>
			<!-- repost -->
			<svg style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} viewBox="0 0 24 24"
				><path
					fill="#71767b"
					d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"
				/></svg
			>
			<!-- like -->
			<svg style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} viewBox="0 0 24 24"
				><path
					fill="#71767b"
					d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.871-2.34 6.054-4.64 7.128-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
				/></svg
			>
			<!-- views -->
			<svg style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} viewBox="0 0 24 24"
				><path
					fill="#71767b"
					d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"
				/></svg
			>
			<!-- bookmark -->
			<svg style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} viewBox="0 0 24 24"
				><path
					fill="#71767b"
					d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"
				/></svg
			>
			<!-- share -->
			<svg style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} viewBox="0 0 24 24"
				><path
					fill="#71767b"
					d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zm9 13.41v3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 22 3 20.88 3 19.5V16h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 16h2z"
				/></svg
			>
		</footer>
	</div>
</article>

<style>
	/*
	 * web-document Surface — an EXACT X (Twitter) status in dark "Dim" theme,
	 * framed by a dark browser window, on a transparent overlay frame. The panel
	 * is the only opaque element; the frame around it stays transparent. No
	 * Syntax collage chrome and NO CSS filter (it pixelates the capture). The
	 * emissive/screen optical look is a TypeGPU shaderPass (dex f0j654gu).
	 *
	 * X Dim palette: bg #15202b · text #f7f9f9 · secondary #8b98a5 · border
	 * #38444d · accent #1d9bf0 · icons #71767b.
	 */
	.web-document {
		--x-bg: #15202b;
		--x-text: #f7f9f9;
		--x-meta: #8b98a5;
		--x-border: #38444d;
		box-sizing: border-box;
		color: var(--x-text);
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		grid-template-rows: auto auto;
		position: absolute;
		top: 50%;
		transform-origin: center;
	}

	.web-document__chrome {
		align-items: center;
		background-color: #2c2c2e;
		border-start-start-radius: 0.85em;
		border-start-end-radius: 0.85em;
		display: flex;
		gap: 1em;
		padding: 0.75em 1.1em;
	}
	.web-document__dots {
		display: inline-flex;
		gap: 0.55em;
		flex: 0 0 auto;
	}
	.web-document__dots i {
		block-size: 0.8em;
		border-radius: 50%;
		display: block;
		inline-size: 0.8em;
	}
	.web-document__address {
		background-color: #1c1c1e;
		border-radius: 0.7em;
		color: #8b98a5;
		flex: 1 1 auto;
		overflow: hidden;
		padding: 0.4em 1em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.web-document__panel {
		background-color: var(--x-bg);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		display: grid;
		gap: 0.7em;
	}

	.web-document__head {
		align-items: start;
		display: flex;
	}
	.web-document__avatar {
		background-color: #2f3b47;
		border-radius: 50%;
		display: block;
		flex: 0 0 auto;
		overflow: hidden;
	}
	.web-document__avatar img,
	.web-document__avatar svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		object-fit: cover;
	}
	.web-document__identity {
		display: grid;
		gap: 0.05em;
		flex: 1 1 auto;
		min-inline-size: 0;
	}
	.web-document__nameline {
		align-items: center;
		display: flex;
		gap: 0.25em;
	}
	.web-document__name {
		font-weight: 800;
		line-height: 1.15;
	}
	.web-document__badge {
		flex: 0 0 auto;
	}
	.web-document__handle {
		color: var(--x-meta);
		line-height: 1.2;
	}
	.web-document__more {
		color: var(--x-meta);
		flex: 0 0 auto;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.web-document__body {
		line-height: 1.35;
		margin: 0;
	}
	/*
	 * Opt out of Graffiti's @layer base fluid typography (same pattern as the
	 * newspaper Surface): the body sizes from the inline JS-driven font-size on
	 * the <section>, so its <p> and mark spans must inherit it.
	 */
	.web-document__body p,
	.web-document__body [data-annotation-mark] {
		font-size: inherit;
		line-height: inherit;
	}
	.web-document__body p {
		margin: 0;
	}
	.web-document__body [data-annotation-mark] {
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}

	.web-document__meta {
		color: var(--x-meta);
	}
	.web-document__dot {
		margin: 0 0.35em;
	}
	.web-document__views {
		color: var(--x-text);
		font-weight: 700;
	}

	.web-document__rule {
		background-color: var(--x-border);
		block-size: 1px;
		inline-size: 100%;
	}

	.web-document__actions {
		align-items: center;
		display: flex;
		justify-content: space-between;
		padding-inline: 0.2em;
	}
	.web-document__actions svg {
		display: block;
	}
</style>
