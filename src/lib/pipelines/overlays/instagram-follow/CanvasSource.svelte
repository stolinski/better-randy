<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { mixHexColors } from '$lib/utils/color';
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
	// One continuous gesture, same grammar as youtube-subscribe: the button
	// squashes down, the state swaps hidden inside the squash bottom, the
	// release overshoots and settles while the blue morphs to the muted chip.
	const DOWN_MS = 110;
	const RELEASE_MS = 210;
	const MORPH_MS = 220;
	const SETTLE_MS = 420; // card settle after the swap
	const durationMs = $derived(engineState.transport.durationSeconds * 1000);
	const sinceBeatMs = $derived((animState.globalProgress - beat) * durationMs);

	const following = $derived(sinceBeatMs >= DOWN_MS);

	// Press scale, continuous across both states: eased squash to 0.92, then
	// an overshoot release resting at exactly 1. Emitted only while
	// non-identity (a lingering descendant transform would quantize the
	// mount's exit-fade opacity in the HTML-in-canvas capture).
	const pressScale = $derived.by(() => {
		if (sinceBeatMs <= 0 || sinceBeatMs >= DOWN_MS + RELEASE_MS) return 1;
		if (sinceBeatMs < DOWN_MS) {
			const t = sinceBeatMs / DOWN_MS;
			const eased = 1 - (1 - t) * (1 - t);
			return 1 - 0.08 * eased;
		}
		const t = (sinceBeatMs - DOWN_MS) / RELEASE_MS;
		return 1 - 0.08 * (1 - t) + 0.035 * Math.sin(t * Math.PI) * (1 - t);
	});

	// Color morph on the landed button: Instagram blue → the muted Following
	// chip, computed per frame; emitted only during the morph, after which the
	// class endpoint colors take over pixel-identically.
	const morphT = $derived(Math.max(0, Math.min(1, (sinceBeatMs - DOWN_MS) / MORPH_MS)));
	const chipBg = $derived(theme === 'dark' ? '#363636' : '#efefef');
	const chipInk = $derived(theme === 'dark' ? '#f5f5f5' : '#262626');
	const morphBg = $derived(morphT < 1 ? mixHexColors('#0095f6', chipBg, morphT) : undefined);
	const morphInk = $derived(morphT < 1 ? mixHexColors('#ffffff', chipInk, morphT) : undefined);

	// A one-shot settle nudge on the whole card as the follow lands — a soft
	// dip-and-return, resting at exactly 1 by SETTLE_MS end.
	const settleT = $derived(Math.max(0, Math.min(1, (sinceBeatMs - DOWN_MS) / SETTLE_MS)));
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

	<span
		class="ig-follow__username"
		data-gfx-readable-id="username"
		data-gfx-text-role="overlay-corner-primary"
	>
		{content.username}{#if content.verified ?? false}<svg
				class="ig-follow__verified"
				viewBox="0 0 24 24"
				aria-hidden="true"
			>
				<path
					d="M12 1.5l2.6 2 3.2-.5 1.2 3 3 1.2-.5 3.2 2 2.6-2 2.6.5 3.2-3 1.2-1.2 3-3.2-.5-2.6 2-2.6-2-3.2.5-1.2-3-3-1.2.5-3.2-2-2.6 2-2.6-.5-3.2 3-1.2 1.2-3 3.2.5Z"
					fill="#0095f6"
				/>
				<path
					d="M8.2 12.3l2.7 2.7 5-5.4"
					fill="none"
					stroke="#ffffff"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>{/if}
	</span>
	{#if content.name || content.meta}
		<span
			class="ig-follow__meta"
			data-gfx-readable-id="meta"
			data-gfx-text-role="overlay-corner-secondary"
		>
			{[content.name, content.meta].filter(Boolean).join(' · ')}
		</span>
	{/if}

	<!-- Both button states stack in one grid cell so the card never reflows at
	     the swap (the wider state reserves the footprint from frame one). -->
	<span class="ig-follow__cta">
		<span class="ig-follow__state" style:visibility={following ? 'hidden' : undefined}>
			<span
				class="ig-follow__button"
				data-gfx-readable-id="follow-action"
				data-gfx-text-role="overlay-corner-secondary"
				style:scale={pressScale !== 1 && !following ? String(pressScale) : undefined}
			>
				Follow
			</span>
		</span>
		<span class="ig-follow__state" style:visibility={following ? undefined : 'hidden'}>
			<span
				class="ig-follow__button ig-follow__button--following"
				data-gfx-readable-id="following-action"
				data-gfx-text-role="overlay-corner-secondary"
				style:scale={pressScale !== 1 && following ? String(pressScale) : undefined}
				style:background={morphBg}
				style:color={morphInk}
			>
				Following
			</span>
		</span>
	</span>
</aside>

<style>
	/* Faithful Instagram card — literal platform palette + type on purpose
	   (pack-immune; see ./identity.ts). Statement scale: this is a HeyGen-
	   register creator block (~half the vertical frame width), not a UI chip —
	   the story ring, the blue Follow, and the verified seal must read
	   instantly at viewing distance. */
	.ig-follow {
		align-items: center;
		border-radius: calc(2.4 * var(--cqmin));
		box-shadow: 0 calc(0.5 * var(--cqmin)) calc(2.4 * var(--cqmin)) rgb(0 0 0 / 0.3);
		display: inline-flex;
		flex-direction: column;
		font-family: -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		gap: calc(1.5 * var(--cqmin));
		padding: calc(4.2 * var(--cqmin)) calc(5.8 * var(--cqmin)) calc(4 * var(--cqmin));
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
		padding: calc(0.62 * var(--cqmin));
		place-items: center;
	}

	.ig-follow__avatar {
		block-size: calc(12.4 * var(--cqmin));
		border: calc(0.5 * var(--cqmin)) solid var(--ig-card, #ffffff);
		border-radius: 50%;
		display: inline-block;
		inline-size: calc(12.4 * var(--cqmin));
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
		align-items: center;
		display: inline-flex;
		font-size: calc(4.8 * var(--cqmin));
		font-weight: 700;
		gap: calc(0.7 * var(--cqmin));
		letter-spacing: 0.01em;
		line-height: 1.2;
		margin-block-start: calc(0.8 * var(--cqmin));
		white-space: nowrap;
	}

	.ig-follow__verified {
		block-size: calc(3.1 * var(--cqmin));
		inline-size: calc(3.1 * var(--cqmin));
	}

	.ig-follow__meta {
		color: #8e8e8e;
		font-size: calc(3 * var(--cqmin));
		line-height: 1.2;
		white-space: nowrap;
	}

	.ig-follow--dark .ig-follow__meta {
		color: #a8a8a8;
	}

	.ig-follow__cta {
		display: inline-grid;
		justify-items: stretch;
		margin-block-start: calc(1.4 * var(--cqmin));
		min-inline-size: calc(28 * var(--cqmin));
	}

	.ig-follow__state {
		display: inline-flex;
		grid-area: 1 / 1;
		justify-self: stretch;
	}

	/* Follow — Instagram blue, the full-width rectangular button (IG's ~8px
	   radius at UI scale, NOT a pill); Following — the muted chip. */
	.ig-follow__button {
		background: #0095f6;
		border-radius: calc(1.5 * var(--cqmin));
		color: #ffffff;
		display: inline-flex;
		flex: 1;
		font-size: calc(3 * var(--cqmin));
		font-weight: 600;
		justify-content: center;
		line-height: 1;
		padding: calc(1.9 * var(--cqmin)) calc(6 * var(--cqmin));
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
