<script lang="ts">
	import type { DiagramLabel } from '$lib/platform/engine-schema';

	interface Props {
		block: DiagramLabel;
	}

	let { block }: Props = $props();
</script>

<span class="diagram-label" data-diagram-text-role={block.role ?? 'caption'}>{block.text}</span>

<style>
	/* Caption and headline preserve one Pack-resolved voice; only their native
	   role size differs. The primitive's live scale is applied by the mount. */
	.diagram-label {
		color: var(--ink, currentColor);
		display: inline-block;
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		font-size: calc(2.6 * var(--cqmin));
		font-weight: 600;
		letter-spacing: 0.05em;
		line-height: 1.25;
		text-align: center;
		white-space: pre-line;
	}

	.diagram-label[data-diagram-text-role='headline'] {
		font-size: calc(2.9 * var(--cqmin));
	}
</style>
