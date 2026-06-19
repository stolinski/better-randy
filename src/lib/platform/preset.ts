import {
	PresetSchema,
	type Effect,
	type MarkTiming,
	type Overlay,
	type Preset,
	type SurfaceState,
	type TextAnimation
} from './engine-schema';
import { engineState, packState, transitionState } from './engine-state.svelte';
import { PIPELINE_REGISTRY } from './pipelines';
import { isTransitionEffectType } from './pipelines/transition-registry';

export interface CataloguedPreset {
	slug: string;
	preset: Preset;
}

const presetModules = import.meta.glob<{ default: unknown }>('$lib/presets/*.json', {
	eager: true
});

function validateOverlayContents(overlays: Overlay[]): string | null {
	for (const overlay of overlays) {
		const renderer = Object.values(PIPELINE_REGISTRY.overlays).find(
			(r) => r.type === overlay.type
		);
		if (!renderer) continue;
		const check = renderer.schema.safeParse(overlay.content);
		if (!check.success) {
			const issues = check.error.issues
				.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
				.join('; ');
			return `overlay "${overlay.id}" (type "${overlay.type}") content invalid: ${issues}`;
		}
	}
	return null;
}

/**
 * Cross-reference checks for the multi-state transition recipe (ADR-0022) that
 * the structural Zod schema can't do: `from`/`to` must resolve to known Presets,
 * `effect` must be a registered transition Effect, and a transition-Effect type
 * must never appear in the ordinary `effects[]` chain (the two lanes are
 * disjoint). `resolveSlug` returns the referenced Preset or null. Returns an
 * error string, or null when valid.
 */
function validateTransition(preset: Preset, resolveSlug: (slug: string) => Preset | null): string | null {
	for (const effect of preset.state.effects) {
		if (isTransitionEffectType(effect.type)) {
			return `effect "${effect.id}" uses transition-Effect type "${effect.type}", which runs via the top-level transition block — not the effects chain`;
		}
	}

	const transition = preset.transition;
	if (!transition) {
		return null;
	}

	if (!resolveSlug(transition.from)) {
		return `transition.from "${transition.from}" does not resolve to a known Preset`;
	}
	if (!resolveSlug(transition.to)) {
		return `transition.to "${transition.to}" does not resolve to a known Preset`;
	}
	if (!isTransitionEffectType(transition.effect)) {
		return `transition.effect "${transition.effect}" is not a registered transition Effect`;
	}
	return null;
}

const SCHEMA_VALID_CATALOG: CataloguedPreset[] = Object.entries(presetModules)
	.map<CataloguedPreset | null>(([path, module]) => {
		const slug = path.split('/').pop()?.replace(/\.json$/, '');

		if (!slug) {
			return null;
		}

		const result = PresetSchema.safeParse(module.default);

		if (!result.success) {
			console.error(`Invalid built-in preset at ${path}.`, result.error);
			return null;
		}

		const contentError = validateOverlayContents(result.data.state.overlays);
		if (contentError) {
			console.error(`Invalid built-in preset at ${path}:`, contentError);
			return null;
		}

		return { slug, preset: result.data };
	})
	.filter((entry): entry is CataloguedPreset => entry !== null)
	.sort((a, b) => a.preset.name.localeCompare(b.preset.name));

// Transition recipes (ADR-0022) reference other Presets by slug, so they can
// only be validated once every schema-valid Preset is resolvable. Second pass:
// resolve `from`/`to` against the schema-valid set and drop any Preset whose
// transition is invalid (unknown slug, unregistered effect, or a transition
// type leaking into the ordinary effects chain).
const SCHEMA_VALID_BY_SLUG = new Map(SCHEMA_VALID_CATALOG.map((entry) => [entry.slug, entry.preset]));

const PRESET_CATALOG: CataloguedPreset[] = SCHEMA_VALID_CATALOG.filter((entry) => {
	const transitionError = validateTransition(
		entry.preset,
		(slug) => SCHEMA_VALID_BY_SLUG.get(slug) ?? null
	);
	if (transitionError) {
		console.error(`Invalid built-in preset "${entry.slug}":`, transitionError);
		return false;
	}
	return true;
});

// Resolves every Preset (fixtures included) so demo / test / showcase
// fixtures stay loadable by URL during development.
const PRESET_BY_SLUG = new Map(PRESET_CATALOG.map((entry) => [entry.slug, entry.preset]));

// The catalog (app preset list) is deliverables only — fixtures are
// schema-valid but not shippable, so they are excluded here.
const DELIVERABLE_CATALOG = PRESET_CATALOG.filter((entry) => entry.preset.kind !== 'fixture');

export function listPresets(): readonly CataloguedPreset[] {
	return DELIVERABLE_CATALOG;
}

export function getPresetBySlug(slug: string): Preset | null {
	return PRESET_BY_SLUG.get(slug) ?? null;
}

export function parsePreset(json: unknown): Preset {
	const result = PresetSchema.safeParse(json);

	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
			.join('\n');

		throw new Error(`Invalid Hiviz preset:\n${issues}`);
	}

	const contentError = validateOverlayContents(result.data.state.overlays);
	if (contentError) {
		throw new Error(`Invalid Hiviz preset:\n${contentError}`);
	}

	const transitionError = validateTransition(result.data, getPresetBySlug);
	if (transitionError) {
		throw new Error(`Invalid Hiviz preset:\n${transitionError}`);
	}

	return result.data;
}

