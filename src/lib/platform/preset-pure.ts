/**
 * Pure (non-Svelte) serialization helpers. Imported by both the Svelte
 * GUI layer (via preset.ts re-exports) and the Node.js test script
 * (scripts/test-round-trip.ts). No Svelte, no browser APIs, no pipelines.
 */
import { serializeAnnotationBodyToText } from '../annotations/annotation-body-text.ts';

import type { EngineState, Preset, SurfaceContent } from './engine-schema';

/**
 * Produce a Preset from the base (top-level metadata) and the live engine
 * state. The base supplies `name`, `description`, `kind`, `schema`, and
 * `transition` (none of which the GUI currently edits); the state and packSlug
 * supply the composition. Fields the GUI has no control for (transport, stage,
 * etc.) pass through untouched from `state` — the same data
 * `applyCompositionState` loaded from the original preset — ensuring a
 * lossless round-trip even when only a subset of the state is covered by GUI
 * controls.
 */
export function serializeCompositionState(
	base: Preset,
	state: EngineState,
	packSlug: string
): Preset {
	const result: Preset = {
		schema: base.schema,
		name: base.name,
		pack: packSlug,
		kind: base.kind,
		state
	};
	if (base.description !== undefined) result.description = base.description;
	if (base.transition !== undefined) result.transition = base.transition;
	return result;
}

/**
 * Converts a Preset to a JSON-serializable plain object. The in-memory
 * `AnnotationBody` fields (`surface.content.body` and chat `messages[*].text`)
 * are serialized back to their text-markup string form so the output can be
 * stored on disk and re-parsed by `PresetSchema` without data loss.
 */
export function presetToWireFormat(preset: Preset): unknown {
	const surface = preset.state.surface;
	const content: unknown = wireContent(surface.content);
	return {
		...preset,
		state: {
			...preset.state,
			surface: { ...surface, content }
		}
	};
}

function wireContent(content: SurfaceContent): unknown {
	const base = {
		...content,
		body: serializeAnnotationBodyToText(content.body)
	};
	if (!content.messages) return base;
	return {
		...base,
		messages: content.messages.map((msg) => ({
			...msg,
			text: serializeAnnotationBodyToText(msg.text)
		}))
	};
}
