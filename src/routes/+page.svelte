<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	import type { Preset } from '$lib/platform/engine-schema';
	import type { UserCompositionMeta } from '$lib/platform/persistence';
	import { userStore } from '$lib/platform/persistence';
	import { posterKeyForPreset } from '$lib/platform/posters';
	import { getPresetBySlug, listFixtures, listPresets } from '$lib/platform/preset';
	import PosterCard from './PosterCard.svelte';

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

	let userComps = $state<UserCompositionMeta[]>([]);
	// A user comp's poster key needs its full stored preset (not just the meta),
	// so resolve them once the list loads; null once resolved-but-unavailable.
	let compKeys = $state<Record<string, string | null>>({});

	onMount(() => {
		userStore
			.list()
			.then((list) => {
				userComps = list;
				for (const comp of list) {
					userStore
						.load(comp.slug)
						.then((preset) => {
							compKeys[comp.slug] = posterKeyForPreset(preset);
						})
						.catch(() => {
							compKeys[comp.slug] = null;
						});
				}
			})
			.catch(() => {
				userComps = [];
			});
	});

	async function createBlank(): Promise<void> {
		const blank = getPresetBySlug('blank');
		if (!blank) return;
		const slug = `comp-${Date.now()}`;
		const named: Preset = { ...blank, name: 'Untitled' };
		await userStore.fork(slug, named, null);
		await goto(`/p/${slug}`);
	}

	async function deleteUserComp(slug: string): Promise<void> {
		if (!confirm('Delete this composition?')) return;
		await userStore.del(slug);
		userComps = userComps.filter((c) => c.slug !== slug);
	}
</script>

