# Surface text-fade render bug — investigation log

**Symptom:** A surface's TEXT does not fade gradually with `paperVisibility` (the article's CSS `opacity`). The captured/composited text vanishes (full → gone) as paperVisibility drops from 1.0 to ~0.9. Confirmed in the EXPORT (ground truth), so not a paused-seek artifact.

**Already established (prior session):**
- `paperVisibility` state is a gradual `power2.inOut` curve (read directly): 1.0 → 0.97@p0.96 → 0.74@p0.97 → 0.26@p0.98 → 0.03@p0.99 → 0@1.0. ✓ (the engine opacity-exit ease fix works)
- DOM `getComputedStyle(.chapter-card-source).opacity` follows paperVisibility gradually (1-sample read lag, but tracks). ✓
- Ruled out: the ease (fixed), text-anims (removed → same snap), paperVisibility state (gradual), DOM opacity (gradual).
- Title-region luma (export): full 0.122 @7.6s(p0.95) → backdrop 0.086 @7.7s(p0.962). The text contributes ~0 once pv < ~0.9.

**Render path (chapter-card):** CanvasSource `<article opacity=paperVisibility>` → `copyElementImageToTexture(.composition)` → surface pipeline output texture (`inputSample`) → `chapter-card-backdrop` shaderPass composites text over backdrop: `finalRgb = mix(backdrop, inputSample.rgb, inputSample.a)` → effect chain → dithered present.

**Open hypotheses:**
1. `copyElementImageToTexture` doesn't capture element `opacity` gradually (threshold/quantization, or ignores it).
2. The surface→backdrop composite (`mix(..., inputSample.a)`) + premultiply double-applies alpha or thresholds.
3. An alpha test / discard somewhere drops low-alpha fragments.

---

## Findings (chronological)

### F1 — ROOT CAUSE: `copyElementImageToTexture` can't capture sub-element `opacity < 1` (binary)
Visualized the captured surface alpha (`inputSample.a`, the surface-pipeline output before the backdrop composite) across the exit, by temporarily returning `vec4f(vec3f(inputSample.a),1)` from the chapter-card-backdrop shader and measuring the title-region max alpha:

| progress | paperVisibility | captured title alpha (max) |
|---|---|---|
| 0.50 | 1.0 | **1** (text present) |
| 0.93 | 1.0 | **1** |
| 0.95 | ~1.0 (exit just started) | **0** (text gone) |
| 0.955 | 0.996 | **0** |
| 0.96 | 0.968 | **0** |

The captured text alpha is **binary**: full at opacity 1.0, **zero** the instant `paperVisibility` < 1.0. So the bug is NOT compositing and NOT the ease — `copyElementImageToTexture` does not rasterize a child element's CSS `opacity < 1` gradually (an `opacity < 1` element becomes a compositing layer the capture renders as transparent). The `<article style:opacity={paperVisibility}>` fade was always binary; it was masked because surfaces fade text via **text-anims** (per-unit, captured fine), not via the article opacity. Removing text-anims and relying on paperVisibility exposed it.

**Implication (corpus-wide):** any surface content fade driven by the article's CSS `opacity` is binary. The fade must be applied as a **GPU alpha-multiply** on the captured surface texture, with the DOM element kept at opacity 1.

### F2 — Fix: apply paperVisibility as a GPU alpha-multiply (DOM stays opacity 1) ✓ VERIFIED

Implemented for chapter-card: the `<article>` no longer binds `style:opacity` (stays opaque → fully captured); the `chapter-card-backdrop` shaderPass takes a `paperVisibility` uniform (read from `animState` in packUniforms) and multiplies the captured surface alpha by it: `surfaceAlpha = inputSample.a * paperVisibility`, then composites with `surfaceAlpha`. The fade is now on the GPU, where it's gradual.

Verified — title-region luma now declines smoothly (was: full 0.124 → snap to backdrop 0.090):

| progress | title luma |
|---|---|
| 0.95 | 0.124 (full) |
| 0.96 | 0.115 |
| 0.97 | 0.098 |
| 0.98 | 0.091 (≈ backdrop) |

A true fade following the `power2.inOut` paperVisibility curve. Enter works too (paperVisibility 0→1 fades the surface in on the GPU; text-anims add the per-unit reveal on top). svelte-check clean, no console errors.

**General fix (follow-up):** this pattern (DOM opaque + GPU alpha-multiply by paperVisibility) should replace `style:opacity={paperVisibility}` in every Surface CanvasSource + give each surface pipeline / composite an alpha-multiply, so all surface fades are gradual — not just chapter-card. Filed as a corpus-wide task.

### F3 — Generalized across all opacity-faded surfaces ✓ VERIFIED (dex jy2m2g7r)

Audited every Surface for the binary-fade path. Only two besides chapter-card faded via `style:opacity={animState.paperVisibility}`: **title-sequence** and **pullquote-on-photo** (both already carry their own backdrop shaderPass). The rest don't have the bug: `newspaper` and `paper` fade via a `translateY` settle (a `transform` — captured fine, already gradual); `type-hero` and `plain` have no opacity fade at all. There is no generic surface-present composite to patch — each faded surface fades inside its own backdrop pass.

Applied the chapter-card treatment to both: dropped `style:opacity` (DOM stays opaque → fully captured), added a `paperVisibility` uniform to `title-sequence-drop` (`fadedAlpha = blurredAlpha * paperVisibility`) and `pullquote-photo-backdrop` (`textAlpha = blurredAlpha * focusOpacity * paperVisibility`).

Verified — text-band max-luma across each exit declines through a true intermediate (binary would jump full→backdrop with nothing between):

| surface | full | mid-exit | backdrop |
|---|---|---|---|
| title-sequence (0.90→0.94) | 249 @p0.90 | **119 @p0.92** | 15 @p0.94 |
| pullquote (0.82→0.86) | 255 @p0.82 | **131 @p0.84** | 29 @p0.86 |

Enter also confirmed visible throughout (drop motion / focus-pull both render the now-opaque captured text). svelte-check: zero new errors/warnings from these four files. All opacity-faded surfaces now fade on the GPU.

