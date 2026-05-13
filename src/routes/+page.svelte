<script lang="ts">
	import type { SurfaceType } from '$lib/platform/engine-schema';
	import { listPresets } from '$lib/platform/preset';

	const SURFACE_LABELS: Record<SurfaceType, string> = {
		'research-paper': 'Research paper',
		'quote-focus': 'Quote focus'
	};

	const presets = listPresets();
</script>

<main class="home stack">
	<h1>Better Randy</h1>
	<ul class="home__list">
		{#each presets as entry (entry.slug)}
			<li>
				<a class="home__row" href="/p/{entry.slug}">
					<span class="home__name">{entry.preset.name}</span>
					<span class="home__surface">{SURFACE_LABELS[entry.preset.state.surface.type]}</span>
				</a>
			</li>
		{/each}
	</ul>
</main>

<style>
	.home {
		padding: var(--pad-l);
		max-inline-size: 40rem;
	}

	h1 {
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

	.home__surface {
		color: var(--fg-6);
		font-size: 0.85rem;
	}
</style>
