<script lang="ts">
	import { engineState, packState } from './engine-state.svelte';
	import { getPack } from './packs/registry';
	import { appearanceVarsToStyle, resolveAppearanceVars } from './packs/resolve';
	import { getSurfaceRenderer } from './pipelines';
	import { filterPackAppearanceVarsForImmunity } from './pipelines/identity-registry';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	const renderer = $derived(getSurfaceRenderer(engineState.surface.type));
	const SurfaceCanvasSource = $derived(renderer?.CanvasSource ?? null);

	// Resolve the active Pack's appearance Roles for this Surface into CSS vars.
	// Unlike OverlayMount (which owns a positioned wrapper), the surface
	// CanvasSource's root IS the captured element, so the wrapper here is
	// `display:contents` — it generates no box and has zero layout impact, while
	// CSS custom properties still inherit into the captured surface element. The
	// CanvasSource consumes them via `var(--slot, #fallback)`; under the syntax
	// Pack the fallbacks already match, so the render is byte-identical.
	//
	// A Surface's Identity Spec immunity decides what survives injection
	// (ADR-0038 / ADR-0039 §2): full immunity filters to nothing, partial
	// immunity keeps only the declared claimable chrome slots (the newspaper's
	// kicker chip), no immunity keeps everything. The registry-derived filter
	// is the authority, so new immune Pipelines cannot leave a copied list
	// stale here.
	const appearanceStyle = $derived(
		appearanceVarsToStyle(
			filterPackAppearanceVarsForImmunity(
				`surface:${engineState.surface.type}`,
				resolveAppearanceVars(getPack(packState.slug), engineState.surface.type)
			)
		)
	);
</script>

{#if SurfaceCanvasSource}
	<div style="display:contents;{appearanceStyle}">
		<SurfaceCanvasSource bind:element />
	</div>
{/if}
