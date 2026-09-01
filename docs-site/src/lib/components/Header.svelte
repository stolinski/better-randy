<script lang="ts">
	import { page } from '$app/state';
	import gfxLogotype from '$identity/gfx-logotype.svg';
	import gfxMark from '$identity/gfx-mark.svg';
	import { ui } from '$lib/ui.svelte';

	const isDoc = $derived(page.url.pathname !== '/');

	function openSearch() {
		ui.searchOpen = true;
	}

	function toggleMenu() {
		ui.menuOpen = !ui.menuOpen;
	}
</script>

<header>
	{#if isDoc}
		<button class="menu" onclick={toggleMenu} aria-label="Menu" aria-expanded={ui.menuOpen}>
			<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" stroke-width="1.5" />
			</svg>
		</button>
	{/if}
	<!-- The masthead lockup matches the app's: mark, then logotype, on one
	     baseline. The logotype carries the accessible name, so the mark is
	     decorative (docs/identity/README.md). -->
	<a class="wordmark" href="/">
		<img class="mark" src={gfxMark} alt="" width="18" height="18" />
		<img class="logotype" src={gfxLogotype} alt="GFX" width="38" height="15" />
		<span class="tag">docs</span>
	</a>
	<nav>
		<button class="search-trigger" onclick={openSearch}>
			<svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
				<circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
				<path d="M9.5 9.5 13 13" stroke="currentColor" stroke-width="1.5" />
			</svg>
			Search
			<kbd>⌘K</kbd>
		</button>
	</nav>
</header>

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		gap: 1rem;
		height: var(--header-h);
		padding: 0 1.25rem;
		background: color-mix(in srgb, var(--ink) 88%, transparent);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid var(--line-soft);
	}

	.menu {
		display: none;
		color: var(--muted);
		padding: 0.375rem;
	}

	.wordmark {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
		font-size: 1rem;
		color: var(--text);
	}

	.mark,
	.logotype {
		display: block;
	}

	.tag {
		font-family: var(--mono);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.1em;
		color: var(--muted);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.1rem 0.35rem;
		translate: 0 1px;
	}

	nav {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.search-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: var(--muted);
		background: var(--panel);
		border: 1px solid var(--line-soft);
		border-radius: 6px;
		padding: 0.375rem 0.625rem;
		transition:
			color 120ms,
			border-color 120ms;
	}

	.search-trigger:hover {
		color: var(--text);
		border-color: var(--line);
	}

	kbd {
		font-family: var(--mono);
		font-size: 0.625rem;
		color: var(--faint);
		border: 1px solid var(--line-soft);
		border-radius: 3px;
		padding: 0.05rem 0.3rem;
	}

	@media (max-width: 56rem) {
		.menu {
			display: block;
		}

		.search-trigger kbd {
			display: none;
		}
	}
</style>
