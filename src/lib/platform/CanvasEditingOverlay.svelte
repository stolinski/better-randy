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


	// ─── Drag state ──────────────────────────────────────────────────────────────

	interface DragState {
		overlayId: string;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	}

	let dragState: DragState | null = null;

	function onPointerDown(event: PointerEvent, overlay: Overlay): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectLayer(`overlay-${overlay.id}`);
		dragState = {
			overlayId: overlay.id,
			startX: event.clientX,
			startY: event.clientY,
			originX: overlay.position.offset?.x ?? 0,
			originY: overlay.position.offset?.y ?? 0
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
		if (!canvasRect || canvasRect.width === 0) return;
		// Offset is a normalized 0-1 fraction of composition size. Convert screen
		// pixel delta to normalized by dividing by the canvas's display dimensions.
		const dx = (event.clientX - dragState.startX) / canvasRect.width;
		const dy = (event.clientY - dragState.startY) / canvasRect.height;
		if (!overlay.position.offset) overlay.position.offset = { x: 0, y: 0 };
		overlay.position.offset.x = clampNumber(dragState.originX + dx, 0, 1);
		overlay.position.offset.y = clampNumber(dragState.originY + dy, 0, 1);
	}

	function onPointerUp(): void {
		dragState = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		}
	}


	onDestroy(() => {
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
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
					<div class="overlay-hit__handle overlay-hit__handle--nw" aria-hidden="true"></div>
					<div class="overlay-hit__handle overlay-hit__handle--ne" aria-hidden="true"></div>
					<div class="overlay-hit__handle overlay-hit__handle--sw" aria-hidden="true"></div>
					<div class="overlay-hit__handle overlay-hit__handle--se" aria-hidden="true"></div>
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

	.overlay-hit {
		box-sizing: border-box;
		cursor: move;
		outline: none;
		pointer-events: all;
		position: absolute;
		touch-action: none;
	}

	.overlay-hit:hover {
		outline: 1px solid rgba(255, 214, 8, 0.5);
	}

	.overlay-hit--selected {
		outline: 2px solid #FFD608;
	}

	.overlay-hit--selected:hover {
		outline: 2px solid #FFD608;
	}

	/* Corner scale handles */
	.overlay-hit__handle {
		background: #FFD608;
		block-size: 8px;
		inline-size: 8px;
		position: absolute;
	}

	.overlay-hit__handle--nw {
		inset-block-start: -4px;
		inset-inline-start: -4px;
	}

	.overlay-hit__handle--ne {
		inset-block-start: -4px;
		inset-inline-end: -4px;
	}

	.overlay-hit__handle--sw {
		inset-block-end: -4px;
		inset-inline-start: -4px;
	}

	.overlay-hit__handle--se {
		inset-block-end: -4px;
		inset-inline-end: -4px;
	}
</style>
