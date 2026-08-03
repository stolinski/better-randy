<script lang="ts">
	import { engineState, packState, addEffect } from './engine-state.svelte';
	import { PACK_REGISTRY } from './packs/registry';
	import { PIPELINE_REGISTRY } from './pipelines';
	import type { EffectRenderer } from './pipelines/types';
	import AddMenu from './AddMenu.svelte';
	import EffectChainRow from './EffectChainRow.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import PackChromeRow from './PackChromeRow.svelte';

	// The Effect chain: authored effects in order, then the active Pack's
	// chrome recipe (surfaced so the list matches the pixels — the Workspace
	// appends these AFTER the authored chain on opaque pieces).
	const effectRenderers = Object.values(PIPELINE_REGISTRY.effects) as EffectRenderer[];
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

	function handleAddEffect(type: string): void {
		const renderer = effectRenderers.find((candidate) => candidate.type === type);
		if (!renderer) return;
		const def = renderer.defaults();
		addEffect({ type, params: def.params });
	}

	// Collapsed-state readout: the chain's names, so closed ≠ invisible.
	const chainSummary = $derived.by(() => {
		const names = [...authoredEffects, ...packChromeEffects].map(
			(entry) => effectRenderers.find((candidate) => candidate.type === entry.type)?.label
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
				items: effectRenderers.map((renderer) => ({
					value: renderer.type,
					label: renderer.label
				}))
			}
		]}
		onselect={handleAddEffect}
	/>
</InspectorSection>
