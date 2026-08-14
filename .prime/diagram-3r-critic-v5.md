# Critic report — diagram-3r-principle v5 — final two-finding verification

## Scope and capture provenance

- Artifact: `user-compositions/diagram-3r-principle.json` (User composition).
- Verification scope: only the two remaining v4 findings, plus settled-layout and exit regression checks.
- Route: `http://localhost:7263/p/diagram-3r-principle` — **no `source=builtin` query**.
- Browser: sanctioned flag-enabled Chrome on CDP 9223; harness returned `FLAG(copyElementImageToTexture in GPUQueue)=true`.
- Capture: one sequential vertical run at native `2160×3840`, saved under `.tmp-baselines/diagram-3r-principle-v5-vertical/`, with samples `0,.03,.08,.12,.20,.28,.38,.50,.56,.64,.71,.75,.90,.94,.95,.96,.966,.98,1`.
- Settled evidence: `.tmp-baselines/diagram-3r-principle-v5-vertical/p0.90.png`.
- Exit evidence: `p0.94.png` through `p1.00.png` in that directory.
- The capture did not mutate the artifact: SHA-256 remained `ba9d2c391286b6bf3367529a45915c79c556b04827366265525fdc6af5940e47` before and after capture.

## Exact prior-finding convergence

### G4 — vertical DELIBERATE ROUTE cap height

**PASS.** Runtime canvas measurement on the settled `DELIBERATE ROUTE` label returned `actualBoundingBoxAscent = 40.09823989868164 px` before the Diagram primitive's authored scale. The current vertical override is `.82`, producing an exact rendered cap height of:

`40.09823989868164 × .82 = 32.880556716918946 px`

That is inside G4's **32–60 px** Diagram caption band, clearing the floor by **0.880556716918946 px**. Evidence: `.tmp-baselines/diagram-3r-principle-v5-vertical/p0.90.png`, approximately `(110,2006)`–`(560,2064)`.

### G3 — vertical source painted bottom

**PASS.** Direct RGB segmentation against the uniform field in the settled native PNG finds source-line paint through **y = 3203 px** (`3203 / 3840 = .8341145833`). G3's lower readable boundary is **y = 3225.6 px** (`.84 × 3840`). The final painted row therefore clears the boundary by **22.6 px** (or 21.6 px treating the painted row as the half-open interval ending at y=3204). Evidence: `.tmp-baselines/diagram-3r-principle-v5-vertical/p0.90.png`, source paint bbox approximately `x=739–1417`, bottom `y=3203`.

## Settled-layout and exit regression

- **Settled layout: PASS.** The vertical `p0.90` frame retains the intended single-column Result → Responsibility → Response structure, readable active/passive route labels, distinct arrow paths, and clear source separation. No newly clipped, overlapping, or stranded readable element is visible. The two changed items now pass their numeric bounds without disturbing the route geometry.
- **Entrance sequence: PASS.** The sequential samples through `p0.75` preserve the established reveal order and remain composed.
- **Exit: PASS.** The layout is intact at `p0.94`, fades continuously through `p0.95` and `p0.96`, and is a uniform `[16,16,15]` field by the requested `.966` sample (saved as `p0.97.png` because filenames round to two decimals). `p0.97`, `p0.98`, and `p1.00` are pixel-identical uniform fields. Mean absolute RGB deltas are `2.7028` (`.94→.95`), `7.4059` (`.95→.96`), `0.4113` (`.96→.966`), then `0` (`.966→.98`) and `0` (`.98→1`). No pop or residual element appears.

## Findings and critic contract

No new findings. Both v4 `preset-choice` findings are resolved.

- `pipeline-bug`: **0**
- `default-too-permissive`: **0**
- `preset-choice`: **0**
- `aesthetic-miss`: **1 carried from v4, not re-reviewed and non-gating**
- `rubric-gap`: **0**

**Recommendation: ACCEPT.**

The final two numeric violations now pass: DELIBERATE ROUTE is **32.8806 px** cap height, and the source paint ends at **y=3203**, safely above **y=3225.6**. Settled layout and exit behavior show no regression.
