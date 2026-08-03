/**
 * The newspaper's intrinsic substrate physics — the aged-newsprint constants
 * that stopped being Pack-claimable under partial substrate immunity
 * (ADR-0039 §2): a white-and-blue "newspaper" is not a newspaper, so the
 * document's own fill, ink, print tints, and tear character are the
 * Pipeline's, not the active Pack's. Channel chrome ON the clipping — the
 * kicker chip (`newspaper.accent` / `newspaper.kicker-ink`) and the
 * depth/shadow rig (`newspaper.depth`) — remains Pack-resolved through the
 * `claimable` slots on `newspaperIdentity.packImmunity`.
 *
 * Values are render-is-truth: the exact hexes the syntax-era Pack claims
 * carried, which were themselves measured FROM this substrate's render (the
 * syntax manifest notes its fill/ink cores "ground in what syntax actually
 * renders" — the newspaper). Retiring the Roles returns the numbers home.
 */

import type { EdgeTreatment } from '$lib/platform/packs/resolve';

/** Aged-newsprint sheet colour (was the `newspaper.fill` Role). */
export const NEWSPRINT_PAPER_HEX = '#f0e8d6';

/** Newsprint body ink (was the `newspaper.ink` Role). */
export const NEWSPRINT_INK_HEX = '#1a1612';

/**
 * WGSL print tints for the newspaper-physics pass (was the `newspaper.print`
 * Role): cool near-black halftone ink, faintly warm edge-occlusion shadow —
 * exact byte conversions of the pass's original vec3f constants.
 */
export const NEWSPRINT_PRINT_INK_HEX = '#0a0a0d';
export const NEWSPRINT_PRINT_SHADOW_HEX = '#0d0a0a';

/**
 * The clipping is TORN from its source, never cropped (was the syntax
 * `newspaper.edge` Role; aesthetic.md § Cut behavior — tear path ~3–8% of the
 * card's smaller dimension, interior fiber rim at the torn boundary). Under
 * partial immunity the cut character is document physics: every Pack gets the
 * same tear.
 */
export const NEWSPRINT_EDGE_TREATMENT: EdgeTreatment = {
	mode: 'torn',
	amplitudePx: 40,
	wavelengthPx: 150,
	fiber: 1
};
