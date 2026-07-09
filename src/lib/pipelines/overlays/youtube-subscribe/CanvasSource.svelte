<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { mixHexColors } from '$lib/utils/color';
	import type { YoutubeSubscribeContent } from './index';

	interface Props {
		content: YoutubeSubscribeContent;
	}

	let { content }: Props = $props();

	// PACK-IMMUNE faithful artifact (ADR-0038, declared in ./identity.ts): the
	// palette and type below are YouTube's, deliberately literal — they must
	// not respond to the active Pack. Only treatments layered on top (Effects,
	// the mount's enter/exit) take the Pack/composition.

	const theme = $derived(content.theme ?? 'light');
	const beat = $derived(content.beat ?? 0.42);

	// The press choreography is intrinsic motion-form, keyed in REAL ms off the
	// authored beat fraction so it reads identically at any transport length —
	// and derived purely from globalProgress (no CSS transitions, no wall
	// clock): preview and export resolve identical pixels at the same frame.
	// A press is one continuous gesture, not a jump-cut: the pill squashes
	// down, the state swaps hidden inside the squash bottom, the release
	// overshoots and settles while the color morphs red → settled grey and the
	// check draws on.
	const DOWN_MS = 110; // squash to the press bottom
	const RELEASE_MS = 210; // overshoot-and-settle back to rest
	const MORPH_MS = 220; // red → grey color morph, from the bottom
	const CHECK_MS = 240; // check draw-on, slightly trailing the morph
	const RING_MS = 650; // bell ring-in wiggle after the swap
	const durationMs = $derived(engineState.transport.durationSeconds * 1000);
	const sinceBeatMs = $derived((animState.globalProgress - beat) * durationMs);

	// The swap hides inside the squash bottom — the least-visible frame.
	const subscribed = $derived(sinceBeatMs >= DOWN_MS);

	// Press scale, one continuous curve across both states: 1 → 0.92 (eased
	// squash), then 0.92 → 1.035 → 1 (release overshoot resting at exactly 1).
	// Emitted only while non-identity — a lingering descendant transform would
	// quantize the mount's exit-fade opacity in the HTML-in-canvas capture
	// (the documented defect family).
	const pressScale = $derived.by(() => {
		if (sinceBeatMs <= 0 || sinceBeatMs >= DOWN_MS + RELEASE_MS) return 1;
		if (sinceBeatMs < DOWN_MS) {
			const t = sinceBeatMs / DOWN_MS;
			const eased = 1 - (1 - t) * (1 - t);
			return 1 - 0.08 * eased;
		}
		const t = (sinceBeatMs - DOWN_MS) / RELEASE_MS;
		// Damped half-wave: rises through 1, peaks +0.035, lands exactly at 1.
		return 1 - 0.08 * (1 - t) + 0.035 * Math.sin(t * Math.PI) * (1 - t);
	});

	// Color morph on the landed pill: YouTube red → the muted Subscribed chip,
	// computed per frame (no CSS transitions). Emitted only during the morph —
	// afterwards the class endpoint colors take over, pixel-identical.
	const morphT = $derived(Math.max(0, Math.min(1, (sinceBeatMs - DOWN_MS) / MORPH_MS)));
	const chipBg = $derived(theme === 'dark' ? '#3f3f3f' : '#f2f2f2');
	const chipInk = $derived(theme === 'dark' ? '#f1f1f1' : '#0f0f0f');
	const morphBg = $derived(morphT < 1 ? mixHexColors('#ff0000', chipBg, morphT) : undefined);
	const morphInk = $derived(morphT < 1 ? mixHexColors('#ffffff', chipInk, morphT) : undefined);

	// Check draw-on: stroke walks the path (pathLength-normalized dashoffset),
	// trailing the morph so the mark lands on the settled chip.
	const checkT = $derived(
		Math.max(0, Math.min(1, (sinceBeatMs - DOWN_MS - 60) / CHECK_MS))
	);

	const ringT = $derived(Math.max(0, Math.min(1, (sinceBeatMs - DOWN_MS) / RING_MS)));

	// Bell ring: decaying wiggle that rests at exactly 0 by RING_MS end.
	const bellDeg = $derived(
		ringT > 0 && ringT < 1 ? Math.sin(ringT * Math.PI * 4) * 16 * (1 - ringT) : 0
	);

	// Press ripple: a ring expanding off the pill, gone by the ring's end.
	const rippleT = $derived(Math.max(0, Math.min(1, sinceBeatMs / 450)));
</script>

