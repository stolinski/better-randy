import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

import {
	createDefaultEngineState,
	createMarkTiming,
	type DiagramElement,
	type EngineState,
	type Effect,
	type MarkTiming,
	type Overlay,
	type Preset,
	type TextAnimation
} from './engine-schema';
import { assertSoundRegistryValid } from './audio-assets';
import {
	assertIdentityRegistryValid,
	assertPackCoreVocabularyValid
} from './pipelines/identity-registry';
import { getPack, PACK_REGISTRY, REFERENCE_PACK_SLUG } from './packs/registry';
import { isColorValue, requireCoreColor } from './packs/resolve';

// ADR-0019 boot gate: refuse to start if any registered Pipeline's Identity
// Spec ships with an unimplemented + non-via-pack dimension, or if the
// completeness-reference Pack does not resolve every via-pack Role referenced
// by the registry. Validated against the reference Pack (not a preset default —
// ADR-0023 removed that); partial Packs fall back through resolveAppearanceVars.
// Throws an aggregated Error on first import of this module.
assertIdentityRegistryValid(getPack(REFERENCE_PACK_SLUG));

// ADR-0024 boot gate: EVERY registered Pack — not just the reference one —
// must supply the mandatory core vocabulary (fill/ink/accent/edge/depth/light
// treatments) with resolver-recognised values, so the specific → core fallback
// always lands on a real value under any Pack a Preset names.
for (const pack of Object.values(PACK_REGISTRY)) {
	assertPackCoreVocabularyValid(pack);
}

// ADR-0033 §7 boot gate, same posture: every core sample and every sample a
// registered Sound kit names must resolve to a bundled audio asset.
assertSoundRegistryValid();

export const engineState = $state<EngineState>(createDefaultEngineState());

/**
 * Active Pack slug. Set by `applyPreset` from the Preset's (required) `pack`
 * field and runtime-overridable (ADR-0023). The mounts read it to resolve each
 * Pipeline's appearance Roles into CSS vars via `resolveAppearanceVars`. The
 * initial value is only a pre-first-Preset bootstrap (every Preset declares its
 * own Pack and overrides this on load), so it uses the reference Pack.
 */
export const packState = $state<{ slug: string }>({ slug: REFERENCE_PACK_SLUG });

/**
 * The active multi-state transition (ADR-0026), or null for an ordinary
 * single-state Preset. Set by `applyPreset` from the Preset's `transition`
 * recipe with `from`/`to` resolved to full Presets. The Workspace reads this to
 * switch into transition mode: snapshot `from` and `to` into textures, then wipe
 * between them. Distinct from `engineState` (the live composition) so the
 * snapshot path can swap the composition state via `applyCompositionState`
 * without clearing the transition it is servicing.
 */
export interface ResolvedTransition {
	from: Preset;
	to: Preset;
	effect: string;
	durationMs: number;
}
/**
 * `capturing` is true while the Workspace is snapshotting `from`/`to` — the
 * window where `engineState` is a scratch buffer holding a swapped-in state
 * rather than the composition's own. Persistence must not observe engineState
 * during this window (it would autosave the scratch state as a user edit).
 */
export const transitionState = $state<{ active: ResolvedTransition | null; capturing: boolean }>({
	active: null,
	capturing: false
});

export function ensureMarkTimingAtIndex(index: number): MarkTiming {
	while (engineState.marks.timings.length <= index) {
		engineState.marks.timings.push(createMarkTiming());
	}

	return engineState.marks.timings[index];
}

/**
 * Mark colour for editor swatches AND the render path's unauthored-mark
 * fallback (threaded into `resolveMarkForIndex`): the Preset's authored
 * `marks.defaults` entry wins; absent that, the active Pack's `<style>.fill`
 * Role → the Pack's mandatory core accent (ADR-0024) — never a baked literal
 * that would make one Pack a de facto base.
 */
export function readMarkColor(style: AnnotationMarkStyle): string {
	const authored = engineState.marks.defaults[style]?.color;
	if (authored) {
		return authored;
	}
	const pack = getPack(packState.slug);
	const role = pack.roles[`${style}.fill`];
	if (role?.kind === 'style' && typeof role.value === 'string' && isColorValue(role.value)) {
		return role.value;
	}
	return requireCoreColor(pack, 'accent-treatment');
}

function nextId(prefix: string, existing: readonly { id: string }[]): string {
	const used = new Set(existing.map((entry) => entry.id));
	let counter = 1;
	let candidate = `${prefix}-${counter}`;
	while (used.has(candidate)) {
		counter += 1;
		candidate = `${prefix}-${counter}`;
	}
	return candidate;
}

export function addOverlay(overlay: Omit<Overlay, 'id'> & { id?: string }): string {
	const id = overlay.id ?? nextId(overlay.type, engineState.overlays);
	engineState.overlays.push({ ...overlay, id });
	return id;
}

export function removeOverlay(id: string): void {
	const index = engineState.overlays.findIndex((overlay) => overlay.id === id);
	if (index >= 0) {
		engineState.overlays.splice(index, 1);
	}
}

export function addEffect(effect: Omit<Effect, 'id'> & { id?: string }): string {
	const id = effect.id ?? nextId(effect.type, engineState.effects);
	engineState.effects.push({ ...effect, id });
	return id;
}

export function removeEffect(id: string): void {
	const index = engineState.effects.findIndex((entry) => entry.id === id);
	if (index >= 0) {
		engineState.effects.splice(index, 1);
	}
}

