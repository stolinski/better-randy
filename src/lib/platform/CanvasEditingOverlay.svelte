<script lang="ts">
	import { onDestroy } from 'svelte';

	import { animState } from './anim-state.svelte';
	import {
		CANVAS_ROTATION_HANDLE_DESCRIPTOR,
		canvasOverlayScaleHandleDescriptors,
		canvasSelectionStackIndex,
		createCanvasHandleGeometry,
		createCanvasInteractionGeometryContract,
		type CanvasInteractionGeometryContract,
		type CanvasInteractionRect
	} from './canvas-interaction-geometry';
	import { engineState } from './engine-state.svelte';
	import { createStageProjector, type StagePlane } from './pipelines/depth-stage-camera';
	import {
		layerSelection,
		selectLayer,
		deselectLayer,
		requestInspectorFocus
	} from './selection.svelte';
	import { createTimelineTrackId, type TimelineTrackIdentity } from './timeline-entity-identity';
	import { resolveDiagramPrimitiveGeometry } from '$lib/utils/diagram-geometry';
	import { clampNumber } from '$lib/utils/math';
	import { resolveOverlayPlacement } from '$lib/utils/overlay-placement';
	import type {
		ChatMessage,
		ChecklistItem,
		DiagramPrimitive,
		Overlay,
		OverlayPlacement
	} from './engine-schema';

	interface Props {
		compositionElement: HTMLElement | null;
		/** The hoisted Overlay-root sibling while the plane split is on (DOF /
		 *  depth stage / owned surface opacity) — overlays live there, not in
		 *  `compositionElement`. Null on the flat path (overlays inline). */
		overlayRootElement?: HTMLElement | null;
		canvas: HTMLCanvasElement | null;
		compositionSize: { width: number; height: number };
		/** Display zoom; pan is only active when zoomed in (> 1). */
		zoom?: number;
		panX?: number;
		panY?: number;
		onPan?: (x: number, y: number) => void;
		onPanStart?: () => void;
		onPanEnd?: () => void;
	}

	let {
		compositionElement,
		overlayRootElement = null,
		canvas,
		compositionSize,
		zoom = 1,
		panX = 0,
		panY = 0,
		onPan,
		onPanStart,
		onPanEnd
	}: Props = $props();

	let rootEl = $state<HTMLDivElement | null>(null);

	function isTrackSelected(identity: TimelineTrackIdentity): boolean {
		return layerSelection.id === createTimelineTrackId(identity);
	}

	// ─── Coordinate helpers ──────────────────────────────────────────────────────

	function getOverlayEl(overlay: Overlay): HTMLElement | null {
		const selector = `[data-overlay-id="${overlay.id}"]`;
		return (
			overlayRootElement?.querySelector<HTMLElement>(selector) ??
			compositionElement?.querySelector<HTMLElement>(selector) ??
			null
		);
	}

	// Depth-stage projection (m182h9gp): when the composition declares a depth
	// stage, the rendered pixels are the captured planes reprojected through the
	// stage's perspective camera — a flat DOM box no longer lands where its
	// pixels are. The projector rebuilds the renderer's exact camera (shared
	// math in depth-stage-camera.ts) from the same state resolveStage feeds it,
	// so hit boxes project forward and pointer drags ray-cast back onto the
	// element's plane. Surface content rides the surface plane; overlays ride
	// the hoisted overlay plane at their ADR-0021 z. Reading globalProgress
	// keeps every projected box tracking the camera move with the playhead.
	const stageProjector = $derived.by(() => {
		const stage = engineState.stage;
		if (!stage || stage.type !== 'depth') return null;
		if (compositionSize.width === 0 || compositionSize.height === 0) return null;
		return createStageProjector({
			aspect: compositionSize.width / compositionSize.height,
			cameraMove: stage.camera.move,
			cameraAmount: clampNumber(stage.camera.amount, 0, 1),
			overlayZ: clampNumber(engineState.overlays[0]?.z ?? 0.7, 0, 1),
			time: clampNumber(animState.globalProgress, 0, 1)
		});
	});

	function canvasInteractionRect(rect: DOMRect): CanvasInteractionRect {
		return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
	}

	// Read current browser measurements at the gesture/paint boundary. CSS zoom
	// and pan are already reflected by the canvas rect; the shared contract keeps
	// those screen pixels separate from normalized/native persistence geometry.
	function currentCanvasInteractionGeometry(): CanvasInteractionGeometryContract | null {
		const editorRect = rootEl?.getBoundingClientRect();
		const canvasRect = canvas?.getBoundingClientRect();
		const compositionRect = compositionElement?.getBoundingClientRect();
		if (!editorRect || !canvasRect || !compositionRect) return null;
		return createCanvasInteractionGeometryContract({
			editorBounds: canvasInteractionRect(editorRect),
			canvasBounds: canvasInteractionRect(canvasRect),
			compositionDomBounds: canvasInteractionRect(compositionRect),
			compositionSize,
			projector: stageProjector
		});
	}

	function projectRect(
		el: HTMLElement,
		plane: StagePlane = 'surface'
	): CanvasInteractionRect | null {
		return (
			currentCanvasInteractionGeometry()?.renderedBoundsFor(
				canvasInteractionRect(el.getBoundingClientRect()),
				plane
			)?.editorBounds ?? null
		);
	}

	// Pointer → normalized composition coordinate on an element's plane. The
	// contract also derives native coordinates for consumers that need them;
	// authored overlay/diagram placement persists normalized values.
	function pointerToComp(
		clientX: number,
		clientY: number,
		plane: StagePlane
	): { x: number; y: number } | null {
		return (
			currentCanvasInteractionGeometry()?.screenPointToComposition(
				{ x: clientX, y: clientY },
				plane
			)?.normalized ?? null
		);
	}

	function overlayRelRect(
		overlay: Overlay
	): { left: number; top: number; width: number; height: number } | null {
		// Subscribe to the overlay's position so the hit box re-measures after a drag
		// or inspector edit moves it — getBoundingClientRect itself isn't reactive, so
		// without these reads the box would stick to the overlay's original spot.
		const placement = resolveOverlayPlacement(overlay.position, engineState.transport.orientation);
		void placement.anchor;
		void placement.offset?.x;
		void placement.offset?.y;
		void placement.rect?.x;
		void placement.rect?.y;
		void placement.rect?.width;
		void placement.rect?.height;
		void placement.scale;
		void placement.rotation;
		const el = getOverlayEl(overlay);
		if (!el) return null;
		return projectRect(el, 'overlay');
	}

	// The overlay's current top-left, as a 0..1 fraction of the composition. Used
	// to seed a `center` overlay's conversion to free placement on drag (so it
	// doesn't jump) — `center` ignores `offset`, so it can't be nudged in place.
	function measureTopLeftFrac(overlay: Overlay): { x: number; y: number } | null {
		const el = getOverlayEl(overlay);
		if (!el) return null;
		const bounds = currentCanvasInteractionGeometry()?.renderedBoundsFor(
			canvasInteractionRect(el.getBoundingClientRect()),
			'overlay'
		)?.compositionBounds.normalized;
		return bounds ? { x: bounds.left, y: bounds.top } : null;
	}

	// ─── Drag state ──────────────────────────────────────────────────────────────

	interface DragState {
		overlayId: string;
		/** Drag origin in composition fractions (ray-cast onto the overlay plane). */
		startCompX: number;
		startCompY: number;
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
		selectLayer(createTimelineTrackId({ kind: 'overlay', overlayId: overlay.id }));
		const pos = resolveOverlayPlacement(overlay.position, engineState.transport.orientation);
		const isRect = pos.anchor === 'normalized-rect';
		const measured = measureTopLeftFrac(overlay);
		// Centre-family anchors ignore `offset` on their centred axis, so a drag
		// converts them to free `top-left` placement (seeded from the measured
		// position so nothing jumps) — full `center` and the x-centred
		// `top-center`/`bottom-center` alike.
		const convertCenter =
			(pos.anchor === 'center' || pos.anchor === 'top-center' || pos.anchor === 'bottom-center') &&
			measured !== null;
		const startComp = pointerToComp(event.clientX, event.clientY, 'overlay');
		if (!startComp) return;
		dragState = {
			overlayId: overlay.id,
			startCompX: startComp.x,
			startCompY: startComp.y,
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
		// Pointer → composition-fraction delta (offset.x is a fraction of
		// inline-size, offset.y of block-size), ray-cast onto the overlay's plane
		// so the drag tracks the reprojected pixels when the stage is on.
		const comp = pointerToComp(event.clientX, event.clientY, 'overlay');
		if (!comp) return;
		const dx = comp.x - dragState.startCompX;
		const dy = comp.y - dragState.startCompY;
		const pos = resolveOverlayPlacement(overlay.position, engineState.transport.orientation);

		// Ignore sub-pixel jitter so a plain click doesn't count as a drag (and so a
		// center overlay isn't reanchored just by selecting it).
		if (!dragState.moved) {
			if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;
			dragState.moved = true;
			if (dragState.convertCenter) {
				pos.anchor = 'top-left';
			}
		}

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
		anchor: OverlayPlacement['anchor'],
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
		selectLayer(createTimelineTrackId({ kind: 'overlay', overlayId: overlay.id }));
		// Anchor point must be in the SAME space as the pointer (client/display px).
		// The hit box is already projected into display space; the overlay DOM element
		// is in the composition's native-4K space, so measure the hit box, not the el.
		const hitEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('.overlay-hit');
		if (!hitEl) return;
		const placement = resolveOverlayPlacement(overlay.position, engineState.transport.orientation);
		const { x: anchorX, y: anchorY } = anchorPoint(placement.anchor, hitEl.getBoundingClientRect());
		const d0 = Math.hypot(event.clientX - anchorX, event.clientY - anchorY);
		if (d0 < 4) return; // grabbed essentially at the anchor — no scale axis
		scaleState = {
			overlayId: overlay.id,
			anchorX,
			anchorY,
			d0,
			scaleOrigin: placement.scale ?? 1
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
		resolveOverlayPlacement(overlay.position, engineState.transport.orientation).scale =
			clampNumber((scaleState.scaleOrigin * d1) / scaleState.d0, 0.1, 8);
	}

	function onScaleEnd(): void {
		scaleState = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onScaleMove);
			window.removeEventListener('pointerup', onScaleEnd);
		}
	}

	// ─── Rotate state (ADR-0035; absorbs 5vcak6og) ───────────────────────────────
	// Static rotation about the anchor point, mirroring the scale handles: the
	// handle's angle around the transform-origin is a direct read of rotation.

	interface RotateState {
		overlayId: string;
		anchorX: number;
		anchorY: number;
		/** Pointer angle (deg) around the anchor at drag start. */
		angle0: number;
		rotationOrigin: number;
	}

	let rotateState: RotateState | null = null;

	function pointerAngle(event: PointerEvent, anchorX: number, anchorY: number): number {
		return (Math.atan2(event.clientY - anchorY, event.clientX - anchorX) * 180) / Math.PI;
	}

	function onRotateStart(event: PointerEvent, overlay: Overlay): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectLayer(createTimelineTrackId({ kind: 'overlay', overlayId: overlay.id }));
		const hitEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('.overlay-hit');
		if (!hitEl) return;
		const placement = resolveOverlayPlacement(overlay.position, engineState.transport.orientation);
		const { x: anchorX, y: anchorY } = anchorPoint(placement.anchor, hitEl.getBoundingClientRect());
		rotateState = {
			overlayId: overlay.id,
			anchorX,
			anchorY,
			angle0: pointerAngle(event, anchorX, anchorY),
			rotationOrigin: placement.rotation ?? 0
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('pointermove', onRotateMove);
			window.addEventListener('pointerup', onRotateEnd);
		}
	}

	function onRotateMove(event: PointerEvent): void {
		if (!rotateState) return;
		const overlay = engineState.overlays.find((o) => o.id === rotateState!.overlayId);
		if (!overlay) return;
		let delta = pointerAngle(event, rotateState.anchorX, rotateState.anchorY) - rotateState.angle0;
		// Take the short way around so crossing the ±180° seam doesn't jump.
		if (delta > 180) delta -= 360;
		if (delta < -180) delta += 360;
		resolveOverlayPlacement(overlay.position, engineState.transport.orientation).rotation =
			clampNumber(rotateState.rotationOrigin + delta, -360, 360);
	}

	function onRotateEnd(): void {
		rotateState = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onRotateMove);
			window.removeEventListener('pointerup', onRotateEnd);
		}
	}

	// ─── Diagram primitive Blocks (ADR-0036): click-select + drag placement ─────
	// Explicit placement IS the authoring model — the canvas drag writes the
	// primitive's composition-fraction position directly (a segment translates
	// both endpoints as one span). Edges have no DOM box; they re-route live as
	// their nodes move and are selected/edited from the timeline + inspector.

	const diagramPrimitiveDraggables = $derived(
		(engineState.surface.diagram ?? []).filter((primitive) => primitive.type !== 'edge-arrow')
	);

	function blockRelRect(
		primitive: DiagramPrimitive
	): { left: number; top: number; width: number; height: number } | null {
		// Subscribe to the authored geometry so the hit box re-measures after a
		// drag or inspector edit (getBoundingClientRect isn't reactive).
		switch (primitive.type) {
			case 'node':
			case 'label':
			case 'stat-callout': {
				const geometry = resolveDiagramPrimitiveGeometry(
					primitive,
					engineState.transport.orientation
				);
				void geometry.position.x;
				void geometry.position.y;
				void geometry.scale;
				break;
			}
			case 'timeline-segment': {
				const geometry = resolveDiagramPrimitiveGeometry(
					primitive,
					engineState.transport.orientation
				);
				void JSON.stringify(geometry.from);
				void JSON.stringify(geometry.to);
				break;
			}
			case 'edge-arrow':
				break;
		}
		const el = compositionElement?.querySelector<HTMLElement>(
			`[data-diagram-primitive="${primitive.id}"]`
		);
		if (!el) return null;
		return projectRect(el);
	}

	interface BlockDragState {
		blockId: string;
		/** Drag origin in composition fractions (ray-cast onto the surface plane). */
		startCompX: number;
		startCompY: number;
		/** Every authored point the drag translates (position, or from+to). */
		points: { point: { x: number; y: number }; originX: number; originY: number }[];
	}

	let blockDrag: BlockDragState | null = null;

	function onBlockPointerDown(event: PointerEvent, primitive: DiagramPrimitive): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectLayer(createTimelineTrackId({ kind: 'block', blockId: primitive.id }));
		const points: BlockDragState['points'] = [];
		switch (primitive.type) {
			case 'node':
			case 'label':
			case 'stat-callout': {
				const geometry = resolveDiagramPrimitiveGeometry(
					primitive,
					engineState.transport.orientation
				);
				points.push({
					point: geometry.position,
					originX: geometry.position.x,
					originY: geometry.position.y
				});
				break;
			}
			case 'timeline-segment': {
				const geometry = resolveDiagramPrimitiveGeometry(
					primitive,
					engineState.transport.orientation
				);
				points.push({
					point: geometry.from,
					originX: geometry.from.x,
					originY: geometry.from.y
				});
				points.push({
					point: geometry.to,
					originX: geometry.to.x,
					originY: geometry.to.y
				});
				break;
			}
			case 'edge-arrow':
				break;
		}
		if (points.length === 0) return;
		const startComp = pointerToComp(event.clientX, event.clientY, 'surface');
		if (!startComp) return;
		blockDrag = {
			blockId: primitive.id,
			startCompX: startComp.x,
			startCompY: startComp.y,
			points
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('pointermove', onBlockPointerMove);
			window.addEventListener('pointerup', onBlockPointerUp);
		}
	}

	function onBlockPointerMove(event: PointerEvent): void {
		if (!blockDrag) return;
		const comp = pointerToComp(event.clientX, event.clientY, 'surface');
		if (!comp) return;
		const dx = comp.x - blockDrag.startCompX;
		const dy = comp.y - blockDrag.startCompY;
		if (Math.abs(dx) < 0.0005 && Math.abs(dy) < 0.0005) return;
		for (const entry of blockDrag.points) {
			// Rounded to 4 dp — sub-pixel-at-4K precision that keeps the inspector
			// and the serialized preset readable.
			entry.point.x = Math.round(clampNumber(entry.originX + dx, 0, 1) * 10000) / 10000;
			entry.point.y = Math.round(clampNumber(entry.originY + dy, 0, 1) * 10000) / 10000;
		}
	}

	function onBlockPointerUp(): void {
		blockDrag = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onBlockPointerMove);
			window.removeEventListener('pointerup', onBlockPointerUp);
		}
	}

	// ─── Surface-interior direct selection (epic 0pkzts2c) ──────────────────────
	// Rendered surface content (iMessage bubbles, text slots) is live DOM inside
	// the canvas layoutsubtree, so its boxes project into display space with the
	// same math as overlays. A click selects the entity's existing address —
	// bubbles use the id from `createTimelineTrackId({ kind: 'surface-message', index })`;
	// slots select the surface
	// and request an inspector reveal — no dragging, these are content, not
	// spatially placed objects.

	const surfaceMessages = $derived(engineState.surface.content.messages ?? []);
	const surfaceItems = $derived(
		engineState.surface.type === 'checklist' ? (engineState.surface.content.items ?? []) : []
	);

	// Text-animation strategies rebuild slot DOM asynchronously (GSAP span
	// splits) — no engine state captures that, so boxes measured at mount can be
	// stale. Bumping this on backdrop pointerenter re-measures every interior box
	// before the cursor can reach one (regions are islands inside the backdrop).
	let measureEpoch = $state(0);

	// Every slot value stamped as `data-text-anim-slot` by surface CanvasSources.
	const SURFACE_TEXT_SLOTS = [
		'kicker',
		'title',
		'counterpoint',
		'body',
		'sourceUrl',
		'author',
		'source',
		'dateLabel'
	] as const;

	function messageRelRect(
		message: ChatMessage,
		index: number
	): { left: number; top: number; width: number; height: number } | null {
		// Bubble DOM moves with the playhead (enter pops, thread slide, window
		// visibility ramp) and reflows on content edits — subscribe so the hit box
		// tracks it (getBoundingClientRect isn't reactive).
		void animState.globalProgress;
		void animState.paperVisibility;
		void measureEpoch;
		void JSON.stringify(message);
		// When the typing indicator is up it renders before the (invisible) bubble,
		// so the first `data-message-index` match is always the visible box.
		const el = compositionElement?.querySelector<HTMLElement>(`[data-message-index="${index}"]`);
		if (!el) return null;
		return projectRect(el);
	}

	function slotRelRect(
		slot: (typeof SURFACE_TEXT_SLOTS)[number]
	): { left: number; top: number; width: number; height: number } | null {
		// Slot elements come and go with surface type/variant/content and ride the
		// surface's enter/exit — subscribe so the box re-measures.
		void engineState.surface.type;
		void engineState.surface.variant;
		void engineState.surface.content[slot];
		void animState.globalProgress;
		void animState.paperVisibility;
		void measureEpoch;
		const candidates = compositionElement?.querySelectorAll<HTMLElement>(
			`[data-text-anim-slot="${slot}"]`
		);
		if (!candidates) return null;
		// Overlays stamp the same attribute for their own text motion, and message
		// bubbles render their text through DocumentBody (slot "body") — both boxes
		// belong to their own hit regions, not a surface slot.
		for (const el of candidates) {
			if (el.closest('[data-overlay-id]') === null && el.closest('[data-message-index]') === null)
				return projectRect(el);
		}
		return null;
	}

	function onMessageDown(event: PointerEvent, index: number): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectMessage(index);
	}

	function selectMessage(index: number): void {
		selectLayer(createTimelineTrackId({ kind: 'surface-message', index }));
		requestInspectorFocus(`message:${index}`);
	}

	// Checklist item rows (ADR-0040) — the messages pattern, per task: a click
	// selects the item's timeline-row id and reveals its inspector entry.
	function itemRelRect(
		item: ChecklistItem,
		index: number
	): { left: number; top: number; width: number; height: number } | null {
		// Rows ride the surface's enter travel/visibility and reflow on content
		// edits — subscribe so the hit box tracks them.
		void animState.globalProgress;
		void animState.paperVisibility;
		void measureEpoch;
		void JSON.stringify(item);
		const el = compositionElement?.querySelector<HTMLElement>(`[data-item-index="${index}"]`);
		if (!el) return null;
		return projectRect(el);
	}

	function onItemDown(event: PointerEvent, index: number): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectItem(index);
	}

	function selectItem(index: number): void {
		selectLayer(createTimelineTrackId({ kind: 'checklist-item', index }));
		requestInspectorFocus(`item:${index}`);
	}

	function onSlotDown(event: PointerEvent, slot: string): void {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		selectSlot(slot);
	}

	function selectSlot(slot: string): void {
		selectLayer(createTimelineTrackId({ kind: 'surface' }));
		requestInspectorFocus(`slot:${slot}`);
	}

	// ─── Backdrop: pan (when zoomed in) or deselect (on a plain click) ──────────────
	// A press on the empty canvas starts a gesture: drag while zoomed in pans the
	// view; release without a real drag deselects (→ root inspector).

	interface PanGesture {
		startX: number;
		startY: number;
		originPanX: number;
		originPanY: number;
		moved: boolean;
	}

	let panGesture: PanGesture | null = null;

	function onBackdropDown(event: PointerEvent): void {
		if (event.button !== 0) return;
		panGesture = {
			startX: event.clientX,
			startY: event.clientY,
			originPanX: panX,
			originPanY: panY,
			moved: false
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('pointermove', onBackdropMove);
			window.addEventListener('pointerup', onBackdropUp);
		}
	}

	function onBackdropMove(event: PointerEvent): void {
		if (!panGesture) return;
		const dx = event.clientX - panGesture.startX;
		const dy = event.clientY - panGesture.startY;
		if (!panGesture.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
		if (!panGesture.moved && zoom > 1) onPanStart?.(); // drop the transition before panning
		panGesture.moved = true;
		if (zoom <= 1 || !onPan) return; // nothing to pan at fit
		// Clamp so the canvas can't be dragged entirely out of view: allow panning
		// up to the zoom overflow on each side (plus a little slack).
		const rootRect = rootEl?.getBoundingClientRect();
		const canvasRect = canvas?.getBoundingClientRect();
		let nextX = panGesture.originPanX + dx;
		let nextY = panGesture.originPanY + dy;
		if (rootRect && canvasRect) {
			const maxX = Math.max(0, (canvasRect.width - rootRect.width) / 2 + 48);
			const maxY = Math.max(0, (canvasRect.height - rootRect.height) / 2 + 48);
			nextX = clampNumber(nextX, -maxX, maxX);
			nextY = clampNumber(nextY, -maxY, maxY);
		}
		onPan(nextX, nextY);
	}

	function onBackdropUp(): void {
		const wasPan = panGesture?.moved === true && zoom > 1;
		panGesture = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onBackdropMove);
			window.removeEventListener('pointerup', onBackdropUp);
		}
		if (wasPan) onPanEnd?.();
		else deselectLayer();
	}

	onDestroy(() => {
		if (typeof window === 'undefined') return;
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerup', onPointerUp);
		window.removeEventListener('pointermove', onBlockPointerMove);
		window.removeEventListener('pointerup', onBlockPointerUp);
		window.removeEventListener('pointermove', onScaleMove);
		window.removeEventListener('pointerup', onScaleEnd);
		window.removeEventListener('pointermove', onRotateMove);
		window.removeEventListener('pointerup', onRotateEnd);
		window.removeEventListener('pointermove', onBackdropMove);
		window.removeEventListener('pointerup', onBackdropUp);
	});
