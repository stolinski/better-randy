<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — author/source/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the panel's type + controls scale from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	const displayName = $derived((content.author ?? '').trim());
	const handle = $derived((content.source ?? '').trim());
	const timestamp = $derived((content.dateLabel ?? '').trim());
	const avatarUrl = $derived((content.avatarUrl ?? '').trim());

	// Type + control scale tracks the card's canvas-pixel width, mirroring X's
	// real proportions (status column ≈ 600 px: body 23 / name 15 / meta 15 /
	// avatar 48). Slightly enlarged for 4K-overlay legibility.
	const bodyFontPx = $derived(width * (width > 2200 ? 0.032 : 0.046));
	const nameFontPx = $derived(width * (width > 2200 ? 0.014 : 0.03));
	const metaFontPx = $derived(width * (width > 2200 ? 0.014 : 0.027));
	const avatarPx = $derived(width * 0.1);
	const badgePx = $derived(nameFontPx * 1.05);
</script>

<!-- X status (Lights Out theme). The only opaque element; the frame around it stays transparent. -->
<div class="x-panel" style:padding={`${width * 0.045}px`}>
	<header class="x-head" style:gap={`${width * 0.028}px`}>
		<span
			class="x-avatar"
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
		<span class="x-identity">
			<span class="x-nameline">
				{#if displayName}
					<span class="x-name" style:font-size={`${nameFontPx}px`}>{displayName}</span>
				{/if}
				<svg
					class="x-badge"
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
				<span class="x-handle" style:font-size={`${metaFontPx}px`}>{handle}</span>
			{/if}
		</span>
		<span class="x-more" style:font-size={`${nameFontPx}px`} aria-hidden="true">···</span>
	</header>

	<DocumentBody body={content.body} fontSize={bodyFontPx} />

	{#if timestamp}
		<div class="x-meta" style:font-size={`${metaFontPx}px`}>{timestamp}</div>
	{/if}
</div>

<style>
	/*
	 * Modern X (Twitter) status in dark "Lights Out" theme. The panel is the only
	 * opaque element; the browser frame around it (CanvasSource) stays transparent.
	 * X palette: bg #000 · text #e7e9ea · secondary/icons #71767b · border
	 * #2f3336 · accent #1d9bf0.
	 */
	.x-panel {
		--x-bg: #000;
		--x-text: #e7e9ea;
		--x-meta: #71767b;
		--x-border: #2f3336;
		background-color: var(--x-bg);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--x-text);
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		gap: 0.7em;
	}

	.x-head {
		align-items: start;
		display: flex;
	}
	.x-avatar {
		background-color: #16181c;
		border-radius: 50%;
		display: block;
		flex: 0 0 auto;
		overflow: hidden;
	}
	.x-avatar img,
	.x-avatar svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		object-fit: cover;
	}
	.x-identity {
		display: grid;
		gap: 0.05em;
		flex: 1 1 auto;
		min-inline-size: 0;
	}
	.x-nameline {
		align-items: center;
		display: flex;
		gap: 0.25em;
	}
	.x-name {
		font-weight: 800;
		line-height: 1.15;
	}
	.x-badge {
		flex: 0 0 auto;
	}
	.x-handle {
		color: var(--x-meta);
		line-height: 1.2;
	}
	.x-more {
		color: var(--x-meta);
		flex: 0 0 auto;
		font-weight: 700;
		letter-spacing: 0.05em;
	}

	.x-meta {
		color: var(--x-meta);
	}
</style>
