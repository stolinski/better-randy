<script lang="ts">
	import { engineState, packState } from './engine-state.svelte';
	import { getPack, PACK_REGISTRY } from './packs/registry';
	import { resolveBackgroundFill } from './packs/resolve';
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

	// ---- Background fill (ADR-0039 §3) ----

	// The colour the declared fill actually renders: the 'pack' sentinel
	// resolves through the active Pack's `field-treatment` core, an explicit
	// hex passes through. undefined = no fill (transparent lane).
	const resolvedBackgroundFillHex = $derived(
		resolveBackgroundFill(getPack(packState.slug), engineState.backgroundFill)
	);

	const backgroundSummary = $derived(
		engineState.backgroundFill === undefined
			? 'Off'
			: engineState.backgroundFill === 'pack'
				? `Pack · ${resolvedBackgroundFillHex}`
				: engineState.backgroundFill
	);

	// Editing the swatch materializes an explicit override (the authored hex
	// wins over the Pack); × restores the pack-field sentinel — the same
	// override model as pack chrome (PackChromeRow).
	function setExplicitBackgroundFill(event: Event): void {
		engineState.backgroundFill = (event.currentTarget as HTMLInputElement).value;
	}

	function restorePackBackgroundFill(): void {
		engineState.backgroundFill = 'pack';
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

	<InspectorSection label="Background" summary={backgroundSummary}>
		{#snippet action()}
			<InspectorToggle
				checked={engineState.backgroundFill !== undefined}
				label="Background fill"
				disabled={engineState.media.videoTrack.clips.length > 0}
				onchange={(checked) => {
					engineState.backgroundFill = checked ? 'pack' : undefined;
				}}
			/>
		{/snippet}
		{#if engineState.backgroundFill !== undefined}
			<Field label="Fill">
				<input
					type="color"
					value={resolvedBackgroundFillHex}
					oninput={setExplicitBackgroundFill}
				/>
				{#if engineState.backgroundFill === 'pack'}
					<span
						class="fill-pack-tag"
						title={`The ${PACK_REGISTRY[packState.slug]?.label ?? packState.slug} pack's field — editing the colour becomes a composition override`}
						>pack</span
					>
				{:else}
					<button
						type="button"
						class="fill-reset-btn"
						aria-label="Restore the pack field"
						title="× restores the pack's field colour"
						onclick={restorePackBackgroundFill}>×</button
					>
				{/if}
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

	/* The same ownership chrome as pack-chrome rows (PackChromeRow): a PACK
	   tag while the Pack's field drives the fill, × while overridden. */
	.fill-pack-tag {
		border: 1px solid var(--chrome-hairline);
		border-radius: 3px;
		color: var(--chrome-muted);
		flex: none;
		font-family: 'Paper Mono', monospace;
		font-size: 0.5rem;
		letter-spacing: 0.14em;
		padding: 1.5px 5px;
		text-transform: uppercase;
	}

	.fill-reset-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		flex: none;
		font-size: 0.875rem;
		line-height: 1;
		padding: 0;
	}

	.fill-reset-btn:hover {
		color: #f0453d;
	}
</style>
