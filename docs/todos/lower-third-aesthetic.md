# Lower-third: chrome it up or document as stripped utility? — **RESOLVED**

> 🔒 **CLOSED 2026-05-29 — folded into [quality-roadmap.md](quality-roadmap.md).** The torn-collage treatment decided here conflicts with "torn is a Pack value, not engine law" ([[feedback_torn_edge_is_pack_not_engine]]); its useful ideas belong to the step-6 configurable edge-treatment primitive. Do not implement as written. Kept for history.


**Status:** resolved 2026-05-14 via `/grill-with-docs`. Implementation pending; estimated 4–6 hours of focused build work.

**Resolution:** chrome it up. The lower-third is a corner collage card on Syntax-style footage; both `lower-third` and `watermark` get the same full Collage System chrome. See [ADR-0006](../adr/0006-lower-third-corner-collage-card.md) and [ADR-0005](../adr/0005-overlay-renderer-shader-pass.md).

## Resolved decisions

| # | Decision | Why |
|---|---|---|
| 1 | Lower-third sits on Syntax-style footage → chrome up, not stripped | The chip lives inside the channel's own visual world; a stripped utility plate would read off-brand |
| 2 | Material identity: **corner collage card** (all four sides torn) | Visual coherence with the channel's other collage cards. See [ADR-0006](../adr/0006-lower-third-corner-collage-card.md) |
| 3 | v1 ships full chrome on **both** `lower-third` and `watermark`; defer washi tape | Watermark has the same shape and the same critique would land next pass; doing both together avoids a second loop |
| 4 | Grit lives composition-wide via `paper-grain` in `effects.frame` only | Aesthetic doc says grit is "over the entire composition"; one source of truth; no double-grit interaction zones |
| 5 | Torn edge implemented in WebGPU, not CSS | CSS `clip-path` polygon produces R4-failing aliased edges at 4K and can't carry the 1–2 px fiber inner stroke; the channel quality bar is shader-quality |
| 6 | L1 height vs G4 cap-height tension resolved by dropping a text element | No rubric changes; cleanest schema; aligns content shape with corner-card form |
| 7 | The dropped element is `subtitle`; lower-third schema becomes `{ kicker, title }` | Kicker carries the mandatory channel mono signature thread per aesthetic.md and can't be dropped. See [ADR-0006](../adr/0006-lower-third-corner-collage-card.md) |
| 8 | Per-overlay shader API shape: declarative `shaderPass?: { wgsl, uniforms, packUniforms }` field on `OverlayRenderer` | Smallest extension that satisfies torn-edge needs; stays consistent with the declarative `*Renderer` registry pattern. See [ADR-0005](../adr/0005-overlay-renderer-shader-pass.md) |

## Implementation plan

### New infrastructure

- Add `shaderPass?: { wgsl: WGSLProgram, uniforms: UniformLayout, packUniforms: (overlay, bounds) => UniformValues }` to `OverlayRenderer` in `src/lib/platform/pipelines/types.ts`.
- Extend the composition pipeline (where overlay DOM-to-texture upload happens) to invoke `shaderPass` between upload and final overlay composite. Per-overlay bounds come from the rendered DOM rect; uniforms pack per-overlay state.
- Write the `tear-edge` shader at `src/lib/pipelines/shader-passes/tear-edge.ts` (or similar — directory TBD). WGSL fragment: read overlay tex; compute SDF from rectangular bounds with seeded jitter (3–8% of smaller dimension); apply fiber inner stroke (1–2 px, white); apply hard offset shadow (8–15 px, `#fabf47`, no blur); write masked output. ~14–20 deterministic polygon points around the perimeter, seed = SHA-256 of `overlay.id` truncated to 32-bit.

### Overlay pipeline updates

- `src/lib/pipelines/overlays/lower-third/CanvasSource.svelte`:
  - Drop `subtitle` element from the markup.
  - Replace `font-family: 'Avenir Next', ...` with `JetBrains Mono Variable` for kicker (via `@fontsource/jetbrains-mono`) and `Inter` for title (via `@fontsource/inter`).
  - Fix kicker plate background `#ffd642` → `#fabf47` per aesthetic.md § Palette.
  - Wrap kicker as a chip-within-chip (yellow plate, mono caps).
  - Update cap-heights to land inside G4 horizontal overlay-primary (96–144 px) for title and overlay-secondary (80–112 px) for kicker.
- `src/lib/pipelines/overlays/lower-third/index.ts`:
  - `LowerThirdContentSchema` becomes `z.object({ kicker: z.string(), title: z.string() })`.
  - `defaults()` returns `{ kicker, title }` only.
  - Declare `shaderPass: tearEdgeShaderPass` on the renderer.
- `src/lib/pipelines/overlays/lower-third/Editor.svelte`:
  - Drop the subtitle input.
- `src/lib/pipelines/overlays/watermark/CanvasSource.svelte`:
  - Apply the same chrome via `shaderPass` (no markup change; schema stays `{ handle, label? }`).
  - Move from `'SFMono-Regular'` to `JetBrains Mono Variable`.
- `src/lib/pipelines/overlays/watermark/index.ts`:
  - Declare `shaderPass: tearEdgeShaderPass` on the renderer.

### Preset updates

- `src/lib/presets/lower-third.json`:
  - Remove `subtitle` from `overlays[0].content`.
  - Add `paper-grain` to `effects.frame` so the composition-wide grit ships by default.
  - Re-tune `offset.y` if needed once the rebuilt chip's actual height lands (corner-card form may want a different vertical position than the prior chip-form).
- Any future built-in preset using `watermark` should also include `paper-grain` in `effects.frame` by default.

### Dependencies

- `pnpm add @fontsource/jetbrains-mono @fontsource/inter`.
- Import the font CSS at app entry (or in the overlay pipelines that use them; check current font-loading pattern).

### Docs updates

- `docs/engine-architecture.md` — document the new `shaderPass` field in the Pipeline Registry section.
- `docs/preset-format.md` — update the `lower-third` content shape to `{ kicker, title }`; regenerate the schema with `node --experimental-strip-types scripts/export-preset-schema.ts`.
- `docs/CONTEXT.md` — no new terms; `Channel chrome` and `Hard offset shadow` already exist.

## Verification

1. `npx svelte-check --tsconfig ./tsconfig.json` exits with `0 ERRORS 0 WARNINGS`.
2. `node --experimental-strip-types scripts/verify-presets.ts` — `lower-third.json` clears the rubric (or only carries findings unrelated to chrome).
3. `/critic lower-third` — `Recommendation: REVISE` or `ACCEPT`, with the four prior `aesthetic-miss` findings (kicker hex, no hard offset shadow, axis-perfect rectangular plate, no grit) all gone, plus the `pipeline-bug` cap-height findings cleared because the type scale is rebuilt against G4.
4. Visual: open `/p/lower-third` in the chrome-devtools MCP browser; capture at progress 0.5; verify the rendered chip has torn edges + fiber + yellow hard offset shadow + grit visible across the composition.

## Open notes for the implementer

- The `shaderPass` API is v1. If torn-edge implementation reveals that multi-pass is needed (e.g. separate passes for shadow vs mask), the design escalates to an imperative `render(ctx)` method alongside `shaderPass`. Document the escalation in a follow-up ADR if it happens.
- Watermark's schema doesn't change in this pass. If a future grill decides watermark should also lose a field for L-rule reasons, that's a separate ADR.
- The fiber inner stroke is "the 'this looks like real paper' detail" — if v1 ships without it for time reasons, it should ship in a v1.1 pass before the next round of overlay work. Don't let fiber-edge become an indefinite follow-up.
