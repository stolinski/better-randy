<script lang="ts">
	import { onDestroy } from 'svelte';

	import { engineState, transitionState } from './engine-state.svelte';
	import { getPack } from './packs/registry';
	import { getPresetBySlug, listFixtures, listPresets } from './preset-catalog';
	import { resolveTransition } from './preset';
	import { presetBase } from './preset-base.svelte';
	import { collectPresetRendererRequirements } from './pipelines/preset-renderer-requirements';
	import { transitionEffectDefinitions } from './pipelines/transition-definition-registry';
	import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
	import type { ResolvedPipelineRendererBundle } from './pipelines/runtime-loader';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';
	import { AsyncAuthoringOperationGuard } from '$lib/utils/async-authoring-operation';

	// The transition recipe (ADR-0022): from/to Presets, the Effect, its
	// duration, and the Effect's own editor. `from`/`to` offer every catalogued
	// Preset — deliverables and fixtures alike, since fixtures are valid
	// transition endpoints (transition-wipe-demo proves it).
	const transitionTargets = [...listPresets(), ...listFixtures()];
	const transitionEffects = transitionEffectDefinitions();
	const transitionEditGuard = new AsyncAuthoringOperationGuard();
	onDestroy(() => transitionEditGuard.dispose());

	// Every recipe edit re-resolves through the same path `applyPreset` uses, so
	// the preview switches into/out of transition mode immediately; an
	// unresolvable ref deactivates the transition rather than throwing.
	function syncTransition(): void {
		transitionState.active = resolveTransition(presetBase.transition);
	}

	function findTransitionEffectRenderer(type: string) {
		return pipelineRendererRuntime.current().transitions.get(type) ?? null;
	}

	async function resolveTransitionEndpointRenderers(
		slug: string
	): Promise<ResolvedPipelineRendererBundle | null> {
		const preset = transitionTargets.find((entry) => entry.slug === slug)?.preset;
		if (!preset) return null;
		return pipelineRendererRuntime.resolve(
			collectPresetRendererRequirements(preset, {
				pack: getPack(preset.pack),
				resolvePack: getPack,
				resolvePreset: getPresetBySlug
			})
		);
	}

	async function toggleTransition(): Promise<void> {
		if (engineState.media.videoTrack.clips.length > 0) return;
		if (presetBase.transition) {
			transitionEditGuard.supersede();
			presetBase.transition = undefined;
			syncTransition();
			return;
		}

		const definition = transitionEffects[0];
		if (!definition) return;
		const from = transitionTargets[0]?.slug ?? '';
		const to = transitionTargets[1]?.slug ?? from;
		const generation = transitionEditGuard.begin();
		const videoIdentity = engineState.media.videoTrack.clips.map((clip) => clip.id).join('\u0000');
		try {
			await pipelineRendererRuntime.ensureTransition(definition.type);
			if (!transitionEditGuard.isCurrent(generation) || presetBase.transition) return;
			const fromBundle = await resolveTransitionEndpointRenderers(from);
			if (!transitionEditGuard.isCurrent(generation) || presetBase.transition) return;
			const toBundle = await resolveTransitionEndpointRenderers(to);
			if (
				!transitionEditGuard.isCurrent(generation) ||
				presetBase.transition ||
				engineState.media.videoTrack.clips.map((clip) => clip.id).join('\u0000') !== videoIdentity
			) {
				return;
			}
			if (fromBundle) pipelineRendererRuntime.activate(fromBundle);
			if (toBundle) pipelineRendererRuntime.activate(toBundle);
			presetBase.transition = {
				from,
				to,
				effect: definition.type,
				durationMs: 1200,
				params: definition.defaults().params
			};
			syncTransition();
		} catch (cause) {
			console.error('Failed to load transition renderers.', { effect: definition.type, cause });
		}
	}

	async function setTransitionField(key: 'from' | 'to', event: Event): Promise<void> {
		const transition = presetBase.transition;
		if (!transition) return;
		const select = event.currentTarget as HTMLSelectElement;
		const slug = select.value;
		const previousSlug = transition[key];
		const generation = transitionEditGuard.begin();
		try {
			const bundle = await resolveTransitionEndpointRenderers(slug);
			if (!transitionEditGuard.isCurrent(generation)) return;
			if (presetBase.transition !== transition || transition[key] !== previousSlug) {
				select.value = presetBase.transition?.[key] ?? '';
				return;
			}
			if (bundle) pipelineRendererRuntime.activate(bundle);
			transition[key] = slug;
			syncTransition();
		} catch (cause) {
			if (transitionEditGuard.isCurrent(generation)) {
				select.value = presetBase.transition?.[key] ?? '';
			}
			console.error('Failed to load transition endpoint renderers.', { key, slug, cause });
		}
	}

	async function setTransitionEffect(event: Event): Promise<void> {
		const transition = presetBase.transition;
		if (!transition) return;
		const select = event.currentTarget as HTMLSelectElement;
		const type = select.value;
		const previousType = transition.effect;
		const definition = transitionEffects.find((entry) => entry.type === type);
		if (!definition) {
			select.value = previousType;
			return;
		}
		const generation = transitionEditGuard.begin();
		try {
			await pipelineRendererRuntime.ensureTransition(type);
			if (!transitionEditGuard.isCurrent(generation)) return;
			if (presetBase.transition !== transition || transition.effect !== previousType) {
				select.value = presetBase.transition?.effect ?? '';
				return;
			}
			transition.effect = type;
			transition.params = definition.defaults().params;
			syncTransition();
		} catch (cause) {
			if (transitionEditGuard.isCurrent(generation)) {
				select.value = presetBase.transition?.effect ?? '';
			}
			console.error('Failed to load transition Effect renderer.', { type, cause });
		}
	}

	function setTransitionDuration(event: Event): void {
		transitionEditGuard.supersede();
		if (!presetBase.transition) return;
		const n = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(n) || n <= 0) return;
		presetBase.transition.durationMs = n;
		syncTransition();
	}

	function handleTransitionEditorChange(): void {
		transitionEditGuard.supersede();
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
				{#each transitionEffects as definition (definition.type)}
					<option value={definition.type}>{definition.label}</option>
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
			<TransitionEditor params={transition.params} onchange={handleTransitionEditorChange} />
		{/if}
	{/if}
</InspectorSection>
