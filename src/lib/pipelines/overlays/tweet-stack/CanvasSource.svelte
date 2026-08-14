<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	import type { TweetStackContent } from './tweet-stack-content';
	import { resolveTweetStackFrameLayout } from './tweet-stack-frame-layout';
	import { resolveTweetStackCardMotion } from './tweet-stack-motion';

	interface Props {
		content: TweetStackContent;
	}

	let { content }: Props = $props();

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const layout = $derived(
		resolveTweetStackFrameLayout(engineState.transport.orientation, frame.width, frame.height)
	);
	const overlay = $derived(engineState.overlays.find((candidate) => candidate.content === content));
	const motions = $derived(
		content.posts.map((_post, cardIndex) =>
			resolveTweetStackCardMotion({
				cardIndex,
				cardCount: content.posts.length,
				globalProgress: animState.globalProgress,
				durationSeconds: engineState.transport.durationSeconds,
				pileStart: content.pileStart ?? 0.08,
				pileWindow: content.pileWindow ?? 0.52,
				exitStart: overlay?.exit?.start,
				exitDuration: overlay?.exit?.duration,
				spread: content.spread ?? 0.72,
				orientation: engineState.transport.orientation
			})
		)
	);
	const bodyFontSize = $derived(layout.cardWidth * 0.037);
	const metaFontSize = $derived(layout.cardWidth * 0.022);
	const avatarSize = $derived(layout.cardWidth * 0.075);
</script>

<section
	class="tweet-stack"
	data-overlay="tweet-stack"
	aria-label="Tweet stack"
	style:block-size={`${layout.stackHeight}px`}
	style:inline-size={`${layout.stackWidth}px`}
>
	{#each content.posts as post, index (post.id)}
		{@const motion = motions[index]}
		<article
			class="tweet-card"
			data-tweet-index={index}
			style:inline-size={`${layout.cardWidth}px`}
			style:font-size={`${bodyFontSize}px`}
			style:opacity={motion.opacity}
			style:rotate={`${motion.rotation}deg`}
			style:scale={motion.scale}
			style:translate={`calc(-50% + ${motion.x * layout.cardWidth * layout.motionSpread}px) calc(-50% + ${motion.y * layout.cardWidth * layout.motionSpread}px)`}
			style:z-index={motion.zIndex}
			style:visibility={motion.opacity <= 0.001 ? 'hidden' : 'visible'}
		>
			<header class="tweet-card__header">
				<span
					class="tweet-card__avatar"
					style:block-size={`${avatarSize}px`}
					style:inline-size={`${avatarSize}px`}
					aria-hidden="true"
				>
					{#if post.avatarUrl}
						<img src={post.avatarUrl} crossorigin="anonymous" alt="" />
					{:else}
						<span>{post.displayName.slice(0, 1).toUpperCase()}</span>
					{/if}
				</span>
				<span class="tweet-card__identity">
					<strong>{post.displayName}</strong>
					{#if post.verified}
						<svg class="tweet-card__verified" viewBox="0 0 24 24" aria-label="Verified">
							<path
								d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.68 2.63 13.43 1.75 12 1.75s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.64 9.33 1.75 10.57 1.75 12s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34Zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77Z"
							/>
						</svg>
					{/if}
					<span>{post.handle}</span>
				</span>
				<svg class="tweet-card__x" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.967 6.817H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
					/>
				</svg>
			</header>

			<p class="tweet-card__body">{post.body}</p>

			<footer class="tweet-card__footer" style:font-size={`${metaFontSize}px`}>
				<time>{post.dateLabel}</time>
				<span class="tweet-card__actions" aria-hidden="true">
					<svg viewBox="0 0 24 24"
						><path
							d="M2.8 10.3A7.5 7.5 0 0 1 10.3 2.8h3.4a7.5 7.5 0 0 1 3.7 14l-7.1 3.9v-3h-.2a7.5 7.5 0 0 1-7.3-7.4Z"
						/></svg
					>
					<svg viewBox="0 0 24 24"
						><path
							d="m4.5 4 4 4H6v8a2 2 0 0 0 2 2h5v2H8a4 4 0 0 1-4-4V8H1.5l3-4Zm15 16-4-4H18V8a2 2 0 0 0-2-2h-5V4h5a4 4 0 0 1 4 4v8h2.5l-3 4Z"
						/></svg
					>
					<svg viewBox="0 0 24 24"
						><path
							d="M12 21C4 16.5 2 12.8 2 8.8A5.8 5.8 0 0 1 12 4.9a5.8 5.8 0 0 1 10 3.9c0 4-2 7.7-10 12.2Z"
						/></svg
					>
					<svg viewBox="0 0 24 24"><path d="M4 20V10h3v10H4Zm6 0V4h3v16h-3Zm6 0V7h3v13h-3Z" /></svg>
				</span>
			</footer>
		</article>
	{/each}
</section>

<style>
	.tweet-stack {
		isolation: isolate;
		position: relative;
	}

	.tweet-card {
		background: #000;
		border: max(2px, 0.0025em) solid #2f3336;
		border-radius: 0.7em;
		box-shadow:
			0 0.12em 0.34em rgb(0 0 0 / 0.28),
			0 0.035em 0.1em rgb(0 0 0 / 0.2);
		box-sizing: border-box;
		color: #e7e9ea;
		display: grid;
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		gap: 0.72em;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		padding: 0.9em 1em 0.78em;
		position: absolute;
		transform-origin: center;
	}

	.tweet-card__header {
		align-items: center;
		display: flex;
		gap: 0.55em;
		min-inline-size: 0;
	}

	.tweet-card__avatar {
		background: #16181c;
		border-radius: 50%;
		display: grid;
		flex: none;
		overflow: hidden;
		place-items: center;
	}

	.tweet-card__avatar img {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		object-fit: cover;
	}

	.tweet-card__avatar > span {
		color: #71767b;
		font-size: 0.95em;
		font-weight: 800;
	}

	.tweet-card__identity {
		align-items: center;
		display: flex;
		flex: 1 1 auto;
		font-size: 0.62em;
		gap: 0.3em;
		min-inline-size: 0;
	}

	.tweet-card__identity strong {
		max-inline-size: 58%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tweet-card__identity > span:last-child {
		color: #71767b;
	}

	.tweet-card__verified {
		block-size: 0.86em;
		fill: #1d9bf0;
		flex: none;
		inline-size: 0.86em;
	}

	.tweet-card__x {
		block-size: 0.72em;
		fill: #e7e9ea;
		flex: none;
		inline-size: 0.72em;
	}

	.tweet-card__body {
		display: -webkit-box;
		font: inherit;
		font-size: 1em;
		line-height: 1.45;
		margin: 0;
		overflow: hidden;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
	}

	.tweet-card__footer {
		align-items: center;
		border-block-start: max(1px, 0.035em) solid #2f3336;
		color: #71767b;
		display: flex;
		justify-content: space-between;
		padding-block-start: 0.65em;
	}

	.tweet-card__actions {
		align-items: center;
		display: flex;
		gap: 1.1em;
	}

	.tweet-card__actions svg {
		block-size: 1.35em;
		fill: #71767b;
		inline-size: 1.35em;
	}
</style>
