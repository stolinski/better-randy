<script lang="ts">
	import LowerThirdSource from '$lib/pipelines/overlays/lower-third/CanvasSource.svelte';

	import { animState } from './anim-state.svelte';
	import { engineState } from './engine-state.svelte';
	import type { Overlay } from './engine-schema';

	function positionStyle(overlay: Overlay): string {
		const { anchor, offset, rect } = overlay.position;
		const ox = offset?.x ?? 0;
		const oy = offset?.y ?? 0;

		if (anchor === 'normalized-rect' && rect) {
			return `left:${rect.x * 100}%;top:${rect.y * 100}%;inline-size:${rect.width * 100}%;block-size:${rect.height * 100}%;`;
		}

		const parts: string[] = [];

		if (anchor.startsWith('top')) {
			parts.push(`top:${oy}px`);
		} else if (anchor.startsWith('bottom')) {
			parts.push(`bottom:${oy}px`);
		} else {
			parts.push(`top:50%`);
		}

		if (anchor.endsWith('left')) {
			parts.push(`left:${ox}px`);
		} else if (anchor.endsWith('right')) {
			parts.push(`right:${ox}px`);
		} else {
			parts.push(`left:50%`);
		}

		return parts.join(';');
	}

	function visibilityStyle(progress: number): string {
		const visible = Math.max(0, Math.min(1, progress));
		const ty = (1 - visible) * 24;
		return `opacity:${visible};transform:translateY(${ty}px);`;
	}
</script>

{#each engineState.overlays as overlay, index (overlay.id)}
	<div
		class="overlay-layer__item"
		data-overlay-id={overlay.id}
		style="{positionStyle(overlay)};{visibilityStyle(animState.overlayProgresses[index] ?? 1)}"
	>
		{#if overlay.type === 'lower-third'}
			<LowerThirdSource
				content={overlay.content as { variant: 'standard' | 'cinematic'; kicker?: string; title: string; subtitle?: string }}
			/>
		{/if}
	</div>
{/each}

<style>
	.overlay-layer__item {
		position: absolute;
		z-index: 1;
	}
</style>
