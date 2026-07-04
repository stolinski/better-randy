<script lang="ts">
	import { page } from '$app/state';

	import { compositionMeta } from '$lib/platform/composition-meta.svelte';
	import { engineState, packState, transitionState } from '$lib/platform/engine-state.svelte';
	import { userStore } from '$lib/platform/persistence';
	import { posterKeyForPreset } from '$lib/platform/posters';
	import { applyPreset, getPresetBySlug } from '$lib/platform/preset';
	import { presetBase } from '$lib/platform/preset-base.svelte';
	import { serializeCompositionState } from '$lib/platform/preset-pure';
	import Workspace from '$lib/platform/Workspace.svelte';

	const slug = $derived(page.params.slug ?? '');

	// Content key for the poster of whatever composition is loaded — handed to the
	// Workspace, which captures the settled frame under it once (see ./posters).
	let posterKey = $state<string | null>(null);

	// Snapshot taken immediately after applyPreset — used to detect the first
	// real edit (anything different from a fresh load must be user input).
	// `applyPreset` seeds both `engineState` and `presetBase`, so the snapshot
	// covers composition and metadata edits alike.
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
				posterKey = posterKeyForPreset(preset);
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
				posterKey = posterKeyForPreset(corpus);
				activeIsUserComp = false;
				loadedSlug = currentSlug;
				loadSnapshot = snapshotState();
				compositionMeta.isUserComp = false;
				compositionMeta.userSlug = currentSlug;
				compositionMeta.forkedFrom = null;
			});
	});

	// Autosave: run on any change to engineState, presetBase, or pack.
	// Skips when the state matches the post-load snapshot (no edit yet), and
	// while the transition snapshot path is mid-capture — engineState is a
	// scratch buffer holding a swapped-in from/to state during that window.
	$effect(() => {
		if (transitionState.capturing) return;

		const currentSnap = snapshotState();

		if (!loadedSlug || currentSnap === loadSnapshot) return;

		const capturedSlug = loadedSlug;
		const capturedIsUser = activeIsUserComp;

		const timer = setTimeout(() => {
			// presetBase mirrors the top-level metadata (name / description / kind /
			// transition) the RootInspector edits; it is reseeded on every load.
			const serialized = serializeCompositionState(presetBase, engineState, packState.slug);
			if (capturedIsUser) {
				userStore
					.save(capturedSlug, serialized)
					.catch((err) => console.error('Autosave failed', err));
			} else {
				userStore
					.fork(capturedSlug, serialized, capturedSlug)
					.then(() => {
						activeIsUserComp = true;
						compositionMeta.isUserComp = true;
						compositionMeta.forkedFrom = capturedSlug;
						posterKey = posterKeyForPreset(serialized);
					})
					.catch((err) => console.error('Fork failed', err));
			}
		}, 500);

		return () => clearTimeout(timer);
	});

	function snapshotState(): string {
		return JSON.stringify(engineState) + JSON.stringify(presetBase) + packState.slug;
	}

	async function handleRevert(): Promise<void> {
		const currentSlug = slug;
		await userStore.del(currentSlug);
		const corpus = getPresetBySlug(currentSlug);
		if (!corpus) return;
		applyPreset(corpus);
		posterKey = posterKeyForPreset(corpus);
		activeIsUserComp = false;
		loadedSlug = currentSlug;
		loadSnapshot = snapshotState();
		compositionMeta.isUserComp = false;
		compositionMeta.forkedFrom = null;
	}

	$effect(() => {
		compositionMeta.revert = handleRevert;
		return () => {
			compositionMeta.revert = null;
		};
	});

	const isKnown = $derived(!!getPresetBySlug(slug) || compositionMeta.userSlug === slug);
</script>

{#if !isKnown && !compositionMeta.isUserComp}
	<main class="missing stack">
		<h1>Preset not found</h1>
		<p>No preset named "{slug}".</p>
		<a href="/">All presets</a>
	</main>
{:else}
	<Workspace {posterKey} />
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
