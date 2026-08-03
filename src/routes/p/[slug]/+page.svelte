<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	import { compositionMeta } from '$lib/platform/composition-meta.svelte';
	import { engineState, packState, transitionState } from '$lib/platform/engine-state.svelte';
	import { posterKeyForPreset } from '$lib/platform/posters';
	import { applyPreset, getPresetBySlug } from '$lib/platform/preset';
	import { presetBase } from '$lib/platform/preset-base.svelte';
	import { serializeCompositionState } from '$lib/platform/preset-pure';
	import { userCompositionStore } from '$lib/platform/user-composition-store';
	import Workspace from '$lib/platform/Workspace.svelte';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const routeKey = $derived(JSON.stringify([data.slug, data.source]));

	// Content key for the poster of whatever composition is loaded — handed to the
	// Workspace, which captures the settled frame under it once (see ./posters).
	let posterKey = $state<string | null>(null);

	// Snapshot taken immediately after applyPreset — used to detect the first
	// real edit (anything different from a fresh load must be user input).
	// `applyPreset` seeds both `engineState` and `presetBase`, so the snapshot
	// covers composition and metadata edits alike.
	let loadSnapshot = '';
	let appliedRouteKey = $state<string | null>(null);

	// Track whether the currently-viewed Preset was found in the User composition store.
	// This determines fork vs autosave on edit.
	let activeIsUserComposition = false;

	afterNavigate(() => {
		const nextData = data;
		const nextRouteKey = JSON.stringify([nextData.slug, nextData.source]);

		appliedRouteKey = null;
		posterKey = null;
		loadSnapshot = '';
		activeIsUserComposition = false;
		transitionState.active = null;
		transitionState.capturing = false;
		compositionMeta.isUserComposition = false;
		compositionMeta.userCompositionSlug = null;
		compositionMeta.forkedFrom = null;
		compositionMeta.persistenceError = null;

		if (nextData.status !== 'ready') return;

		applyPreset(nextData.preset);
		posterKey = posterKeyForPreset(nextData.preset);
		activeIsUserComposition = nextData.provenance === 'user';
		loadSnapshot = snapshotState();
		compositionMeta.isUserComposition = activeIsUserComposition;
		compositionMeta.userCompositionSlug = nextData.slug;
		appliedRouteKey = nextRouteKey;
	});

	// Autosave: run on any change to engineState, presetBase, or pack.
	// Skips explicit built-in source mode, when state matches the post-load snapshot, and
	// while the transition snapshot path is mid-capture — engineState is a
	// scratch buffer holding a swapped-in from/to state during that window.
	$effect(() => {
		const currentRouteKey = routeKey;
		if (
			data.status !== 'ready' ||
			data.source === 'builtin' ||
			transitionState.capturing ||
			appliedRouteKey !== currentRouteKey
		) {
			return;
		}

		const currentSnap = snapshotState();

		if (currentSnap === loadSnapshot) return;

		const capturedSlug = data.slug;
		const capturedRouteKey = currentRouteKey;
		const capturedIsUserComposition = activeIsUserComposition;
		// Serialize before the debounce so this save cannot observe a later route's state.
		const serializedUserComposition = serializeCompositionState(
			presetBase,
			engineState,
			packState.slug
		);

		const timer = setTimeout(() => {
			if (!isCurrentAppliedRoute(capturedRouteKey)) return;

			if (capturedIsUserComposition) {
				userCompositionStore
					.saveUserComposition(capturedSlug, serializedUserComposition)
					.then(() => {
						if (!isCurrentAppliedRoute(capturedRouteKey)) return;
						compositionMeta.persistenceError = null;
					})
					.catch((error: unknown) => {
						if (!isCurrentAppliedRoute(capturedRouteKey)) return;
						console.error('Autosave failed', error);
						compositionMeta.persistenceError =
							error instanceof Error ? error.message : 'Autosave failed.';
					});
			} else {
				userCompositionStore
					.forkUserComposition(capturedSlug, serializedUserComposition, capturedSlug)
					.then(() => {
						if (!isCurrentAppliedRoute(capturedRouteKey)) return;
						compositionMeta.persistenceError = null;
						activeIsUserComposition = true;
						compositionMeta.isUserComposition = true;
						compositionMeta.forkedFrom = capturedSlug;
						posterKey = posterKeyForPreset(serializedUserComposition);
					})
					.catch((error: unknown) => {
						if (!isCurrentAppliedRoute(capturedRouteKey)) return;
						console.error('Fork failed', error);
						compositionMeta.persistenceError =
							error instanceof Error ? error.message : 'Fork failed.';
					});
			}
		}, 500);

		return () => clearTimeout(timer);
	});

	function snapshotState(): string {
		return JSON.stringify(engineState) + JSON.stringify(presetBase) + packState.slug;
	}

	function isCurrentAppliedRoute(expectedRouteKey: string): boolean {
		return appliedRouteKey === expectedRouteKey && routeKey === expectedRouteKey;
	}

	async function handleRevert(): Promise<void> {
		const currentRouteKey = appliedRouteKey;
		if (data.status !== 'ready' || !currentRouteKey || routeKey !== currentRouteKey) return;

		const currentSlug = data.slug;
		await userCompositionStore.deleteUserComposition(currentSlug);
		if (!isCurrentAppliedRoute(currentRouteKey)) return;

		const corpusPreset = getPresetBySlug(currentSlug);
		if (!corpusPreset) return;
		applyPreset(corpusPreset);
		posterKey = posterKeyForPreset(corpusPreset);
		activeIsUserComposition = false;
		loadSnapshot = snapshotState();
		compositionMeta.isUserComposition = false;
		compositionMeta.forkedFrom = null;
		compositionMeta.persistenceError = null;
	}

	onMount(() => {
		compositionMeta.revertUserComposition = handleRevert;
		return () => {
			compositionMeta.revertUserComposition = null;
		};
	});
</script>

{#if data.status === 'error'}
	<main class="missing stack">
		<h1>Couldn't load composition</h1>
		<p>The composition store didn't respond. Reload to retry.</p>
		<a href={resolve('/')}>All presets</a>
	</main>
{:else if data.status === 'missing'}
	<main class="missing stack">
		<h1>Preset not found</h1>
		<p>No preset named "{data.slug}".</p>
		<a href={resolve('/')}>All presets</a>
	</main>
{:else if appliedRouteKey === routeKey}
	{#key routeKey}
		<Workspace {posterKey} />
	{/key}
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
