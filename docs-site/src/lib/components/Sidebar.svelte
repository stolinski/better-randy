<script lang="ts">
	import { page } from '$app/state';
	import { ui } from '$lib/ui.svelte';
	import type { NavSection } from '$lib/server/docs';

	let { nav }: { nav: NavSection[] } = $props();

	function close() {
		ui.menuOpen = false;
	}
</script>

<aside class:open={ui.menuOpen}>
	<nav aria-label="Docs">
		{#each nav as section (section.label)}
			<section>
				<h2>{section.label}</h2>
				<ul>
					{#each section.items as item (item.href)}
						<li>
							<a
								href={item.href}
								aria-current={page.url.pathname === item.href ? 'page' : undefined}
								onclick={close}
							>
								{#if item.badge}<span class="badge">{item.badge}</span>{/if}
								{item.title}
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</nav>
</aside>

{#if ui.menuOpen}
	<button class="scrim" onclick={close} aria-label="Close menu"></button>
{/if}

<style>
	aside {
		position: sticky;
		top: var(--header-h);
		height: calc(100dvh - var(--header-h));
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 1.5rem 0.75rem 3rem 1.25rem;
		border-right: 1px solid var(--line-soft);
		scrollbar-width: thin;
		scrollbar-color: var(--line) transparent;
	}

	section + section {
		margin-top: 1.75rem;
	}

	h2 {
		font-family: var(--mono);
		font-size: 0.6563rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--faint);
		margin: 0 0 0.5rem 0.625rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	a {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--muted);
		text-decoration: none;
		padding: 0.3rem 0.625rem;
		border-radius: 5px;
		border-left: 2px solid transparent;
		transition:
			color 100ms,
			background 100ms;
	}

	a:hover {
		color: var(--text);
		background: var(--panel);
	}

	a[aria-current='page'] {
		color: var(--text);
		background: var(--panel);
		border-left-color: var(--signal-y);
		border-radius: 0 5px 5px 0;
	}

	.badge {
		font-family: var(--mono);
		font-size: 0.6563rem;
		color: var(--faint);
		flex-shrink: 0;
	}

	.scrim {
		display: none;
	}

	@media (max-width: 56rem) {
		aside {
			position: fixed;
			left: 0;
			z-index: 20;
			width: 18rem;
			background: var(--ink);
			translate: -100% 0;
			transition: translate 180ms ease;
		}

		aside.open {
			translate: 0 0;
		}

		.scrim {
			display: block;
			position: fixed;
			inset: var(--header-h) 0 0 0;
			z-index: 15;
			background: rgb(0 0 0 / 0.5);
		}
	}
</style>
