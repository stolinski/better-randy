<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { InstanceStackContent } from '../index';
	import { horizontalTrain } from './horizontal-train';

	interface Props {
		content: InstanceStackContent;
	}

	let { content }: Props = $props();

	const progress = $derived(animState.globalProgress);
	const indices = $derived(Array.from({ length: content.count }, (_, i) => i));
</script>

<aside class="instance-stack-overlay" data-overlay="instance-stack" data-variant="horizontal-train">
	<div class="instance-stack-overlay__row">
		{#each indices as i (i)}
			{@const state = horizontalTrain.motionShape(i, content.count, progress, { spacing: content.spacing, opacityFloor: content.opacityFloor, lagWindow: content.lagWindow })}
			<span
				class="instance-stack-overlay__instance"
				data-text-anim-slot={i === 0 ? 'title' : undefined}
				style:transform={`translate(${state.xOffset}em, ${state.yOffset}em) scale(${state.scale})`}
				style:opacity={state.opacity}
			>
				{content.text}
			</span>
		{/each}
	</div>
</aside>

<style>
	.instance-stack-overlay {
		color: var(--ink, #000000);
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		font-size: calc(9 * var(--cqmin));
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		text-transform: uppercase;
	}

	.instance-stack-overlay__row {
		display: flex;
		flex-direction: row;
		gap: 0.6em;
	}

	.instance-stack-overlay__instance {
		display: inline-block;
		transform-origin: 50% 50%;
		white-space: nowrap;
	}
</style>
