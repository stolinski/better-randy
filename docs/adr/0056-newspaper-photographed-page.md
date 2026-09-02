# ADR-0056 — The newspaper is a photographed page, not a torn clipping

## Status

**Canon. Built 2026-09-01.** Direction plates: [`docs/inspo/newspaper/heading.png`](../inspo/newspaper/heading.png), [`docs/inspo/newspaper/body.png`](../inspo/newspaper/body.png). Supersedes the torn-clipping framing of [ADR-0008](0008-newspaper-surface-pipeline.md) and the newspaper's _partial_ substrate immunity in [ADR-0039 §2](0039-pack-neutral-compositions-and-listing-hygiene.md) (the mechanism stays; the newspaper stops using it).

## Context

The `newspaper` Surface shipped as a torn clipping: an 88 % × 62 % cream card, seeded 1–3° rotation, a Playfair headline over a mono kicker chip, a mono byline strip, the Pack's hard-offset shadow synthesized against the tear. Every one of those choices is collage grammar — the register [ADR-0039 §1](0039-pack-neutral-compositions-and-listing-hygiene.md) retired for shipped Presets — and none of them is what the reference plates show.

The plates are a broadsheet page photographed up close for a documentary insert: the frame is a tight crop _into_ the page; the sheet is grey newsprint under a lens vignette, soft at the corners, grainy; the headline is a bold, tightly tracked grotesque so large its measure runs off the frame; the folio line carries the date at the left and the masthead at the right over a heavy rule; the byline is bold caps with a light affiliation line beneath; the body is justified Times-cut serif in 30–36 character columns separated by thin rules, paragraphs indented and unspaced; a single highlighter stroke sits on the text, line by line. No edge of the paper is ever in shot.

Scott's verdict on the shipped render, 2026-09-01: it has to look like the plates.

## Decision

1. **The newspaper is a page, and the frame is a crop into it.** The CanvasSource sizes the sheet larger than the frame and offsets it so no page edge exists inside the canvas under the seeded tilt and the full camera move. The Composition's overflow clip is the crop. The headline is laid out inside the visible measure so it reads whole; the folio rule and the body columns use the full page width and run off the frame. `edgeTreatment` is not declared on the definition — an intentional absence, recorded in the Identity Spec's `page-crop` dimension.

2. **Real page furniture, real page type.** `dateLabel` and `source` print on the folio line over the heavy rule; `kicker` is an ink section label; `title` is the grotesque headline (Inter 700, −0.035 em, sized from the visible measure to fill two lines); `author` and `affiliation` form the byline; `body` flows through justified Old Standard TT columns with `column-rule`s, first-line indents, and no paragraph spacing. The sheet is `#dadada`, the ink `#1b1b1b` (`newsprint-substrate.ts`), read off the plates.

3. **Motion is a camera, not a card.** The enter is a landing (settle from 4 % closer with a small drop), the whole piece carries a 2 % push with a hint of drift, and the exit accelerates the push. Every transform is a pure function of the frame's timeline values (`paperVisibility`, `globalProgress`, the authored exit start). Nothing enters from off-frame.

4. **The photograph's optics apply to the whole frame.** `newspaper-physics` keeps halftone-at-body and ink bleed on desaturated ink-on-paper pixels, and applies mottling, a per-pixel scan grain, radial defocus, and a 30 % lens vignette to every opaque pixel, the highlighter included — the frame is the photograph. The edge-occlusion shadow and optical misregistration dimensions are retired with the silhouette and the chip.

5. **Full substrate immunity.** A photographed page carries no channel chrome — no kicker chip, no card shadow — so `packImmunity.claimable` is dropped and `surface:newspaper` joins the fully immune set. The `newspaper.accent`, `newspaper.kicker-ink`, and `newspaper.depth` Roles are removed from the contract registry and every catalog Pack. Annotation marks on the page (the highlighter) stay Pack-resolved through their own Pipelines, which is where the Pack's colour lands on this Surface.

6. **Full-frame classification.** Newspaper Presets declare `backgroundFill: "pack"` so the export lane classifies them as segments; the fill is never visible under the full-bleed sheet.

## Considered options

- **Keep the clipping as a variant and add a `page` variant** (rejected: the clipping is the register ADR-0039 retired; a variant would maintain the look Scott rejected forever, and every fixture that needed a card silhouette is a depth-stage or DOF proof that reads identically on the `paper` Surface).
- **Keep partial immunity with the kicker as Pack-inked text** (rejected: on a photographed page the section label is ink like everything else; a Pack-coloured label is chrome the plates do not have, and the `depth` claim has no silhouette to act on).
- **Camera pan across an oversized one-line headline** (rejected for the title card: the direction crops its headline because the editor pans a real page, but a chapter card must read its title whole; two balanced lines inside the visible measure keep the scale of the plates and the legibility of a title).
- **Generated filler columns when the body is short** (rejected: greeked prose under a real headline is fabricated copy; the Surface lays out what the author wrote, and the shipped Presets carry enough body to fill the crop).
- **A highlighter stroke on the headline** (deferred: `title` is a plain string everywhere — marks are enumerated from `body`, so a headline mark needs a schema-level title-mark model across the readable contract, the editor, and the operation inventory. The plates' headline-highlight moment is a follow-up, not a reason to widen this change).

## Consequences

- `title-card-newspaper` is re-authored as the page (4 s, body copy, no tape, no grain Effect); `newspaper-body-test` becomes the body-plate fixture (multi-line highlighter across a quotation). `depth-stage-demo` and `depth-of-field-tabletop` move to the `paper` Surface — they prove the depth stage and DOF, not the newspaper. `server-renders-again` (the editorial-mono clipping collage and the pack-diff lock's newspaper representative) is deleted: its rationale was the chip and the `depth: 'none'` claim, both gone.
- The pack-diff lock's newspaper row moves from the must-change set to the stability ceiling; `PACK_IMMUNE_PIPELINE_KEYS` gains `surface:newspaper`.
- Every catalog Pack's calibration fingerprint re-keys (the shared render-source tree changed) — the freshness gate demands the usual 15-frame re-ratification on the next `--affected` run.
- The rubric's Surface-title band and the T1/T2 corpus notes read the newspaper as a document surface with a display-scale headline; the layout contract's floors (surface-title ≥ 60/76 px, surface-body ≥ 32/44 px) hold at both orientations.
