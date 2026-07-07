import { z } from 'zod';

import { rawCatalog } from './raw-catalog-bundle.ts';
import { SUPERS_EFFECT_MODULES } from './supers-effects/index.ts';

// Vendored upstream JSON, eager-bundled by `raw-catalog-bundle.ts` so the
// catalog is available both inside Vite (the production build via the
// import-glob bundler) and inside `node --experimental-strip-types` (used by
// `scripts/verify-presets.ts` and other CI tooling). See
// `raw-catalog-bundle.ts` for the loader rationale; see
// `raw-catalog/CATALOG_SOURCE.md` for upstream provenance.
//
// Supers-original effects (motion-primitives plan Phase 4.1: `kerning-pop`,
// `bracket-pop`) merge in alongside the vendored set so the catalog lane
// stays a single registry from the consumer\'s perspective.
const { specModules } = rawCatalog;
const effectModules: Record<string, unknown> = {
	...rawCatalog.effectModules,
	...SUPERS_EFFECT_MODULES
};

/**
 * The four split modes the catalog defines. Each effect names exactly one as
 * its `portable_spec.target`. Supers mirrors this term in `docs/CONTEXT.md` as
 * **Split mode**.
 */
export const SPLIT_MODES = ['whole', 'per-character', 'per-word', 'per-line'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/**
 * The four renderer families Supers ships. The 20 `visibility: visible` upstream
 * effects choose one explicitly via `showcase.renderer.id`; the four hidden
 * effects (no showcase block) fall through to `generic-stagger`. Supers mirrors
 * this term in `docs/CONTEXT.md` as **Renderer family**.
 */
export const RENDERER_FAMILIES = [
	'generic-stagger',
	'kinetic-center-build',
	'kinetic-top-build',
	'shared-slide-opacity-stage'
] as const;
export type RendererFamily = (typeof RENDERER_FAMILIES)[number];

/**
 * Optional ordering applied by the generic-stagger renderer on top of the
 * unit index. Maps the upstream `portable_spec.stagger_mode` field.
 */
export const STAGGER_MODES = ['normal', 'reverse', 'center-out', 'edges-in'] as const;
export type StaggerMode = (typeof STAGGER_MODES)[number];

const KeyframeShapeSchema = z
	.object({
		opacity: z.number().optional(),
		x_px: z.number().optional(),
		y_px: z.number().optional(),
		z_px: z.number().optional(),
		blur_px: z.number().optional(),
		scale: z.number().optional(),
		rotate_deg: z.number().optional(),
		rotate_x_deg: z.number().optional(),
		rotate_y_deg: z.number().optional(),
		letter_spacing_em: z.number().optional()
	})
	.passthrough();

const PhaseSchema = z.object({
	duration_ms: z.number(),
	stagger_ms: z.number().optional().default(0),
	easing: z.string(),
	from: KeyframeShapeSchema,
	to: KeyframeShapeSchema
});

const PortableSpecSchema = z
	.object({
		id: z.string(),
		display_name: z.string(),
		description: z.string(),
		target: z.enum(SPLIT_MODES),
		signature_easing: z.string().optional(),
		stagger_mode: z.enum(STAGGER_MODES).optional(),
		enter: PhaseSchema,
		exit: PhaseSchema.optional()
	})
	.passthrough();

const ShowcaseRuntimeSchema = z
	.object({
		speed_multiplier: z.number().optional(),
		hold_ms: z.number().optional(),
		gap_ms: z.number().optional(),
		y_travel_multiplier: z.number().optional(),
		initial_delay_ms: z.unknown().optional()
	})
	.passthrough();

const ShowcaseRendererSchema = z
	.object({
		id: z.enum(RENDERER_FAMILIES),
		params: z.record(z.string(), z.unknown()).optional(),
		recipe: z.unknown().optional()
	})
	.passthrough();

const ShowcaseSchema = z
	.object({
		renderer: ShowcaseRendererSchema.optional(),
		runtime: ShowcaseRuntimeSchema.optional()
	})
	.passthrough();

const EffectFileSchema = z
	.object({
		id: z.string(),
		visibility: z.enum(['visible', 'hidden']),
		portable_spec: PortableSpecSchema,
		showcase: ShowcaseSchema.nullable().optional()
	})
	.passthrough();

const SpecFileSchema = PortableSpecSchema;

export type KeyframeShape = z.infer<typeof KeyframeShapeSchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type PortableSpec = z.infer<typeof PortableSpecSchema>;
export type ShowcaseRuntime = z.infer<typeof ShowcaseRuntimeSchema>;

export interface EffectSpec {
	id: string;
	displayName: string;
	description: string;
	visibility: 'visible' | 'hidden';
	target: SplitMode;
	renderer: RendererFamily;
	staggerMode: StaggerMode;
	signatureEasing: string | null;
	enter: Phase;
	exit: Phase | null;
	runtime: ShowcaseRuntime;
	/**
	 * Renderer-family-specific recipe params (only populated for the layout-aware
	 * renderers, copied through verbatim from `showcase.renderer.params`). Empty
	 * object for generic-stagger effects.
	 */
	rendererParams: Record<string, unknown>;
}

const DEFAULT_RUNTIME: ShowcaseRuntime = {
	speed_multiplier: 1,
	hold_ms: 0,
	gap_ms: 0,
	y_travel_multiplier: 1
};

function narrowEffect(file: z.infer<typeof EffectFileSchema>): EffectSpec {
	const spec = file.portable_spec;
	const renderer = file.showcase?.renderer?.id ?? 'generic-stagger';
	const staggerMode = spec.stagger_mode ?? 'normal';
	const runtime = { ...DEFAULT_RUNTIME, ...(file.showcase?.runtime ?? {}) };

	return {
		id: file.id,
		displayName: spec.display_name,
		description: spec.description,
		visibility: file.visibility,
		target: spec.target,
		renderer,
		staggerMode,
		signatureEasing: spec.signature_easing ?? null,
		enter: spec.enter,
		exit: spec.exit ?? null,
		runtime,
		rendererParams: { ...(file.showcase?.renderer?.params ?? {}) }
	};
}

function buildCatalog(): ReadonlyMap<string, EffectSpec> {
	const out = new Map<string, EffectSpec>();

	for (const [id, raw] of Object.entries(effectModules)) {
		const parsed = EffectFileSchema.safeParse(raw);

		if (!parsed.success) {
			throw new Error(
				`Text-animation effect catalog drift at effects/${id}.json:\n${parsed.error.message}`
			);
		}

		// Cross-check against the matching spec file when present — the upstream
		// pairs spec + effect and they should agree on id + target.
		const specRaw = specModules[parsed.data.id];
		if (specRaw) {
			const specCheck = SpecFileSchema.safeParse(specRaw);
			if (!specCheck.success) {
				throw new Error(
					`Text-animation spec catalog drift at specs/${parsed.data.id}.json:\n${specCheck.error.message}`
				);
			}

			if (specCheck.data.target !== parsed.data.portable_spec.target) {
				throw new Error(
					`Text-animation catalog mismatch: spec/${parsed.data.id} target ${specCheck.data.target} != effect target ${parsed.data.portable_spec.target}`
				);
			}
		}

		out.set(parsed.data.id, narrowEffect(parsed.data));
	}

	return out;
}

export const EFFECT_CATALOG: ReadonlyMap<string, EffectSpec> = buildCatalog();

export type EffectId = string;

/** Type predicate for use at parse-time validators. */
export function isEffectId(value: string): value is EffectId {
	return EFFECT_CATALOG.has(value);
}

/** Layout-aware renderers can only be applied to title-scale slots. */
export const LAYOUT_AWARE_RENDERERS: ReadonlySet<RendererFamily> = new Set([
	'kinetic-center-build',
	'kinetic-top-build',
	'shared-slide-opacity-stage'
]);

/** Slots the parse-time validators consider "title-scale". */
export const TITLE_SCALE_SLOTS: ReadonlySet<string> = new Set([
	'title',
	'kicker',
	'overlay:title',
	'overlay:kicker'
]);

/** Stable ordering of effect IDs for UI listings (catalog source order). */
export const EFFECT_IDS: readonly EffectId[] = Array.from(EFFECT_CATALOG.keys());
