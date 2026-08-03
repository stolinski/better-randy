/**
 * The paper Surface's intrinsic substrate colours — the printer-paper
 * constants an unauthored composition falls to under substrate immunity
 * (ADR-0039 §2). An authored `typography.paperColor` / `inkColor` remains an
 * intentional composition-content choice that wins (ADR-0038); what stopped
 * existing is the ACTIVE PACK deciding the sheet: a quoted document's body is
 * document physics, not brand dress. Resolved through
 * `resolveSurfaceTypographyColors` (`src/lib/platform/pipelines/index.ts`).
 *
 * Values are the corpus's canonical print-paper look — the hexes nearly every
 * paper preset already authors explicitly.
 */

/** Clean printer-paper sheet. */
export const PAPER_SHEET_HEX = '#ffffff';

/** Printed body ink. */
export const PAPER_INK_HEX = '#111111';
