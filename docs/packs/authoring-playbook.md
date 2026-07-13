# Pack Authoring Playbook

The repeatable pipeline for authoring a **Pack** — distilled from the sessions that proved it (the Syntax re-dress to the real brand, 2026-07-09, and the CRT Terminal tube-chrome payoff, 2026-07-10). Any pack-authoring session — house archetype or concierge customer pack — follows this checklist top to bottom. The catalog rule binds throughout: **one pack at a time; a pack enters the catalog only with a Scott-ratified Calibration Trio** (see `docs/CONTEXT.md` § Pack catalog).

The one-sentence law everything below serves: **brand tokens ≠ brand grammar.** A pack that only swaps hue + font reads as one design system in a new colorway (the honest verdict on the first CRT demo: "it's just colors really"). A real pack claims _structural_ roles — depth, edge, material, form, chrome — and at least one inversion that changes what the element **is**, not what color it wears.

---

## 1 — Intake (no ceremony)

Accept whatever brand material exists; do not demand a formal brief:

- **A brand doc / style guide** — treat stated tokens as claims to verify, not truth.
- **CSS / a repo** — the strongest source. Real computed values beat any doc (the Syntax truth was `github.com/randyrektor/syntax-overlay`'s CSS, not the old aesthetic doc).
- **A website** — screenshot at real scale, read computed styles, eyedrop real pixels.
- **A house archetype** (catalog work) — a direction line plus a reference reel you assemble.

The intake bar: **enough real pixels to ground every claim.** Never author a value from memory of a brand or from taste alone — measure it, or derive it from a measured neighbor and say so in a comment.

## 2 — Extract the contract

Distill the material into the pack's contract _before_ writing a manifest line:

1. **Tokens.** Palette as a job table (field, card/plate, ink ladder, accent(s), semantic colors), each value measured. Note the saturated-hue budget (Q4: ≤ 3 visible at once).
2. **Voice + label voice, at TRUE font cuts.** Identify the display face and the label/chrome face. For every weight/stretch you intend to claim, verify the cut **exists** (check the `@fontsource` package's actual files). **Never synthesize weight or stretch** — Space Grotesk has no 900/condensed; the browser's synthetic squeeze rendered off-brand and this is now a form-suffix (`stretch`) a pack must claim honestly.
3. **Card/chrome system, proportioned to the ELEMENT.** Extract _ratios of the element_, not absolute pixels: border ≈ N% of card height, radius ≈ N%, shadow steps ≈ N%, padding ≈ N%. The first Syntax pass scaled 1080p values ×2 for the 4K frame and rendered hairline — chrome scales with the card it dresses, not the frame it sits in.
4. **Motion grammar.** Which parts of the shared motion vocabulary the brand leans into and out of (Syntax: settled-place, stroke-draw, no gloss sweeps; CRT: sharp snaps, decay exits, "a machine does not wobble"). A Pack never adds motion — ADR-0023 — but the aesthetic doc must say which intrinsic moves read on-brand so Preset authors choose well.
5. **Sound grammar.** Which kit events fit the brand's physicality. **Audition the samples — event names lie**: `pop` is the iMessage bloop; a physical card landing wants `impact`.
6. **Substrate ≠ chrome.** Found documents (tweets, newsprint, photos, iMessage) keep their own physics under every pack. Only what the _channel adds_ — cards, chips, lower-thirds, diagram strokes — wears the pack. Pack-immune pipelines (`PACK_IMMUNE_PIPELINE_KEYS`) never receive vars at all.
7. **Capability ≠ brand membership.** The engine's features are not all this brand's features. A pack may rule a capability out of its aesthetic (CRT forbids tape) — but it still supplies **defensive values** for that capability's roles, so a re-skinned Preset that carries it anyway can't leak another pack's tones. Never curate the engine or the Critics to one pack (`docs/adr/` — the engine stays general).

## 3 — Author the artifacts

Anatomy of a pack (three files + one registration):

1. **`src/lib/packs/<slug>/fonts.ts`** — `@fontsource` side-effect imports (self-hosted; nothing fetched at render time) plus the exported `PackFont[]` declaration. Family strings must match the `font-family` values the roles reference **exactly**; declare every weight you claim so capture gates on real cuts. The family named first in `font-treatment` must appear here — HTML-in-Canvas capture awaits it before rasterizing.
2. **`src/lib/packs/<slug>/manifest.ts`** — in this order:
   - **The six mandatory cores** (`fill/ink/accent/edge/depth/light-treatment`, ADR-0024). `validatePackCoreVocabulary` refuses the pack at boot without them. These are the fallback floor — every unclaimed slot in every pipeline eventually lands here, so choose values that survive _anywhere_.
   - **Optional cores** where the brand claims them: `font-treatment` (the universal type voice, emitted as `--font`), `font-label-treatment` (pairs a label/chrome voice with the display voice), `material-treatment` (grain/scanline — how ink sits on the substrate).
   - **`chrome` role** (kind `'chrome'`) only if the brand dresses opaque pieces — an effect recipe the Workspace appends after the preset's own effects **only when `backgroundFill` is declared** (`withPackChrome`). Chrome never appears in preset JSON, and transparent overlays never get it. The GUI shows it read-only with a PACK tag — invisible auto-applied treatments read as bugs.
   - **Per-pipeline overrides** only where the pack diverges — the chain is specific → core (`resolveAppearanceVars`); a partial pack is legitimate (only `syntax` must resolve every `viaPack` reference, as `REFERENCE_PACK_SLUG`).
   - **Form dress** via the `CSS_FORM_SUFFIXES` allowlist (`border`, `radius`, `pad`, `gap`, `tracking`, `weight`, `case`, `leading`, `shadow`, `font`, `fontLabel`, `stretch`, plus the status-voice drives `kickerDim`/`kickerWeight`/`subtitleDim`/`textShadow`; color claims like `kickerInk` ride the normal color-role path). Reference `var(--cqmin)` so widths scale with the frame. This is what makes the element a different _object_, not a recolor.
   - **Comment the why on every non-obvious value** — the three existing manifests are the model: each hex traces to a measurement, a Critic finding, or an aesthetic-doc law.
3. **`docs/packs/<slug>/aesthetic.md`** — the doc the Critic verifies against, grounded in the real pixels from intake: voice, palette job-table, type system, surface treatment (the structural claims and their inversions), motion vocabulary preferences, **anti-aesthetic** (what this pack is _not_ — the most load-bearing section), reference reel. Model: `docs/packs/crt-terminal/aesthetic.md`.
4. **Register** in `PACK_REGISTRY` (`src/lib/platform/packs/registry.ts`). There is no default pack — every Preset names its own.

## 4 — Machine gates

Run all three before any human review:

1. **Boot validator** — `npx tsx scripts/verify-presets.ts` (runs `validatePackCoreVocabulary` for every registered pack, plus preset schema checks).
2. **Pixel-diff lock** — `npx tsx scripts/probe-pack-diff.ts --packs syntax,<slug>` — every covered non-immune pipeline must visibly re-skin (≥ 0.25% changed pixels at the pinned frame). Coverage-gap warnings are honest state, not failures.
3. **Render-verify at zoom, at native resolution.** Capture real frames (`scripts/cdp-capture.mjs` saves native 4K), zoom the regions you claimed, and judge rendered pixels — never trust intent. If a change "doesn't take," prove the path runs with a garish diagnostic color before tuning the real value.

## 5 — The Calibration Trio loop (the human gate)

The trio: **`docu-timeline-build`**, the **`lower-third` house card**, and **`type-hero-vantage`** — the three Scott-ratified references (task `7sshp8rj`). Re-dress _the same three compositions_ under the new pack:

- Copy each reference preset to `<name>-<slug>.json` with the `pack` field flipped (the `*-crt.json` set is the precedent).
- **Lift authored `typography.paperColor`/`inkColor` overrides that fight the pack** — ADR-0038 lets authored overrides legitimately win, so a re-dress must remove the ones that restate the old pack.
- Re-dressing means **rebuilding the composition's language under the pack**, not repainting: check every voice, every piece of chrome, every treatment against the new aesthetic doc. Where a role can't express the brand, that's a role gap to add — not a preset hack.
- Capture all three at native 4K, **look at the frames at human scale** (not just probe numbers), then iterate **live with Scott until ratified**. The ratified trio doubles as the pack's pack-switch demo.

No ratified trio → the pack is not in the catalog, and the next pack does not start.

## 6 — Gotchas ledger (each one cost a session)

- **Additive WGSL tints zero with black.** Backdrop `light`/`glow`/band/particle roles are additive — `#000000` _disables_ them, and `top == bottom` kills a gradient. Use black to flatten deliberately; never to "paint black."
- **Chrome scales with the card, not the frame.** Extract ratios of the element (§ 2.3).
- **Event names lie — audition samples** (§ 2.5).
- **Render-verify at zoom; never trust intent** (§ 4.3).
- **Never synthesize font cuts** — claim only weights/stretches the face ships (§ 2.2).
- **Measure rendered contrast, not spec hex.** A treatment stack (element opacity × material raster × chrome) attenuates text ~25–30%; G5 is judged on rendered pixels. CRT's dim phosphor passed on paper and failed on glass.
- **Status voice = size/caps/tracking, never dimness** under any lossy chrome — a dimmed small voice structurally cannot clear the G5 floor once the chrome takes its cut.
- **Shader masks must be luminance-compensated** (`maskRGB / maskMean`) or they silently regress G5 on dim text.
- **Sub-pitch hairlines null under a raster.** Any hairline form dress must span ≥ 1 raster pitch of the pack's chrome or it reads as broken dashes.
- **Silent roles must stay byte-identical.** Form dress wraps `var(--suffix, <exact current value>)` in the pipeline — a pack with no claim must not move a pixel (the pixel-diff lock's inverse, checked by byte-compare on syntax).
- **In-page pack flips fork compositions.** Swapping `packState` from the console requires the app's `?t=`-versioned module URL AND a `transitionState.capturing = true` bracket, or `/p/[slug]` autosave forks the composition into `user-compositions/`.
- **Defensive values for ruled-out capabilities** (§ 2.7) — an aesthetic-doc prohibition is not a runtime guarantee.
