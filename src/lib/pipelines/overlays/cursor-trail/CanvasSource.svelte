<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { resolveColorChannels } from '$lib/platform/packs/resolve';
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

	// Pointer shape — resolved from the active Pack's cursor-trail.pointer Role
	// (the pointer asset is appearance, the Pack's job, not overlay content, per
	// ADR-0023). The four shapes in the template are the intrinsic vocabulary;
	// the Pack picks which one.
	const pointerKind = $derived.by(() => {
		const role = getPack(packState.slug).roles['cursor-trail.pointer'];
		return role?.kind === 'style' && typeof role.value === 'string' ? role.value : 'mac-pointer';
	});

	// Trail material — resolved from the active Pack's cursor-trail.trailMaterial
	// Role. The trail is one colour composed at several alphas along the velocity
	// fade, so the colour is carried as an rgb-channel var (resolveColorChannels)
	// and `rgb(var(--trail-rgb) / <a>)` sets each stop; `softness` (0..1) drives
	// the gradient falloff midpoint.
	const trail = $derived.by(() => {
		const pack = getPack(packState.slug);
		const role = pack.roles['cursor-trail.trailMaterial'];
		const material =
			role?.kind === 'style' && role.value !== null && typeof role.value === 'object'
				? (role.value as { softness?: number })
				: null;
		const softness = typeof material?.softness === 'number' ? material.softness : 0.35;
		return {
			channels: resolveColorChannels(pack, 'cursor-trail.trailMaterial', '#ffffff'),
			softStop: `${Math.round(softness * 100)}%`
		};
	});
</script>

<aside
	class="cursor-trail-overlay"
	data-overlay="cursor-trail"
	style:--cursor-x={`${cursorX}px`}
	style:--cursor-y={`${cursorY}px`}
	style:--trail-angle={`${angleDeg}deg`}
	style:--trail-length={`${trailLengthPx}px`}
	style:--trail-rgb={trail.channels}
	style:--trail-soft={trail.softStop}
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
			rgb(var(--trail-rgb, 255 255 255) / 0.65) 0%,
			rgb(var(--trail-rgb, 255 255 255) / 0.2) var(--trail-soft, 40%),
			rgb(var(--trail-rgb, 255 255 255) / 0) 100%
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