{#snippet presetCard(slug: string, preset: Preset)}
	<li>
		<PosterCard
			{slug}
			thumbKey={posterKeyForPreset(preset)}
			name={preset.name}
			type={preset.state.surface.type}
			orientation={preset.state.transport.orientation}
			badge={compositorBadge(preset)}
		/>
	</li>
{/snippet}

{#snippet userCard(comp: UserCompositionMeta)}
	{@const base = comp.forkedFrom ? getPresetBySlug(comp.forkedFrom) : null}
	<li class="card-cell">
		<PosterCard
			slug={comp.slug}
			thumbKey={compKeys[comp.slug] ?? null}
			name={comp.name}
			type={base?.state.surface.type ?? 'plain'}
			orientation={base?.state.transport.orientation ?? 'horizontal'}
			badge={base ? compositorBadge(base) : null}
		/>
		<button
			class="card__delete"
			type="button"
			aria-label="Delete {comp.name}"
			onclick={() => deleteUserComp(comp.slug)}
		>
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
		<button class="home__new" type="button" onclick={createBlank}>
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

	{#if userComps.length > 0}
		<section class="home__section home__section--user">
			<h2 class="home__heading">Your compositions</h2>
			<ul class="home__grid">
				{#each userComps as comp (comp.slug)}
					{@render userCard(comp)}
				{/each}
			</ul>
		</section>
	{/if}

	<section class="home__section home__section--templates">
		<h2 class="home__heading">Starter templates</h2>
		<ul class="home__grid">
			{#each presets as entry (entry.slug)}
				{@render presetCard(entry.slug, entry.preset)}
			{/each}
		</ul>
	</section>

	{#if fixtures.length > 0}
		<section class="home__section home__section--fixtures">
			<h2 class="home__heading">Demos &amp; fixtures</h2>
			<ul class="home__grid">
				{#each fixtures as entry (entry.slug)}
					{@render presetCard(entry.slug, entry.preset)}
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	.home {
		--race-ink: #07070a;
		--race-panel: #111119;
		--race-panel-2: #181822;
		--race-line: #2b2b36;
		--race-text: #f4f4f7;
		--race-muted: #8d8d99;
		--signal-yellow: #ffd608;
		--signal-red: #e6322a;
		--signal-cyan: #2de8ee;
		display: grid;
		gap: clamp(1.45rem, 2.6vw, 2.75rem);
		isolation: isolate;
		margin-inline: auto;
		max-inline-size: 90rem;
		min-block-size: 100svh;
		padding: clamp(1rem, 2.4vw, 2.4rem);
		position: relative;
	}

	.home::before,
	.home::after {
		content: '';
		inset: 0;
		pointer-events: none;
		position: absolute;
		z-index: -1;
	}

	.home::before {
		background: var(--race-ink);
	}

	.home::after {
		background: linear-gradient(90deg, rgb(230 50 42 / 0.18), rgb(255 214 8 / 0.2), transparent 52%);
		block-size: 1px;
		inset-block-end: auto;
		opacity: 1;
		width: 100%;
	}

	.home__header {
		align-items: end;
		background: transparent;
		border-block-end: 1px solid var(--race-line);
		border-radius: 0;
		color: var(--race-text);
		display: flex;
		gap: var(--vs-l, 1.5rem);
		justify-content: space-between;
		padding-block: clamp(1rem, 3.2vw, 3.2rem);
		position: relative;
	}

	.home__header::before {
		background: var(--signal-yellow);
		block-size: 0.34rem;
		content: '';
		inline-size: min(18rem, 50vw);
		inset-block-end: -1px;
		inset-inline-start: 0;
		position: absolute;
	}

	.home__brand {
		display: grid;
		gap: 0.35rem;
		position: relative;
		z-index: 1;
	}

	.home__stamp,
	.home__heading {
		font-family: 'JetBrains Mono', monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.home__stamp {
		color: var(--signal-cyan);
		font-size: clamp(0.68rem, 0.9vw, 0.8rem);
		font-weight: var(--fw-semibold);
		margin: 0;
	}

	.home__wordmark {
		font-family: Archivo, sans-serif;
		font-size: clamp(3.8rem, 9.8vw, 8.8rem);
		font-style: italic;
		font-weight: 900;
		letter-spacing: -0.055em;
		line-height: 0.82;
		margin: 0;
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
		background: var(--signal-yellow);
		border: 1px solid var(--race-line);
		border-radius: 0.35rem;
		color: #09090c;
		cursor: pointer;
		display: inline-flex;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.76rem;
		font-weight: var(--fw-semibold);
		gap: var(--vs-xs, 0.45rem);
		padding: 0.72rem 0.92rem;
		position: relative;
		text-transform: uppercase;
		transition:
			background 120ms ease,
			translate 120ms ease;
		z-index: 1;
	}

	.home__new:hover {
		background: var(--signal-cyan);
		border-color: #000;
		translate: 0 -0.12rem;
	}

	.home__new:focus-visible {
		border-color: var(--signal-yellow);
		outline: 2px solid var(--signal-yellow);
		outline-offset: 3px;
	}

	.home__section {
		background: transparent;
		border: 0;
		border-radius: 0;
		color: var(--race-text);
		display: grid;
		gap: var(--vs-m, 1rem);
		padding: 0;
		position: relative;
	}

	.home__heading {
		align-items: center;
		color: var(--race-text);
		display: flex;
		font-size: 0.76rem;
		font-weight: var(--fw-semibold);
		gap: 0.7rem;
		margin: 0;
	}

	.home__heading::after {
		background: linear-gradient(90deg, currentColor, transparent);
		block-size: 1px;
		content: '';
		flex: 1;
		opacity: 0.24;
	}

	.home__section--user .home__heading {
		color: var(--signal-cyan);
	}

	.home__section--templates .home__heading {
		color: var(--signal-yellow);
	}

	.home__section--fixtures .home__heading {
		color: var(--signal-red);
	}

	.home__grid {
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

	.home :global(.poster-card) {
		background: color-mix(in oklab, var(--race-panel) 82%, white);
		border-color: var(--race-line);
		border-radius: 0.4rem;
		box-shadow: none;
	}

	.home :global(.poster-card:hover) {
		border-color: var(--signal-cyan);
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--signal-cyan) 70%, transparent),
			0 0.75rem 1.5rem rgb(0 0 0 / 0.16);
		transform: translateY(-0.1rem);
	}

	.home :global(.poster-card:focus-visible) {
		border-color: var(--signal-yellow);
		outline: 2px solid var(--signal-yellow);
		outline-offset: 3px;
	}

	.home :global(.poster-card__body) {
		background: color-mix(in oklab, var(--race-panel) 82%, white);
		border-block-start: 1px solid var(--race-line);
	}

	.home :global(.poster-card__name) {
		color: var(--race-text);
	}

	.home :global(.poster-card__meta) {
		font-family: 'JetBrains Mono', monospace;
		text-transform: lowercase;
	}

	.home :global(.poster-card__surface) {
		color: var(--race-muted);
	}

	.home :global(.poster-card__badge) {
		background: #9f1d1a;
		border-radius: 999px;
		color: #fff;
	}

	.card-cell {
		position: relative;
	}

	.card__delete {
		align-items: center;
		background: var(--race-panel);
		border: 1px solid var(--race-line);
		border-radius: 0.35rem;
		color: #fff;
		cursor: pointer;
		display: flex;
		inline-size: 1.85rem;
		block-size: 1.85rem;
		inset-block-start: var(--vs-s);
		inset-inline-end: var(--vs-s);
		justify-content: center;
		opacity: 0;
		padding: 0;
		position: absolute;
		transition:
			background 100ms ease,
			opacity 100ms ease;
		z-index: 3;
	}

	.card-cell:hover .card__delete,
	.card__delete:focus-visible {
		opacity: 1;
	}

	.card__delete:hover {
		background: var(--signal-red);
	}

	.card__delete:focus-visible {
		outline: 2px solid var(--signal-yellow);
		outline-offset: 2px;
	}

	@media (hover: none), (pointer: coarse) {
		.card__delete {
			opacity: 1;
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
