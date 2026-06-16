<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { InstanceStackContent } from '../index';
	import { verticalStack } from './vertical-stack';

	interface Props {
		content: InstanceStackContent;
	}

	let { content }: Props = $props();

	const progress = $derived(animState.globalProgress);
	const indices = $derived(Array.from({ length: content.count }, (_, i) => i));
</script>

<aside class="instance-stack-overlay" data-overlay="instance-stack" data-variant="vertical-stack">
	{#each indices as i (i)}
		{@const state = verticalStack.motionShape(i, content.count, progress, { spacing: content.spacing, opacityFloor: content.opacityFloor, lagWindow: content.lagWindow })}
		<span
			class="instance-stack-overlay__instance"
			data-text-anim-slot={i === 0 ? 'title' : undefined}
			style:transform={`translate(${state.xOffset}em, ${state.yOffset}em) scale(${state.scale})`}
			style:opacity={state.opacity}
		>
			{content.text}
		</span>
	{/each}
</aside>

<style>
	.instance-stack-overlay {
		color: var(--ink, #000000);
		display: flex;
		flex-direction: column;
		font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
		font-size: 11cqmin;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		text-transform: uppercase;
	}

	.instance-stack-overlay__instance {
		display: block;
		transform-origin: 0 50%;
		white-space: nowrap;
	}
</style>
