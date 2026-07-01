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

<main class="home">
	<div class="home__header">
		<h1 class="home__wordmark">Hiviz</h1>
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
	</div>

	{#if userComps.length > 0}
		<section>
			<h2 class="home__heading">Your compositions</h2>
			<ul class="home__grid">
				{#each userComps as comp (comp.slug)}
					{@render userCard(comp)}
				{/each}
			</ul>
		</section>
	{/if}

	<section>
		<h2 class="home__heading">Starter templates</h2>
		<ul class="home__grid">
			{#each presets as entry (entry.slug)}
				{@render presetCard(entry.slug, entry.preset)}
			{/each}
		</ul>
	</section>

	{#if fixtures.length > 0}
		<section>
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
		display: grid;
		gap: var(--vs-l, 2rem);
		margin-inline: auto;
		max-inline-size: 74rem;
		padding: var(--vs-xl) var(--vs-l);
	}

	.home__header {
		align-items: center;
		border-block-end: var(--border-1);
		display: flex;
		gap: var(--vs-s);
		justify-content: space-between;
		padding-block-end: var(--vs-m);
	}

	.home__wordmark {
		font-size: 1.5rem;
		font-weight: var(--fw-bold);
		letter-spacing: -0.01em;
		margin: 0;
	}

	.home__new {
		align-items: center;
		background: var(--fg-1);
		border: var(--border-1);
		border-radius: var(--br-s);
		color: var(--fg);
		cursor: pointer;
		display: inline-flex;
		font-size: 0.82rem;
		font-weight: var(--fw-medium);
		gap: var(--vs-xs);
		padding: 0.45rem 0.75rem;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}

	.home__new:hover {
		background: var(--fg-2);
		border-color: var(--fg-4);
	}

	.home__heading {
		color: var(--fg-6);
		font-size: 0.85rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.06em;
		margin: 0 0 var(--vs-s);
		text-transform: uppercase;
	}

	.home__grid {
		display: grid;
		gap: var(--vs-m);
		grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.card-cell {
		position: relative;
	}

	.card__delete {
		align-items: center;
		background: var(--bg);
		border: var(--border-1);
		border-radius: var(--br-xs);
		color: var(--fg-4);
		cursor: pointer;
		display: flex;
		inline-size: 1.75rem;
		block-size: 1.75rem;
		inset-block-start: var(--vs-s);
		inset-inline-end: var(--vs-s);
		justify-content: center;
		opacity: 0;
		padding: 0;
		position: absolute;
		transition:
			color 100ms ease,
			opacity 100ms ease;
	}

	.card-cell:hover .card__delete,
	.card__delete:focus-visible {
		opacity: 1;
	}

	.card__delete:hover {
		color: #e6322a;
	}
</style>
