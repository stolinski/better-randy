<script lang="ts">
	import { onMount } from 'svelte';

	import { packState } from './engine-state.svelte';
	import { getAuthoringPackOption, listAuthoringPacks } from './packs/catalog';
	import { PACK_REGISTRY } from './packs/registry';
	import {
		bindCompositionPack,
		forkBoundPackIntoStore,
		refreshUserPackList,
		userPackAuthoring
	} from './user-pack-authoring.svelte';
	import { IS_ORIGIN_COMPOSITION_STORE_SERVED } from './user-composition-store';
	import { loadedUserPackDocument } from './user-pack-runtime.svelte';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import UserPackEditor from './UserPackEditor.svelte';

	// The Pack control (ADR-0055): bind a catalog Pack or a User Pack, fork the
	// bound built-in into the store, and — when a User Pack is bound — edit it in
	// place. The select lists the catalog, then every User Pack: loaded ones by
	// their live label, stored-but-unloaded ones from the store listing. A
	// browser-scoped session has no Pack store, so it neither lists nor forks.
	onMount(() => {
		if (IS_ORIGIN_COMPOSITION_STORE_SERVED) void refreshUserPackList();
	});

	const catalogOptions = $derived(
		listAuthoringPacks()
			.filter((option) => option.source === 'catalog')
			.map((option) => ({ slug: option.slug, label: option.label }))
	);
	// Loaded User Packs by their live label, then stored-but-unloaded ones from the listing.
	const userPackOptions = $derived.by(() => {
		const options = listAuthoringPacks()
			.filter((option) => option.source === 'user')
			.map((option) => ({ slug: option.slug, label: option.label }));
		const listed = new Set(options.map((option) => option.slug));
		for (const meta of userPackAuthoring.storePacks) {
			if (!listed.has(meta.slug)) options.push({ slug: meta.slug, label: `${meta.label} · User` });
		}
		return options;
	});
	const boundUserPack = $derived(loadedUserPackDocument(packState.slug));
	const canFork = $derived(
		IS_ORIGIN_COMPOSITION_STORE_SERVED && Object.hasOwn(PACK_REGISTRY, packState.slug)
	);

	let bindingError = $state<string | null>(null);

	async function handlePackChange(event: Event): Promise<void> {
		const select = event.currentTarget as HTMLSelectElement;
		const outcome = await bindCompositionPack(select.value);
		if (outcome.kind === 'refused') {
			select.value = packState.slug;
			bindingError = outcome.message;
			return;
		}
		bindingError = null;
	}

	async function handleFork(): Promise<void> {
		bindingError = null;
		try {
			const slug = await forkBoundPackIntoStore();
			const outcome = await bindCompositionPack(slug);
			if (outcome.kind === 'refused') bindingError = outcome.message;
		} catch (cause) {
			console.error('Failed to fork the Pack.', cause);
			bindingError = cause instanceof Error ? cause.message : 'Failed to fork the Pack.';
		}
	}
</script>

<InspectorSection label="Pack" summary={getAuthoringPackOption(packState.slug).label}>
	{#snippet action()}
		{#if canFork}
			<button
				type="button"
				class="pack-fork"
				disabled={userPackAuthoring.isForking}
				onclick={handleFork}>{userPackAuthoring.isForking ? 'Forking…' : 'Fork'}</button
			>
		{/if}
	{/snippet}
	<Field label="Pack">
		<select aria-label="Pack" value={packState.slug} onchange={handlePackChange}>
			{#each catalogOptions as option (option.slug)}
				<option value={option.slug}>{option.label}</option>
			{/each}
			{#if userPackOptions.length > 0}
				<optgroup label="User packs">
					{#each userPackOptions as option (option.slug)}
						<option value={option.slug}>{option.label}</option>
					{/each}
				</optgroup>
			{/if}
		</select>
	</Field>
	{#if bindingError}
		<p class="pack-refusal" role="alert">{bindingError}</p>
	{/if}
	{#if boundUserPack}
		<UserPackEditor />
	{/if}
</InspectorSection>

<style>
	/* The header action reads at the section-summary scale: mono, muted, text on
	   hover — a verb, never a chip. */
	.pack-fork {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-family: 'Paper Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		padding: 0;
		text-transform: uppercase;
	}

	.pack-fork:hover:not(:disabled),
	.pack-fork:focus-visible {
		color: var(--chrome-text);
		outline: none;
	}

	.pack-fork:disabled {
		cursor: progress;
	}

	.pack-refusal {
		color: #f0453d;
		font-size: 0.7rem;
		margin: 0;
	}
</style>
