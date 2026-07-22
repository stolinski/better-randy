<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	import type { Preset } from '$lib/platform/engine-schema';
	import { posterKeyForPreset } from '$lib/platform/posters';
	import type { CataloguedPreset } from '$lib/platform/preset';
	import { getPresetBySlug, listFixtures, listPresets } from '$lib/platform/preset';
	import {
		userCompositionStore,
		type UserCompositionMeta
	} from '$lib/platform/user-composition-store';
	import PosterCard from './PosterCard.svelte';
	import { SURFACE_LABELS } from './surface-labels';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Posters that actually exist (server load reads the store) — cards get a
	// thumbKey only for these, so nothing probes a not-yet-captured poster.
	const posterKeys = $derived(new Set(data.posterKeys));

	// Which compositor a Preset drives, resolved the same way Workspace does:
	// `state.stage` → the dimensional depth stage (real WebGPU 3D, ADR-0028);
	// a `depth-of-field` Effect → the flat multiplane DOF (2.5D, ADR-0027);
	// otherwise the plain flat composite. Only the non-default (3D / 2.5D) ones
	// get a badge so they're discoverable — flat is the unmarked default.
	function compositorBadge(preset: Preset): string | null {
		if (preset.state.stage) return '3D depth stage';
		if (preset.state.effects.some((effect) => effect.type === 'depth-of-field')) {
			return '2.5D multiplane DOF';
		}
		return null;
	}

	const presets = listPresets();
	const fixtures = listFixtures();

	// Content families that cut across the generic `plain` surface — grouping by
	// surface type alone would leave a 25-card run under one heading. Matched by
	// slug prefix; anything unmatched falls back to its surface-type label.
	const TEMPLATE_FAMILIES: readonly { label: string; prefixes: readonly string[] }[] = [
		{ label: 'Captions', prefixes: ['captions-'] },
		{ label: 'Flowcharts', prefixes: ['docu-flowchart', 'wake-conversation-flow'] },
		{ label: 'Docu', prefixes: ['docu-'] },
		{ label: 'Lower thirds', prefixes: ['lower-third'] },
		{ label: 'Social beats', prefixes: ['youtube-', 'instagram-'] }
	];

	function templateGroupLabel(entry: CataloguedPreset): string {
		const family = TEMPLATE_FAMILIES.find((candidate) =>
			candidate.prefixes.some((prefix) => entry.slug.startsWith(prefix))
		);
		return family ? family.label : SURFACE_LABELS[entry.preset.state.surface.type];
	}

	const templateGroups: readonly { label: string; entries: CataloguedPreset[] }[] = (() => {
		const byLabel: Record<string, CataloguedPreset[]> = {};
		for (const entry of presets) {
			const label = templateGroupLabel(entry);
			(byLabel[label] ??= []).push(entry);
		}
		return Object.entries(byLabel)
			.map(([label, entries]) => ({ label, entries }))
			.sort((a, b) => a.label.localeCompare(b.label));
	})();

	let userCompositions = $state<UserCompositionMeta[]>([]);
	// A User composition's poster key needs its full stored Preset (not just the metadata),
	// so resolve them once the list loads; null once resolved-but-unavailable.
	let userCompositionPosterKeys = $state<Record<string, string | null>>({});
	// Two-step in-place delete: first press arms this slug ("Delete?"), second
	// press commits; pointer-down elsewhere or Escape disarms.
	let confirmingSlug = $state<string | null>(null);

	onMount(() => {
		userCompositionStore
			.listUserCompositions()
			.then((userCompositionList) => {
				userCompositions = userCompositionList;
				for (const userComposition of userCompositionList) {
					userCompositionStore
						.loadUserComposition(userComposition.slug)
						.then((preset) => {
							const key = preset ? posterKeyForPreset(preset) : null;
							userCompositionPosterKeys[userComposition.slug] =
								key !== null && posterKeys.has(key) ? key : null;
						})
						.catch(() => {
							userCompositionPosterKeys[userComposition.slug] = null;
						});
				}
			})
			.catch(() => {
				userCompositions = [];
			});
	});

	async function createBlankUserComposition(): Promise<void> {
		const blank = getPresetBySlug('blank');
		if (!blank) return;
		const slug = `comp-${Date.now()}`;
		const named: Preset = { ...blank, name: 'Untitled' };
		await userCompositionStore.forkUserComposition(slug, named, null);
		await goto(resolve('/p/[slug]', { slug }));
	}

	async function deleteUserComposition(slug: string): Promise<void> {
		if (confirmingSlug !== slug) {
			confirmingSlug = slug;
			return;
		}
		confirmingSlug = null;
		try {
			await userCompositionStore.deleteUserComposition(slug);
			userCompositions = userCompositions.filter(
				(userComposition) => userComposition.slug !== slug
			);
		} catch (error) {
			console.error(`Failed to delete composition "${slug}".`, error);
		}
	}

	function disarmDeleteOnPointerDown(event: PointerEvent): void {
		if (confirmingSlug === null) return;
		if (event.target instanceof Element && event.target.closest('.card__delete')) return;
		confirmingSlug = null;
	}

	function disarmDeleteOnEscape(event: KeyboardEvent): void {
		if (confirmingSlug !== null && event.key === 'Escape') confirmingSlug = null;
	}
