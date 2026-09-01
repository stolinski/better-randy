/**
 * A Pack's chrome contributes Effects to a full-frame piece, so binding a pack
 * (or turning the background fill on) can need renderers this bundle has never
 * loaded. Loading them first is what keeps a re-dress from producing a frame
 * missing its chrome. Shared by the Pack control and the background toggle.
 */
import type { PackManifest } from './packs/types';
import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';

/**
 * Load every chrome Effect renderer `pack` declares. `isCurrent` lets a caller
 * abandon the wait when a newer authoring gesture superseded this one; false
 * then means "stop, the world moved on", not a load failure.
 */
export async function ensurePackChromeEffectRenderers(
	pack: PackManifest,
	isCurrent: () => boolean
): Promise<boolean> {
	const chromeRole = pack.roles.chrome;
	if (chromeRole?.kind !== 'chrome') return true;
	for (const effect of chromeRole.effects) {
		await pipelineRendererRuntime.ensureEffect(effect.type);
		if (!isCurrent()) return false;
	}
	return true;
}
