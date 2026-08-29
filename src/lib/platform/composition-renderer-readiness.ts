/**
 * Loading the Pipeline renderers a composition needs before it becomes the open
 * document.
 *
 * The bundle is resolved from the document itself — its Surface, Blocks,
 * Annotations, Overlays, Effects, transition endpoints, and the Effects its
 * Pack's chrome contributes to a full-frame piece — and activation is additive,
 * so readying one document never unloads another's renderers.
 *
 * Any operation that changes what has to render resolves the prospective
 * document here before applying it. That covers more than convenience: a Pack
 * whose chrome Effect has not loaded renders a frame without its chrome, which
 * is silently wrong output rather than a visible failure.
 */
import { collectPresetRendererRequirements } from './pipelines/preset-renderer-requirements';
import { getPack } from './packs/registry';
import { getPresetBySlug } from './preset-catalog';
import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';

import type { Preset } from './engine-schema';

/**
 * Load and activate every Pipeline renderer `document` needs. Rejects when a
 * renderer module cannot load, which is what stops an operation from applying a
 * document this browser could not draw.
 */
export async function ensureCompositionRenderersLoaded(document: Preset): Promise<void> {
	const bundle = await pipelineRendererRuntime.resolve(
		collectPresetRendererRequirements(document, {
			pack: getPack(document.pack),
			resolvePack: getPack,
			resolvePreset: getPresetBySlug
		})
	);
	pipelineRendererRuntime.activate(bundle);
}
