<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Left-column field label; all field labels share one left edge (§9). */
		label: string;
		children: Snippet;
	}

	let { label, children }: Props = $props();
</script>

<div class="ins-field">
	<span class="ins-field__label">{label}</span>
	<div class="ins-field__control">{@render children()}</div>
</div>

<style>
	/* A labelled row: fixed label column so every control shares one left edge,
	   then a flex control area that fills the rest. */
	.ins-field {
		align-items: center;
		column-gap: var(--vs-s);
		display: grid;
		grid-template-columns: var(--ins-label-w, 5.5rem) minmax(0, 1fr);
	}

	/* The label is engraved in sans (DESIGN.md type voices) — values answer
	   in mono from the shared control styling on the rail root. */
	.ins-field__label {
		color: var(--chrome-muted);
		font-family: Archivo, sans-serif;
		font-size: 0.71875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ins-field__control {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
		min-inline-size: 0;
	}

	/* Text/number inputs and selects fill the control area; checkboxes, colour
	   swatches, ranges, and inline text keep their natural size. Tabular numerals
	   keep numeric fields visually aligned. */
	.ins-field__control :global(input:not([type='checkbox']):not([type='color']):not([type='range'])),
	.ins-field__control :global(select) {
		flex: 1 1 auto;
		font-variant-numeric: tabular-nums;
		min-inline-size: 0;
	}
</style>
