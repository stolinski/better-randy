<script lang="ts">
	import { onDestroy } from 'svelte';

	import { engineState, packState, addEffect } from './engine-state.svelte';
	import { PACK_REGISTRY } from './packs/registry';
	import { PIPELINE_DEFINITION_REGISTRY } from './pipelines/definition-registry';
	import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
	import AddMenu from './AddMenu.svelte';
	import EffectChainRow from './EffectChainRow.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import { AsyncAuthoringOperationGuard } from '$lib/utils/async-authoring-operation';
	import PackChromeRow from './PackChromeRow.svelte';

	// The Effect chain: authored effects in order, then the active Pack's
	// chrome recipe (surfaced so the list matches the pixels — the Workspace
	// appends these AFTER the authored chain on opaque pieces).
	const effectDefinitions = Object.values(PIPELINE_DEFINITION_REGISTRY.effects);
	const effectAddGuard = new AsyncAuthoringOperationGuard();
	onDestroy(() => effectAddGuard.dispose());
	const EFFECT_CHAIN_LIMIT = 3;

	const chainFull = $derived(engineState.effects.length >= EFFECT_CHAIN_LIMIT);

	const packChromeEffects = $derived.by(() => {
		if (!engineState.backgroundFill) return [];
		const role = PACK_REGISTRY[packState.slug]?.roles['chrome'];
		return role && role.kind === 'chrome' ? role.effects : [];
	});
	const packChromeTypes = $derived(new Set(packChromeEffects.map((entry) => entry.type)));
	// Authored effects that occupy a chrome slot render in the chrome rows
	// (as the override), not in the authored list.
	const authoredEffects = $derived(
		engineState.effects.filter((effect) => !packChromeTypes.has(effect.type))
	);

	async function handleAddEffect(type: string): Promise<void> {
		const definition = effectDefinitions.find((candidate) => candidate.type === type);
		if (!definition) return;
		const generation = effectAddGuard.begin();
		const chainIdentity = engineState.effects.map((effect) => effect.id).join('\u0000');
		try {
			await pipelineRendererRuntime.ensureEffect(type);
			if (
				!effectAddGuard.isCurrent(generation) ||
				engineState.effects.map((effect) => effect.id).join('\u0000') !== chainIdentity ||
				chainFull
			) {
				return;
			}
			const def = definition.defaults();
			addEffect({ type, params: def.params });
		} catch (cause) {
			console.error('Failed to load Effect renderer.', { type, cause });
		}
	}

	// Collapsed-state readout: the chain's names, so closed ≠ invisible.
	const chainSummary = $derived.by(() => {
		const names = [...authoredEffects, ...packChromeEffects].map(
			(entry) => effectDefinitions.find((candidate) => candidate.type === entry.type)?.label
		);
		const present = names.filter((name): name is string => name !== undefined);
		return present.length > 0 ? present.join(' · ') : 'None';
	});
</script>

<InspectorSection label="Effects" summary={chainSummary}>
	{#each authoredEffects as effect (effect.id)}
		<EffectChainRow {effect} />
	{/each}
	{#each packChromeEffects as entry (entry.type)}
		<PackChromeRow {entry} />
	{/each}
	<!-- The add slot trails the chain (an empty row inviting a fill), leaving
	     the section header's right side for collapsed-state summaries. -->
	<AddMenu
		label={chainFull ? 'Chain full' : '+ Add effect'}
		disabled={chainFull}
		title={chainFull ? `Chain is full (max ${EFFECT_CHAIN_LIMIT})` : undefined}
		groups={[
			{
				items: effectDefinitions.map((renderer) => ({
					value: renderer.type,
					label: renderer.label
				}))
			}
		]}
		onselect={handleAddEffect}
	/>
</InspectorSection>
