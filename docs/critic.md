# Supers Critic — Adversarial Verification

The protocol for verifying that a **Preset** is actually done. The companion to [`docs/quality-rubric.md`](quality-rubric.md), [`docs/animation-rubric.md`](animation-rubric.md), and the **active Pack's aesthetic** (`docs/packs/<preset.pack>/aesthetic.md` per [ADR-0014](adr/0014-pack-preset-split.md); the legacy single `docs/aesthetic.md` is now a redirect). Background: [ADR-0001](adr/0001-critic-sub-agent-verification.md).

A **Producer** agent that has just authored or modified a Preset does **not** verify its own output. Producer self-verification has repeatedly returned plausible PASS observations against renders that obviously fail. The Critic exists because *framing* is the load-bearing variable: when the same model is reframed as "find every problem with this render" instead of "verify against rubric," it reliably surfaces real defects. The Critic is the operational form of that reframing.

---

## When the Critic runs

Whenever a Producer is about to claim a Preset is complete. "Complete" is defined as: the Critic returned **no `pipeline-bug` and no `default-too-permissive` findings**. `preset-choice`, `aesthetic-miss`, and `rubric-gap` findings may be acceptable depending on intent, but the Producer must acknowledge each in writing.

The Critic does **not** run on every micro-edit during authoring. It runs when the Producer would otherwise say "this preset is ready." Treat it as the verification gate, not the linter.

### Pack aesthetics never gate

Supers is a **general motion-graphics engine** — "the engine is general, the look is not" (CLAUDE.md). A Pack supplies the channel's appearance; it does not define what the engine is allowed to do. Therefore:

- A Pack aesthetic / channel-fit observation is **always classified `aesthetic-miss`**, which is **non-gating** by definition (`ACCEPT` only requires zero `pipeline-bug` + zero `default-too-permissive`). It is surfaced for the user to route, never used to force `REVISE` or `IMPLEMENTATION-FIX-REQUIRED` on its own.
- **Never escalate a Pack style mismatch into a `pipeline-bug` or `default-too-permissive`.** "This composition is off-channel for the Pack" / "the Pack reserves this effect for surface X" is a *style preference*, not a render defect. A defect is a wrong pixel: a broken shader, a halo, a banded gradient, an upscaled texture — measurable against the R/Q/G rules, independent of any Pack.
- When the target is a **general engine-capability demo** (a Preset whose job is to exercise an engine feature — a new Effect, Surface, Overlay, or transition — rather than to ship channel content), gate **only** on pipeline correctness + the R/Q/G rules. Pack-aesthetic checks are advisory notes only. If you believe a Pack rule *should* forbid what the engine demonstrates, file a `rubric-gap` for the user — do not block the demo.

---

## How the Critic is invoked

The Critic is a **sub-agent spawned with fresh context.** The Producer (or the user) launches it via the Agent tool. The sub-agent sees:

- The target Preset's path under `src/lib/presets/`.
- The route URL where the Preset renders (`http://localhost:7263/p/<slug>` on this repo's dev server).
- The four binding docs: this file, the quality rubric, the animation rubric, and the Preset's Pack aesthetic at `docs/packs/<preset.pack>/aesthetic.md` (resolved from the Preset's top-level `pack` field; defaults to `syntax` for unmigrated Presets).
- The glossary at [`docs/CONTEXT.md`](CONTEXT.md).

The sub-agent does **not** see the conversation that produced the Preset. The framing flip depends on a clean context.

### Spawn prompt template

