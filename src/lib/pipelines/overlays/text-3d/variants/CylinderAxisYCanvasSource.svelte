<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { Text3dContent } from '../index';

	interface Props {
		content: Text3dContent;
	}

	let { content }: Props = $props();

	const progress = $derived(animState.globalProgress);
	const chars = $derived(Array.from(content.text));
	const count = $derived(chars.length);

	// Each character occupies an equal angular slice of the cylinder. The
	// cylinder rotates by `rotationDegrees * progress` over the timeline.
	const baseRotation = $derived(progress * content.rotationDegrees);
	const angleStep = $derived(count > 0 ? 360 / Math.max(count, 12) : 0);

	function lightingForAngle(deg: number): { opacity: number; brightness: number } {
		// Cylinder normal at angle θ: facing camera when cos(θ - viewAngle) is
		// largest. Treat the camera as looking down +Z; visible arc is ±90° of
		// the cylinder front. cos > 0 means front-facing.
		const rad = (deg * Math.PI) / 180;
		const cos = Math.cos(rad);
		const opacity = cos > 0 ? Math.max(0.2, cos) : 0;
		const brightness = cos > 0 ? 0.55 + cos * 0.45 : 0;
		return { opacity, brightness };
	}
</script>

<aside class="text-3d-overlay" data-overlay="text-3d" data-variant="cylinder-axis-y">
	<div class="text-3d-overlay__scene">
		<div class="text-3d-overlay__cylinder" style:transform={`rotateY(${baseRotation}deg)`}>
			{#each chars as ch, i (i)}
				{@const localAngle = (i - (count - 1) / 2) * angleStep}
				{@const compositeAngle = localAngle + baseRotation}
				{@const light = lightingForAngle(compositeAngle)}
				<span
					class="text-3d-overlay__glyph"
					style:transform={`rotateY(${localAngle}deg) translateZ(${content.radiusCh}ch)`}
					style:opacity={light.opacity}
					style:filter={`brightness(${light.brightness})`}
				>
					{ch === ' ' ? ' ' : ch}
				</span>
			{/each}
		</div>
	</div>
</aside>

<style>
	.text-3d-overlay {
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		font-size: 14cqmin;
		font-weight: 800;
		letter-spacing: -0.01em;
		line-height: 1;
		perspective: 80cqmin;
		text-transform: uppercase;
	}

	.text-3d-overlay__scene {
		position: relative;
		transform-style: preserve-3d;
	}

	.text-3d-overlay__cylinder {
		position: relative;
		transform-style: preserve-3d;
	}

	.text-3d-overlay__glyph {
		backface-visibility: hidden;
		color: var(--ink, #fffaf2);
		display: inline-block;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: absolute;
		transform-origin: center center;
		transform-style: preserve-3d;
	}
</style>
