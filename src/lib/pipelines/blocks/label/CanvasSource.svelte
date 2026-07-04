<script lang="ts">
	import type { DiagramLabel } from '$lib/platform/engine-schema';

	interface Props {
		block: DiagramLabel;
	}

	let { block }: Props = $props();
</script>

<span class="diagram-label">{block.text}</span>

<style>
	/* The diagram's caption voice: mono annotation register, sized by the
	   element's own `scale` (applied by the mount), ink from the Pack →
	   composition typography. */
	.diagram-label {
		color: var(--ink, currentColor);
		display: inline-block;
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		font-size: calc(2.4 * var(--cqmin));
		font-weight: 600;
		letter-spacing: 0.05em;
		line-height: 1.25;
		text-align: center;
		white-space: pre-line;
	}
</style>