function cloneTiming(timing: MarkTiming): MarkTiming {
	const next: MarkTiming = {
		start: timing.start,
		duration: timing.duration,
		ease: timing.ease
	};

	if (timing.color !== undefined) {
		next.color = timing.color;
	}

	if (timing.intensity !== undefined) {
		next.intensity = timing.intensity;
	}

	return next;
}

function cloneSurface(surface: SurfaceState): SurfaceState {
	return {
		type: surface.type,
		// Spread every content slot — a hand-enumerated list silently drops new
		// fields (it had already lost `counterpoint`, degrading every type-hero
		// `pair` preset to the `single` fallback). `body` is a parsed structure
		// shared by reference, matching the prior behavior.
		content: { ...surface.content },
		variant: surface.variant,
		enter: surface.enter
			? { start: surface.enter.start, duration: surface.enter.duration, ease: surface.enter.ease }
			: undefined,
		exit: surface.exit
			? { start: surface.exit.start, duration: surface.exit.duration, ease: surface.exit.ease }
			: undefined,
		backgroundVisibility: surface.backgroundVisibility
	};
}

function cloneOverlay(overlay: Overlay): Overlay {
	return {
		type: overlay.type,
		id: overlay.id,
		content: overlay.content,
		position: {
			anchor: overlay.position.anchor,
			offset: overlay.position.offset ? { ...overlay.position.offset } : undefined,
			rect: overlay.position.rect ? { ...overlay.position.rect } : undefined
		},
		enter: overlay.enter ? { ...overlay.enter } : undefined,
		exit: overlay.exit ? { ...overlay.exit } : undefined,
		z: overlay.z
	};
}

function cloneEffect(effect: Effect): Effect {
	return { type: effect.type, id: effect.id, params: effect.params };
}

function cloneTextAnimation(entry: TextAnimation): TextAnimation {
	const target =
		entry.target.kind === 'surface'
			? { kind: 'surface' as const, slot: entry.target.slot }
			: {
					kind: 'overlay' as const,
					overlayId: entry.target.overlayId,
					slot: entry.target.slot
				};

	return {
		id: entry.id,
		target,
		effect: entry.effect,
		enter: { ...entry.enter },
		exit: entry.exit ? { ...entry.exit } : undefined,
		params: entry.params ? { ...entry.params } : undefined
	};
}


/**
 * Apply a Preset's composition (its Pack + `state`) to the live engine state.
 * Does NOT touch `transitionState` — the transition snapshot path swaps the
 * composition to `from`/`to` through this without disturbing the transition it
 * is servicing. Callers wanting the full "load this Preset" behaviour (including
 * resolving a transition recipe) use `applyPreset`.
 */
export function applyCompositionState(preset: Preset): void {
	const next = preset.state;

	packState.slug = preset.pack;

	engineState.transport.orientation = next.transport.orientation;
	engineState.transport.durationSeconds = next.transport.durationSeconds;
	engineState.transport.fps = next.transport.fps;
	engineState.transport.format = next.transport.format;

	engineState.typography.fontFamily = next.typography.fontFamily;
	engineState.typography.paperColor = next.typography.paperColor;
	engineState.typography.inkColor = next.typography.inkColor;

	for (const style of Object.keys(engineState.marks.defaults) as (keyof typeof engineState.marks.defaults)[]) {
		if (!(style in next.marks.defaults)) {
			delete engineState.marks.defaults[style];
		}
	}
	for (const [style, appearance] of Object.entries(next.marks.defaults)) {
		engineState.marks.defaults[style as keyof typeof engineState.marks.defaults] = {
			color: appearance.color,
			intensity: appearance.intensity
		};
	}

	engineState.marks.timings.length = 0;
	for (const timing of next.marks.timings) {
		engineState.marks.timings.push(cloneTiming(timing));
	}

	engineState.surface = cloneSurface(next.surface);
	engineState.overlays = next.overlays.map(cloneOverlay);
	engineState.effects = (next.effects ?? []).map(cloneEffect);
	engineState.textAnimations = (next.textAnimations ?? []).map(cloneTextAnimation);
	engineState.backgroundFill = next.backgroundFill;
	engineState.stage = next.stage
		? {
				type: next.stage.type,
				camera: { ...next.stage.camera },
				focus: {
					...next.stage.focus,
					pull: next.stage.focus.pull ? { ...next.stage.focus.pull } : undefined
				}
			}
		: undefined;
}

/**
 * Load a Preset: apply its composition, then resolve its transition recipe (if
 * any) into `transitionState` for the Workspace to act on. This is what the
 * route calls for the active Preset. `from`/`to` resolve against the built-in
 * catalog; an unresolved ref leaves the transition inactive (the validator
 * already rejects such Presets, so this is defence in depth).
 */
export function applyPreset(preset: Preset): void {
	applyCompositionState(preset);

	if (preset.transition) {
		const from = getPresetBySlug(preset.transition.from);
		const to = getPresetBySlug(preset.transition.to);
		transitionState.active =
			from && to
				? { from, to, effect: preset.transition.effect, durationMs: preset.transition.durationMs }
				: null;
	} else {
		transitionState.active = null;
	}
}
