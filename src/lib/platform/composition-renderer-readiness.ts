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
import { compositionEditHistory } from './composition-edit-history';
import { getPack } from './packs/registry';
import { getPresetBySlug } from './preset-catalog';
import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
import {
	refuseCompositionOperation,
	type CompositionOperationFailure
} from './composition-operation-preflight';

import type { Preset } from './engine-schema';
import type { WebmcpOperationRow } from './webmcp-operation-inventory';

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

/**
 * The refusal an operation returns when this browser cannot load the renderers
 * its prospective document needs. `subject` names what pulled them in — the
 * Surface, the Pack, the Effect — so the caller learns which argument to change
 * rather than that "something failed".
 */
export async function refuseUnloadableCompositionRenderers(
	row: WebmcpOperationRow,
	prospective: Preset,
	subject: string
): Promise<CompositionOperationFailure | null> {
	try {
		await ensureCompositionRenderersLoaded(prospective);
		return null;
	} catch (cause) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'render_failed',
			`This browser could not load the renderers ${subject} needs: ${
				cause instanceof Error ? cause.message : 'a renderer module failed to load'
			}.`
		);
	}
}
