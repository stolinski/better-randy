import {
	type Cascade,
	type CascadeAnchor,
	type CompositionTransition,
	type Effect,
	type Keyframe,
	type MarkTiming,
	type Overlay,
	type OverlayAnimation,
	type Preset,
	type SurfaceAnimation,
	type SurfaceState,
	type TextAnimation,
	type Transition
} from './engine-schema';
import { cloneOverlayPlacement } from '../utils/overlay-placement';
import { cloneJsonValue } from '../utils/json-clone';
import {
	engineState,
	packState,
	transitionState,
	type ResolvedTransition
} from './engine-state.svelte';
import { applyPresetBase } from './preset-base.svelte';
import { PresetIngressSchema } from './preset-ingress';
import { isTransitionEffectType } from './pipelines/transition-registry';
import { formatPresetSemanticIssues, validatePresetSemantics } from './preset-validation';

export interface CataloguedPreset {
	slug: string;
	preset: Preset;
}

const presetModules = import.meta.glob<{ default: unknown }>('$lib/presets/*.json', {
	eager: true
});

const SCHEMA_VALID_CATALOG: CataloguedPreset[] = Object.entries(presetModules)
	.map<CataloguedPreset | null>(([path, module]) => {
		const slug = path
			.split('/')
			.pop()
			?.replace(/\.json$/, '');

		if (!slug) {
			return null;
		}

		const result = PresetIngressSchema.safeParse(module.default);

		if (!result.success) {
			console.error(`Invalid built-in preset at ${path}.`, result.error);
			return null;
		}

		const semanticIssues = validatePresetSemantics(result.data);
		if (semanticIssues.length > 0) {
			console.error(
				`Invalid built-in preset at ${path}:\n${formatPresetSemanticIssues(semanticIssues)}`
			);
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
const SCHEMA_VALID_BY_SLUG = new Map(
	SCHEMA_VALID_CATALOG.map((entry) => [entry.slug, entry.preset])
);

const PRESET_CATALOG: CataloguedPreset[] = SCHEMA_VALID_CATALOG.filter((entry) => {
	const semanticIssues = validatePresetSemantics(entry.preset, {
		resolvePreset: (slug) => SCHEMA_VALID_BY_SLUG.get(slug) ?? null
	});
	if (semanticIssues.length > 0) {
		console.error(
			`Invalid built-in preset "${entry.slug}":\n${formatPresetSemanticIssues(semanticIssues)}`
		);
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

// Fixtures (engine demos / verification / showcase) — schema-valid and loadable
// by URL, but not shippable deliverables. Listed separately so demos like the
// dimensional depth stage stay discoverable from the index without mixing into
// the deliverables list.
const FIXTURE_CATALOG = PRESET_CATALOG.filter((entry) => entry.preset.kind === 'fixture');

export function listPresets(): readonly CataloguedPreset[] {
	return DELIVERABLE_CATALOG;
}

export function listFixtures(): readonly CataloguedPreset[] {
	return FIXTURE_CATALOG;
}

export function getPresetBySlug(slug: string): Preset | null {
	return PRESET_BY_SLUG.get(slug) ?? null;
}

export function parsePreset(json: unknown): Preset {
	const result = PresetIngressSchema.safeParse(json);

	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
			.join('\n');

		throw new Error(`Invalid Supers preset:\n${issues}`);
	}

	const semanticIssues = validatePresetSemantics(result.data, { resolvePreset: getPresetBySlug });
	if (semanticIssues.length > 0) {
		throw new Error(`Invalid Supers preset:\n${formatPresetSemanticIssues(semanticIssues)}`);
	}

	return result.data;
}

function cloneCascadeAnchor(anchor: CascadeAnchor): CascadeAnchor {
	if (anchor === 'surface') {
		return anchor;
	}
	if ('overlay' in anchor) {
		return { overlay: anchor.overlay };
	}
	if ('mark' in anchor) {
		return { mark: anchor.mark };
	}
	if ('block' in anchor) {
		return { block: anchor.block };
	}
	return { textAnimation: anchor.textAnimation };
}

function cloneCascade(cascade: Cascade): Cascade {
	return {
		anchor: cloneCascadeAnchor(cascade.anchor),
		event: cascade.event,
		offsetMs: cascade.offsetMs
	};
}

// Clones every declared channel track without hand-enumerating channel names —
// a fixed list here would silently drop any channel the schema grows later
// (the same trap that lost `counterpoint` in cloneSurface).
function cloneChannelKeyframes<T extends Record<string, Keyframe[] | undefined>>(channels: T): T {
	const next = { ...channels };
	for (const key of Object.keys(next) as (keyof T)[]) {
		const track = next[key];
		if (track) {
			next[key] = track.map((frame) => ({ ...frame })) as T[keyof T];
		}
	}
	return next;
}

function cloneOverlayAnimation(animation: OverlayAnimation): OverlayAnimation {
	return {
		channels: animation.channels ? cloneChannelKeyframes(animation.channels) : undefined,
		cascade: animation.cascade ? cloneCascade(animation.cascade) : undefined
	};
}

function cloneSurfaceAnimation(animation: SurfaceAnimation): SurfaceAnimation {
	return {
		channels: animation.channels ? cloneChannelKeyframes(animation.channels) : undefined
	};
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

	if (timing.sound !== undefined) {
		next.sound = { ...timing.sound };
	}

	if (timing.cascade !== undefined) {
		next.cascade = cloneCascade(timing.cascade);
	}

	return next;
}

// Clones the nested per-motion sound override too — sharing it by reference
// would let GUI edits on the live engine state mutate the catalogued Preset.
function cloneTransition(transition: Transition): Transition {
	return {
		...transition,
		sound: transition.sound ? { ...transition.sound } : undefined
	};
}

function cloneSurface(surface: SurfaceState): SurfaceState {
	return {
		type: surface.type,
		// Spread every content slot — a hand-enumerated list silently drops new
		// fields (it had already lost `counterpoint`, degrading every type-hero
		// `pair` preset to the `single` fallback). `body` is a parsed structure
		// shared by reference, matching the prior behavior.
		content: cloneJsonValue(surface.content),
		// Which site the `web-document` Surface mocks (twitter | reddit |
		// wikipedia). A top-level surface field like `variant` — must be carried
		// here or applyPreset silently drops it and every site falls back to the
		// `twitter` mock (the same hand-enumeration trap that lost `counterpoint`).
		site: surface.site,
		variant: surface.variant,
		// Chrome mode (ADR-0037): another top-level surface field that must be
		// carried explicitly, or chromeless presets silently render the window.
		chrome: surface.chrome,
		enter: surface.enter ? cloneTransition(surface.enter) : undefined,
		exit: surface.exit ? cloneTransition(surface.exit) : undefined,
		animation: surface.animation ? cloneSurfaceAnimation(surface.animation) : undefined,
		backgroundVisibility: surface.backgroundVisibility,
		// Diagram primitive Blocks (ADR-0036). Pure JSON (points, strings, numbers,
		// transitions, channel tracks), so structuredClone deep-copies every field
		// without the hand-enumeration trap that lost `counterpoint` and `chrome`.
		diagram: surface.diagram ? cloneJsonValue(surface.diagram) : undefined,
		// Chart Blocks (ADR-0048) are the same pure JSON contract. Clone the
		// complete group so applyPreset cannot share mutable data with catalog or wire input.
		chart: surface.chart ? cloneJsonValue(surface.chart) : undefined
	};
}

function cloneOverlay(overlay: Overlay): Overlay {
	return {
		type: overlay.type,
		id: overlay.id,
		content: cloneJsonValue(overlay.content),
		position: {
			...cloneOverlayPlacement(overlay.position),
			orientationOverrides: overlay.position.orientationOverrides
				? {
						horizontal: overlay.position.orientationOverrides.horizontal
							? cloneOverlayPlacement(overlay.position.orientationOverrides.horizontal)
							: undefined,
						vertical: overlay.position.orientationOverrides.vertical
							? cloneOverlayPlacement(overlay.position.orientationOverrides.vertical)
							: undefined
					}
				: undefined
		},
		enter: overlay.enter ? cloneTransition(overlay.enter) : undefined,
		exit: overlay.exit ? cloneTransition(overlay.exit) : undefined,
		animation: overlay.animation ? cloneOverlayAnimation(overlay.animation) : undefined,
		z: overlay.z
	};
}

function cloneEffect(effect: Effect): Effect {
	return { type: effect.type, id: effect.id, params: cloneJsonValue(effect.params) };
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
		enter: cloneTransition(entry.enter),
		exit: entry.exit ? cloneTransition(entry.exit) : undefined,
		cascade: entry.cascade ? cloneCascade(entry.cascade) : undefined,
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

	for (const style of Object.keys(
		engineState.marks.defaults
	) as (keyof typeof engineState.marks.defaults)[]) {
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
	engineState.audioCues = next.audioCues.map((cue) => ({ ...cue }));
	engineState.media = cloneJsonValue(next.media);
	engineState.backgroundFill = next.backgroundFill;
	engineState.stage = next.stage
		? {
				type: next.stage.type,
				camera: { ...next.stage.camera },
				focus: {
					...next.stage.focus,
					pull: next.stage.focus.pull ? { ...next.stage.focus.pull } : undefined
				},
				backdrop: next.stage.backdrop
					? {
							image: next.stage.backdrop.image ? { ...next.stage.backdrop.image } : undefined,
							contrast: next.stage.backdrop.contrast
						}
					: undefined
			}
		: undefined;
	// Captions track (creator blocks): pure JSON (style knobs + ms cues), so
	// structuredClone deep-copies every field without the hand-enumeration trap.
	engineState.captions = next.captions ? cloneJsonValue(next.captions) : undefined;
}

/**
 * Resolve a transition recipe into the form `transitionState.active` carries:
 * `from`/`to` slugs resolved against the built-in catalog, `effect` checked
 * against the transition registry. Returns null when the recipe is absent or
 * any reference fails to resolve — the "no active transition" state, never a
 * throw. Shared by `applyPreset` (load) and the RootInspector's Transition
 * section (live edits), so both paths resolve identically.
 */
export function resolveTransition(
	recipe: CompositionTransition | undefined
): ResolvedTransition | null {
	if (!recipe) return null;
	const from = getPresetBySlug(recipe.from);
	const to = getPresetBySlug(recipe.to);
	if (!from || !to || !isTransitionEffectType(recipe.effect)) return null;
	return {
		fromSlug: recipe.from,
		toSlug: recipe.to,
		from,
		to,
		effect: recipe.effect,
		durationMs: recipe.durationMs,
		params: cloneJsonValue(recipe.params)
	};
}

/**
 * Load a Preset: apply its composition, seed the GUI-editable `presetBase`
 * metadata (name / description / kind / transition), then resolve its
 * transition recipe (if any) into `transitionState` for the Workspace to act
 * on. This is what the route calls for the active Preset. An unresolved
 * transition ref leaves the transition inactive (the validator already
 * rejects such Presets, so this is defence in depth).
 */
export function applyPreset(preset: Preset): void {
	applyCompositionState(preset);
	applyPresetBase(preset);
	transitionState.active = resolveTransition(preset.transition);
}
