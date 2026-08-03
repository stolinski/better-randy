<script lang="ts">
	interface Props {
		checked: boolean;
		/** Accessible name — every rail toggle must announce what it enables. */
		label: string;
		onchange: (checked: boolean) => void;
		disabled?: boolean;
	}

	let { checked, label, onchange, disabled = false }: Props = $props();
</script>

<!-- The rail's boolean control: a recessed instrument well, never OS chrome.
     Enabled reads as a primary-text check — yellow stays reserved for
     selection and focus (DESIGN.md color grammar). -->
<button
	type="button"
	role="switch"
	aria-checked={checked}
	aria-label={label}
	class="ins-toggle"
	{disabled}
	onclick={() => onchange(!checked)}
>
	{#if checked}
		<svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
			<path d="M1 4.2 3.8 7 9 1" fill="none" stroke="currentColor" stroke-width="1.6" />
		</svg>
	{/if}
</button>

<style>
	.ins-toggle {
		align-items: center;
		background: var(--chrome-well);
		block-size: 20px;
		border: 1px solid var(--chrome-hairline);
		border-radius: 3px;
		color: var(--chrome-text);
		cursor: pointer;
		display: inline-flex;
		flex: none;
		inline-size: 20px;
		justify-content: center;
		padding: 0;
		transition: border-color 120ms ease;
	}

	.ins-toggle:hover {
		border-color: var(--chrome-muted);
	}

	.ins-toggle:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.ins-toggle:focus-visible {
		border-color: #ffd608;
		outline: none;
	}
</style>
