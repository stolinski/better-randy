<script lang="ts">
	import { engineState, transitionState } from './engine-state.svelte';
	import { listFixtures, listPresets, resolveTransition } from './preset';
	import { presetBase } from './preset-base.svelte';
	import type { TransitionEffectRenderer } from './pipelines/types';
	import { transitionEffectRenderers } from './pipelines/transition-registry';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	// The transition recipe (ADR-0022): from/to Presets, the Effect, its
	// duration, and the Effect's own editor. `from`/`to` offer every catalogued
	// Preset — deliverables and fixtures alike, since fixtures are valid
	// transition endpoints (transition-wipe-demo proves it).
	const transitionTargets = [...listPresets(), ...listFixtures()];
	const transitionEffects = transitionEffectRenderers();

	// Every recipe edit re-resolves through the same path `applyPreset` uses, so
	// the preview switches into/out of transition mode immediately; an
	// unresolvable ref deactivates the transition rather than throwing.
	function syncTransition(): void {
		transitionState.active = resolveTransition(presetBase.transition);
	}

	function findTransitionEffectRenderer(type: string): TransitionEffectRenderer<unknown> | null {
		return transitionEffects.find((renderer) => renderer.type === type) ?? null;
	}

	function toggleTransition(): void {
		if (engineState.media.videoTrack.clips.length > 0) return;
		if (presetBase.transition) {
			presetBase.transition = undefined;
		} else {
			const renderer = transitionEffects[0];
			presetBase.transition = {
				from: transitionTargets[0]?.slug ?? '',
				to: transitionTargets[1]?.slug ?? transitionTargets[0]?.slug ?? '',
				effect: renderer?.type ?? '',
				durationMs: 1200,
				params: renderer?.defaults().params ?? {}
			};
		}
		syncTransition();
	}

	function setTransitionField(key: 'from' | 'to', event: Event): void {
		if (!presetBase.transition) return;
		presetBase.transition[key] = (event.currentTarget as HTMLSelectElement).value;
		syncTransition();
	}

	function setTransitionEffect(event: Event): void {
		if (!presetBase.transition) return;
		const renderer = findTransitionEffectRenderer((event.currentTarget as HTMLSelectElement).value);
		if (!renderer) return;
		presetBase.transition.effect = renderer.type;
		presetBase.transition.params = renderer.defaults().params;
		syncTransition();
	}

	function setTransitionDuration(event: Event): void {
		if (!presetBase.transition) return;
		const n = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(n) || n <= 0) return;
		presetBase.transition.durationMs = n;
		syncTransition();
	}
</script>

<InspectorSection label="Transition" summary={presetBase.transition ? 'On' : 'Off'}>
	{#snippet action()}
		<InspectorToggle
			checked={!!presetBase.transition}
			label="Transition"
			disabled={engineState.media.videoTrack.clips.length > 0}
			onchange={toggleTransition}
		/>
	{/snippet}
	{#if presetBase.transition}
		{@const transition = presetBase.transition}
		{@const transitionRenderer = findTransitionEffectRenderer(transition.effect)}
		<Field label="From">
			<select value={transition.from} onchange={(e) => setTransitionField('from', e)}>
				{#each transitionTargets as entry (entry.slug)}
					<option value={entry.slug}>{entry.preset.name}</option>
				{/each}
			</select>
		</Field>
		<Field label="To">
			<select value={transition.to} onchange={(e) => setTransitionField('to', e)}>
				{#each transitionTargets as entry (entry.slug)}
					<option value={entry.slug}>{entry.preset.name}</option>
				{/each}
			</select>
		</Field>
		<Field label="Effect">
			<select value={transition.effect} onchange={setTransitionEffect}>
				{#each transitionEffects as renderer (renderer.type)}
					<option value={renderer.type}>{renderer.label}</option>
				{/each}
			</select>
		</Field>
		<Field label="Duration">
			<input
				type="number"
				min="100"
				step="10"
				value={transition.durationMs}
				oninput={setTransitionDuration}
			/>
			<span class="ins-unit">ms</span>
		</Field>
		{#if transitionRenderer?.Editor}
			{@const TransitionEditor = transitionRenderer.Editor}
			<TransitionEditor params={transition.params} onchange={syncTransition} />
		{/if}
	{/if}
</InspectorSection>
