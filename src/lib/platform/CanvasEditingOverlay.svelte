<script lang="ts">
	import { onDestroy } from 'svelte';

	import { engineState } from './engine-state.svelte';
	import { layerSelection, selectLayer, deselectLayer } from './selection.svelte';
	import { clampNumber } from '$lib/utils/math';
	import type { Overlay } from './engine-schema';

	interface Props {
		compositionElement: HTMLElement | null;
		canvas: HTMLCanvasElement | null;
		compositionSize: { width: number; height: number };
	}

	let { compositionElement, canvas, compositionSize }: Props = $props();

	let rootEl = $state<HTMLDivElement | null>(null);

	// ─── Coordinate helpers ──────────────────────────────────────────────────────

	function getOverlayEl(overlay: Overlay): HTMLElement | null {
		return compositionElement?.querySelector<HTMLElement>(`[data-overlay-id="${overlay.id}"]`) ?? null;
	}

	// The composition DOM is full 4K CSS size (3840×2160). The WebGPU canvas is
	// displayed at a much smaller size. To position hit regions in the editing
	// overlay (which spans the canvas section), we must project from the 4K DOM
	// coordinate space into the canvas display coordinate space.
	//
	// Steps:
	//   1. Get the overlay element's rect in 4K DOM space (viewport-relative).
	//   2. Compute its offset from the composition element's top-left.
	//   3. Scale that offset by (canvasDisplay / comp4K) to get canvas-space coords.
	//   4. Add the canvas element's position within the editing overlay root.
	function overlayRelRect(overlay: Overlay): { left: number; top: number; width: number; height: number } | null {
		// Subscribe to the overlay's position so the hit box re-measures after a drag
		// or inspector edit moves it — getBoundingClientRect itself isn't reactive, so
		// without these reads the box would stick to the overlay's original spot.
		void overlay.position.anchor;
		void overlay.position.offset?.x;
		void overlay.position.offset?.y;
		void overlay.position.rect?.x;
		void overlay.position.rect?.y;
		void overlay.position.scale;
		const rootRect = rootEl?.getBoundingClientRect();
		const canvasRect = canvas?.getBoundingClientRect();
		const compRect = compositionElement?.getBoundingClientRect();
		if (!rootRect || !canvasRect || !compRect || canvasRect.width === 0 || compRect.width === 0) return null;
		const el = getOverlayEl(overlay);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		const scale = canvasRect.width / compRect.width;
		const dx = (r.left - compRect.left) * scale;
		const dy = (r.top - compRect.top) * scale;
		return {
			left: canvasRect.left - rootRect.left + dx,
			top: canvasRect.top - rootRect.top + dy,
			width: r.width * scale,
			height: r.height * scale
		};
	}


	// The overlay's current top-left, as a 0..1 fraction of the composition. Used
	// to seed a `center` overlay's conversion to free placement on drag (so it
	// doesn't jump) — `center` ignores `offset`, so it can't be nudged in place.
	function measureTopLeftFrac(overlay: Overlay): { x: number; y: number } | null {
		const el = getOverlayEl(overlay);
		const compRect = compositionElement?.getBoundingClientRect();
		if (!el || !compRect || compRect.width === 0 || compRect.height === 0) return null;
		const r = el.getBoundingClientRect();
		return {
			x: (r.left - compRect.left) / compRect.width,
			y: (r.top - compRect.top) / compRect.height
		};
	}

	// ─── Drag state ──────────────────────────────────────────────────────────────

	interface DragState {
		overlayId: string;
		startX: number;
		startY: number;
		/** Which representation the drag writes: `offset` (edge-anchored) or `rect`
		 *  (normalized-rect). */
		mode: 'offset' | 'rect';
		/** Origin value in the active representation (offset.x / rect.x …). */
		originX: number;
		originY: number;
		/** A `center`-anchored overlay converts to free `top-left` placement on the
		 *  first real move; this seeds the post-conversion origin. */
		convertCenter: boolean;
		moved: boolean;
	}

	let dragState: DragState | null = null;

	function onPointerDown(event: PointerEvent, overlay: Overlay): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectLayer(`overlay-${overlay.id}`);
		const pos = overlay.position;
		const isRect = pos.anchor === 'normalized-rect';
		const measured = measureTopLeftFrac(overlay);
		const convertCenter = pos.anchor === 'center' && measured !== null;
		dragState = {
			overlayId: overlay.id,
			startX: event.clientX,
			startY: event.clientY,
			mode: isRect ? 'rect' : 'offset',
			// For a center overlay we seed from the measured top-left so the post-
			// conversion top-left anchor keeps the same on-screen position.
			originX: isRect ? (pos.rect?.x ?? 0) : convertCenter ? measured!.x : (pos.offset?.x ?? 0),
			originY: isRect ? (pos.rect?.y ?? 0) : convertCenter ? measured!.y : (pos.offset?.y ?? 0),
			convertCenter,
			moved: false
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('pointermove', onPointerMove);
			window.addEventListener('pointerup', onPointerUp);
		}
	}

	function onPointerMove(event: PointerEvent): void {
		if (!dragState) return;
		const overlay = engineState.overlays.find((o) => o.id === dragState!.overlayId);
		if (!overlay) return;
		const canvasRect = canvas?.getBoundingClientRect();
		if (!canvasRect || canvasRect.width === 0 || canvasRect.height === 0) return;
		// Screen-pixel delta → fraction of the composition (offset.x is a fraction of
		// inline-size, offset.y of block-size). The canvas display size maps 1:1 to
		// the composition, so the displayed delta IS the fraction.
		const dx = (event.clientX - dragState.startX) / canvasRect.width;
		const dy = (event.clientY - dragState.startY) / canvasRect.height;

		// Ignore sub-pixel jitter so a plain click doesn't count as a drag (and so a
		// center overlay isn't reanchored just by selecting it).
		if (!dragState.moved) {
			if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;
			dragState.moved = true;
			if (dragState.convertCenter) overlay.position.anchor = 'top-left';
		}

		const pos = overlay.position;
		if (dragState.mode === 'rect') {
			if (!pos.rect) return;
			pos.rect.x = clampNumber(dragState.originX + dx, 0, 1);
			pos.rect.y = clampNumber(dragState.originY + dy, 0, 1);
			return;
		}

		// Offset is an INSET from the anchor edge: `right`/`bottom` anchors map to CSS
		// right/bottom, so moving toward the far edge DECREASES the offset. Sign the
		// delta per anchor edge so the overlay tracks the cursor.
		if (!pos.offset) pos.offset = { x: 0, y: 0 };
		const horizSign = pos.anchor.endsWith('right') ? -1 : 1;
		const vertSign = pos.anchor.startsWith('bottom') ? -1 : 1;
		pos.offset.x = clampNumber(dragState.originX + horizSign * dx, 0, 1);
		pos.offset.y = clampNumber(dragState.originY + vertSign * dy, 0, 1);
	}

	function onPointerUp(): void {
		dragState = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		}
	}

	// ─── Scale state ───────────────────────────────────────────────────────────────
	// Uniform scale about the anchor point. The anchor's transform-origin corner
	// stays fixed in screen space as the overlay scales, so a corner handle's
	// distance from that point is a direct measure of scale: drag it out → bigger.

	interface ScaleState {
		overlayId: string;
		/** The fixed anchor point in client px (the overlay's transform-origin corner). */
		anchorX: number;
		anchorY: number;
		/** Distance anchor→grabbed-corner at drag start; the scale denominator. */
		d0: number;
		scaleOrigin: number;
	}

	let scaleState: ScaleState | null = null;

	/** Corner of the overlay box that an anchor pins (matches OverlayMount's
	 *  anchorOrigin); the scale grows from there. */
	function anchorPoint(
		anchor: Overlay['position']['anchor'],
		rect: DOMRect
	): { x: number; y: number } {
		const x =
			anchor === 'normalized-rect' || anchor.endsWith('left')
				? rect.left
				: anchor.endsWith('right')
					? rect.right
					: rect.left + rect.width / 2;
		const y =
			anchor === 'normalized-rect' || anchor.startsWith('top')
				? rect.top
				: anchor.startsWith('bottom')
					? rect.bottom
					: rect.top + rect.height / 2;
		return { x, y };
	}

	function onScaleStart(event: PointerEvent, overlay: Overlay): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectLayer(`overlay-${overlay.id}`);
		// Anchor point must be in the SAME space as the pointer (client/display px).
		// The hit box is already projected into display space; the overlay DOM element
		// is in the composition's native-4K space, so measure the hit box, not the el.
		const hitEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('.overlay-hit');
		if (!hitEl) return;
		const { x: anchorX, y: anchorY } = anchorPoint(
			overlay.position.anchor,
			hitEl.getBoundingClientRect()
		);
		const d0 = Math.hypot(event.clientX - anchorX, event.clientY - anchorY);
		if (d0 < 4) return; // grabbed essentially at the anchor — no scale axis
		scaleState = {
			overlayId: overlay.id,
			anchorX,
			anchorY,
			d0,
			scaleOrigin: overlay.position.scale ?? 1
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('pointermove', onScaleMove);
			window.addEventListener('pointerup', onScaleEnd);
		}
	}

	function onScaleMove(event: PointerEvent): void {
		if (!scaleState) return;
		const overlay = engineState.overlays.find((o) => o.id === scaleState!.overlayId);
		if (!overlay) return;
		const d1 = Math.hypot(event.clientX - scaleState.anchorX, event.clientY - scaleState.anchorY);
		overlay.position.scale = clampNumber((scaleState.scaleOrigin * d1) / scaleState.d0, 0.1, 8);
	}

	function onScaleEnd(): void {
		scaleState = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onScaleMove);
			window.removeEventListener('pointerup', onScaleEnd);
		}
	}

	// A corner handle is shown only when it isn't pinned by the anchor — the anchor
	// corner can't scale (it's the fixed point), so we hide that one and keep every
	// visible handle functional. Center / edge / normalized-rect pin no corner.
	function showHandle(corner: 'nw' | 'ne' | 'sw' | 'se', anchor: string): boolean {
		const pinned: Record<string, string> = {
			'top-left': 'nw',
			'top-right': 'ne',
			'bottom-left': 'sw',
			'bottom-right': 'se'
		};
		return pinned[anchor] !== corner;
	}


	onDestroy(() => {
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointermove', onScaleMove);
		window.removeEventListener('pointerup', onScaleEnd);
	});