<aside class="yt-sub yt-sub--{theme}" data-overlay="youtube-subscribe">
	<span class="yt-sub__avatar">
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

	<span class="yt-sub__identity">
		<span class="yt-sub__channel">{content.channel}</span>
		{#if content.handle || content.subscribers}
			<span class="yt-sub__meta">
				{[content.handle, content.subscribers].filter(Boolean).join(' · ')}
			</span>
		{/if}
	</span>

	<!-- Both CTA states stack in one grid cell so the card reserves the wider
	     (Subscribed + bell) footprint from frame one — the swap changes pixels,
	     never layout (Q15: nothing pops). The inactive state is
	     visibility:hidden (capture-safe; no opacity/transform tricks). -->
	<span class="yt-sub__cta">
		{#if rippleT > 0 && rippleT < 1}
			<span
				class="yt-sub__ripple"
				style:scale={String(0.6 + rippleT * 1.5)}
				style:opacity={String(0.35 * (1 - rippleT))}
			></span>
		{/if}
		<span class="yt-sub__state" style:visibility={subscribed ? 'hidden' : undefined}>
			<span
				class="yt-sub__pill"
				style:scale={pressScale !== 1 && !subscribed ? String(pressScale) : undefined}
			>
				<span>Subscribe</span>
			</span>
		</span>
		<span class="yt-sub__state" style:visibility={subscribed ? undefined : 'hidden'}>
			<span
				class="yt-sub__pill yt-sub__pill--subscribed"
				style:scale={pressScale !== 1 && subscribed ? String(pressScale) : undefined}
				style:background={morphBg}
				style:color={morphInk}
			>
				<svg class="yt-sub__check" viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M4.5 12.5l5 5 10-11"
						fill="none"
						stroke="currentColor"
						stroke-width="2.6"
						stroke-linecap="round"
						stroke-linejoin="round"
						pathLength="1"
						stroke-dasharray="1"
						stroke-dashoffset={checkT < 1 ? String(1 - checkT) : undefined}
					/>
				</svg>
				<span>Subscribed</span>
			</span>
			<span
				class="yt-sub__bell"
				style:opacity={subscribed ? String(Math.min(1, ringT * 2.5)) : undefined}
				style:rotate={bellDeg !== 0 ? `${bellDeg}deg` : undefined}
			>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path
						d="M12 3.2c-3.3 0-5.6 2.5-5.6 5.8v3.9l-1.9 2.9v1h15v-1l-1.9-2.9V9c0-3.3-2.3-5.8-5.6-5.8Z"
						fill="currentColor"
					/>
					<path d="M10 18.6a2 2 0 0 0 4 0Z" fill="currentColor" />
				</svg>
			</span>
		</span>
	</span>
</aside>

<style>
	/* Faithful YouTube card — literal platform palette + type on purpose
	   (pack-immune; see ./identity.ts). Roboto is YouTube's face; the stack
	   falls through the closest metric neighbours. Statement scale: a HeyGen-
	   register lower-third (~half the frame width), not a UI chip — the red
	   Subscribe pill is the read. */
	.yt-sub {
		align-items: center;
		border-radius: calc(1.7 * var(--cqmin));
		box-shadow: 0 calc(0.5 * var(--cqmin)) calc(2.4 * var(--cqmin)) rgb(0 0 0 / 0.3);
		display: inline-flex;
		font-family: Roboto, 'Segoe UI', Helvetica, Arial, sans-serif;
		gap: calc(2.6 * var(--cqmin));
		padding: calc(2.4 * var(--cqmin)) calc(3.2 * var(--cqmin));
	}

	.yt-sub--light {
		background: #ffffff;
		color: #0f0f0f;
	}

	.yt-sub--dark {
		background: #212121;
		color: #f1f1f1;
	}

	.yt-sub__avatar {
		block-size: calc(8 * var(--cqmin));
		border-radius: 50%;
		display: inline-block;
		flex: none;
		inline-size: calc(8 * var(--cqmin));
		overflow: hidden;
	}

	.yt-sub__avatar img,
	.yt-sub__avatar svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		object-fit: cover;
	}

	.yt-sub__identity {
		display: inline-flex;
		flex-direction: column;
		gap: calc(0.5 * var(--cqmin));
		white-space: nowrap;
	}

	.yt-sub__channel {
		font-size: calc(3.7 * var(--cqmin));
		font-weight: 600;
		line-height: 1.2;
	}

	.yt-sub__meta {
		color: #606060;
		font-size: calc(2.5 * var(--cqmin));
		line-height: 1.2;
	}

	.yt-sub--dark .yt-sub__meta {
		color: #aaaaaa;
	}

	.yt-sub__cta {
		display: inline-grid;
		margin-inline-start: calc(2 * var(--cqmin));
		position: relative;
	}

	/* Both states share the single grid cell; the cell sizes to the wider one
	   so the swap never reflows the card. */
	.yt-sub__state {
		align-items: center;
		display: inline-flex;
		gap: calc(1.8 * var(--cqmin));
		grid-area: 1 / 1;
		justify-self: start;
	}

	/* The Subscribe pill — YouTube red (#ff0000, the brand red), flipping to
	   the muted Subscribed chip. */
	.yt-sub__pill {
		align-items: center;
		background: #ff0000;
		border-radius: calc(4 * var(--cqmin));
		color: #ffffff;
		display: inline-flex;
		font-size: calc(3 * var(--cqmin));
		font-weight: 600;
		gap: calc(1 * var(--cqmin));
		letter-spacing: 0.01em;
		line-height: 1;
		padding: calc(1.9 * var(--cqmin)) calc(3.4 * var(--cqmin));
		white-space: nowrap;
	}

	.yt-sub--light .yt-sub__pill--subscribed {
		background: #f2f2f2;
		color: #0f0f0f;
	}

	.yt-sub--dark .yt-sub__pill--subscribed {
		background: #3f3f3f;
		color: #f1f1f1;
	}

	.yt-sub__check {
		block-size: calc(2.8 * var(--cqmin));
		inline-size: calc(2.8 * var(--cqmin));
	}

	.yt-sub__ripple {
		background: #ff0000;
		border-radius: 50%;
		block-size: calc(6.5 * var(--cqmin));
		inline-size: calc(6.5 * var(--cqmin));
		inset-block-start: calc(50% - 3.25 * var(--cqmin));
		inset-inline-start: calc(50% - 3.25 * var(--cqmin));
		position: absolute;
	}

	.yt-sub__bell {
		block-size: calc(4.2 * var(--cqmin));
		display: inline-block;
		inline-size: calc(4.2 * var(--cqmin));
	}

	.yt-sub__bell svg {
		block-size: 100%;
		display: block;
		inline-size: 100%;
	}
</style>
