<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { requireCoreColor, resolveColorChannels } from '$lib/platform/packs/resolve';
	import { getVideoFrameSize } from '$lib/utils/video-frame';
	import type { CursorTrailContent, CursorPath } from './index';
	import { buildCursorSchedule, cursorAt } from './schedule';

	interface Props {
		content: CursorTrailContent;
	}

	let { content }: Props = $props();

	// The overlay root fills the composition (preset positions it normalized-rect
	// 0,0,1,1). Its getBoundingClientRect is the composition's rendered rect in
	// viewport px; slot rects (from getBoundingClientRect, also viewport px) are
	// converted into the composition's local CSS space (0..frame.width) through it.
	let overlayEl = $state<HTMLElement | null>(null);

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const progress = $derived(animState.globalProgress);

	// Resolve current path segment from the authored phase schedule (glide + dwell
	// per waypoint), so the cursor's clock honors the per-waypoint dwellMs/travelMs
	// instead of treating waypoints as equally spaced. During a dwell the cursor is
	// parked (from === to → velocity and trail collapse to zero). See schedule.ts.
	const schedule = $derived(buildCursorSchedule(content.path));
	const at = $derived(cursorAt(schedule, progress));
	const totalSteps = $derived(content.path.length);
	const fromIndex = $derived(at.fromIndex);
	const toIndex = $derived(at.toIndex);
	const local = $derived(at.localT);

	function findSlotPosition(slot: string): { x: number; y: number } | null {
		if (typeof window === 'undefined' || !overlayEl) return null;
		const el = document.querySelector(`[data-text-anim-slot="${slot}"]`);
		if (!el) return null;
		// Measure against the frame-sized `.composition` ancestor, NOT the overlay's
		// own root: the overlay mounts in an auto-sized (top-left anchored) wrapper,
		// so its `inset:0` root collapses to 0×0 and can't supply an origin/scale.
		// `.composition` is laid out at exactly frame.width CSS px (then display-
		// scaled), giving the stable origin the slot coords are projected through.
		// The absolutely-positioned pointer/trail still resolve against this same
		// origin, so the cursor lands on the slot.
		const root = overlayEl.closest('.composition');
		if (!root) return null;
		const rect = el.getBoundingClientRect();
		const origin = root.getBoundingClientRect();
		if (origin.width <= 0) return null;
		// Convert the slot's viewport-space centre into the composition's local
		// CSS coordinate space: subtract the composition origin, then undo the
		// display scale (composition is laid out at frame.width CSS px but shown
		// scaled). Without this the cursor lands off the captured canvas.
		const scale = frame.width / origin.width;
		return {
			x: (rect.left + rect.width * 0.5 - origin.left) * scale,
			y: (rect.top + rect.height * 0.5 - origin.top) * scale
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
	// length. The trail only exists during a glide phase (at.moving); a dwell
	// parks the cursor (from === to → zero displacement). A sin envelope over the
	// glide grows the trail out of the launch waypoint and reels it back into the
	// landing, so it eases in/out instead of popping to full length.
	const isMoving = $derived(at.moving);
	const glideEnvelope = $derived(isMoving ? Math.sin(Math.max(0, Math.min(1, local)) * Math.PI) : 0);
	const dx = $derived(toPos && fromPos ? toPos.x - fromPos.x : 0);
	const dy = $derived(toPos && fromPos ? toPos.y - fromPos.y : 0);
	const angleDeg = $derived((Math.atan2(dy, dx) * 180) / Math.PI);
	// Sizes are in composition CSS px (0..frame.width). A fixed 32 px pointer is
	// ~0.8% of a 4K frame — far too small to read as the hero. Scale the pointer
	// and trail to the frame so the cursor is a substantial focal element and
	// reflows H↔V. Trail length tracks velocity, capped to a frame fraction.
	const pointerSize = $derived(frame.width * 0.024);
	const trailWidth = $derived(frame.width * 0.005);
	const trailLengthPx = $derived(
		isMoving ? Math.min(frame.width * 0.14, Math.hypot(dx, dy) * 0.32) * glideEnvelope : 0
	);

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
		// The inner fallback chains to the Pack's mandatory core ink (ADR-0024)
		// instead of a literal — a Pack with no trailMaterial claim trails in
		// its own ink, never another Pack's colour.
		return {
			channels: resolveColorChannels(
				pack,
				'cursor-trail.trailMaterial',
				requireCoreColor(pack, 'ink-treatment')
			),
			softStop: `${Math.round(softness * 100)}%`
		};
	});
</script>

<aside
	bind:this={overlayEl}
	class="cursor-trail-overlay"
	data-overlay="cursor-trail"
	style:--cursor-x={`${cursorX}px`}
	style:--cursor-y={`${cursorY}px`}
	style:--trail-angle={`${angleDeg}deg`}
	style:--trail-length={`${trailLengthPx}px`}
	style:--trail-width={`${trailWidth}px`}
	style:--pointer-size={`${pointerSize}px`}
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
		{:else if pointerKind === 'block-cursor'}
			<!-- Terminal block cursor (▮): a hard-edged phosphor rect. Rides the
			     Pack's trail-material channels so pointer and persistence trail
			     share one phosphor; crispEdges keeps the pixel-hard boundary. -->
			<svg viewBox="0 0 24 24" width="32" height="32" shape-rendering="crispEdges">
				<rect x="5" y="3" width="14" height="18" fill="rgb(var(--trail-rgb))" />
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
		block-size: var(--pointer-size, 32px);
		filter: drop-shadow(0 0.18em 0.28em rgba(0, 0, 0, 0.55));
		inline-size: var(--pointer-size, 32px);
		inset-block-start: var(--cursor-y);
		inset-inline-start: var(--cursor-x);
		position: absolute;
	}

	.cursor-trail-overlay__pointer :global(svg) {
		block-size: 100%;
		display: block;
		inline-size: 100%;
	}

	/* An emissive pack's block cursor casts no shadow — depth is glow, and a
	   drop shadow under a screen element is a pack bug by definition (CSS
	   filters also drop out of the HTML-in-Canvas capture). */
	.cursor-trail-overlay__pointer[data-pointer='block-cursor'] {
		filter: none;
	}

	/*
	 * Velocity-anisotropic trail — rotated to align with the motion vector;
	 * length scales with velocity; gradient falloff implies the trail is
	 * "behind" the cursor along the motion direction.
	 */
	.cursor-trail-overlay__trail {
		/* --trail-rgb is always set inline by the script's Pack channel
		   resolution above — no literal channel fallback. */
		background: linear-gradient(
			to left,
			rgb(var(--trail-rgb) / 0.65) 0%,
			rgb(var(--trail-rgb) / 0.2) var(--trail-soft, 40%),
			rgb(var(--trail-rgb) / 0) 100%
		);
		block-size: var(--trail-width, 6px);
		inline-size: var(--trail-length);
		inset-block-start: var(--cursor-y);
		inset-inline-start: var(--cursor-x);
		position: absolute;
		transform-origin: 0 50%;
		transform: rotate(calc(var(--trail-angle) + 180deg)) translateY(-50%);
		opacity: 0.85;
	}
</style>
