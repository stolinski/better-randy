<script lang="ts">
	import Field from '$lib/platform/Field.svelte';
	import { IS_HOSTED_ORIGIN } from '$lib/platform/hosted-origin';
	import InspectorToggle from '$lib/platform/InspectorToggle.svelte';
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';

	import {
		TweetStackPostSchema,
		type TweetStackContent,
		type TweetStackPost
	} from './tweet-stack-content';

	let { overlay = $bindable() }: OverlayEditorProps<TweetStackContent> = $props();
	let importUrl = $state('');
	let importError = $state('');
	let importing = $state(false);

	function removePost(index: number): void {
		if (overlay.content.posts.length <= 2) return;
		overlay.content.posts.splice(index, 1);
	}

	function movePost(index: number, direction: -1 | 1): void {
		const destination = index + direction;
		if (destination < 0 || destination >= overlay.content.posts.length) return;
		const [post] = overlay.content.posts.splice(index, 1);
		if (post) overlay.content.posts.splice(destination, 0, post);
	}

	function setOptionalAvatar(post: TweetStackPost, value: string): void {
		post.avatarUrl = value.trim().length > 0 ? value.trim() : undefined;
	}

	async function importPost(): Promise<void> {
		if (importing || overlay.content.posts.length >= 8) return;
		importing = true;
		importError = '';
		try {
			const response = await fetch('/api/x-post', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: importUrl })
			});
			const payload: unknown = await response.json();
			if (!response.ok) {
				const message =
					typeof payload === 'object' && payload !== null && 'message' in payload
						? String((payload as { message: unknown }).message)
						: 'X post could not be imported';
				throw new Error(message);
			}
			const parsed = TweetStackPostSchema.safeParse(payload);
			if (!parsed.success) throw new Error('X returned incomplete post content');
			if (overlay.content.posts.some((post) => post.url === parsed.data.url)) {
				throw new Error('That post is already in the stack');
			}
			overlay.content.posts.push(parsed.data);
			importUrl = '';
		} catch (errorValue) {
			importError =
				errorValue instanceof Error ? errorValue.message : 'X post could not be imported';
		} finally {
			importing = false;
		}
	}
</script>

<!-- The import fetches the post through the origin (ADR-0054 §7), which the
     hosted origin refuses, so the row is absent there; posts are typed in. -->
{#if !IS_HOSTED_ORIGIN}
	<Field label="Share URL">
		<div class="tweet-import">
			<input bind:value={importUrl} type="url" placeholder="https://x.com/…/status/…" />
			<button
				type="button"
				disabled={importing || importUrl.trim().length === 0 || overlay.content.posts.length >= 8}
				onclick={importPost}>{importing ? 'Importing…' : 'Import'}</button
			>
		</div>
	</Field>
	{#if importError}
		<p class="tweet-import__error" role="status">{importError}</p>
	{/if}
{/if}

<Field label="Pile start">
	<input bind:value={overlay.content.pileStart} type="number" min="0" max="0.95" step="0.01" />
</Field>
<Field label="Pile window">
	<input bind:value={overlay.content.pileWindow} type="number" min="0.08" max="0.8" step="0.01" />
</Field>
<Field label="Spread">
	<input bind:value={overlay.content.spread} type="range" min="0" max="1" step="0.01" />
</Field>

{#each overlay.content.posts as post, index (post.url)}
	<fieldset class="tweet-entry">
		<legend>
			<span>{index + 1}. {post.handle}</span>
			<span class="tweet-entry__actions">
				<button
					type="button"
					aria-label={`Move post ${index + 1} earlier`}
					disabled={index === 0}
					onclick={() => movePost(index, -1)}>↑</button
				>
				<button
					type="button"
					aria-label={`Move post ${index + 1} later`}
					disabled={index === overlay.content.posts.length - 1}
					onclick={() => movePost(index, 1)}>↓</button
				>
				<button
					type="button"
					aria-label={`Remove post ${index + 1}`}
					disabled={overlay.content.posts.length <= 2}
					onclick={() => removePost(index)}>×</button
				>
			</span>
		</legend>
		<Field label="Name"><input bind:value={post.displayName} type="text" /></Field>
		<Field label="Handle"><input bind:value={post.handle} type="text" /></Field>
		<Field label="Text"><textarea bind:value={post.body} rows="3"></textarea></Field>
		<Field label="Date"><input bind:value={post.dateLabel} type="text" /></Field>
		<Field label="Avatar">
			<input
				value={post.avatarUrl ?? ''}
				oninput={(event) => setOptionalAvatar(post, event.currentTarget.value)}
				type="url"
			/>
		</Field>
		<Field label="Verified">
			<InspectorToggle
				checked={post.verified}
				label={`Post ${index + 1} verified`}
				onchange={(checked) => (post.verified = checked)}
			/>
		</Field>
	</fieldset>
{/each}

<style>
	.tweet-import {
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.tweet-import__error {
		color: #f0453d;
		font-size: 0.72rem;
		margin: 0;
	}

	.tweet-entry {
		border: 0;
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-xs);
		margin: var(--vs-s) 0 0;
		padding: var(--vs-s) 0 0;
	}

	.tweet-entry legend {
		align-items: center;
		color: var(--chrome-text);
		display: flex;
		font-size: 0.75rem;
		inline-size: 100%;
		justify-content: space-between;
		padding: 0;
	}

	.tweet-entry__actions {
		display: flex;
		gap: 2px;
	}

	.tweet-entry__actions button {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		padding: 2px 5px;
	}

	.tweet-entry__actions button:disabled {
		cursor: default;
		opacity: 0.3;
	}
</style>
