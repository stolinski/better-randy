<script lang="ts">
	import { page } from '$app/state';

	import { compositionMeta } from '$lib/platform/composition-meta.svelte';
	import type { Preset } from '$lib/platform/engine-schema';
	import { engineState, packState } from '$lib/platform/engine-state.svelte';
	import { userStore } from '$lib/platform/persistence';
	import { applyPreset, getPresetBySlug } from '$lib/platform/preset';
	import { serializeCompositionState } from '$lib/platform/preset-pure';
	import Workspace from '$lib/platform/Workspace.svelte';

	const slug = $derived(page.params.slug ?? '');

	// The base Preset: the template from which edits are derived.
	// Set once per slug load; read by performSave.
	let base: Preset | null = null;
	// Snapshot taken immediately after applyPreset — used to detect the first
	// real edit (anything different from a fresh load must be user input).
	let loadSnapshot = '';
	let loadedSlug = '';

	// Track whether the currently-viewed preset was found in the user store.
	// This determines fork vs autosave on edit.
	let activeIsUserComp = false;

	// Load: user store first, corpus fallback.
	$effect(() => {
		const currentSlug = slug;
		if (!currentSlug) return;

		userStore
			.load(currentSlug)
			.then((preset) => {
				if (currentSlug !== slug) return;
				applyPreset(preset);
				base = preset;
				activeIsUserComp = true;
				loadedSlug = currentSlug;
				loadSnapshot = snapshotState();
				compositionMeta.isUserComp = true;
				compositionMeta.userSlug = currentSlug;
				compositionMeta.forkedFrom = null;
			})
			.catch(() => {
				const corpus = getPresetBySlug(currentSlug);
				if (!corpus || currentSlug !== slug) return;
				applyPreset(corpus);
				base = corpus;
				activeIsUserComp = false;
				loadedSlug = currentSlug;
				loadSnapshot = snapshotState();
				compositionMeta.isUserComp = false;
				compositionMeta.userSlug = currentSlug;
				compositionMeta.forkedFrom = null;
			});
	});

	// Autosave: run on any change to engineState or pack.
	// Skips when the state matches the post-load snapshot (no edit yet).
	$effect(() => {
		const currentSnap = snapshotState();

		if (!base || !loadedSlug || currentSnap === loadSnapshot) return;

		const capturedBase = base;
		const capturedSlug = loadedSlug;
		const capturedIsUser = activeIsUserComp;

		const timer = setTimeout(() => {
			const serialized = serializeCompositionState(capturedBase, engineState, packState.slug);
			if (capturedIsUser) {
				userStore.save(capturedSlug, serialized).catch((err) =>
					console.error('Autosave failed', err)
				);
			} else {
				userStore
					.fork(capturedSlug, serialized, capturedSlug)
					.then(() => {
						activeIsUserComp = true;
						compositionMeta.isUserComp = true;
						compositionMeta.forkedFrom = capturedSlug;
						// Update base to the serialized fork so subsequent saves are autosaves.
						base = serialized;
					})
					.catch((err) => console.error('Fork failed', err));
			}
		}, 500);

		return () => clearTimeout(timer);
	});

	function snapshotState(): string {
		return JSON.stringify(engineState) + packState.slug;
	}

	const isKnown = $derived(!!getPresetBySlug(slug) || compositionMeta.userSlug === slug);
</script>

{#if !isKnown && !compositionMeta.isUserComp}
	<main class="missing stack">
		<h1>Preset not found</h1>
		<p>No preset named "{slug}".</p>
		<a href="/">All presets</a>
	</main>
{:else}
	<Workspace />
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
