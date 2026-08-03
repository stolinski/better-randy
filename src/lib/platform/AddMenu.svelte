<script lang="ts">
	export interface AddMenuItem {
		value: string;
		label: string;
	}

	export interface AddMenuGroup {
		/** Optional group heading (e.g. a split mode). */
		label?: string;
		items: AddMenuItem[];
	}

	interface Props {
		/** Button caption, e.g. "+ Add" / "+ Effect". */
		label: string;
		groups: AddMenuGroup[];
		disabled?: boolean;
		title?: string;
		onselect: (value: string) => void;
	}

	let { label, groups, disabled = false, title, onselect }: Props = $props();

	let open = $state(false);
	let root = $state<HTMLSpanElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);

	function choose(value: string): void {
		open = false;
		onselect(value);
	}

	// The menu closes whenever focus leaves it — covers outside clicks (they
	// move focus) and Tab in one seam, with no document-level listeners.
	function handleFocusOut(event: FocusEvent): void {
		if (root && event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
		open = false;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && open) {
			event.stopPropagation();
			open = false;
			trigger?.focus();
		}
	}
</script>

<!-- The rail's one add-action grammar: a raised button that opens a menu —
     never a select masquerading as a command (a picker whose "value" is the
     action label confuses AT and lies about state). Discloses at 0ms. -->
<span class="add-menu" bind:this={root} onfocusout={handleFocusOut}>
	<button
		type="button"
		class="ins-add"
		aria-haspopup="menu"
		aria-expanded={open}
		{disabled}
		{title}
		bind:this={trigger}
		onclick={() => (open = !open)}
		onkeydown={handleKeydown}
	>
		{label}
	</button>
	{#if open}
		<div class="add-menu__panel" role="menu" tabindex="-1" onkeydown={handleKeydown}>
			{#each groups as group, index (group.label ?? index)}
				{#if group.label}
					<span class="add-menu__group">{group.label}</span>
				{/if}
				{#each group.items as item (item.value)}
					<button
						type="button"
						role="menuitem"
						class="add-menu__item"
						onclick={() => choose(item.value)}
					>
						{item.label}
					</button>
				{/each}
			{/each}
		</div>
	{/if}
</span>

<style>
	.add-menu {
		display: flex;
		position: relative;
	}

	/* In a grid section body the wrapper stretches row-wide; the trigger
	   follows. Header usages stay content-sized (no free space to grow into). */
	.add-menu > button {
		flex: 1;
	}

	.add-menu__panel {
		background: var(--chrome-raised);
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-s);
		display: grid;
		inset-block-start: calc(100% + 4px);
		inset-inline-end: 0;
		max-block-size: 40dvh;
		min-inline-size: min(max(11rem, 100%), 40dvw);
		overflow-y: auto;
		padding: 4px;
		position: absolute;
		z-index: 10;
	}

	.add-menu__group {
		color: var(--chrome-muted);
		font-size: 0.72rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		padding: 8px 8px 4px;
		text-transform: uppercase;
	}

	.add-menu__item {
		background: transparent;
		border: 0;
		border-radius: 4px;
		color: var(--chrome-text);
		cursor: pointer;
		display: flex;
		font-size: 0.78rem;
		justify-content: flex-start;
		padding: 4px 8px;
		text-align: start;
		transition: background-color 120ms ease;
	}

	.add-menu__item:hover,
	.add-menu__item:focus-visible {
		background: var(--chrome-hairline);
		outline: none;
	}
</style>
