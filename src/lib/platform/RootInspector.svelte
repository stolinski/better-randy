<script lang="ts">
	import { engineState, packState } from './engine-state.svelte';
	import { PACK_REGISTRY } from './packs/registry';
	import { presetBase } from './preset-base.svelte';
	import { compositionMeta } from './composition-meta.svelte';
	import {
		rescaleCompositionTimings,
		STANDARD_TRANSPORT_RATES
	} from '$lib/utils/composition-timing';
	import AudioCueSection from './AudioCueSection.svelte';
	import DepthStageSection from './DepthStageSection.svelte';
	import EffectsChainSection from './EffectsChainSection.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import InterchangeSection from './InterchangeSection.svelte';
	import Field from './Field.svelte';
	import MarkDefaultsSection from './MarkDefaultsSection.svelte';
	import TransitionRecipeSection from './TransitionRecipeSection.svelte';

	const packOptions = Object.entries(PACK_REGISTRY) as [string, (typeof PACK_REGISTRY)[string]][];

	// ---- Composition metadata (presetBase) ----

	function setDescription(event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).value;
		// An empty description clears the optional field entirely — it round-trips
		// as an absent key, not an empty string.
		presetBase.description = value === '' ? undefined : value;
	}

	// Changing the clip duration PRESERVES the real-time speed of every
	// animation: timing is stored as a fraction of the clip, so a longer clip
	// would otherwise slow everything down. Rescaling the fractions by prev/next
	// keeps a 400ms enter at 400ms — the extra time becomes hold. Absolute-time
	// timing (keyframe atMs, captions, cascade offsets) is left alone.
	function handleDurationChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const next = Number(input.value);
		const prev = engineState.transport.durationSeconds;
		if (!Number.isFinite(next) || next <= 0 || next === prev) {
			input.value = String(prev);
			return;
		}
		rescaleCompositionTimings(engineState, prev / next);
		engineState.transport.durationSeconds = next;
	}
</script>

<div class="root-inspector">
	{#if compositionMeta.persistenceError}
		<p class="persistence-error" role="alert">
			<span>Persistence / save / composition</span>
			{compositionMeta.persistenceError}
		</p>
	{/if}

	<InspectorSection label="Composition" summary={presetBase.kind}>
		<Field label="Name">
			<input type="text" bind:value={presetBase.name} />
		</Field>
		<Field label="Description">
			<input type="text" value={presetBase.description ?? ''} oninput={setDescription} />
		</Field>
		<Field label="Kind">
			<select bind:value={presetBase.kind}>
				<option value="deliverable">Deliverable</option>
				<option value="fixture">Fixture</option>
			</select>
		</Field>
	</InspectorSection>

	<InspectorSection
		label="Transport"
		summary={`${engineState.transport.durationSeconds} s · ${engineState.transport.fps} fps`}
	>
		<Field label="Duration">
			<input
				type="number"
				min="1"
				max="60"
				step="0.1"
				value={engineState.transport.durationSeconds}
				onchange={handleDurationChange}
			/>
			<span class="ins-unit">s</span>
		</Field>
		<Field label="Rate">
			<!-- Standard broadcast/web rates only (ADR-0042) — the NTSC fractional
			     literals map to exact rationals in every frame computation, so a
			     free-typed 29.9 has no exact math to run. A loaded legacy value
			     outside the standard set stays selectable, never silently rewritten. -->
			<select bind:value={engineState.transport.fps}>
				{#if !STANDARD_TRANSPORT_RATES.includes(engineState.transport.fps)}
					<option value={engineState.transport.fps}>{engineState.transport.fps} fps</option>
				{/if}
				{#each STANDARD_TRANSPORT_RATES as rate (rate)}
					<option value={rate}>{rate} fps</option>
				{/each}
			</select>
		</Field>
	</InspectorSection>

	<InspectorSection label="Pack" summary={PACK_REGISTRY[packState.slug]?.label ?? packState.slug}>
		<Field label="Pack">
			<select bind:value={packState.slug}>
				{#each packOptions as [slug, pack] (slug)}
					<option value={slug}>{pack.label}</option>
				{/each}
			</select>
		</Field>
	</InspectorSection>

	<EffectsChainSection />

	<InspectorSection
		label="Background"
		summary={engineState.backgroundFill !== undefined ? engineState.backgroundFill : 'Off'}
	>
		{#snippet action()}
			<InspectorToggle
				checked={engineState.backgroundFill !== undefined}
				label="Background fill"
				disabled={engineState.media.videoTrack.clips.length > 0}
				onchange={(checked) => {
					engineState.backgroundFill = checked ? '#000000' : undefined;
				}}
			/>
		{/snippet}
		{#if engineState.backgroundFill !== undefined}
			<Field label="Fill">
				<input type="color" bind:value={engineState.backgroundFill} />
			</Field>
		{/if}
	</InspectorSection>

	<TransitionRecipeSection />

	<DepthStageSection />

	<MarkDefaultsSection />

	<AudioCueSection />

	<InterchangeSection />
</div>

<style>
	.root-inspector {
		display: grid;
		gap: 0;
	}

	.persistence-error {
		color: #f0453d;
		font-size: 0.75rem;
		margin: 0;
		padding: var(--vs-s);
	}

	.persistence-error span {
		color: var(--chrome-muted);
		display: block;
		font-size: 0.68rem;
		margin-block-end: var(--vs-xs);
		text-transform: uppercase;
	}
</style>
