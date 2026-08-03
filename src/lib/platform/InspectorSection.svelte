<script lang="ts" module>
	// Disclosure is remembered per session, keyed by section label, so the
	// rail keeps its shape while the user works across selections.
	const sectionOpenState: Record<string, boolean> = {};
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
		/** Current-value readout shown while the section is COLLAPSED, so a closed
		 *  section still states what it holds ("4.004 s · 29.97 fps", "Off"). */
		summary?: string | null;
		children: Snippet;
	}

	let { label, action, defaultOpen = true, summary = null, children }: Props = $props();

	// Init-once on purpose: disclosure is per-label session memory, not a
	// derivation of props — the user's toggle owns the state after mount.
	// svelte-ignore state_referenced_locally
	let open = $state(sectionOpenState[label] ?? defaultOpen);

	function toggle(): void {
		open = !open;
		sectionOpenState[label] = open;
	}
</script>

<section class="ins-section">
	<div class="ins-section__head">
		<button type="button" class="ins-section__disclose" aria-expanded={open} onclick={toggle}>
			<!-- Caret leads (▾ open / ▸ closed) so every header reads disclosure
			     state in the same first glyph; the label follows on the grid. -->
			<svg class="ins-section__chevron" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
				<path
					d={open ? 'M1 2.5 4 5.5 7 2.5' : 'M2.5 1 5.5 4 2.5 7'}
					fill="none"
					stroke="currentColor"
					stroke-width="1.4"
				/>
			</svg>
			<span class="ins-section__label">{label}</span>
		</button>
		{#if !open && summary}
			<span class="ins-section__summary">{summary}</span>
		{/if}
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
		padding: 12px 16px;
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
		font-family: 'Paper Mono', monospace;
		font-size: 0.59375rem;
		font-weight: 400;
		letter-spacing: 0.16em;
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

	/* Closed ≠ invisible: the collapsed section's value readout. */
	.ins-section__summary {
		color: var(--chrome-muted);
		font-family: 'Paper Mono', monospace;
		font-size: 0.66rem;
		margin-inline-start: auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
