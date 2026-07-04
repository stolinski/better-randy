<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { InstanceStackContent } from '../index';
	import { verticalStack } from './vertical-stack';

	interface Props {
		content: InstanceStackContent;
	}

	let { content }: Props = $props();

	// Anchor the staggered assembly to the schema `staggerStart` (a timeline clip),
	// not the raw clip start.
	const progress = $derived(
		Math.max(0, Math.min(1, animState.globalProgress - (content.staggerStart ?? 0)))
	);
	const indices = $derived(Array.from({ length: content.count }, (_, i) => i));
</script>

<aside class="instance-stack-overlay" data-overlay="instance-stack" data-variant="vertical-stack">
	{#each indices as i (i)}
		{@const state = verticalStack.motionShape(i, content.count, progress, { spacing: content.spacing, opacityFloor: content.opacityFloor, lagWindow: content.lagWindow })}
		<span
			class="instance-stack-overlay__instance"
			data-text-anim-slot={i === 0 ? 'title' : undefined}
			style:margin-top={i > 0 ? `${content.spacing - 1}em` : null}
			style:transform={`translate(${state.xOffset}em, ${state.yOffset}em) scale(${state.scale})`}
			style:opacity={state.opacity}
		>
			{content.text}
		</span>
	{/each}
</aside>

<style>
	.instance-stack-overlay {
		color: var(--ink);
		display: flex;
		flex-direction: column;
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		/* 12.5·cqmin → ~270px on a 2160-wide vertical frame → cap-height ~189px,
		   clearing the G4 Overlay-display vertical floor (180px) for the frontmost
		   instance; the depth recession then steps the lower echoes down from there. */
		font-size: calc(12.5 * var(--cqmin));
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		text-transform: uppercase;
	}

	.instance-stack-overlay__instance {
		display: block;
		transform-origin: 0 0;
		white-space: nowrap;
	}
</style>
