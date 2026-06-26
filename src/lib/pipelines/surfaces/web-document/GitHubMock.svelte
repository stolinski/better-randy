<script lang="ts">
	import type { SurfaceState } from '$lib/platform/engine-schema';

	import DocumentBody from './DocumentBody.svelte';

	interface Props {
		/** Surface content — title/source/author/dateLabel/body slots. */
		content: SurfaceState['content'];
		/** Card pixel width; the issue's type scales from it. */
		width: number;
	}

	let { content, width }: Props = $props();

	// Content slots for the github layout: `source` = repo path ("owner/repo"),
	// `title` = issue/PR title, `author` = commenter username, `dateLabel` =
	// "commented on Jun 22", `body` = the comment carrying the hero `[highlight]`.
	const repo = $derived((content.source ?? '').trim());
	const title = $derived((content.title ?? '').trim());
	const username = $derived((content.author ?? '').trim());
	const when = $derived((content.dateLabel ?? '').trim());

	const repoFontPx = $derived(width * 0.024);
	const titleFontPx = $derived(width * 0.044);
	const badgeFontPx = $derived(width * 0.024);
	const headFontPx = $derived(width * 0.028);
	const bodyFontPx = $derived(width * 0.032);
	const avatarPx = $derived(width * 0.06);
	const badgeIconPx = $derived(width * 0.026);
</script>

<!-- GitHub issue (dark mode). Repo breadcrumb · title · Open badge · comment. -->
<div class="gh-panel" style:padding={`${width * 0.034}px`} style:gap={`${width * 0.022}px`}>
	<div class="gh-head" style:gap={`${width * 0.01}px`}>
		{#if repo}
			<div class="gh-repo" style:font-size={`${repoFontPx}px`}>{repo}</div>
		{/if}
		{#if title}
			<h2 class="gh-title" style:font-size={`${titleFontPx}px`}>{title}</h2>
		{/if}
		<span class="gh-badge" style:font-size={`${badgeFontPx}px`} style:gap={`${width * 0.008}px`}>
			<svg
				style:inline-size={`${badgeIconPx}px`}
				style:block-size={`${badgeIconPx}px`}
				viewBox="0 0 16 16"
				aria-hidden="true"
				><path
					fill="#ffffff"
					d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"
				/></svg
			>Open</span
		>
	</div>

	<div class="gh-comment">
		<div
			class="gh-comment-head"
			style:padding={`${width * 0.016}px ${width * 0.02}px`}
			style:gap={`${width * 0.014}px`}
			style:font-size={`${headFontPx}px`}
		>
			<span
				class="gh-avatar"
				style:inline-size={`${avatarPx}px`}
				style:block-size={`${avatarPx}px`}
				aria-hidden="true"
				><svg viewBox="0 0 24 24" fill="#6e7681"
					><circle cx="12" cy="8.5" r="3.6" /><path
						d="M4.5 20.5c0-3.8 3.4-5.8 7.5-5.8s7.5 2 7.5 5.8z"
					/></svg
				></span
			>
			<span class="gh-comment-meta">
				{#if username}<span class="gh-user">{username}</span>{/if}
				<span class="gh-when">{when || 'commented'}</span>
			</span>
		</div>
		<div class="gh-comment-body" style:padding={`${width * 0.024}px`}>
			<DocumentBody body={content.body} fontSize={bodyFontPx} />
		</div>
	</div>
</div>

<style>
	/*
	 * GitHub issue — dark mode. The panel is the only opaque element; the browser
	 * frame around it (CanvasSource) stays transparent. GitHub dark palette:
	 * canvas #0d1117 · text #e6edf3 · muted #7d8590 · border #30363d · comment
	 * head #161b22 · open-green #238636 · link #2f81f7.
	 */
	.gh-panel {
		--gh-canvas: #0d1117;
		--gh-text: #e6edf3;
		--gh-muted: #7d8590;
		--gh-border: #30363d;
		background-color: var(--gh-canvas);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--gh-text);
		display: grid;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.gh-head {
		display: grid;
		justify-items: start;
	}
	.gh-repo {
		color: var(--gh-muted);
	}
	.gh-title {
		color: var(--gh-text);
		font-weight: 600;
		line-height: 1.2;
		margin: 0;
	}
	.gh-badge {
		align-items: center;
		background-color: #238636;
		border-radius: 2em;
		color: #ffffff;
		display: inline-flex;
		font-weight: 600;
		margin-block-start: 0.2em;
		padding: 0.3em 0.85em;
	}
	.gh-badge svg {
		display: block;
	}

	.gh-comment {
		border: 1px solid var(--gh-border);
		border-radius: 0.6em;
		overflow: hidden;
	}
	.gh-comment-head {
		align-items: center;
		background-color: #161b22;
		border-block-end: 1px solid var(--gh-border);
		display: flex;
	}
	.gh-avatar {
		background-color: #30363d;
		border-radius: 50%;
		display: block;
		flex: 0 0 auto;
		overflow: hidden;
	}
	.gh-avatar svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
	}
	.gh-user {
		color: var(--gh-text);
		font-weight: 600;
	}
	.gh-when {
		color: var(--gh-muted);
	}
	.gh-comment-body {
		background-color: var(--gh-canvas);
	}
</style>