```text
You are the Critic for the Supers preset at <preset-path>.

CAPTURE SETUP (this repo): the dev server is at http://localhost:7263 — route
http://localhost:7263/p/<slug>. Supers renders via WICG HTML-in-Canvas, which
needs Chrome launched with --enable-blink-features=CanvasDrawElement; a
flag-enabled Chrome is already running on CDP port 9223. A normal/unflagged
browser (including the default chrome-devtools MCP browser unless it carries the
flag) captures a BLANK canvas — do not use one. Capture frames with the repo
harness: `CDP_SAMPLES=0,0.25,0.5,0.75,1 node scripts/cdp-capture.mjs <slug>`
(saves .tmp-baselines/<slug>/pX.XX.png at the native 4K render, clipped to the
canvas; it drives window.__supersTimeline.seekProgress). The Preset renders at
its native target resolution (3840×2160 horizontal or 2160×3840 vertical). Also
capture the peak-amplitude frame of every focal mark and effect.

For every captured frame, run the R-protocol from quality-rubric.md.
Each R-line must include:
  - a named region described concretely,
  - the saved screenshot path,
  - the pixel coordinate of the inspected region in that screenshot,
  - for measurable rules (R3, R5, R6, Q4, Q9), the numeric output of the
    corresponding probe script — do not substitute prose for the number.

After R-rules, walk Q1–Q18, G-rules, and docs/packs/<preset.pack>/aesthetic.md. Classify every finding:

  - pipeline-bug         — shader / effect / render-pass defect (a wrong pixel)
  - default-too-permissive — pipeline works, the engine default is too lax
  - preset-choice        — this Preset picked wrong values
  - aesthetic-miss       — rule-clean but doesn't read as the bound Pack's aesthetic (NON-GATING)
  - rubric-gap           — the failure isn't covered by current rules

PACK AESTHETICS NEVER GATE (see § Pack aesthetics never gate): a Pack style
mismatch is `aesthetic-miss` only — never `pipeline-bug`, never
`default-too-permissive`, never a reason for REVISE / IMPLEMENTATION-FIX-REQUIRED.
If this Preset is a general ENGINE-CAPABILITY demo (its job is to exercise an
engine feature, not to ship channel content), gate on pipeline correctness + the
R/Q/G rules only; treat Pack-aesthetic notes as advisory.

Be brutal. The user's prior experience is that you find real problems when
asked "what's wrong" but plausibly invent PASS observations when asked "verify
against rubric." Behave like the former.

Output: see docs/critic.md § Output format.
```

Adapt the path tokens to the actual Preset under review.

---

## The Critic's protocol

### Capture phase

1. Capture through a Chrome with `--enable-blink-features=CanvasDrawElement` (WICG HTML-in-Canvas). A flag-enabled Chrome runs on CDP port 9223; the repo harness `scripts/cdp-capture.mjs` drives it. Any browser lacking the flag captures a blank canvas and is invalid for verification.
2. The harness renders at the Preset's native target resolution (`docs/quality-rubric.md` R6) and clips the screenshot to the canvas. `CDP_SAMPLES=0,0.25,0.5,0.75,1 node scripts/cdp-capture.mjs <slug>` drives the **Timeline** to each progress sample. Also capture the peak-amplitude frame of every focal slot and every transition Mark.
3. Captures land at `.tmp-baselines/<preset-slug>/pX.XX.png`. The Critic's findings must cite these paths. (For sub-canvas-resolution detail — e.g. fine bokeh — `scripts/cdp-dof-detail.mjs` captures at a high device-pixel-ratio.)

### Inspection phase — R-rules (gating)

R-rules from `docs/quality-rubric.md` are evaluated first. **A failing R-rule stops the Critic.** No Q-rule or aesthetic check runs until R-rules pass.

Every R-line in the report must follow this shape:

```
R<n> <topic>: At <zoom>% on <region> in <captures/...png> at (x, y),
observed: <description>. Probe: <script-output>. PASS / FAIL.
```

If no probe script exists yet for a given rule, the line is annotated `Probe: not yet implemented`; the rule is verified by prose alone for now, and a `rubric-gap` finding is filed noting the missing probe.

### Inspection phase — Q-rules, G-rules, aesthetic

After every R-line is PASS, walk Q1–Q18, the G-rules, and the active Pack's `docs/packs/<preset.pack>/aesthetic.md` in order. Each finding cites the screenshot path and frame label that surfaced it.

`Q15`, `Q14`, and aesthetic checks may legitimately be prose-only — they are judgment calls about composition and channel-fit, not pixel measurements.

---

