/**
 * The newspaper's intrinsic substrate physics — the photographed-newsprint
 * constants that are the Pipeline's, never the active Pack's. The Surface is a
 * FULLY immune faithful artifact (ADR-0056, extending ADR-0039 §2's doctrine
 * to its conclusion): a page photographed up close carries no channel chrome
 * at all — no kicker chip, no card shadow — so nothing on it re-dresses under a
 * Pack swap. Annotation marks laid on the page (the highlighter) stay
 * Pack-resolved through their own Pipelines.
 *
 * Values are read off the direction plates in `docs/inspo/newspaper/` — an old
 * broadsheet photographed for a documentary cut: a neutral grey sheet (the
 * paper compositor's warmth multiply nudges it faintly warm), dark grey ink
 * that reads near-black at headline weight and softens to charcoal in the
 * body once the physics pass bleeds it.
 */

/** Photographed-newsprint sheet colour, before the compositor's grain and warmth. */
export const NEWSPRINT_PAPER_HEX = '#dadada';

/** Newsprint ink — headline, masthead, byline, body, column rules. */
export const NEWSPRINT_INK_HEX = '#1b1b1b';

/**
 * WGSL halftone ink for the newspaper-physics pass: the cool near-black the
 * mid-tone screen prints with.
 */
export const NEWSPRINT_PRINT_INK_HEX = '#0f0f11';
