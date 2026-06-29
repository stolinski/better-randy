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
</script>

{#snippet presetRow(slug: string, preset: Preset)}
	{@const compositor = compositorBadge(preset)}
	<li>
		<a class="home__row" href="/p/{slug}">
			<span class="home__name">{preset.name}</span>
			<span class="home__meta">
				{#if compositor}
					<span class="home__compositor">{compositor}</span>
				{/if}
				<span class="home__surface">{SURFACE_LABELS[preset.state.surface.type]}</span>
			</span>
		</a>
	</li>
{/snippet}

{#snippet userRow(comp: UserCompositionMeta)}
	<li>
		<a class="home__row" href="/p/{comp.slug}">
			<span class="home__name">{comp.name}</span>
			<span class="home__meta">
				{#if comp.forkedFrom}
					<span class="home__compositor">from {comp.forkedFrom}</span>
				{/if}
				<span class="home__surface">your composition</span>
			</span>
		</a>
	</li>
{/snippet}

<main class="home stack">
	<div class="home__header">
		<h1>Better Randy</h1>
		<button type="button" onclick={createBlank}>New composition</button>
	</div>

	{#if userComps.length > 0}
		<h2 class="home__heading">Your compositions</h2>
		<ul class="home__list">
			{#each userComps as comp (comp.slug)}
				{@render userRow(comp)}
			{/each}
		</ul>
	{/if}

	<h2 class="home__heading">Starter templates</h2>
	<ul class="home__list">
		{#each presets as entry (entry.slug)}
			{@render presetRow(entry.slug, entry.preset)}
		{/each}
	</ul>

	{#if fixtures.length > 0}
		<h2 class="home__heading">Demos &amp; fixtures</h2>
		<ul class="home__list">
			{#each fixtures as entry (entry.slug)}
				{@render presetRow(entry.slug, entry.preset)}
			{/each}
		</ul>
	{/if}
</main>

<style>
	.home {
		padding: var(--pad-l);
		max-inline-size: 40rem;
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
		font-size: 0.95rem;
		font-weight: var(--fw-semibold);
		margin: 0;
	}

	.home__list {
		display: grid;
		gap: var(--vs-xs);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.home__row {
		display: grid;
		gap: var(--vs-s);
		grid-template-columns: minmax(0, 1fr) auto;
		padding-block: var(--vs-xs);
	}

	.home__name {
		font-weight: var(--fw-semibold);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.home__meta {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
	}

	.home__surface {
		color: var(--fg-6);
		font-size: 0.85rem;
	}

	.home__compositor {
		background: var(--surface-3);
		border-radius: var(--radius-s);
		color: var(--fg-4);
		font-size: 0.72rem;
		padding-block: 0.1em;
		padding-inline: var(--vs-xs);
		white-space: nowrap;
	}
</style>
