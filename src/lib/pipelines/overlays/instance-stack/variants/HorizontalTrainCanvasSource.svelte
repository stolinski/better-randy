<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { InstanceStackContent } from '../index';
	import { horizontalTrainMotionShape } from './instance-stack-motion';

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

<aside class="instance-stack-overlay" data-overlay="instance-stack" data-variant="horizontal-train">
	<div class="instance-stack-overlay__row">
		{#each indices as i (i)}
			{@const state = horizontalTrainMotionShape(i, content.count, progress, {
				spacing: content.spacing,
				opacityFloor: content.opacityFloor,
				lagWindow: content.lagWindow
			})}
			<span
				class="instance-stack-overlay__instance"
				data-text-anim-slot={i === 0 ? 'title' : undefined}
				data-supers-readable-id={`instance-${i}`}
				data-supers-text-role="overlay-display"
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
		color: var(--ink);
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		font-size: calc(9 * var(--cqmin));
		/* Pack FORM dress (ADR-0023): the numeral/display weight (`instance-stack.weight`).
		   Border/pad/radius don't apply (no plate — this is depth-recessed display
		   type, not a card); tracking stays the intrinsic optical value (a name-type
		   lever, not exposed, matching the cinematic lower-third name). Silent → 800. */
		font-weight: var(--weight, 800);
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
