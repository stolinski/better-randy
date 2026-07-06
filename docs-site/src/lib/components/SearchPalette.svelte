<script lang="ts">
	import { goto } from '$app/navigation';
	import { ui } from '$lib/ui.svelte';
	import type { SearchEntry } from '$lib/server/docs';

	let query = $state('');
	let selected = $state(0);
	let index: SearchEntry[] | null = $state(null);

	function open() {
		ui.searchOpen = true;
		query = '';
		selected = 0;
	}

	async function loadIndex() {
		if (index) return;
		const res = await fetch('/search.json');
		index = (await res.json()) as SearchEntry[];
	}

	function setup(node: HTMLInputElement) {
		node.focus();
		loadIndex().catch((error) => console.error('search index failed to load', error));
	}

	function close() {
		ui.searchOpen = false;
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			if (ui.searchOpen) close();
			else open();
			return;
		}
		if (ui.searchOpen && event.key === 'Escape') close();
		if (
			!ui.searchOpen &&
			event.key === '/' &&
			!(event.target instanceof HTMLInputElement) &&
			!(event.target instanceof HTMLTextAreaElement)
		) {
			event.preventDefault();
			open();
		}
	}

	interface Hit {
		entry: SearchEntry;
		excerpt: string;
	}

	const hits: Hit[] = $derived.by(() => {
		if (!index || query.trim().length < 2) return [];
		const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
		const scored: Array<{ score: number; hit: Hit }> = [];
		for (const entry of index) {
			const title = entry.title.toLowerCase();
			const body = entry.text.toLowerCase();
			let score = 0;
			let firstBodyHit = -1;
			for (const term of terms) {
				if (title.includes(term)) score += title.startsWith(term) ? 20 : 10;
				const at = body.indexOf(term);
				if (at >= 0) {
					score += 2;
					if (firstBodyHit < 0) firstBodyHit = at;
				}
			}
			if (score === 0) continue;
			const start = Math.max(0, firstBodyHit - 40);
			const excerpt =
				firstBodyHit < 0 ? entry.text.slice(0, 110) : entry.text.slice(start, start + 110);
			scored.push({ score, hit: { entry, excerpt: (start > 0 ? '…' : '') + excerpt } });
		}
		return scored
			.sort((a, b) => b.score - a.score)
			.slice(0, 8)
			.map((s) => s.hit);
	});

	function onInputKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected = Math.min(selected + 1, hits.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected = Math.max(selected - 1, 0);
		} else if (event.key === 'Enter' && hits[selected]) {
			event.preventDefault();
			pick(hits[selected].entry.href);
		}
	}

	function pick(href: string) {
		close();
		goto(href);
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if ui.searchOpen}
	<button class="scrim" onclick={close} aria-label="Close search"></button>
	<div class="palette" role="dialog" aria-label="Search docs">
		<input
			type="search"
			name="docs-search"
			placeholder="Search the docs…"
			bind:value={query}
			oninput={() => (selected = 0)}
			onkeydown={onInputKeydown}
			{@attach setup}
		/>
		{#if hits.length > 0}
			<ul>
				{#each hits as hit, i (hit.entry.href)}
					<li>
						<a
							href={hit.entry.href}
							class:selected={i === selected}
							onclick={(event) => {
								event.preventDefault();
								pick(hit.entry.href);
							}}
						>
							<span class="where">{hit.entry.section}</span>
							<span class="title">{hit.entry.title}</span>
							<span class="excerpt">{hit.excerpt}</span>
						</a>
					</li>
				{/each}
			</ul>
		{:else if query.trim().length >= 2 && index}
			<p class="empty">No matches for “{query}”</p>
		{/if}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 30;
		background: rgb(0 0 0 / 0.6);
		cursor: default;
	}

	.palette {
		position: fixed;
		z-index: 31;
		top: 14vh;
		left: 50%;
		translate: -50% 0;
		width: min(37.5rem, calc(100vw - 2rem));
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: 10px;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.55);
		overflow: hidden;
	}

	input {
		width: 100%;
		background: none;
		border: 0;
		border-bottom: 1px solid var(--line-soft);
		color: var(--text);
		font: inherit;
		font-size: 0.9375rem;
		padding: 0.875rem 1.125rem;
	}

	input:focus {
		outline: none;
	}

	input::placeholder {
		color: var(--faint);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0.375rem;
		max-height: 22rem;
		overflow-y: auto;
	}

	li a {
		display: grid;
		grid-template-columns: 5.5rem 1fr;
		grid-template-rows: auto auto;
		column-gap: 0.75rem;
		align-items: baseline;
		text-decoration: none;
		padding: 0.55rem 0.75rem;
		border-radius: 6px;
	}

	li a:hover,
	li a.selected {
		background: var(--raise);
	}

	li a.selected {
		box-shadow: inset 2px 0 0 var(--signal-y);
	}

	.where {
		grid-row: 1 / 3;
		font-family: var(--mono);
		font-size: 0.625rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--faint);
	}

	.title {
		font-size: 0.8438rem;
		font-weight: 550;
	}

	.excerpt {
		grid-column: 2;
		font-size: 0.75rem;
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.empty {
		margin: 0;
		padding: 1rem 1.125rem;
		font-size: 0.8125rem;
		color: var(--muted);
	}
</style>
