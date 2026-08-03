# ADR-0039 — Pack-neutral compositions and preset listing hygiene

## Status

**Canon policy, partially built; some mechanisms remain designed, not built.** Accepted by Scott on 2026-07-13 during the Clean Light calibration session.

- **Built:** Pack-neutral/listing policy, orientation-duplicate pruning, orientation-responsive Overlay placement and Diagram geometry, Pack-routable paper grain, fixture-only calibration/reflow proofs, anamorphic-flare removal, and `backgroundFill: "pack"` (2026-08-03: `field-treatment` joined the mandatory core vocabulary as the sentinel's resolution target — see the ADR-0024 extension note — with schema/GUI parity and every field-restating corpus fill converted).
- **Designed, not built:** Pack-picked Pipeline variants.
- **Built 2026-08-03 (dex `6ltfmkwx`):** partial paper-document immunity — `packImmunity.claimable` splits an immune document body from enumerated claimable chrome slots; the newspaper's sheet/ink/print/tear are intrinsic (`newsprint-substrate.ts`) with the kicker chip + depth rig still Pack-resolved, and the paper family went fully immune with authored typography still winning (`resolveSurfaceTypographyColors`). The pack-diff lock's paper row measures IMMUNE-PASS 0%; the newspaper row measures chrome-only deltas on a chip-bearing representative. Known limitation: a glow-form depth claim has no torn-silhouette synthesis lane, so crt-terminal's bloom does not reach the clipping.
- **Superseded:** Pack sound-kit resolution in §3 was replaced by ADR-0033's engine defaults plus per-motion overrides.
- **Still converging:** the human-scale Pack-matrix sweep is tracked in Dex; its policy is Canon, but completion must not be inferred from this ADR. _Pack-suffix folding completed 2026-08-03 (dex `5otj2thj`):_ the four `-crt` fixtures were deleted — their deltas were identity strings, field hexes now expressed by the `backgroundFill: "pack"` sentinel, stale pre-ADR-0033 sound models, and staleness against evolved bases (`lower-third-cinematic-crt` was an orphan of a retired base; its variant-pick lesson is carried by the PackPipelineRole task). The three `-clean-light` re-dresses are retained as `kind: "fixture"` Calibration Trio ratification evidence, per §6's meaningfulness gate — they are calibration records, not listing entries.

## Context

Two audits landed together:

**The pack-flip audit.** Flipping `server-renders-again` (a rotated, taped-down newspaper clipping) across packs changes 55% of pixels and none of the meaning. Three distinct causes, none of them "the roles are too timid":

1. **Brand grammar baked into the composition.** The piece's staging — rotate + tape + grain collage — is one brand's language (and a retired register even for syntax). ADR-0023 makes Packs appearance-only, so a swap can only repaint staging it's given. No re-dress makes a taped clipping read as CRT or white-studio.
2. **Substrate doctrine inconsistency.** A quoted tweet is pack-immune (ADR-0038) but a quoted newspaper is pack-claimable — so packs repaint the _artifact itself_, breaking verisimilitude (a white-and-blue "newspaper" is no longer a newspaper) without gaining brand.
3. **The remaining dupe deltas are enumerable.** Diffing every pack-suffix duplicate (`*-crt`, `*-clean-light`) against its base yields exactly: the `pack` field, `typography.paperColor/inkColor` restatements (already optional per ADR-0038), `backgroundFill` (a brand-coupled authored hex), sound-event swaps, one grain effect, one variant pick. That's the full list of what stops a pure pack flip from working.

**The orientation audit.** Of 19 `-vertical`/`-horizontal` pairs, **13 are byte-identical** to their base apart from `transport.orientation` (all seven web-documents, all three iMessage pieces, both captions demos, depth-stage-demo). The GUI flips orientation live (CanvasControlsBar); these files add nothing. Two pairs differ by 3 layout nudges (instagram-follow, youtube-subscribe). Four docu-diagram pairs are real vertical recompositions (docu-timeline-build: 174 diffs — diagram coordinates are authored per orientation).

**The product frame** (roadmap § The pack catalog): a creator picks one pack and authors in it. The cross-pack flip is our internal contract proof — the pixel-diff lock needs it as a no-op guard — not a user-facing promise that any composition reads native under every brand.

## Decision

1. **Compositions are pack-neutral.** A shipped Preset must not bake one brand's staging grammar into its composition. Brand-specific staging lives in the Pack (roles, and eventually pack-picked variants) or it doesn't ship as a shared Preset. Existing brand-grammar pieces (the `server-renders-again` collage class) are retired or re-authored — they are not evidence about the pack system.

2. **Substrate immunity extends to paper documents.** `newspaper` (and the paper-document family) becomes substrate-immune like `web-document`/`imessage`: the document's own physics — body fill/ink, print tints, tear/edge character — stop re-skinning under a pack swap. **Channel chrome on and around the document stays claimable**: the kicker chip, marks/annotation inks, depth/shadow chrome, backdrop. This requires _partial_ immunity machinery (immune body + claimable chrome slots) — today's `packImmunity` is all-or-nothing.

3. **One preset per piece — the pack is a dial, not a filename.** No pack-suffix duplicates in the listing. The mechanisms that make a pure flip sufficient, in dependency order:
   - Lift remaining ADR-0038 `typography` restatements from base presets (pure pruning).
   - `backgroundFill: "pack"` sentinel — resolves to the active Pack's field color; presence still signals the opaque/transparent export lane. Schema + GUI parity.
   - Pack-routable grain: `paper-grain` uniforms scale by a Pack claim (the type-hero-rake routing pattern); a non-paper pack **declines the material categorically** (`'none'` — the authored effect goes inert and the inspector shows `pack · off`) instead of the composition dropping the effect. A NUMBER claim is a dial (quieter grain, still live-edited); binary UI state never hangs off a threshold on a dial.
   - Pack sound voice: sound _events_ stay composition-owned (ADR-0023), but event→sample resolution routes through the active Pack's kit, so 'impact' lands as each brand's impact. Scope to be designed — the CRT dupes exist mostly for this.
   - Pack-picked pipeline variants (`PackPipelineRole`, unwired since the form-dress round) for the rare places staging itself is brand.
     The `*-crt` / `*-clean-light` duplicates fold back into their bases **as these mechanisms land** — they are not deleted before the flip can express their deltas.

4. **One preset per composition across orientations.** Orientation is a transport dial. An `-vertical`/`-horizontal` file may exist **only** for a real recomposition (the four docu-diagram pieces qualify — per-orientation diagram coordinates are authored content, until responsive diagram layout exists). The 13 byte-identical duplicates are deleted now. _Amended same-day (Scott):_ the two "3-diff nudge" pairs (instagram-follow, youtube-subscribe) turned out to encode the **platform safe-area placement rule** — horizontal anchors bottom-left (YouTube lower-third position), vertical anchors bottom-center raised (above TikTok/Reels UI chrome). They are kept as recompositions — **but Scott rules the need for them a system failure, not an acceptable state**: the reflow story promises one composition across targets with platform safe-areas, and an overlay placement that must be re-authored per orientation means the engine has no safe-area placement model. The two files are a stopgap; the wanted state is orientation-responsive placement (roadmap 🧭). Any new creator block needing a duplicate pair re-raises this immediately.

   _Placement amendment (2026-07-24, Scott):_ orientation-responsive authored placement remains explicit geometry, not a semantic named-slot system. Each Overlay has one shared placement fallback and may carry complete horizontal and/or vertical placement snapshots inside the same Preset. Each Diagram primitive applies the same policy through type-specific geometry snapshots: position + scale for nodes/labels/stats, endpoints + route + control for edges, and both endpoints for timeline segments. Partial field inheritance is rejected because mixed geometry becomes ambiguous. In the GUI, edits remain shared until the author explicitly enables **Customize horizontal** or **Customize vertical**; enabling copies the currently resolved geometry into that orientation, disabling deletes it and immediately returns to the shared fallback. Rendering, animation-channel seeds/deltas, direct manipulation, and static lint all consume geometry resolved for the active transport orientation. Safe areas are validation only: authored geometry remains exact and the engine never clamps or mutates it.

5. **The pixel-diff lock keeps its job and loses the overclaim.** It is a floor against silent no-op packs — never a meaningfulness gate. The meaningfulness gate is the Calibration Trio, ratified live.

6. _Amended same-day (Scott)._ **Listing admission: materially different or it doesn't ship.** A new preset enters the listing only if it is materially different from every existing piece — a new register, composition language, or content domain. A re-dress, re-text, re-orientation, or feature demo is not a new piece: pack flips are the dial, feature proofs are `kind: "fixture"`. And the pack-neutral bar is affirmative, not just structural: **every listed preset must _look good_ under every catalog pack** — verified by a pack-matrix render sweep (every deliverable × every pack, judged at human scale), not just the pixel-diff lock.

7. _Amended same-day (Scott)._ **The anamorphic flare is removed.** The lower-third `cinematic` variant's flare pass read as cheap ("that's not it" — flare ≠ cinematic) and was already dead code — gated on an `'anamorphic-flare'` light claim no registered Pack makes. The pass and the dead `lower-third.flare` rim claims are deleted (pixel-neutral, byte-compared); the `lower-third.light` Role stays declared so a future light treatment can resolve it, at a higher bar.

## Consequences

- The listing shrinks by 13 files immediately (more as § 3 mechanisms land); the pixel-diff coverage map re-derives from the remaining corpus.
- Partial substrate immunity is new registry machinery (an Identity-Spec-level split of immune body vs claimable chrome slots) and shrinks the pack surface on the highest-traffic document surfaces — the pack-diff lock's newspaper row will measure chrome-only deltas once it lands.
- `server-renders-again` stays an editorial-mono showcase until retired/re-authored under the pack-neutral bar; it stops being cited as a pack-system verdict.
- Historical ADRs/briefs that name deleted `-vertical` deliverables (`0030`, imessage-friday-deploy brief) remain accurate as point-in-time records; the canonical deliverable is the base preset flipped live.
- The Instagram, YouTube, and four docu-diagram orientation siblings folded into their canonical Presets once complete orientation snapshots shipped; orientation-suffix deliverables are no longer an accepted exception.
