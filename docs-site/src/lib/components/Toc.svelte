<script lang="ts">
	import type { DocHeading } from '$lib/server/docs';

	let { headings }: { headings: DocHeading[] } = $props();

	let activeId = $state('');

	function spy() {
		const marker = window.scrollY + window.innerHeight * 0.25;
		let current = '';
		for (const heading of headings) {
			const el = document.getElementById(heading.id);
			if (el && el.offsetTop <= marker) current = heading.id;
		}
		activeId = current;
	}
</script>

<svelte:window onscroll={spy} />

{#if headings.length > 1}
	<nav aria-label="On this page">
		<h2>On this page</h2>
		<ul>
			{#each headings as heading (heading.id)}
				<li class:sub={heading.depth === 3}>
					<a href={'#' + heading.id} class:active={activeId === heading.id}>{heading.text}</a>
				</li>
			{/each}
		</ul>
	</nav>
{/if}

<style>
	nav {
		position: sticky;
		top: calc(var(--header-h) + 2.5rem);
		max-height: calc(100dvh - var(--header-h) - 5rem);
		overflow-y: auto;
		font-size: 0.75rem;
		scrollbar-width: thin;
		scrollbar-color: var(--line) transparent;
	}

	h2 {
		font-family: var(--mono);
		font-size: 0.6563rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--faint);
		margin: 0 0 0.625rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-left: 1px solid var(--line-soft);
	}

	li a {
		display: block;
		color: var(--muted);
		text-decoration: none;
		padding: 0.2rem 0 0.2rem 0.75rem;
		margin-left: -1px;
		border-left: 1px solid transparent;
		line-height: 1.45;
		transition:
			color 100ms,
			border-color 100ms;
	}

	li.sub a {
		padding-left: 1.5rem;
	}

	li a:hover {
		color: var(--text);
	}

	li a.active {
		color: var(--text);
		border-left-color: var(--signal-y);
	}
</style>
