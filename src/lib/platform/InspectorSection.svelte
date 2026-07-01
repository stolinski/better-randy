<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** All-caps section label, flush-left on the divider (ADR-0034 §9). */
		label: string;
		/** Optional right-aligned control in the section header (e.g. + Add, a toggle). */
		action?: Snippet;
		children: Snippet;
	}

	let { label, action, children }: Props = $props();
</script>

<section class="ins-section">
	<div class="ins-section__head">
		<span class="ins-section__label">{label}</span>
		{#if action}
			<div class="ins-section__action">{@render action()}</div>
		{/if}
	</div>
	{@render children()}
</section>

<style>
	/* ADR-0034 §9: sections are separated by a single 1px divider with an inline
	   all-caps label flush left — never bordered cards. Fields hang below. */
	.ins-section {
		border-block-start: var(--border-1);
		display: grid;
		gap: 0.4rem;
		padding: 0.7rem var(--vs-s);
	}

	.ins-section__head {
		align-items: center;
		column-gap: var(--vs-s);
		display: flex;
		justify-content: space-between;
		margin-block-end: 0.1rem;
		min-block-size: 1rem;
	}

	.ins-section__label {
		color: var(--fg-5);
		font-size: 0.68rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.09em;
		line-height: 1;
		text-transform: uppercase;
	}

	.ins-section__action {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
	}
</style>
