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

	function positionStyle(overlay: Overlay): string {
		const { anchor, offset, rect } = overlay.position;
		// Offsets are fractions of the composition (0..1 of inline-size / block-size).
		// 0.05 = 5% margin from the anchor edge.
		const ox = (offset?.x ?? 0) * 100;
		const oy = (offset?.y ?? 0) * 100;

		if (anchor === 'normalized-rect' && rect) {
			return `left:${rect.x * 100}%;top:${rect.y * 100}%;inline-size:${rect.width * 100}%;block-size:${rect.height * 100}%;`;
		}

		const parts: string[] = [];

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

		return parts.join(';');
	}

	function visibilityStyle(progress: number): string {
		const visible = Math.max(0, Math.min(1, progress));
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
				animState.overlayProgresses[index] ?? 1
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
