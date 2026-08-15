<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — title/author/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the comment's type scales from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// Content slots for the youtube layout: `title` = the video headline (context
	// line), `author` = the commenter (@handle / name), `dateLabel` = age, `body`
	// = the comment carrying the hero `[highlight]`.
	const videoTitle = $derived((content.title ?? '').trim());
	const commenter = $derived((content.author ?? '').trim());
	const age = $derived((content.dateLabel ?? '').trim());

	const videoFontPx = $derived(width * 0.032);
	const metaFontPx = $derived(width * 0.026);
	const bodyFontPx = $derived(width * 0.032);
	const actionFontPx = $derived(width * 0.024);
	const actionIconPx = $derived(width * 0.03);
	const avatarPx = $derived(width * 0.07);
</script>

<!-- YouTube comment (dark). Video headline as context · avatar + comment. -->
<div class="yt-panel" style:padding={`${width * 0.032}px`} style:gap={`${width * 0.024}px`}>
	{#if videoTitle}
		<h2
			class="yt-video"
			data-supers-readable-id="surface:web-document:title"
			data-supers-readable-text={videoTitle}
			data-supers-text-role="surface-title"
			style:font-size={`${videoFontPx}px`}
		>
			{videoTitle}
		</h2>
	{/if}

	<div class="yt-comment" style:gap={`${width * 0.018}px`}>
		<span
			class="yt-avatar"
			style:inline-size={`${avatarPx}px`}
			style:block-size={`${avatarPx}px`}
			aria-hidden="true"
			><svg viewBox="0 0 24 24" fill="#717171"
				><circle cx="12" cy="8.5" r="3.6" /><path
					d="M4.5 20.5c0-3.8 3.4-5.8 7.5-5.8s7.5 2 7.5 5.8z"
				/></svg
			></span
		>
		<div class="yt-content" style:gap={`${width * 0.012}px`}>
			<div class="yt-meta" style:font-size={`${metaFontPx}px`} style:gap={`${width * 0.01}px`}>
				{#if commenter}<span
						class="yt-user"
						data-supers-readable-id="surface:web-document:author"
						data-supers-readable-text={commenter}
						data-supers-text-role="found-document-metadata">{commenter}</span
					>{/if}
				{#if age}<span
						class="yt-age"
						data-supers-readable-id="surface:web-document:date-label"
						data-supers-readable-text={age}
						data-supers-text-role="found-document-metadata">{age}</span
					>{/if}
			</div>

			<DocumentBody
				body={content.body}
				fontSize={bodyFontPx}
				readablePrefix="surface:web-document:body"
			/>

			<div
				class="yt-actions"
				style:font-size={`${actionFontPx}px`}
				style:gap={`${width * 0.02}px`}
				aria-hidden="true"
			>
				<span class="yt-action">
					<svg
						style:inline-size={`${actionIconPx}px`}
						style:block-size={`${actionIconPx}px`}
						viewBox="0 0 24 24"
						><path
							fill="#aaaaaa"
							d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"
						/></svg
					><span
						data-supers-readable-id="surface:web-document:chrome:likes"
						data-supers-readable-text="1.2K"
						data-supers-text-role="found-document-metadata">1.2K</span
					></span
				>
				<svg
					class="yt-dislike"
					style:inline-size={`${actionIconPx}px`}
					style:block-size={`${actionIconPx}px`}
					viewBox="0 0 24 24"
					><path
						fill="#aaaaaa"
						d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"
					/></svg
				>
				<span
					class="yt-reply"
					data-supers-readable-id="surface:web-document:chrome:reply"
					data-supers-readable-text="Reply"
					data-supers-text-role="found-document-metadata">Reply</span
				>
			</div>
		</div>
	</div>
</div>

<style>
	/*
	 * YouTube comment — dark theme. The panel is the only opaque element; the
	 * browser frame around it (CanvasSource) stays transparent. YouTube dark
	 * palette: bg #0f0f0f · text #f1f1f1 · secondary #aaaaaa.
	 */
	.yt-panel {
		--yt-bg: #0f0f0f;
		--yt-text: #f1f1f1;
		--yt-meta: #aaaaaa;
		background-color: var(--yt-bg);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--yt-text);
		display: grid;
		font-family:
			Roboto,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Arial,
			sans-serif;
	}

	.yt-video {
		color: var(--yt-text);
		font-weight: 600;
		line-height: 1.25;
		margin: 0;
	}

	.yt-comment {
		align-items: start;
		display: flex;
	}
	.yt-avatar {
		background-color: #272727;
		border-radius: 50%;
		display: block;
		flex: 0 0 auto;
		overflow: hidden;
	}
	.yt-avatar svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
	}
	.yt-content {
		display: grid;
		flex: 1 1 auto;
		min-inline-size: 0;
	}
	.yt-meta {
		align-items: baseline;
		display: flex;
	}
	.yt-user {
		color: var(--yt-text);
		font-weight: 500;
	}
	.yt-age {
		color: var(--yt-meta);
	}
	.yt-actions {
		align-items: center;
		color: var(--yt-meta);
		display: flex;
		margin-block-start: 0.3em;
	}
	.yt-action {
		align-items: center;
		display: inline-flex;
		gap: 0.45em;
	}
	.yt-actions svg {
		display: block;
	}
	.yt-reply {
		font-weight: 500;
	}
</style>
