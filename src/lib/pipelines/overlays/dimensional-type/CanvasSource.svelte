<script lang="ts">
	import { engineState } from '$lib/platform/engine-state.svelte';
	import type { DimensionalTypeContent } from './index';

	interface Props {
		content: DimensionalTypeContent;
	}

	let { content }: Props = $props();

	// On the depth Stage this Overlay is a body the stage draws, and the stage
	// keeps it out of every captured plane, so this source never paints there.
	// Off the stage the headline stands flat in the Pack's face — the same
	// text at the same cap height, the honest fallback.
	const onStage = $derived(engineState.stage?.type === 'depth');
	/** A Latin face's cap height is about 0.7 em: size is a cap-height share of the frame's short side. */
	const CAP_TO_EM = 0.7;
	const fontSize = $derived(`calc(${((content.size / CAP_TO_EM) * 100).toFixed(3)} * var(--cqmin))`);
</script>

{#if !onStage}
	<div class="dimensional-type" style:font-size={fontSize}>{content.text}</div>
{/if}

<style>
	.dimensional-type {
		color: var(--ink, #f5f5f5);
		font-family: var(--font, 'Space Grotesk', 'Inter', sans-serif);
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1;
		white-space: nowrap;
	}
</style>
