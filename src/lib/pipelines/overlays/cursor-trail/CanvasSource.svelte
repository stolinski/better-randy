<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { CursorTrailContent, CursorPath } from './index';

	interface Props {
		content: CursorTrailContent;
	}

	let { content }: Props = $props();

	const progress = $derived(animState.globalProgress);

	// Resolve current path segment. Path is an array of { targetSlot, dwellMs,
	// action }; we treat them as equally spaced waypoints across the timeline
	// for v1 — the dwellMs is used only as a duration hint for the visual
	// hold.
	const totalSteps = $derived(content.path.length);
	const segmentProgress = $derived(progress * Math.max(1, totalSteps - 1));
	const fromIndex = $derived(Math.floor(segmentProgress));
	const toIndex = $derived(Math.min(totalSteps - 1, fromIndex + 1));
	const local = $derived(segmentProgress - fromIndex);

	function findSlotPosition(slot: string): { x: number; y: number } | null {
		if (typeof window === 'undefined') return null;
		const el = document.querySelector(`[data-text-anim-slot="${slot}"]`);
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return {
			x: rect.left + rect.width * 0.5,
			y: rect.top + rect.height * 0.5
		};
	}

	function easeInOut(t: number): number {
		return t * t * (3 - 2 * t);
	}

	const fromTarget: CursorPath | undefined = $derived(content.path[fromIndex]);
	const toTarget: CursorPath | undefined = $derived(content.path[toIndex]);

	// Resolve named slot positions to pixel coords. We re-resolve every frame
	// (cheap querySelector) so layout changes during text-animations are
	// tracked.
	const fromPos = $derived(fromTarget ? findSlotPosition(fromTarget.targetSlot) : null);
	const toPos = $derived(toTarget ? findSlotPosition(toTarget.targetSlot) : null);

	const tEased = $derived(easeInOut(local));
	const cursorX = $derived(fromPos && toPos ? fromPos.x + (toPos.x - fromPos.x) * tEased : 0);
	const cursorY = $derived(fromPos && toPos ? fromPos.y + (toPos.y - fromPos.y) * tEased : 0);

	// Velocity (Δposition per progress unit) — drives trail orientation +
	// length. While dwelling (local < dwellThreshold near 0 or 1), velocity
	// collapses to zero.
	const dwellThreshold = 0.12;
	const isMoving = $derived(local > dwellThreshold && local < 1 - dwellThreshold);
	const dx = $derived(toPos && fromPos ? toPos.x - fromPos.x : 0);
	const dy = $derived(toPos && fromPos ? toPos.y - fromPos.y : 0);
	const angleDeg = $derived((Math.atan2(dy, dx) * 180) / Math.PI);
	const trailLengthPx = $derived(isMoving ? Math.min(140, Math.hypot(dx, dy) * 0.3) : 0);

	// Pointer shape — resolved by the active Pack via cursor-trail.pointer.
	// For v1 we render the syntax-Pack default (a small mac-style pointer
	// triangle) directly here; Pack-aware resolution lands in a follow-up.
	const pointerKind = $derived(content.pointer ?? 'mac-pointer');
</script>

<aside
	class="cursor-trail-overlay"
	data-overlay="cursor-trail"
	style:--cursor-x={`${cursorX}px`}
	style:--cursor-y={`${cursorY}px`}
	style:--trail-angle={`${angleDeg}deg`}
	style:--trail-length={`${trailLengthPx}px`}
>
	<div class="cursor-trail-overlay__trail" aria-hidden="true"></div>
	<div class="cursor-trail-overlay__pointer" data-pointer={pointerKind} aria-hidden="true">
		{#if pointerKind === 'mac-pointer'}
			<svg viewBox="0 0 24 24" width="32" height="32">
				<path d="M2 2 L2 22 L8 16 L12 22 L14 21 L10 15 L18 15 Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round" />
			</svg>
		{:else if pointerKind === 'arrow'}
			<svg viewBox="0 0 24 24" width="28" height="28">
				<path d="M3 12 L21 12 M14 5 L21 12 L14 19" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
			</svg>
		{:else if pointerKind === 'crosshair'}
			<svg viewBox="0 0 24 24" width="28" height="28">
				<circle cx="12" cy="12" r="8" stroke="white" stroke-width="2" fill="none" />
				<path d="M12 4 L12 20 M4 12 L20 12" stroke="white" stroke-width="2" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="32" height="32">
				<path d="M12 22 L12 8 M8 12 L12 8 L16 12 M8 18 L8 12 L16 12 L16 18" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
			</svg>
		{/if}
	</div>
</aside>

<style>
	.cursor-trail-overlay {
		inset: 0;
		pointer-events: none;
		position: absolute;
		z-index: 90; /* Per-Layer default z = 0.9 per ADR-0021 */
	}

	.cursor-trail-overlay__pointer {
		inset-block-start: var(--cursor-y);
		inset-inline-start: var(--cursor-x);
		position: absolute;
		transform: translate(-2px, -2px);
	}

	/*
	 * Velocity-anisotropic trail — rotated to align with the motion vector;
	 * length scales with velocity; gradient falloff implies the trail is
	 * "behind" the cursor along the motion direction.
	 */
	.cursor-trail-overlay__trail {
		background: linear-gradient(
			to left,
			rgba(255, 255, 255, 0.65) 0%,
			rgba(255, 255, 255, 0.2) 40%,
			rgba(255, 255, 255, 0) 100%
		);
		block-size: 6px;
		inline-size: var(--trail-length);
		inset-block-start: var(--cursor-y);
		inset-inline-start: var(--cursor-x);
		position: absolute;
		transform-origin: 0 50%;
		transform: rotate(calc(var(--trail-angle) + 180deg)) translateY(-3px);
		opacity: 0.85;
	}
</style>