</script>

<!-- Positioned over the canvas by Workspace; pointer-events only where overlays are -->
<div bind:this={rootEl} class="canvas-editing-overlay" role="presentation">
	<!-- Full-area backdrop: drag to pan when zoomed in, plain click to deselect -->
	<div
		class="canvas-editing-overlay__backdrop"
		class:canvas-editing-overlay__backdrop--pannable={zoom > 1}
		onpointerdown={onBackdropDown}
		onpointerenter={() => {
			measureEpoch += 1;
		}}
		role="presentation"
		aria-hidden="true"
	></div>
	{#each surfaceMessages as message, index (index)}
		{@const rect = messageRelRect(message, index)}
		{#if rect && rect.width > 0}
			<div
				class="interior-hit"
				class:interior-hit--selected={isTrackSelected({ kind: 'surface-message', index })}
				onpointerdown={(e) => onMessageDown(e, index)}
				role="button"
				tabindex="0"
				aria-label={`Edit message ${index + 1}`}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') selectMessage(index);
				}}
				style:left="{rect.left}px"
				style:top="{rect.top}px"
				style:width="{rect.width}px"
				style:height="{rect.height}px"
				style:z-index={canvasSelectionStackIndex({
					layer: 'surface-content',
					paintIndex: index,
					stableId: `message:${index}`
				})}
			></div>
		{/if}
	{/each}
	{#each surfaceItems as item, index (index)}
		{@const rect = itemRelRect(item, index)}
		{#if rect && rect.width > 0}
			<div
				class="interior-hit"
				class:interior-hit--selected={isTrackSelected({ kind: 'checklist-item', index })}
				onpointerdown={(e) => onItemDown(e, index)}
				role="button"
				tabindex="0"
				aria-label={`Edit item ${index + 1}`}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') selectItem(index);
				}}
				style:left="{rect.left}px"
				style:top="{rect.top}px"
				style:width="{rect.width}px"
				style:height="{rect.height}px"
				style:z-index={canvasSelectionStackIndex({
					layer: 'surface-content',
					paintIndex: index,
					stableId: `item:${index}`
				})}
			></div>
		{/if}
	{/each}
	{#each SURFACE_TEXT_SLOTS as slot, slotIndex (slot)}
		{@const rect = slotRelRect(slot)}
		{#if rect && rect.width > 0}
			<div
				class="interior-hit"
				onpointerdown={(e) => onSlotDown(e, slot)}
				role="button"
				tabindex="0"
				aria-label={`Edit ${slot}`}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') selectSlot(slot);
				}}
				style:left="{rect.left}px"
				style:top="{rect.top}px"
				style:width="{rect.width}px"
				style:height="{rect.height}px"
				style:z-index={canvasSelectionStackIndex({
					layer: 'surface-text',
					paintIndex: slotIndex,
					stableId: `slot:${slot}`
				})}
			></div>
		{/if}
	{/each}
	{#each diagramPrimitiveDraggables as primitive, primitiveIndex (primitive.id)}
		{@const rect = blockRelRect(primitive)}
		{#if rect && rect.width > 0}
			{@const isSelected = isTrackSelected({ kind: 'block', blockId: primitive.id })}
			<div
				class="overlay-hit block-hit"
				class:overlay-hit--selected={isSelected}
				onpointerdown={(e) => onBlockPointerDown(e, primitive)}
				role="button"
				tabindex="0"
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ')
						selectLayer(createTimelineTrackId({ kind: 'block', blockId: primitive.id }));
				}}
				style:left="{rect.left}px"
				style:top="{rect.top}px"
				style:width="{rect.width}px"
				style:height="{rect.height}px"
				style:z-index={canvasSelectionStackIndex({
					layer: 'block',
					paintIndex: primitiveIndex,
					stableId: primitive.id
				})}
			></div>
		{/if}
	{/each}
	{#each engineState.overlays as overlay, overlayIndex (overlay.id)}
		{@const rect = overlayRelRect(overlay)}
		{@const placement = resolveOverlayPlacement(
			overlay.position,
			engineState.transport.orientation
		)}
		{#if rect && rect.width > 0}
			{@const isSelected = isTrackSelected({ kind: 'overlay', overlayId: overlay.id })}
			<div
				class="overlay-hit"
				class:overlay-hit--selected={isSelected}
				onpointerdown={(e) => onPointerDown(e, overlay)}
				role="button"
				tabindex="0"
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ')
						selectLayer(createTimelineTrackId({ kind: 'overlay', overlayId: overlay.id }));
				}}
				style:left="{rect.left}px"
				style:top="{rect.top}px"
				style:width="{rect.width}px"
				style:height="{rect.height}px"
				style:z-index={canvasSelectionStackIndex({
					layer: 'overlay',
					paintIndex: overlayIndex,
					stableId: overlay.id
				})}
			>
				{#if isSelected}
					{@const localVisibleBounds = {
						left: 0,
						top: 0,
						width: rect.width,
						height: rect.height
					}}
					{@const rotationHandle = createCanvasHandleGeometry(
						localVisibleBounds,
						CANVAS_ROTATION_HANDLE_DESCRIPTOR
					)}
					{@const scaleHandles = canvasOverlayScaleHandleDescriptors(placement.anchor).map(
						(descriptor) => createCanvasHandleGeometry(localVisibleBounds, descriptor)
					)}
					<button
						class="overlay-hit__rotate"
						type="button"
						aria-label="Rotate {overlay.type}"
						onpointerdown={(e) => onRotateStart(e, overlay)}
						style:left="{rotationHandle.pointerBounds.left}px"
						style:top="{rotationHandle.pointerBounds.top}px"
						style:width="{rotationHandle.pointerBounds.width}px"
						style:height="{rotationHandle.pointerBounds.height}px"
					></button>
					{#each scaleHandles as handle (handle.position)}
						<button
							class="overlay-hit__handle"
							type="button"
							data-handle-position={handle.position}
							aria-label="Scale {overlay.type}"
							onpointerdown={(e) => onScaleStart(e, overlay)}
							style:left="{handle.pointerBounds.left}px"
							style:top="{handle.pointerBounds.top}px"
							style:width="{handle.pointerBounds.width}px"
							style:height="{handle.pointerBounds.height}px"
							style:cursor={handle.cursor}
						></button>
					{/each}
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

	/* Zoomed in → the empty canvas can be dragged to pan. */
	.canvas-editing-overlay__backdrop--pannable {
		cursor: grab;
	}

	.canvas-editing-overlay__backdrop--pannable:active {
		cursor: grabbing;
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

	/* Surface-interior content (bubbles, text slots): clickable to edit, not
	   draggable — pointer cursor + dashed hover ring distinguish "content that
	   opens its editor" from the solid ring of liftable overlay objects. */
	.interior-hit {
		box-sizing: border-box;
		cursor: pointer;
		outline: none;
		outline-offset: -1px;
		pointer-events: all;
		position: absolute;
	}

	.interior-hit:hover {
		outline: 1.5px dashed rgba(255, 214, 8, 0.7);
	}

	.interior-hit--selected,
	.interior-hit--selected:hover {
		outline: 2px solid #ffd608;
	}

	/* Handle buttons use the contract's 24px screen-space pointer bounds. The
	   visible chrome stays fixed at 10px and therefore never bloats with zoom. */
	.overlay-hit__handle,
	.overlay-hit__rotate {
		background: transparent;
		border: 0;
		box-sizing: border-box;
		padding: 0;
		pointer-events: all;
		position: absolute;
		touch-action: none;
	}

	.overlay-hit__handle::before {
		background: #ffd608;
		block-size: 10px;
		border: 1px solid rgba(0, 0, 0, 0.5);
		border-radius: 1px;
		box-sizing: border-box;
		content: '';
		inline-size: 10px;
		inset-block-start: calc(50% - 5px);
		inset-inline-start: calc(50% - 5px);
		position: absolute;
	}

	/* Rotate lollipop — its circle and stem are visual chrome inside the larger
	   pointer target supplied by the same handle contract. */
	.overlay-hit__rotate {
		cursor: grab;
	}

	.overlay-hit__rotate::before {
		background: #ffd608;
		block-size: 9px;
		border: 1px solid rgba(0, 0, 0, 0.5);
		border-radius: 50%;
		box-sizing: border-box;
		content: '';
		inline-size: 9px;
		inset-block-start: calc(50% - 4.5px);
		inset-inline-start: calc(50% - 4.5px);
		position: absolute;
	}

	.overlay-hit__rotate::after {
		background: rgba(255, 214, 8, 0.7);
		block-size: 10px;
		content: '';
		inline-size: 1.5px;
		inset-block-start: calc(50% + 4.5px);
		inset-inline-start: calc(50% - 0.75px);
		position: absolute;
	}

	.overlay-hit__rotate:active {
		cursor: grabbing;
	}
</style>