</script>

<!-- Positioned over the canvas by Workspace; pointer-events only where overlays are -->
<div
	bind:this={rootEl}
	class="canvas-editing-overlay"
	role="presentation"
>
	<!-- Full-area backdrop: pointer-events catch clicks on blank canvas → deselect -->
	<div
		class="canvas-editing-overlay__backdrop"
		onpointerdown={deselectLayer}
		role="presentation"
		aria-hidden="true"
	></div>
	{#each engineState.overlays as overlay (overlay.id)}
		{@const rect = overlayRelRect(overlay)}
		{#if rect && rect.width > 0}
			{@const isSelected = layerSelection.id === `overlay-${overlay.id}`}
			<div
				class="overlay-hit"
				class:overlay-hit--selected={isSelected}
				onpointerdown={(e) => onPointerDown(e, overlay)}
				role="button"
				tabindex="0"
				onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectLayer(`overlay-${overlay.id}`); }}
				style:left="{rect.left}px"
				style:top="{rect.top}px"
				style:width="{rect.width}px"
				style:height="{rect.height}px"
			>
				{#if isSelected}
					{#if showHandle('nw', overlay.position.anchor)}
						<button
							class="overlay-hit__handle overlay-hit__handle--nw"
							type="button"
							aria-label="Scale {overlay.type}"
							onpointerdown={(e) => onScaleStart(e, overlay)}
						></button>
					{/if}
					{#if showHandle('ne', overlay.position.anchor)}
						<button
							class="overlay-hit__handle overlay-hit__handle--ne"
							type="button"
							aria-label="Scale {overlay.type}"
							onpointerdown={(e) => onScaleStart(e, overlay)}
						></button>
					{/if}
					{#if showHandle('sw', overlay.position.anchor)}
						<button
							class="overlay-hit__handle overlay-hit__handle--sw"
							type="button"
							aria-label="Scale {overlay.type}"
							onpointerdown={(e) => onScaleStart(e, overlay)}
						></button>
					{/if}
					{#if showHandle('se', overlay.position.anchor)}
						<button
							class="overlay-hit__handle overlay-hit__handle--se"
							type="button"
							aria-label="Scale {overlay.type}"
							onpointerdown={(e) => onScaleStart(e, overlay)}
						></button>
					{/if}
				{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	.canvas-editing-overlay {
		inset: 0;
		pointer-events: none;
		position: absolute;
	}

	.canvas-editing-overlay__backdrop {
		inset: 0;
		pointer-events: all;
		position: absolute;
	}

	/* Draggable affordance: overlays are liftable objects, so they show a `grab`
	   cursor and reveal a hover ring on mouse-over. The surface (no hit region)
	   shows neither — the absence of an affordance signals "base layer, not
	   spatially draggable; edit it in the inspector". Reveal-on-hover keeps the
	   canvas clean (no permanent chrome) while making manipulable layers obvious. */
	.overlay-hit {
		box-sizing: border-box;
		cursor: grab;
		outline: none;
		outline-offset: -1px;
		pointer-events: all;
		position: absolute;
		touch-action: none;
	}

	.overlay-hit:active {
		cursor: grabbing;
	}

	.overlay-hit:hover {
		outline: 1.5px solid rgba(255, 214, 8, 0.7);
	}

	.overlay-hit--selected,
	.overlay-hit--selected:hover {
		outline: 2px solid #ffd608;
	}

	/* Corner scale handles — drag to scale the overlay uniformly about its anchor. */
	.overlay-hit__handle {
		background: #ffd608;
		block-size: 10px;
		border: 1px solid rgba(0, 0, 0, 0.5);
		border-radius: 1px;
		box-sizing: border-box;
		inline-size: 10px;
		padding: 0;
		pointer-events: all;
		position: absolute;
		touch-action: none;
	}

	.overlay-hit__handle--nw {
		cursor: nwse-resize;
		inset-block-start: -5px;
		inset-inline-start: -5px;
	}

	.overlay-hit__handle--ne {
		cursor: nesw-resize;
		inset-block-start: -5px;
		inset-inline-end: -5px;
	}

	.overlay-hit__handle--sw {
		cursor: nesw-resize;
		inset-block-end: -5px;
		inset-inline-start: -5px;
	}

	.overlay-hit__handle--se {
		cursor: nwse-resize;
		inset-block-end: -5px;
		inset-inline-end: -5px;
	}
</style>
