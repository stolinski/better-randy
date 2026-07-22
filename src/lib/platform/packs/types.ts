/**
 * Pack manifest types — per ADR-0014 (Pack/Preset split) and ADR-0019
 * (via-pack clause on Identity Specs). A Pack manifest resolves the Role
 * references that Pipelines declare in their Identity Spec `viaPack`
 * clauses; the engine boot validator refuses to start if any registered
 * Pipeline\'s `viaPack` references do not resolve in the active Pack.
 *
 * Roles come in three kinds:
 *   - `style`: a leaf value (hex, font stack, numeric, ease curve, etc.)
 *   - `pipeline`: a Pipeline pick (which Surface / Block / Effect / etc.)
 *   - `chrome`: an effect-chain or shaderPass recipe
 *
 * The Pack manifest is a flat record keyed by Role name. A Role name has
 * the shape `<pipeline-type>.<role-id>` (e.g. `lower-third.ink`,
 * `highlight.fill`). Core Roles (Pack-vocabulary, not Pipeline-scoped) use
 * a bare name (e.g. `fill-treatment`, `edge-treatment`).
 */

export type PackRoleKind = 'style' | 'pipeline' | 'chrome';

/**
 * The mandatory core vocabulary (ADR-0024): the six bare core Roles every
 * registered Pack MUST supply, so the specific → core fallback chain always
 * lands on a real value and no CanvasSource literal fallback ever decides a
 * Pack's pixels. Enforced for every Pack in the registry by
 * `validatePackCoreVocabulary` (engine boot + `scripts/verify-presets.ts`).
 *
 * Value contracts (checked by the validator):
 *   - `fill-treatment` / `ink-treatment` / `accent-treatment` — a colour
 *     string (hex / rgb() / oklch() / … — see `isColorValue` in `resolve.ts`).
 *   - `edge-treatment` — the five-value edge vocabulary
 *     (`'clean' | 'soft' | 'irregular' | 'torn' | 'none'`), bare or as the
 *     `{ mode, amplitudePx?, wavelengthPx?, fiber? }` object form
 *     (see `resolveEdgeTreatment`).
 *   - `depth-treatment` — `'none'`, or a hard-offset rig
 *     (`{ hardOffset | offset: { dx, dy, blur?, color? } }`) per
 *     `resolveDepthTreatment`. The recognised-value set is intentionally
 *     extensible (a `'glow'` variant is planned for a CRT pack).
 *   - `light-treatment` — `'none'`, or `{ direction, intensity }` per
 *     `resolveLightTreatment`.
 *
 * OPTIONAL cores — recognised dimension vocabulary a Pack MAY supply, never
 * required by the validator:
 *   - `material-treatment` — a grain/material claim (how ink sits on the
 *     substrate; e.g. the paragraph Block's `paragraph.material: 'ink-bleed'`
 *     rides this dimension).
 *   - `font-treatment` — the Pack's universal type voice: a single CSS
 *     font-family stack STRING (e.g. `'"JetBrains Mono", "SFMono-Regular",
 *     Consolas, monospace'`). When present, `resolveAppearanceVars` emits it
 *     as `--font` on every mount and pipelines consume it via
 *     `font-family: var(--font, <intrinsic stack>)` — one family everywhere.
 *     Per-Pipeline `<type>.font` string Roles beat the core (specific → core,
 *     `resolveFontTreatment`). Any other or absent value is no claim —
 *     pipelines keep their intrinsic stacks. Pack-immune Pipelines never
 *     receive it; their mounts derive immunity from the Identity Registry. The
 *     family named first must appear in `fonts` so capture gates on it loading.
 */
export const MANDATORY_CORE_ROLES = [
	'fill-treatment',
	'ink-treatment',
	'accent-treatment',
	'edge-treatment',
	'depth-treatment',
	'light-treatment'
] as const;

export type MandatoryCoreRole = (typeof MANDATORY_CORE_ROLES)[number];

export interface PackStyleRole {
	kind: 'style';
	value: unknown;
}

export interface PackPipelineRole {
	kind: 'pipeline';
	pipeline: string;
	params?: Record<string, unknown>;
}

export interface PackChromeRole {
	kind: 'chrome';
	effects: readonly { type: string; params?: Record<string, unknown> }[];
}

export type PackRole = PackStyleRole | PackPipelineRole | PackChromeRole;

/**
 * A typeface this Pack supplies. The engine loads it and gates the
 * HTML-in-Canvas capture on `document.fonts.ready` so renders never rasterize
 * OS fallbacks. The Pack folder owns the actual `@font-face` registration
 * (e.g. `@fontsource` imports); this only declares what the engine must await.
 * `family` must match exactly the `font-family` value the Pipelines reference.
 */
export interface PackFont {
	family: string;
	/** Weights to preload before capture. Defaults to `[400]`. */
	weights?: readonly number[];
	/** Font style to preload. Defaults to `'normal'`. */
	style?: string;
}

export interface PackManifest {
	slug: string;
	label: string;
	description: string;
	/** Roles satisfied by this Pack, keyed by Role name. */
	roles: Record<string, PackRole>;
	/** Typefaces this Pack supplies; the engine awaits them before capture. */
	fonts?: readonly PackFont[];
}