export function addTextAnimation(entry: Omit<TextAnimation, 'id'> & { id?: string }): string {
	const id = entry.id ?? nextId('text-anim', engineState.textAnimations);
	engineState.textAnimations.push({ ...entry, id });
	return id;
}

export function removeTextAnimation(id: string): void {
	const index = engineState.textAnimations.findIndex((entry) => entry.id === id);
	if (index >= 0) {
		engineState.textAnimations.splice(index, 1);
	}
}

/**
 * Add a diagram Block element (ADR-0036) with type-appropriate defaults. A new
 * edge-arrow connects the two most recently added nodes when they exist —
 * building a flowchart in the GUI is node, node, edge — and falls back to
 * explicit points otherwise. Positions are explicit composition fractions
 * (art-directed placement; there is no auto-layout to fall back to).
 */
export function addDiagramElement(type: DiagramElement['type']): string {
	const diagram = (engineState.surface.diagram ??= []);
	const id = nextId(type, diagram);
	const enter = { start: 0.08, duration: 0.05, ease: 'settled' as const };

	let element: DiagramElement;
	if (type === 'node') {
		element = { type, id, position: { x: 0.5, y: 0.45 }, form: 'box', text: 'Node', enter };
	} else if (type === 'edge-arrow') {
		const nodes = diagram.filter((entry) => entry.type === 'node');
		const from = nodes.length >= 2 ? { node: nodes[nodes.length - 2].id } : { x: 0.35, y: 0.5 };
		const to = nodes.length >= 2 ? { node: nodes[nodes.length - 1].id } : { x: 0.65, y: 0.5 };
		element = { type, id, from, to, route: 'straight', enter };
	} else if (type === 'label') {
		element = { type, id, position: { x: 0.5, y: 0.3 }, text: 'Label', enter };
	} else if (type === 'stat-callout') {
		element = { type, id, position: { x: 0.5, y: 0.6 }, from: 0, to: 100, enter };
	} else {
		element = { type, id, from: { x: 0.3, y: 0.7 }, to: { x: 0.7, y: 0.7 }, enter };
	}

	diagram.push(element);
	return id;
}

/**
 * Remove a diagram element and every weld that would dangle: cascades (on any
 * layer) anchored to it lose their cascade, and edges referencing a removed
 * node swap that endpoint for the node's last explicit position — the
 * resolver and schema both fail fast on dangling refs, so removal must leave
 * the composition valid.
 */
export function removeDiagramElement(id: string): void {
	const diagram = engineState.surface.diagram;
	if (!diagram) return;
	const index = diagram.findIndex((element) => element.id === id);
	if (index < 0) return;
	const removed = diagram[index];
	diagram.splice(index, 1);

	const dropAnchoredCascade = (owner: { cascade?: { anchor: unknown } }): void => {
		const anchor = owner.cascade?.anchor;
		if (anchor && typeof anchor === 'object' && 'block' in anchor && anchor.block === id) {
			owner.cascade = undefined;
		}
	};
	for (const element of diagram) {
		if (element.animation) dropAnchoredCascade(element.animation);
	}
	for (const overlay of engineState.overlays) {
		if (overlay.animation) dropAnchoredCascade(overlay.animation);
	}
	for (const timing of engineState.marks.timings) {
		dropAnchoredCascade(timing);
	}
	for (const entry of engineState.textAnimations) {
		dropAnchoredCascade(entry);
	}

	if (removed.type === 'node') {
		const fallback = removed.position;
		for (const element of diagram) {
			if (element.type !== 'edge-arrow') continue;
			if ('node' in element.from && element.from.node === id) {
				element.from = { ...fallback };
			}
			if ('node' in element.to && element.to.node === id) {
				element.to = { ...fallback };
			}
		}
	}

	if (diagram.length === 0) {
		engineState.surface.diagram = undefined;
	}
}

export function reorderOverlay(id: string, direction: 'up' | 'down'): void {
	const index = engineState.overlays.findIndex((o) => o.id === id);
	if (index < 0) return;
	const targetIndex = direction === 'up' ? index - 1 : index + 1;
	if (targetIndex < 0 || targetIndex >= engineState.overlays.length) return;
	const [item] = engineState.overlays.splice(index, 1);
	engineState.overlays.splice(targetIndex, 0, item);
}

export function reorderTextAnimation(id: string, direction: 'up' | 'down'): void {
	const index = engineState.textAnimations.findIndex((e) => e.id === id);
	if (index < 0) return;
	const targetIndex = direction === 'up' ? index - 1 : index + 1;
	if (targetIndex < 0 || targetIndex >= engineState.textAnimations.length) return;
	const [item] = engineState.textAnimations.splice(index, 1);
	engineState.textAnimations.splice(targetIndex, 0, item);
}

export const EDITOR_MARK_COLORS = {
	get highlight() {
		return readMarkColor('highlight');
	},
	get underline() {
		return readMarkColor('underline');
	},
	get strike() {
		return readMarkColor('strike');
	},
	get circle() {
		return readMarkColor('circle');
	},
	get box() {
		return readMarkColor('box');
	},
	get 'side-note'() {
		return readMarkColor('side-note');
	},
	get magnify() {
		return readMarkColor('magnify');
	},
	get 'lift-out'() {
		return readMarkColor('lift-out');
	},
	get 'tear-out'() {
		return readMarkColor('tear-out');
	},
	get isolate() {
		return readMarkColor('isolate');
	}
} satisfies Record<AnnotationMarkStyle, string>;