</script>

<svelte:window onpointerdown={disarmDeleteOnPointerDown} onkeydown={disarmDeleteOnEscape} />

{#snippet presetCard(slug: string, preset: Preset)}
	{@const key = posterKeyForPreset(preset)}
	<li>
		<PosterCard
			{slug}
			thumbKey={posterKeys.has(key) ? key : null}
			name={preset.name}
			type={preset.state.surface.type}
			badge={compositorBadge(preset)}
		/>
	</li>
{/snippet}

{#snippet userCompositionCard(userComposition: UserCompositionMeta)}
	{@const starterTemplate = userComposition.forkedFrom
		? getPresetBySlug(userComposition.forkedFrom)
		: null}
	<li class="card-cell">
		<PosterCard
			slug={userComposition.slug}
			thumbKey={userCompositionPosterKeys[userComposition.slug] ?? null}
			name={userComposition.name}
			type={starterTemplate?.state.surface.type ?? 'plain'}
			badge={starterTemplate ? compositorBadge(starterTemplate) : null}
		/>
		<button
			class="card__delete"
			class:is-confirming={confirmingSlug === userComposition.slug}
			type="button"
			aria-label={confirmingSlug === userComposition.slug
				? `Confirm delete ${userComposition.name}`
				: `Delete ${userComposition.name}`}
			onclick={() => deleteUserComposition(userComposition.slug)}
		>
			{#if confirmingSlug === userComposition.slug}
				Delete?
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 16 16"
					aria-hidden="true"
				>
					<path
						d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4"
						stroke="currentColor"
						stroke-width="1.5"
						fill="none"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{/if}
		</button>
	</li>
{/snippet}

<svelte:head>
	<title>Supers</title>
</svelte:head>

<main class="home">
	<header class="home__header">
		<div class="home__brand">
			<p class="home__stamp">4K / WebGPU / alpha</p>
			<h1 class="home__wordmark">Supers</h1>
		</div>
		<button class="home__new" type="button" onclick={createBlankUserComposition}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 16 16"
				aria-hidden="true"
			>
				<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
			</svg>
			New composition
		</button>
	</header>

	{#if userCompositions.length > 0}
		<section class="home__section home__section--user">
			<h2 class="home__heading">Your compositions</h2>
			<ul class="home__grid">
				{#each userCompositions as userComposition (userComposition.slug)}
					{@render userCompositionCard(userComposition)}
				{/each}
			</ul>
		</section>
	{/if}

	<section class="home__section home__section--templates">
		<h2 class="home__heading">Starter templates</h2>
		{#each templateGroups as group (group.label)}
			<h3 class="home__subheading">{group.label}</h3>
			<ul class="home__grid">
				{#each group.entries as entry (entry.slug)}
					{@render presetCard(entry.slug, entry.preset)}
				{/each}
			</ul>
		{/each}
	</section>

	{#if fixtures.length > 0}
		<details class="home__fixtures">
			<summary class="home__heading home__heading--summary">Demos &amp; fixtures</summary>
			<ul class="home__grid">
				{#each fixtures as entry (entry.slug)}
					{@render presetCard(entry.slug, entry.preset)}
				{/each}
			</ul>
		</details>
	{/if}
</main>

<style>
	/* The DESIGN.md neutral ladder + signal lights, scoped to the home deck.
	   PosterCard reads these same properties by inheritance. */
	.home {
		--ink: #0c0c0e;
		--panel: #131315;
		--raised: #1a1a1d;
		--line: #26262a;
		--text: #e8e8ea;
		--muted: #8a8a90;
		--selection: #ffd608;
		--danger-text: #f0453d;
		background: var(--ink);
		display: grid;
		gap: clamp(1.45rem, 2.6vw, 2.75rem);
		margin-inline: auto;
		max-inline-size: 90rem;
		min-block-size: 100svh;
		padding: clamp(1rem, 2.4vw, 2.4rem);
	}

	.home__header {
		align-items: end;
		border-block-end: 1px solid var(--line);
		color: var(--text);
		display: flex;
		gap: var(--vs-l, 1.5rem);
		justify-content: space-between;
		padding-block: clamp(1rem, 3.2vw, 3.2rem);
	}

	.home__brand {
		display: grid;
		gap: 0.35rem;
	}

	.home__stamp {
		/* Sanctioned spec-plate exception (DESIGN.md Typography): a data readout,
		   so it keeps the instrument mono voice. */
		color: var(--muted);
		font-family: 'JetBrains Mono', monospace;
		font-size: clamp(0.68rem, 0.9vw, 0.8rem);
		font-weight: 600;
		letter-spacing: 0.12em;
		margin: 0;
		text-transform: uppercase;
	}

	.home__wordmark {
		font-family: Archivo, sans-serif;
		font-size: clamp(3.8rem, 9.8vw, 8.8rem);
		font-style: italic;
		font-weight: 900;
		letter-spacing: -0.055em;
		line-height: 0.82;
		margin: 0;
		/* The one sanctioned display accent (DESIGN.md Typography): a single
		   hard-offset signal-hue shadow on the brand shout. */
		text-shadow: 0.04em 0.03em 0 rgb(230 50 42 / 0.55);
		text-transform: uppercase;
	}

	.home__wordmark::after {
		--checker-cell: 0.19em;
		--checker-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2' shape-rendering='crispEdges'%3E%3Cpath fill='white' d='M0 0h1v1H0zM2 0h1v1H2zM1 1h1v1H1z'/%3E%3C/svg%3E");
		background: currentColor;
		block-size: calc(var(--checker-cell) * 2);
		content: '';
		display: inline-block;
		inline-size: calc(var(--checker-cell) * 3);
		margin-inline-start: 0.2em;
		-webkit-mask: var(--checker-mask) 0 0 / 100% 100% no-repeat;
		mask: var(--checker-mask) 0 0 / 100% 100% no-repeat;
		transform: skewX(-10deg);
		transform-origin: 0 100%;
	}

	.home__new {
		align-items: center;
		background: var(--raised);
		border: 1px solid var(--line);
		border-radius: 2px;
		color: var(--text);
		cursor: pointer;
		display: inline-flex;
		font-family: Archivo, sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		gap: var(--vs-xs, 0.45rem);
		letter-spacing: 0.08em;
		padding: 0.72rem 0.92rem;
		text-transform: uppercase;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}

	.home__new:hover {
		background: #202024;
		border-color: #3a3a3e;
	}

	.home__new:focus-visible {
		border-color: var(--selection);
		outline: 2px solid var(--selection);
		outline-offset: 3px;
	}

	.home__section {
		color: var(--text);
		display: grid;
		gap: var(--vs-m, 1rem);
	}

	.home__heading,
	.home__subheading {
		align-items: center;
		display: flex;
		font-family: Archivo, sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		gap: 0.7rem;
		letter-spacing: 0.08em;
		margin: 0;
		text-transform: uppercase;
	}

	.home__heading {
		color: var(--text);
	}

	.home__subheading {
		color: var(--muted);
	}

	.home__heading::after,
	.home__subheading::after {
		background: var(--line);
		block-size: 1px;
		content: '';
		flex: 1;
	}

	/* Group seams inside the template wall: a touch more air above each family
	   than between its label and its cards. */
	.home__grid + .home__subheading {
		margin-block-start: 0.5rem;
	}

	.home__fixtures {
		color: var(--text);
	}

	.home__fixtures .home__grid {
		margin-block-start: var(--vs-m, 1rem);
	}

	.home__heading--summary {
		cursor: pointer;
		list-style: none;
	}

	.home__heading--summary::-webkit-details-marker {
		display: none;
	}

	.home__heading--summary::before {
		color: var(--muted);
		content: '▸';
	}

	.home__fixtures[open] .home__heading--summary::before {
		content: '▾';
	}

	.home__heading--summary:focus-visible {
		outline: 2px solid var(--selection);
		outline-offset: 3px;
	}

	.home__grid {
		container-type: inline-size;
		display: grid;
		gap: clamp(0.9rem, 1.8vw, 1.35rem);
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.home__grid > li {
		min-inline-size: 0;
		position: relative;
	}

	.card-cell {
		position: relative;
	}

	.card__delete {
		align-items: center;
		background: var(--panel);
		block-size: 1.85rem;
		border: 1px solid var(--line);
		border-radius: 2px;
		color: var(--text);
		cursor: pointer;
		display: flex;
		inline-size: 1.85rem;
		inset-block-start: var(--vs-s);
		inset-inline-end: var(--vs-s);
		justify-content: center;
		opacity: 0;
		padding: 0;
		position: absolute;
		transition:
			border-color 100ms ease,
			color 100ms ease,
			opacity 100ms ease;
		z-index: 3;
	}

	.card-cell:hover .card__delete,
	.card__delete:focus-visible,
	.card__delete.is-confirming {
		opacity: 1;
	}

	.card__delete:hover {
		border-color: #3a3a3e;
		color: var(--danger-text);
	}

	.card__delete.is-confirming {
		background: var(--ink);
		color: var(--danger-text);
		font-family: Archivo, sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		inline-size: auto;
		letter-spacing: 0.08em;
		padding-inline: 0.55rem;
		text-transform: uppercase;
	}

	.card__delete:focus-visible {
		outline: 2px solid var(--selection);
		outline-offset: 2px;
	}

	@media (hover: none), (pointer: coarse) {
		.card__delete {
			opacity: 1;
		}

		/* Keep the 1.85rem visual; extend the effective touch target past 44px. */
		.card__delete::after {
			content: '';
			inset: -0.5rem;
			position: absolute;
		}
	}

	@media (max-width: 46rem) {
		.home__header {
			align-items: start;
			flex-direction: column;
			min-block-size: auto;
		}
	}
</style>
