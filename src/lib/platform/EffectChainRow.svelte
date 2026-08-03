<script lang="ts">
	import { packState, removeEffect } from './engine-state.svelte';
	import type { Effect } from './engine-schema';
	import { PACK_REGISTRY } from './packs/registry';
	import { PIPELINE_REGISTRY } from './pipelines';
	import type { EffectRenderer } from './pipelines/types';

	// One authored effect: its label row (with a pack-inert tag when the active
	// Pack disables it) plus the effect's own Editor.
	interface Props {
		effect: Effect;
	}

	let { effect }: Props = $props();

	const renderer = $derived(
		(Object.values(PIPELINE_REGISTRY.effects) as EffectRenderer[]).find(
			(candidate) => candidate.type === effect.type
		) ?? null
	);
	const packInert = $derived(renderer?.isPackInert?.(PACK_REGISTRY[packState.slug]) ?? false);
</script>

{#if renderer}
	<div
		class="layer-row"
		title={packInert
			? `Inert under the ${PACK_REGISTRY[packState.slug]?.label ?? packState.slug} pack — the authored effect travels with the composition and applies under packs that keep it`
			: undefined}
	>
		<span class="layer-row__label">{renderer.label}</span>
		{#if packInert}
			<span class="layer-row__pack-tag">pack · off</span>
		{/if}
		<button
			type="button"
			class="remove-btn"
			aria-label={`Remove ${renderer.label}`}
			onclick={() => removeEffect(effect.id)}>×</button
		>
	</div>
	{#if renderer.Editor && !packInert}
		{@const EffectEditor = renderer.Editor}
		<EffectEditor effect={effect as Effect & { params: unknown }} />
	{/if}
{/if}

<style>
	/* An effect entry is an fx-row: a recessed well chip naming the pipeline,
	   with its tags and remove affordance inside the row. */
	.layer-row {
		align-items: center;
		background: var(--chrome-well);
		block-size: 28px;
		border: 1px solid var(--chrome-hairline);
		border-radius: 5px;
		display: flex;
		gap: var(--vs-s);
		padding-inline: 9px;
	}

	.layer-row__label {
		color: var(--chrome-text);
		flex: 1;
		font-family: 'Paper Mono', monospace;
		font-size: 0.6875rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.layer-row__pack-tag {
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

	.remove-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		flex: none;
		font-size: 0.875rem;
		line-height: 1;
		padding: 0;
	}

	.remove-btn:hover {
		color: #f0453d;
	}
</style>
