# Hiviz Critic — Adversarial Verification

The protocol for verifying that a **Preset** is actually done. The companion to [`docs/quality-rubric.md`](quality-rubric.md), [`docs/animation-rubric.md`](animation-rubric.md), and the **active Pack's aesthetic** (`docs/packs/<preset.pack>/aesthetic.md` per [ADR-0014](adr/0014-pack-preset-split.md); the legacy single `docs/aesthetic.md` is now a redirect). Background: [ADR-0001](adr/0001-critic-sub-agent-verification.md).

A **Producer** agent that has just authored or modified a Preset does **not** verify its own output. Producer self-verification has repeatedly returned plausible PASS observations against renders that obviously fail. The Critic exists because *framing* is the load-bearing variable: when the same model is reframed as "find every problem with this render" instead of "verify against rubric," it reliably surfaces real defects. The Critic is the operational form of that reframing.

---

## When the Critic runs

Whenever a Producer is about to claim a Preset is complete. "Complete" is defined as: the Critic returned **no `pipeline-bug` and no `default-too-permissive` findings**. `preset-choice`, `aesthetic-miss`, and `rubric-gap` findings may be acceptable depending on intent, but the Producer must acknowledge each in writing.

The Critic does **not** run on every micro-edit during authoring. It runs when the Producer would otherwise say "this preset is ready." Treat it as the verification gate, not the linter.

---

## How the Critic is invoked

The Critic is a **sub-agent spawned with fresh context.** The Producer (or the user) launches it via the Agent tool. The sub-agent sees:

- The target Preset's path under `src/lib/presets/`.
- The route URL where the Preset renders (e.g. `http://localhost:5173/p/<slug>`).
- The four binding docs: this file, the quality rubric, the animation rubric, and the Preset's Pack aesthetic at `docs/packs/<preset.pack>/aesthetic.md` (resolved from the Preset's top-level `pack` field; defaults to `syntax` for unmigrated Presets).
- The glossary at [`docs/CONTEXT.md`](CONTEXT.md).

The sub-agent does **not** see the conversation that produced the Preset. The framing flip depends on a clean context.

### Spawn prompt template

```text
You are the Critic for the Hiviz preset at <preset-path>.

Open <route-url> in Chrome via the chrome-devtools MCP. Set the viewport to
the Preset's native target resolution (3840×2160 horizontal or 2160×3840
vertical). Drive the Preset through its timeline; capture frames at progress
0.0, 0.25, 0.5, 0.75, 1.0, and the peak-amplitude frame of every focal mark
and effect. Save captures under .tmp-baselines/<preset-slug>/<frame>.png.

For every captured frame, run the R-protocol from quality-rubric.md.
Each R-line must include:
  - a named region described concretely,
  - the saved screenshot path,
  - the pixel coordinate of the inspected region in that screenshot,
  - for measurable rules (R3, R5, R6, Q4, Q9), the numeric output of the
    corresponding probe script — do not substitute prose for the number.

After R-rules, walk Q1–Q18, G-rules, and docs/packs/<preset.pack>/aesthetic.md. Classify every finding:

  - pipeline-bug         — shader / effect / render-pass defect
  - default-too-permissive — pipeline works, the engine default is too lax
  - preset-choice        — this Preset picked wrong values
  - aesthetic-miss       — rule-clean but doesn't read as the bound Pack's aesthetic
  - rubric-gap           — the failure isn't covered by current rules

Be brutal. The user's prior experience is that you find real problems when
asked "what's wrong" but plausibly invent PASS observations when asked "verify
against rubric." Behave like the former.

Output: see docs/critic.md § Output format.
```

Adapt the path tokens to the actual Preset under review.

---

## The Critic's protocol

### Capture phase

1. Open the Preset's route in the chrome-devtools MCP browser. The Chrome instance there has `chrome://flags/#canvas-draw-element` enabled and is the only browser context that should be used for verification.
2. Resize the viewport to the Preset's native target resolution (`docs/quality-rubric.md` R6). Captures taken at any other size are invalid.
3. Drive the **Timeline** to each progress sample: `0.0`, `0.25`, `0.5`, `0.75`, `1.0`. Also capture the peak-amplitude frame of every focal slot and every transition Mark.
4. Save every capture to disk at `.tmp-baselines/<preset-slug>/<frame-label>.png`. The Critic's findings must cite these paths.

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

`ACCEPT` is only valid if zero `pipeline-bug` and zero `default-too-permissive` findings exist. `REVISE` is for findings the Producer can address. `IMPLEMENTATION-FIX-REQUIRED` halts the Producer; a code change has to land before the Preset can be re-reviewed.

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
