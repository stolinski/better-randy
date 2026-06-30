<script lang="ts">
	import { animState } from './anim-state.svelte';
	import { engineState, packState } from './engine-state.svelte';
	import { getPack } from './packs/registry';
	import { appearanceVarsToStyle, resolveAppearanceVars } from './packs/resolve';
	import { PIPELINE_REGISTRY } from './pipelines';
	import type { Overlay } from './engine-schema';
	import type { OverlayRenderer } from './pipelines/types';

	function findRenderer(type: string): OverlayRenderer | null {
		for (const renderer of Object.values(PIPELINE_REGISTRY.overlays)) {
			if (renderer.type === type) {
				return renderer as OverlayRenderer;
			}
		}

		return null;
	}

	// transform-origin matching an anchor's pinned point, so a scale grows from the
	// anchored edge/corner instead of the element's default centre.
	function anchorOrigin(anchor: string): string {
		if (anchor === 'normalized-rect') return 'top left';
		const v = anchor.startsWith('top') ? 'top' : anchor.startsWith('bottom') ? 'bottom' : 'center';
		const h = anchor.endsWith('left') ? 'left' : anchor.endsWith('right') ? 'right' : 'center';
		return `${v} ${h}`;
	}

	function positionStyle(overlay: Overlay): string {
		const { anchor, offset, rect, scale } = overlay.position;
		// Offsets are fractions of the composition (0..1 of inline-size / block-size).
		// 0.05 = 5% margin from the anchor edge.
		const ox = (offset?.x ?? 0) * 100;
		const oy = (offset?.y ?? 0) * 100;

		const parts: string[] = [];

		if (anchor === 'normalized-rect' && rect) {
			parts.push(
				`left:${rect.x * 100}%`,
				`top:${rect.y * 100}%`,
				`inline-size:${rect.width * 100}%`,
				`block-size:${rect.height * 100}%`
			);
		} else {
			if (anchor.startsWith('top')) {
				parts.push(`top:${oy}%`);
			} else if (anchor.startsWith('bottom')) {
				parts.push(`bottom:${oy}%`);
			} else {
				parts.push(`top:50%`);
			}

			if (anchor.endsWith('left')) {
				parts.push(`left:${ox}%`);
			} else if (anchor.endsWith('right')) {
				parts.push(`right:${ox}%`);
			} else {
				parts.push(`left:50%`);
			}

			// `center` anchor: offset the element by half its own size so the
			// element's visual centre aligns with the (50%, 50%) origin point.
			// Uses CSS `translate` (independent of `transform`) so it doesn't
			// conflict with the visibilityStyle translateY animation.
			if (anchor === 'center') {
				parts.push(`translate:-50% -50%`);
			}
		}

		// Uniform scale about the anchor point. CSS `scale` longhand composes with
		// the `translate` (center anchor) and the visibilityStyle `transform`
		// translateY entry slide without clobbering either.
		if (scale !== undefined && scale !== 1) {
			parts.push(`scale:${scale}`, `transform-origin:${anchorOrigin(anchor)}`);
		}

		return parts.join(';');
	}

	function visibilityStyle(progress: number, renderer: OverlayRenderer): string {
		// Clamp to [0,1] INTENTIONALLY: the generic overlay enter is a fade-through
		// (opacity + a short slide-up), which is the motion-form every overlay
		// Pipeline declares in its identity spec (e.g. watermark "fade-through").
		// A `settled`/`back.out` ease can drive progress past 1; clamping discards
		// that overshoot so the slide settles cleanly without a bounce that would
		// contradict the declared fade-through. Do NOT un-clamp to "add overshoot"
		// — overshoot is a different motion-form that would need per-overlay opt-in
		// (and overshooting opacity is meaningless). See dex 9z8tm4na.
		const visible = Math.max(0, Math.min(1, progress));
		if (renderer.disableEntryOffset) {
			return `opacity:${visible};`;
		}
		const ty = (1 - visible) * 32;
		return `opacity:${visible};transform:translateY(${ty}px);`;
	}

	// Resolve the overlay's appearance Roles through the active Pack into CSS
	// vars on the mount root; the CanvasSource consumes them via `var(--…)`.
	function appearanceStyle(overlay: Overlay): string {
		return appearanceVarsToStyle(resolveAppearanceVars(getPack(packState.slug), overlay.type));
	}
</script>

{#each engineState.overlays as overlay, index (overlay.id)}
	{@const renderer = findRenderer(overlay.type)}
	{#if renderer}
		{@const Component = renderer.CanvasSource}
		<div
			class="overlay-mount__item"
			data-overlay-id={overlay.id}
			data-overlay-type={overlay.type}
			style="{positionStyle(overlay)};{visibilityStyle(
				animState.overlayProgresses[index] ?? 1,
				renderer
			)};{appearanceStyle(overlay)}"
		>
			<Component content={overlay.content} />
		</div>
	{/if}
{/each}

<style>
	.overlay-mount__item {
		position: absolute;
		z-index: 1;
	}
</style>
