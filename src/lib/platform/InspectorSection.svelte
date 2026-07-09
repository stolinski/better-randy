<script lang="ts" module>
	// Disclosure is remembered per session, keyed by section label, so the
	// rail keeps its shape while the user works across selections.
	const sectionOpenState = new Map<string, boolean>();
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** All-caps section label, flush-left on the divider (ADR-0034 §9). */
		label: string;
		/** Optional right-aligned control in the section header (e.g. + Add, a toggle). */
		action?: Snippet;
		/** Sections past the everyday core (Keyframes, Cascade, Sound, Text
		 *  Motion) start collapsed so the rail's depth stays disclosed, not
		 *  scrolled (ADR-0034 §9 progressive disclosure). */
		defaultOpen?: boolean;
		children: Snippet;
	}

	let { label, action, defaultOpen = true, children }: Props = $props();

	// Init-once on purpose: disclosure is per-label session memory, not a
	// derivation of props — the user's toggle owns the state after mount.
	// svelte-ignore state_referenced_locally
	let open = $state(sectionOpenState.get(label) ?? defaultOpen);

	function toggle(): void {
		open = !open;
		sectionOpenState.set(label, open);
	}
</script>

<section class="ins-section">
	<div class="ins-section__head">
		<button type="button" class="ins-section__disclose" aria-expanded={open} onclick={toggle}>
			<!-- Label first: section labels stay flush left on the shared grid;
			     the chevron trails as the disclosure affordance. -->
			<span class="ins-section__label">{label}</span>
			<svg class="ins-section__chevron" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
				<path
					d={open ? 'M1 2.5 4 5.5 7 2.5' : 'M2.5 1 5.5 4 2.5 7'}
					fill="none"
					stroke="currentColor"
					stroke-width="1.4"
				/>
			</svg>
		</button>
		{#if action}
			<div class="ins-section__action">{@render action()}</div>
		{/if}
	</div>
	{#if open}
		{@render children()}
	{/if}
</section>

<style>
	/* ADR-0034 §9: sections are separated by a single 1px divider with an inline
	   all-caps label flush left — never bordered cards. Fields hang below.
	   Disclosure is a plain chevron on the label; it snaps at 0ms. */
	.ins-section {
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-s);
		padding: 12px var(--vs-s);
	}

	/* One fixed head height — heads never change height with their content,
	   so the rail's repeated structure keeps a single rhythm. */
	.ins-section__head {
		align-items: center;
		block-size: 26px;
		column-gap: var(--vs-s);
		display: flex;
		justify-content: space-between;
	}

	.ins-section__disclose {
		align-items: center;
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		display: flex;
		gap: var(--vs-xs);
		min-inline-size: 0;
		padding: 0;
	}

	.ins-section__disclose:focus-visible {
		color: var(--chrome-text);
		outline: none;
	}

	.ins-section__disclose:hover {
		color: var(--chrome-text);
	}

	.ins-section__chevron {
		flex: none;
	}

	.ins-section__label {
		font-family: Archivo, sans-serif;
		font-size: 0.72rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		line-height: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.ins-section__action {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
	}
</style>
