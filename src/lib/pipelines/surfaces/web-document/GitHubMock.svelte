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
	// `title` = issue/PR title, `author` = the user, `dateLabel` = "commented on
	// Jun 22", `body` = the comment carrying the hero `[highlight]`. The issue
	// `#number` is read from the trailing number of `sourceUrl`.
	const repo = $derived((content.source ?? '').trim());
	const title = $derived((content.title ?? '').trim());
	const username = $derived((content.author ?? '').trim());
	const when = $derived((content.dateLabel ?? '').trim());
	const issueNumber = $derived((content.sourceUrl ?? '').match(/(\d+)\/?(?:[?#].*)?$/)?.[1] ?? '');

	const [repoOwner, repoName] = $derived.by(() => {
		const parts = repo.split('/');
		return [parts[0] ?? '', parts.slice(1).join('/')];
	});

	const repoFontPx = $derived(width * 0.024);
	const titleFontPx = $derived(width * 0.044);
	const metaFontPx = $derived(width * 0.026);
	const badgeFontPx = $derived(width * 0.024);
	const headFontPx = $derived(width * 0.028);
	const bodyFontPx = $derived(width * 0.032);
	const avatarPx = $derived(width * 0.066);
	const badgeIconPx = $derived(width * 0.026);
	const tailPx = $derived(width * 0.014);
</script>

<!-- GitHub issue (dark mode): breadcrumb · title #n · Open meta · avatar + comment. -->
<div class="gh-panel" style:padding={`${width * 0.034}px`} style:gap={`${width * 0.022}px`}>
	<div class="gh-head" style:gap={`${width * 0.012}px`}>
		{#if repo}
			<div
				class="gh-repo"
				data-gfx-readable-id="surface:web-document:source"
				data-gfx-readable-text={repo}
				data-gfx-text-role="found-document-metadata"
				style:font-size={`${repoFontPx}px`}
			>
				<span class="gh-repo-owner">{repoOwner}</span>{#if repoName}<span class="gh-repo-sep"
						>/</span
					><span class="gh-repo-name">{repoName}</span>{/if}
			</div>
		{/if}
		{#if title}
			<h2 class="gh-title" style:font-size={`${titleFontPx}px`}>
				<span
					data-gfx-readable-id="surface:web-document:title"
					data-gfx-readable-text={title}
					data-gfx-text-role="found-document-title">{title}</span
				>{#if issueNumber}<span
						class="gh-number"
						data-gfx-readable-id="surface:web-document:chrome:issue-number"
						data-gfx-readable-text={`#${issueNumber}`}
						data-gfx-text-role="found-document-metadata">#{issueNumber}</span
					>{/if}
			</h2>
		{/if}
		<div class="gh-meta" style:font-size={`${metaFontPx}px`} style:gap={`${width * 0.012}px`}>
			<span
				class="gh-badge"
				data-gfx-readable-id="surface:web-document:chrome:open-status"
				data-gfx-readable-text="Open"
				data-gfx-text-role="found-document-metadata"
				style:font-size={`${badgeFontPx}px`}
				style:gap={`${width * 0.007}px`}
			>
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
			{#if username}<span class="gh-meta-text"
					><span
						class="gh-user"
						data-gfx-readable-id="surface:web-document:author"
						data-gfx-readable-text={username}
						data-gfx-text-role="found-document-metadata">{username}</span
					>
					<span
						data-gfx-readable-id="surface:web-document:chrome:opened-issue"
						data-gfx-readable-text="opened this issue"
						data-gfx-text-role="found-document-metadata">opened this issue</span
					></span
				>{/if}
		</div>
	</div>

	<div class="gh-thread" style:gap={`${width * 0.018}px`}>
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
		<div class="gh-comment" style:--tail={`${tailPx}px`}>
			<div
				class="gh-comment-head"
				style:padding={`${width * 0.015}px ${width * 0.02}px`}
				style:font-size={`${headFontPx}px`}
			>
				{#if username}<span
						class="gh-user"
						data-gfx-readable-id="surface:web-document:chrome:comment-author"
						data-gfx-readable-text={username}
						data-gfx-text-role="found-document-metadata">{username}</span
					>{/if}
				<span
					class="gh-when"
					data-gfx-readable-id={when
						? 'surface:web-document:date-label'
						: 'surface:web-document:chrome:commented'}
					data-gfx-readable-text={when || 'commented'}
					data-gfx-text-role="found-document-metadata">{when || 'commented'}</span
				>
				<span
					class="gh-role"
					data-gfx-readable-id="surface:web-document:chrome:owner-role"
					data-gfx-readable-text="Owner"
					data-gfx-text-role="found-document-metadata"
					style:font-size={`${metaFontPx}px`}>Owner</span
				>
			</div>
			<div class="gh-comment-body" style:padding={`${width * 0.024}px`}>
				<DocumentBody
					body={content.body}
					fontSize={bodyFontPx}
					readablePrefix="surface:web-document:body"
				/>
			</div>
		</div>
	</div>
</div>

<style>
	/*
	 * GitHub issue — dark mode. The panel is the only opaque element; the browser
	 * frame around it (CanvasSource) stays transparent. The signature GitHub tell:
	 * the avatar sits OUTSIDE the comment box on the left, and the box header has a
	 * caret/tail pointing back to it. GitHub dark palette: canvas #0d1117 · text
	 * #e6edf3 · muted #7d8590 · border #30363d · comment head #161b22 · open-green
	 * #1f883d · link #2f81f7.
	 */
	.gh-panel {
		--gh-canvas: #0d1117;
		--gh-text: #e6edf3;
		--gh-muted: #7d8590;
		--gh-border: #30363d;
		--gh-head: #161b22;
		--gh-link: #2f81f7;
		background-color: var(--gh-canvas);
		border-end-start-radius: 0.85em;
		border-end-end-radius: 0.85em;
		box-sizing: border-box;
		color: var(--gh-text);
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	}

	.gh-head {
		border-block-end: 1px solid var(--gh-border);
		display: grid;
		justify-items: start;
		padding-block-end: 0.5em;
	}
	.gh-repo {
		color: var(--gh-link);
	}
	.gh-repo-owner {
		color: var(--gh-link);
	}
	.gh-repo-sep {
		color: var(--gh-muted);
		margin: 0 0.35em;
	}
	.gh-repo-name {
		color: var(--gh-link);
		font-weight: 600;
	}
	.gh-title {
		color: var(--gh-text);
		font-weight: 600;
		line-height: 1.2;
		margin: 0;
	}
	.gh-number {
		color: var(--gh-muted);
		font-weight: 300;
		margin-inline-start: 0.25em;
	}
	.gh-meta {
		align-items: center;
		color: var(--gh-muted);
		display: flex;
	}
	.gh-badge {
		align-items: center;
		background-color: #1f883d;
		border-radius: 2em;
		color: #ffffff;
		display: inline-flex;
		font-weight: 500;
		padding: 0.35em 0.85em;
	}
	.gh-badge svg {
		display: block;
	}
	.gh-meta-text {
		color: var(--gh-muted);
	}

	.gh-thread {
		align-items: start;
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

	.gh-comment {
		border: 1px solid var(--gh-border);
		border-radius: 0.6em;
		flex: 1 1 auto;
		min-inline-size: 0;
		position: relative;
	}
	/* Speech-bubble tail pointing left to the avatar (outer border + inner fill). */
	.gh-comment::before,
	.gh-comment::after {
		block-size: 0;
		content: '';
		inline-size: 0;
		position: absolute;
		inset-block-start: calc(var(--tail) * 0.9);
	}
	.gh-comment::before {
		border-block: var(--tail) solid transparent;
		border-inline-end: var(--tail) solid var(--gh-border);
		inset-inline-start: calc(var(--tail) * -1);
	}
	.gh-comment::after {
		border-block: calc(var(--tail) - 1px) solid transparent;
		border-inline-end: calc(var(--tail) - 1px) solid var(--gh-head);
		inset-inline-start: calc(var(--tail) * -1 + 1px);
	}
	.gh-comment-head {
		align-items: center;
		background-color: var(--gh-head);
		border-block-end: 1px solid var(--gh-border);
		border-start-start-radius: 0.55em;
		border-start-end-radius: 0.55em;
		display: flex;
		gap: 0.4em;
	}
	.gh-user {
		color: var(--gh-text);
		font-weight: 600;
	}
	.gh-when {
		color: var(--gh-muted);
	}
	.gh-role {
		border: 1px solid var(--gh-border);
		border-radius: 2em;
		color: var(--gh-muted);
		margin-inline-start: 0.2em;
		padding: 0.1em 0.7em;
	}
	.gh-comment-body {
		background-color: var(--gh-canvas);
		border-end-start-radius: 0.55em;
		border-end-end-radius: 0.55em;
	}
</style>
