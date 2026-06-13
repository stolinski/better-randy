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
