<script lang="ts">
	import type { DiagramNode } from '$lib/platform/engine-schema';

	interface Props {
		block: DiagramNode;
	}

	let { block }: Props = $props();
</script>

{#if block.form === 'box'}
	<span class="node node--box">{block.text ?? ''}</span>
{:else if block.form === 'pin'}
	<span class="node node--pin">
		<!-- Shadow is an offset SVG path, never a CSS filter — filters promote
		     compositing layers, which drop out of the HTML-in-Canvas capture. -->
		<svg class="node__pin-mark" viewBox="0 0 52 65" aria-hidden="true">
			<path
				class="node__pin-shadow"
				d="M27 5C14.8 5 5 14.9 5 27.1 5 43.6 27 63 27 63s22-19.4 22-35.9C49 14.9 39.2 5 27 5Z"
			/>
			<path
				class="node__pin-body"
				d="M24 2C11.8 2 2 11.9 2 24.1 2 40.6 24 60 24 60s22-19.4 22-35.9C46 11.9 36.2 2 24 2Z"
			/>
			<circle class="node__pin-core" cx="24" cy="23" r="8.5" />
		</svg>
		{#if block.text}<span class="node__pin-text">{block.text}</span>{/if}
	</span>
{:else}
	<span class="node node--dot">
		<span class="node__dot-mark"></span>
		{#if block.text}<span class="node__dot-text">{block.text}</span>{/if}
	</span>
{/if}

<style>
	.node {
		align-items: center;
		display: inline-flex;
		line-height: 1;
		white-space: nowrap;
	}

	/* Box — the flowchart card: Pack fill, hard Pack depth, ink that follows
	   the fill's luminance (set by the mount). */
	.node--box {
		background: var(--fill, #ffffff);
		border: calc(0.32 * var(--cqmin)) solid var(--node-box-ink, #0c0c0c);
		box-shadow: var(--node-shadow, none);
		color: var(--node-box-ink, #0c0c0c);
		font-size: calc(2.9 * var(--cqmin));
		font-weight: 700;
		letter-spacing: 0.01em;
		padding: calc(1.5 * var(--cqmin)) calc(2.4 * var(--cqmin));
	}

	/* Pin — the map marker: Pack accent body, punched core. */
	.node--pin {
		flex-direction: column;
		gap: calc(0.7 * var(--cqmin));
	}

	.node__pin-mark {
		display: block;
		inline-size: calc(3.6 * var(--cqmin));
	}

	.node__pin-shadow {
		fill: rgb(0 0 0 / 0.4);
	}

	.node__pin-body {
		fill: var(--accent, #fabf47);
		stroke: var(--ink, currentColor);
		stroke-width: 3;
	}

	.node__pin-core {
		fill: var(--ink, currentColor);
	}

	.node__pin-text,
	.node__dot-text {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: calc(2 * var(--cqmin));
		font-weight: 700;
		letter-spacing: 0.06em;
	}

	/* Dot — the quiet point marker. */
	.node--dot {
		gap: calc(1 * var(--cqmin));
	}

	.node__dot-mark {
		background: var(--accent, #fabf47);
		border: calc(0.24 * var(--cqmin)) solid var(--ink, currentColor);
		border-radius: 50%;
		block-size: calc(1.9 * var(--cqmin));
		display: inline-block;
		inline-size: calc(1.9 * var(--cqmin));
	}
</style>
