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
	const bodyFontPx = $derived(width * 0.046);
	const nameFontPx = $derived(width * 0.03);
	const metaFontPx = $derived(width * 0.027);
	const avatarPx = $derived(width * 0.1);
	const iconPx = $derived(width * 0.034);
	const badgePx = $derived(nameFontPx * 1.05);
</script>

<!-- X status (Dim theme). The only opaque element; the frame around it stays transparent. -->
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
		<div class="x-meta" style:font-size={`${metaFontPx}px`}>
			{timestamp}<span class="x-dot">·</span><span class="x-views">1.2M</span> Views
		</div>
	{/if}

	<div class="x-rule"></div>

	<footer class="x-actions" aria-hidden="true">
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

<style>
	/*
	 * EXACT X (Twitter) status in dark "Dim" theme. The panel is the only opaque
	 * element; the browser frame around it (CanvasSource) stays transparent.
	 * X Dim palette: bg #15202b · text #f7f9f9 · secondary #8b98a5 · border
	 * #38444d · accent #1d9bf0 · icons #71767b.
	 */
	.x-panel {
		--x-bg: #15202b;
		--x-text: #f7f9f9;
		--x-meta: #8b98a5;
		--x-border: #38444d;
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
		background-color: #2f3b47;
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
	.x-dot {
		margin: 0 0.35em;
	}
	.x-views {
		color: var(--x-text);
		font-weight: 700;
	}

	.x-rule {
		background-color: var(--x-border);
		block-size: 1px;
		inline-size: 100%;
	}

	.x-actions {
		align-items: center;
		display: flex;
		justify-content: space-between;
		padding-inline: 0.2em;
	}
	.x-actions svg {
		display: block;
	}
</style>
