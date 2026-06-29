<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	import type { Preset, SurfaceType } from '$lib/platform/engine-schema';
	import type { UserCompositionMeta } from '$lib/platform/persistence';
	import { userStore } from '$lib/platform/persistence';
	import { getPresetBySlug, listFixtures, listPresets } from '$lib/platform/preset';

	const SURFACE_LABELS: Record<SurfaceType, string> = {
		paper: 'Paper',
		plain: 'Plain',
		newspaper: 'Newspaper',
		'pullquote-on-photo': 'Pullquote on photo',
		'chapter-card': 'Chapter card',
		'title-sequence': 'Title sequence',
		'type-hero': 'Type hero',
		'web-document': 'Web document',
		imessage: 'iMessage'
	};

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

	onMount(() => {
		userStore.list().then((list) => {
			userComps = list;
		}).catch(() => {
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
	{@const compositor = compositorBadge(preset)}
	<li>
		<a class="home__card" href="/p/{slug}">
			<span class="home__card-name">{preset.name}</span>
			<span class="home__card-meta">
				<span class="home__surface">{SURFACE_LABELS[preset.state.surface.type]}</span>
				{#if compositor}
					<span class="home__badge">{compositor}</span>
				{/if}
			</span>
		</a>
	</li>
{/snippet}

{#snippet userCard(comp: UserCompositionMeta)}
	<li class="home__user-item">
		<a class="home__card" href="/p/{comp.slug}">
			<span class="home__card-name">{comp.name}</span>
			<span class="home__card-meta">
				<span class="home__surface">your composition</span>
				{#if comp.forkedFrom}
					<span class="home__badge">from {comp.forkedFrom}</span>
				{/if}
			</span>
		</a>
		<button
			class="home__delete"
			type="button"
			aria-label="Delete {comp.name}"
			onclick={() => deleteUserComp(comp.slug)}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
				<path d="M2 4h12M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
	</li>
{/snippet}

<main class="home">
	<div class="home__header">
		<h1>Hiviz</h1>
		<button type="button" onclick={createBlank}>New composition</button>
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
		max-inline-size: 72rem;
		padding: var(--pad-l);
	}

	.home__header {
		align-items: baseline;
		display: flex;
		gap: var(--vs-s);
		justify-content: space-between;
	}

	h1 {
		margin: 0;
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
		gap: var(--vs-xs);
		grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.home__user-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: stretch;
	}

	.home__card {
		border-radius: var(--br-s);
		display: grid;
		gap: var(--vs-xs);
		padding: var(--vs-s) var(--vs-base);
		text-decoration: none;
		transition: background 100ms ease;
	}

	.home__card:hover {
		background: var(--surface-2, #1a1a1a);
	}

	.home__card-name {
		color: var(--fg);
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.home__card-meta {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
	}

	.home__surface {
		color: var(--fg-6);
		font-size: 0.8rem;
	}

	.home__badge {
		background: var(--surface-3, #222);
		border-radius: var(--radius-s);
		color: var(--fg-4);
		font-size: 0.7rem;
		padding-block: 0.1em;
		padding-inline: 0.4em;
		white-space: nowrap;
	}

	.home__delete {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--br-xs);
		color: var(--fg-4);
		cursor: pointer;
		display: flex;
		inline-size: 32px;
		justify-content: center;
		padding: 0;
		transition: color 100ms ease;
	}

	.home__delete:hover {
		color: #E6322A;
	}
</style>
