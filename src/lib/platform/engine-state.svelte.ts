import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

import {
	createDefaultEngineState,
	createMarkTiming,
	type EngineState,
	type Effect,
	type MarkTiming,
	type Overlay,
	type TextAnimation
} from './engine-schema';
import { assertIdentityRegistryValid } from './pipelines/identity-registry';
import { getPack, REFERENCE_PACK_SLUG } from './packs/registry';

// ADR-0019 boot gate: refuse to start if any registered Pipeline's Identity
// Spec ships with an unimplemented + non-via-pack dimension, or if the
// completeness-reference Pack does not resolve every via-pack Role referenced
// by the registry. Validated against the reference Pack (not a preset default —
// ADR-0023 removed that); partial Packs fall back through resolveAppearanceVars.
// Throws an aggregated Error on first import of this module.
assertIdentityRegistryValid(getPack(REFERENCE_PACK_SLUG));

export const engineState = $state<EngineState>(createDefaultEngineState());

/**
 * Active Pack slug. Set by `applyPreset` from the Preset's (required) `pack`
 * field and runtime-overridable (ADR-0023). The mounts read it to resolve each
 * Pipeline's appearance Roles into CSS vars via `resolveAppearanceVars`. The
 * initial value is only a pre-first-Preset bootstrap (every Preset declares its
 * own Pack and overrides this on load), so it uses the reference Pack.
 */
export const packState = $state<{ slug: string }>({ slug: REFERENCE_PACK_SLUG });

export function ensureMarkTimingAtIndex(index: number): MarkTiming {
	while (engineState.marks.timings.length <= index) {
		engineState.marks.timings.push(createMarkTiming());
	}

	return engineState.marks.timings[index];
}

const FALLBACK_MARK_COLOR = '#1f5aff';

function readMarkColor(style: AnnotationMarkStyle): string {
	return engineState.marks.defaults[style]?.color ?? FALLBACK_MARK_COLOR;
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