## Output format

```text
Critic report — <preset-slug> — <timestamp>

Captures:
  - .tmp-baselines/<preset-slug>/p0.00.png
  - .tmp-baselines/<preset-slug>/p0.25.png
  - ...

R-rule verification (gating):
  R1 (text sharpness): At 200% on <region> in .tmp-baselines/.../p0.50.png
     at (1240, 800), observed: stroke edges are crisp single-pixel transitions.
     Probe: probe-text-edge.ts → max-step=0.93. PASS.
  R3 (shadow falloff): At 400% on shadow edge of <element> in
     .tmp-baselines/.../p0.50.png at (1840, 1120), observed: alpha falls off
     over 18 px with no visible bands. Probe: probe-banding.ts → max-step=0.04,
     band-count=0. PASS.
  ...

Findings:
  [pipeline-bug] <one-line description>
    Where: <file:line or shader/effect name>
    Evidence: <screenshot path>:(x,y)
    Proposed fix: <one or two sentences>

  [default-too-permissive] <one-line description>
    Where: <engine default location, e.g. src/lib/platform/engine-schema.ts>
    Evidence: <screenshot path>:(x,y)
    Proposed tightening: <one sentence>

  [preset-choice] <one-line description>
    Where: <preset JSON path and field>
    Evidence: <screenshot path>:(x,y)
    Suggested value: <one sentence>

  [aesthetic-miss] <one-line description>
    Where: <preset element or composition aspect>
    Evidence: <screenshot path>:(x,y)
    Aesthetic-doc reference: docs/packs/<preset.pack>/aesthetic.md § <section>

  [rubric-gap] <one-line description>
    Where: <which rule should cover this and doesn't>
    Suggested rule: <one sentence>

Recommendation: ACCEPT / REVISE / IMPLEMENTATION-FIX-REQUIRED
```

`ACCEPT` is only valid if zero `pipeline-bug` and zero `default-too-permissive` findings exist. `REVISE` is for findings the Producer can address. `IMPLEMENTATION-FIX-REQUIRED` halts the Producer; a code change has to land before the Preset can be re-reviewed. **`aesthetic-miss` findings never drive `REVISE` or `IMPLEMENTATION-FIX-REQUIRED`** — a Pack style mismatch is surfaced for the user to route, not a blocker (see § Pack aesthetics never gate).

---

## Probe scripts

Probe scripts at `scripts/probe-*.ts` read a captured screenshot and return numeric measurements. The Critic invokes them and quotes their output verbatim. Because the numbers come from the scripts, they cannot be fabricated.

The first three probes to implement (highest leverage):

| Probe | Returns | Used by |
|---|---|---|
| `probe-dimensions.ts <png>` | `{ width, height }` | R6 (resolution) |
| `probe-banding.ts <png> --region <x,y,w,h>` | `{ max-step, band-count, peak-falloff-px }` | R3 (shadow), R5 (banding) |
| `probe-hue-count.ts <png>` | `{ saturated-hues: [hsl,...], count }` | Q4 (palette restraint) |

Follow-on probes when failure patterns demand them:

| Probe | Returns | Used by |
|---|---|---|
| `probe-text-edge.ts <png> --region <x,y,w,h>` | `{ max-step, fringing }` | R1, R2 (text sharpness, resampling) |
| `probe-ink-coverage.ts <png>` | `{ inkRatio }` | Q9 (negative space ≥ 30%) |
| `probe-edge-aa.ts <png> --region <x,y,w,h>` | `{ stairstep-px }` | R4 (edge AA) |

Each probe is ~30 lines of canvas / `image-data` inspection. Implementations don't live in this doc; the contract above is the binding contract.

