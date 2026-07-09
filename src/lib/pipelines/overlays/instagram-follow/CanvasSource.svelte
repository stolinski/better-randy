<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import type { InstagramFollowContent } from './index';

	interface Props {
		content: InstagramFollowContent;
	}

	let { content }: Props = $props();

	// PACK-IMMUNE faithful artifact (ADR-0038, declared in ./identity.ts): the
	// story-ring gradient, the #0095f6 Follow blue, and the type voice are
	// Instagram's, deliberately literal — they must not respond to the Pack.

	const theme = $derived(content.theme ?? 'light');
	const beat = $derived(content.beat ?? 0.42);

	// Press choreography keyed in REAL ms off the beat, derived purely from
	// globalProgress — frame-deterministic (no CSS transitions, no wall clock).
	const PRESS_MS = 140;
	const SETTLE_MS = 420; // card settle after the swap
	const durationMs = $derived(engineState.transport.durationSeconds * 1000);
	const sinceBeatMs = $derived((animState.globalProgress - beat) * durationMs);

	const pressT = $derived(Math.max(0, Math.min(1, sinceBeatMs / PRESS_MS)));
	const following = $derived(sinceBeatMs >= PRESS_MS);
	const settleT = $derived(Math.max(0, Math.min(1, (sinceBeatMs - PRESS_MS) / SETTLE_MS)));

	// Press dip on the button — zero at both ends; emitted only while
	// non-identity (a lingering descendant transform would quantize the mount's
	// exit-fade opacity in the HTML-in-canvas capture).
	const pressScale = $derived(1 - 0.06 * Math.sin(Math.min(1, pressT) * Math.PI));

	// A one-shot settle nudge on the whole card as the follow lands — a soft
	// dip-and-return, resting at exactly 1 by SETTLE_MS end.
	const cardScale = $derived(
		settleT > 0 && settleT < 1 ? 1 + 0.012 * Math.sin(settleT * Math.PI) : 1
	);
</script>

<aside
	class="ig-follow ig-follow--{theme}"
	data-overlay="instagram-follow"
	style:scale={cardScale !== 1 ? String(cardScale) : undefined}
>
	<span class="ig-follow__ring">
		<span class="ig-follow__avatar">
			{#if content.avatarUrl}
				<img src={content.avatarUrl} crossorigin="anonymous" alt="" />
			{:else}
				<svg viewBox="0 0 40 40" aria-hidden="true">
					<circle cx="20" cy="20" r="20" fill={theme === 'dark' ? '#3d3d3d' : '#c6c6c6'} />
					<circle cx="20" cy="15.5" r="7" fill={theme === 'dark' ? '#8a8a8a' : '#f5f5f5'} />
					<path
						d="M6.5 44V36.5c1.8-7.4 7.3-11 13.5-11s11.7 3.6 13.5 11V44Z"
						fill={theme === 'dark' ? '#8a8a8a' : '#f5f5f5'}
					/>
				</svg>
			{/if}
		</span>
	</span>

	<span class="ig-follow__username">{content.username}</span>
	{#if content.name || content.meta}
		<span class="ig-follow__meta">
			{[content.name, content.meta].filter(Boolean).join(' · ')}
		</span>
	{/if}

	<!-- Both button states stack in one grid cell so the card never reflows at
	     the swap (the wider state reserves the footprint from frame one). -->
	<span class="ig-follow__cta">
		<span class="ig-follow__state" style:visibility={following ? 'hidden' : undefined}>
			<span
				class="ig-follow__button"
				style:scale={pressT > 0 && pressT < 1 ? String(pressScale) : undefined}
			>
				Follow
			</span>
		</span>
		<span class="ig-follow__state" style:visibility={following ? undefined : 'hidden'}>
			<span class="ig-follow__button ig-follow__button--following">Following</span>
		</span>
	</span>
</aside>

<style>
	/* Faithful Instagram card — literal platform palette + type on purpose
	   (pack-immune; see ./identity.ts). */
	.ig-follow {
		align-items: center;
		border-radius: calc(0.9 * var(--cqmin));
		box-shadow: 0 calc(0.18 * var(--cqmin)) calc(0.9 * var(--cqmin)) rgb(0 0 0 / 0.28);
		display: inline-flex;
		flex-direction: column;
		font-family: -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		gap: calc(0.55 * var(--cqmin));
		padding: calc(1.6 * var(--cqmin)) calc(2.2 * var(--cqmin)) calc(1.5 * var(--cqmin));
	}

	.ig-follow--light {
		background: #ffffff;
		color: #262626;
	}

	.ig-follow--dark {
		background: #262626;
		color: #f5f5f5;
	}

	/* The story ring — Instagram's gradient, drawn as a ring behind the
	   avatar (plain CSS gradient: capture-safe, no filters/masks). */
	.ig-follow__ring {
		background: linear-gradient(45deg, #f9ce34, #ee2a7b 52%, #6228d7);
		border-radius: 50%;
		display: inline-grid;
		padding: calc(0.22 * var(--cqmin));
		place-items: center;
	}

	.ig-follow__avatar {
		block-size: calc(4.6 * var(--cqmin));
		border: calc(0.18 * var(--cqmin)) solid var(--ig-card, #ffffff);
		border-radius: 50%;
		display: inline-block;
		inline-size: calc(4.6 * var(--cqmin));
		overflow: hidden;
	}

	.ig-follow--light .ig-follow__avatar {
		--ig-card: #ffffff;
	}

	.ig-follow--dark .ig-follow__avatar {
		--ig-card: #262626;
	}

	.ig-follow__avatar img,
	.ig-follow__avatar svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		object-fit: cover;
	}

	.ig-follow__username {
		font-size: calc(1.35 * var(--cqmin));
		font-weight: 700;
		letter-spacing: 0.01em;
		line-height: 1.2;
		margin-block-start: calc(0.3 * var(--cqmin));
		white-space: nowrap;
	}

	.ig-follow__meta {
		color: #8e8e8e;
		font-size: calc(0.95 * var(--cqmin));
		line-height: 1.2;
		white-space: nowrap;
	}

	.ig-follow--dark .ig-follow__meta {
		color: #a8a8a8;
	}

	.ig-follow__cta {
		display: inline-grid;
		margin-block-start: calc(0.5 * var(--cqmin));
	}

	.ig-follow__state {
		display: inline-flex;
		grid-area: 1 / 1;
		justify-self: center;
	}

	/* Follow — Instagram blue; Following — the muted chip. */
	.ig-follow__button {
		background: #0095f6;
		border-radius: calc(0.55 * var(--cqmin));
		color: #ffffff;
		display: inline-flex;
		font-size: calc(1.05 * var(--cqmin));
		font-weight: 600;
		line-height: 1;
		padding: calc(0.68 * var(--cqmin)) calc(2.2 * var(--cqmin));
		white-space: nowrap;
	}

	.ig-follow--light .ig-follow__button--following {
		background: #efefef;
		color: #262626;
	}

	.ig-follow--dark .ig-follow__button--following {
		background: #363636;
		color: #f5f5f5;
	}
</style>
