<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';

	import { GFX_PRODUCT_NAME } from '$lib/identity/gfx-brand';
	import GfxMarkHomeLink from '$lib/identity/GfxMarkHomeLink.svelte';
	import { compositionAutosaveInvalidation } from '../../../lib/platform/composition-autosave-invalidation.svelte.ts';
	import { compositionMeta } from '$lib/platform/composition-meta.svelte';
	import { engineState, packState, transitionState } from '$lib/platform/engine-state.svelte';
	import { getPack } from '$lib/platform/packs/registry';
	import { collectPresetRendererRequirements } from '$lib/platform/pipelines/preset-renderer-requirements';
	import {
		pipelineRendererRuntime,
		setPipelineRendererRuntime
	} from '$lib/platform/pipelines/runtime-context.svelte';
	import { posterKeyForPreset } from '$lib/platform/posters';
	import { getPresetBySlug } from '$lib/platform/preset-catalog';
	import { applyPreset } from '$lib/platform/preset';
	import { presetBase } from '$lib/platform/preset-base.svelte';
	import { serializeCompositionState } from '$lib/platform/preset-pure';
	import { userCompositionStore } from '$lib/platform/user-composition-store';
	import { isCurrentPresetRouteRendererLoad } from '$lib/utils/preset-route-renderer-load';
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
	let rendererLoadError = $state<string | null>(null);
	let rendererLoading = $state(true);
	let routeLoadGeneration = 0;
	let revertGeneration = 0;

	// The tab follows the composition the moment its name is edited, so a stack of
	// open pieces stays tellable apart.
	const documentTitle = $derived(
		appliedRouteKey === routeKey && presetBase.name
			? `${presetBase.name} · ${GFX_PRODUCT_NAME}`
			: GFX_PRODUCT_NAME
	);

	setPipelineRendererRuntime(pipelineRendererRuntime);

	// Track whether the currently-viewed Preset was found in the User composition store.
	// This determines fork vs autosave on edit.
	let activeIsUserComposition = false;

	afterNavigate(() => {
		void loadNavigatedPreset();
	});

	async function loadNavigatedPreset(): Promise<void> {
		const generation = ++routeLoadGeneration;
		const nextData = data;
		const nextRouteKey = JSON.stringify([nextData.slug, nextData.source]);

		appliedRouteKey = null;
		rendererLoadError = null;
		rendererLoading = nextData.status === 'ready';
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

		try {
			const requirements = collectPresetRendererRequirements(nextData.preset, {
				pack: getPack(nextData.preset.pack),
				resolvePack: getPack,
				resolvePreset: getPresetBySlug
			});
			const rendererBundle = await pipelineRendererRuntime.resolve(requirements);
			if (
				!isCurrentPresetRouteRendererLoad(generation, routeLoadGeneration, nextRouteKey, routeKey)
			) {
				return;
			}
			pipelineRendererRuntime.activate(rendererBundle);
			applyPreset(nextData.preset);
			rendererLoading = false;
			posterKey = posterKeyForPreset(nextData.preset);
			activeIsUserComposition = nextData.provenance === 'user';
			loadSnapshot = snapshotState();
			compositionMeta.isUserComposition = activeIsUserComposition;
			compositionMeta.userCompositionSlug = nextData.slug;
			appliedRouteKey = nextRouteKey;
		} catch (cause) {
			if (
				!isCurrentPresetRouteRendererLoad(generation, routeLoadGeneration, nextRouteKey, routeKey)
			) {
				return;
			}
			rendererLoading = false;
			console.error('Failed to load composition renderers.', {
				slug: nextData.slug,
				cause
			});
			rendererLoadError =
				cause instanceof Error ? cause.message : 'Failed to load composition renderers.';
		}
	}

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
		return (
			JSON.stringify(engineState) +
			JSON.stringify(presetBase) +
			packState.slug +
			compositionAutosaveInvalidation.revision
		);
	}

	function isCurrentAppliedRoute(expectedRouteKey: string): boolean {
		return appliedRouteKey === expectedRouteKey && routeKey === expectedRouteKey;
	}

	async function handleRevert(): Promise<void> {
		const currentRouteKey = appliedRouteKey;
		if (data.status !== 'ready' || !currentRouteKey || routeKey !== currentRouteKey) return;

		const generation = ++revertGeneration;
		const currentRouteGeneration = routeLoadGeneration;
		const currentSlug = data.slug;
		const corpusPreset = getPresetBySlug(currentSlug);
		if (!corpusPreset) return;
		try {
			const rendererBundle = await pipelineRendererRuntime.resolve(
				collectPresetRendererRequirements(corpusPreset, {
					pack: getPack(corpusPreset.pack),
					resolvePack: getPack,
					resolvePreset: getPresetBySlug
				})
			);
			if (
				generation !== revertGeneration ||
				currentRouteGeneration !== routeLoadGeneration ||
				!isCurrentAppliedRoute(currentRouteKey)
			) {
				return;
			}
			await userCompositionStore.deleteUserComposition(currentSlug);
			if (
				generation !== revertGeneration ||
				currentRouteGeneration !== routeLoadGeneration ||
				!isCurrentAppliedRoute(currentRouteKey)
			) {
				return;
			}
			pipelineRendererRuntime.activate(rendererBundle);
			applyPreset(corpusPreset);
			posterKey = posterKeyForPreset(corpusPreset);
			activeIsUserComposition = false;
			loadSnapshot = snapshotState();
			compositionMeta.isUserComposition = false;
			compositionMeta.forkedFrom = null;
			compositionMeta.persistenceError = null;
		} catch (cause) {
			if (generation !== revertGeneration || !isCurrentAppliedRoute(currentRouteKey)) return;
			console.error('Failed to revert composition.', { slug: currentSlug, cause });
			compositionMeta.persistenceError =
				cause instanceof Error ? cause.message : 'Failed to revert composition.';
		}
	}

	onMount(() => {
		compositionMeta.revertUserComposition = handleRevert;
		return () => {
			compositionMeta.revertUserComposition = null;
		};
	});
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>

{#if rendererLoadError}
	<main class="missing stack">
		<h1>Couldn't load renderer</h1>
		<p>{rendererLoadError}</p>
		<a href={resolve('/')}>All presets</a>
	</main>
{:else if data.status === 'error'}
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
{:else if data.status === 'ready' && rendererLoading}
	<!-- Renderer bundles resolve asynchronously, so this stands in for the editor
	     for a few frames after a card is clicked. It carries the chrome bar the
	     Workspace is about to draw, holding the mark on its pixel instead of
	     blanking it out and snapping it back when the editor arrives. -->
	<main class="loading" aria-busy="true">
		<header class="loading__topbar">
			<GfxMarkHomeLink />
		</header>
		<p role="status">Loading…</p>
	</main>
{:else if appliedRouteKey === routeKey}
	{#key routeKey}
		<Workspace {posterKey} />
	{/key}
{/if}

<style>
	.loading {
		padding: 0;
	}

	/* Same 52px bar and 12px inset as `.workspace__topbar`, so the mark does not
	   move when the Workspace replaces this. */
	.loading__topbar {
		align-items: center;
		background: #131315;
		border-block-end: 1px solid #26262a;
		display: flex;
		min-block-size: 52px;
		padding-inline: 12px 14px;
	}

	.loading p {
		margin: 0;
		padding: var(--pad-l);
	}

	.missing {
		padding: var(--pad-l);
		max-inline-size: 32rem;
	}

	.missing h1 {
		margin: 0;
	}
</style>