**Two-Pack pixel-diff lock (ADR-0038).** `npx tsx scripts/probe-pack-diff.ts` is the regression lock for full Pack buy-in: for every non-immune Pipeline in `IDENTITY_REGISTRY` it renders a representative corpus Preset at one deterministically pinned frame under two Packs (default: the Preset's own vs `editorial-mono`; `--packs a,b` to override, e.g. `--packs syntax,crt-terminal`) and requires the two canvas captures to visibly differ — ≥ 0.25% changed pixels, calibrated ~8× above the re-capture noise floor (≤ 0.03%) and ~3× below the smallest real re-skin measured (0.78%). Preset-authored `typography.paperColor`/`inkColor` are lifted during both captures so the `override ?? packRole` seam resolves on the Pack side. A **FAIL means partial Pack buy-in regressed**: a Pipeline's pixels no longer respond to the active Pack (a baked literal or unwired Role) — an `IMPLEMENTATION-FIX-REQUIRED`-class defect, never fixable by editing the Preset. Pipelines whose Identity Spec declares Pack-immunity (`PACK_IMMUNE_PIPELINE_KEYS`: `surface:imessage`, `surface:web-document`) are exempt — their artifact is verisimilar by contract — and Pipelines with no covering Preset are reported as coverage-gap warnings. Paired captures + `pack-diff-results.json` land in `docs/critic-captures/pack-diff/`.

**Export decode verification.** `node --experimental-strip-types scripts/probe-export-decode.ts <export.mov> [--frames N | --all]` verifies the *actual exported file* — not the captured DOM frames. It decodes the export back to RGBA PNGs with ffmpeg (the same binary the ProRes route uses server-side) and feeds the frames to `probe-frame-diff.ts`, asserting the sequence **animates** (consecutive frames differ) and **carries alpha** (transparent-output contract). Export a **ProRes 4444** (`yuva444p10le`) piece for this check: it round-trips alpha and is byte-deterministic, unlike VP9 hardware encode. A 4K all-frames decode is multiple GB, so it samples evenly-spaced frames by default (`--all` for the literal every-frame decode). Output is the `probe-frame-diff` JSON wrapped with decode provenance; exit is forwarded verbatim — `0` pass, `1` fail, `2` usage. **Opaque full-frame pieces fail the alpha clause by design** — that's the `--opaque` luma mode owned by corpus-tail task `9w7kdptf`, not this probe.

---

## Acting on findings

| Classification | Lane | Who acts | Where the fix lands |
|---|---|---|---|
| `pipeline-bug` | Code | Producer or follow-up code-fix session | `src/lib/platform/pipelines/...` |
| `default-too-permissive` | Code | Batched into engine-default sprint | `src/lib/platform/engine-schema.ts` or pipeline init |
| `preset-choice` | Data | Producer | The Preset JSON under `src/lib/presets/` |
| `aesthetic-miss` | Data + doc | Producer; if recurring, the Pack's aesthetic doc | The Preset; possibly `docs/packs/<preset.pack>/aesthetic.md` |
| `rubric-gap` | Doc | User reviews; rubric gets updated | `docs/quality-rubric.md` or `docs/animation-rubric.md` |

R8 from the quality rubric binds here: a `pipeline-bug` is **never** fixed by tweaking the Preset to avoid the broken code path. The Critic's recommendation in that case is `IMPLEMENTATION-FIX-REQUIRED` and the Preset waits.

---

## Anti-anti-gaming

The Critic itself can rubber-stamp ("zero findings, ACCEPT") the same way a Producer can. The structural guardrails:

- Every R-line cites a saved screenshot path and pixel coordinate. A bare `PASS` is invalid.
- Every measurable R-line cites the probe's numeric output. Prose is not a substitute for the number.
- Captures are saved to disk, not only described. The user can re-open any capture and check the named observation.
- Probe outputs are reproducible. Re-running a probe on the same capture yields the same number.

If a Critic report claims `ACCEPT` with no probe output for any measurable rule, treat the report itself as invalid and re-spawn the Critic.

---

## Non-goals

- The Critic does not author Presets. If revisions are needed, the Producer revises and the Critic re-runs.
- The Critic does not adjudicate intent. `aesthetic-miss` findings are surfaced; the user decides whether the Preset deliberately deviates.
- The Critic does not run on commits or PRs. It runs at the "is this done" gate, which may be invoked many times during a development session and zero times during a commit.
