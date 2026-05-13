<script lang="ts">
	import { page } from '$app/state';

	import { isQuoteFocusSurface, isResearchPaperSurface } from '$lib/platform/engine-schema';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { applyPreset, getPresetBySlug } from '$lib/platform/preset';
	import QuoteFocusWorkspace from '$lib/tools/quote-focus/QuoteFocusWorkspace.svelte';
	import ResearchPaperWorkspace from '$lib/tools/research-paper/ResearchPaperWorkspace.svelte';

	const slug = $derived(page.params.slug ?? '');
	const preset = $derived(getPresetBySlug(slug));

	let lastAppliedSlug = $state<string | null>(null);

	$effect(() => {
		if (preset && lastAppliedSlug !== slug) {
			applyPreset(preset);
			lastAppliedSlug = slug;
		}
	});
</script>

{#if !preset}
	<main class="missing stack">
		<h1>Preset not found</h1>
		<p>No preset named “{slug}”.</p>
		<a href="/">All presets</a>
	</main>
{:else if isResearchPaperSurface(engineState.surface)}
	<ResearchPaperWorkspace />
{:else if isQuoteFocusSurface(engineState.surface)}
	<QuoteFocusWorkspace />
{/if}

<style>
	.missing {
		padding: var(--pad-l);
		max-inline-size: 32rem;
	}

	.missing h1 {
		margin: 0;
	}
</style>
