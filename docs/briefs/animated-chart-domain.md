# Agent-authored animated chart domain

**Kind:** domain
**Slug:** animated-chart-domain
**Pack:** syntax
**Verification preset:** chart-domain-survey-fixture

## Pitch

A constrained chart vocabulary for broadcast motion graphics, authored from the same Preset JSON by agents and the GUI. It turns supplied facts into accurate editorial bars, columns, unit grids, and dot fields without becoming a general visualization system. The marks stay planar and legible; Packs provide the look; deterministic chart motion provides the reveal.

## Surface and Block home

A Preset may declare one optional `surface.chart` group. The group is content carried by the Surface, while each `surface.chart.items[]` entry is a Block rendered in the **Block Layer**. This follows the existing `surface.diagram[]` precedent without inventing a sixth Layer or a generic scene graph.

`surface.chart.items[].type` selects one stable Block Pipeline:

- `bar-chart`
- `column-chart`
- `unit-grid-chart`
- `dot-field-chart`

Each type is added to `BlockTypeSchema`, `PIPELINE_REGISTRY.blocks`, the Identity registry, Block mounts, timeline identity, authoring discovery, and core fallback coverage. The group contains one to four chart Blocks and has a bounded presentation mode:

- `single` requires exactly one item.
- `sequence` permits two to four items. Each item uses the full chart plot region during a non-overlapping visibility interval derived from its motion phases. Intervals follow item order.

The sequence mode exists so one composition can prove or present a short chart sequence without changing Pipeline identity. Simultaneous dashboards, arbitrary placement, line/area/pie/map charts, and true x/y scatter remain out of scope.

## Inline declaration

The strict `supers@1` declaration has this conceptual shape; the implementation task owns the exact Zod spelling and inferred TypeScript types:

```jsonc
"chart": {
  "mode": "single",
  "items": [
    {
      "id": "agent-count-distribution",
      "type": "column-chart",
      "title": "How many coding agents do you run at once?",
      "data": {
        "categories": [
          { "id": "one", "label": "1" },
          { "id": "two", "label": "2" },
          { "id": "three", "label": "3" },
          { "id": "four", "label": "4" },
          { "id": "five", "label": "5" }
        ],
        "series": [
          {
            "id": "responses",
            "label": "Responses",
            "values": [
              { "categoryId": "one", "value": 360 },
              { "categoryId": "two", "value": 354 },
              { "categoryId": "three", "value": 237 },
              { "categoryId": "four", "value": 73 },
              { "categoryId": "five", "value": 80 }
            ]
          }
        ]
      },
      "layout": { "mode": "single" },
      "domain": { "min": 0 },
      "labels": { "values": true, "legend": false },
      "highlights": [
        {
          "target": {
            "kind": "category-set",
            "seriesId": "responses",
            "categoryIds": ["two", "three", "four", "five"]
          }
        }
      ],
      "callouts": [
        {
          "target": {
            "kind": "category-set",
            "seriesId": "responses",
            "categoryIds": ["two", "three", "four", "five"]
          },
          "valueLabel": {
            "kind": "approximate-fraction-and-percent",
            "maxDenominator": 10,
            "precision": 1
          }
        }
      ],
      "sourceNote": "Source: Syntax survey, n=1,104",
      "fill": { "role": "default" },
      "motion": {
        "entry": { "start": 0.04, "duration": 0.12, "ease": "smooth" },
        "reveal": { "start": 0.16, "duration": 0.24, "ease": "smooth" },
        "emphasis": { "start": 0.44, "duration": 0.12, "ease": "sharp" },
        "annotation": { "start": 0.60, "duration": 0.12, "ease": "smooth" },
        "exit": { "start": 0.88, "duration": 0.12, "ease": "smooth" }
      }
    }
  ]
}
```

The inline dataset contains authored facts. The surrounding chart object also contains authored editorial and presentation direction. Agents translate user direction and supplied facts into the object; the GUI edits the same object. There is no CSV upload, URL fetch, live data source, or parallel ingestion model.

### Data targets

Highlights and callouts use the same strict target union so grouped and stacked charts stay unambiguous:

- `datum`: one `seriesId` plus one `categoryId`.
- `category-set`: one `seriesId` plus two or more unique `categoryIds`.
- `series-total`: one `seriesId`.

The renderer derives target values from the dataset. V1 callouts contain no free-text field: their visible claim comes only from a strict `valueLabel` formatter, so prose cannot contradict the target. `value` prints the resolved value. `percent-of-series-total` divides it by that series total and may represent a signed or out-of-range comparison. `approximate-fraction-and-percent` is restricted to a resolved ratio strictly greater than zero and at most one; zero targets must use a non-fraction formatter. It searches fractions satisfying `1 <= numerator <= denominator <= maxDenominator`, where `maxDenominator` is an integer from 2 through 20. Selection minimizes absolute error, then prefers the lower denominator and numerator. Unity emits `1 in 1 · 100%`. Percent precision is an integer from zero through four. For 744/1,104 with denominator bound 10, the renderer emits `2 in 3 · 67.4%`. Leader and highlight geometry anchor to the resolved datum or deterministic centroid of the resolved set.

### Variant-specific constraints

- `bar-chart` and `column-chart` accept `single`, `grouped`, or `stacked` layout. `single` requires one series. Initial stacked values are non-negative; mixed-sign grouped values are allowed only with a visible zero baseline.
- `unit-grid-chart` and `dot-field-chart` require exactly one parts-of-whole series plus `normalization: { total, unitCount }`. `total` is finite and positive. `unitCount` is a required integer from 10 through 1,000. Every part is explicit and non-negative; omitted remainder is invalid.
- The sum of normalized values must equal `total` within `max(1e-9, abs(total) * 1e-9)`. The validator treats a difference inside that tolerance as numeric representation noise only; it never creates a remainder category or rewrites values.
- Unit allocation uses deterministic largest-remainder rounding of `value / total * unitCount`, with declaration order as the final tie-breaker, and must sum exactly to `unitCount`.
- Precise labels retain the authored or computed numeric value. A 100-unit field may show 67 marks while its computed label says `67.4%`; mark quantization never changes the fact.
- Linear scales only in the first release. Truncated, logarithmic, dual-axis, and independently normalized grouped scales are rejected.

## Data-integrity rules

Structural parsing is strict and rejects unknown keys. `validatePresetSemantics` then rejects the declaration before rendering when any of these conditions hold:

- IDs are empty or duplicated; references do not resolve; a category is missing or repeated within a series.
- A value, domain bound, total, or timing is non-finite or out of its bounded range.
- An explicit domain excludes zero where the selected bar/column form requires it, clips an authored value or stack total, or has `min >= max`.
- `single`, `grouped`, or `stacked` mode disagrees with the series shape; a stack contains a negative value.
- A normalized total is not positive, a part is negative, `unitCount` falls outside 10–1,000, an explicit part is missing, or the part sum differs from `total` by more than `max(1e-9, abs(total) * 1e-9)`.
- A highlight, label, callout target, or series reference does not resolve exactly; a target repeats categories; a percent formatter would divide by a non-positive series total; an approximate-fraction formatter resolves to a ratio outside `(0, 1]`; or a callout contains any field outside its target and strict computed `valueLabel` formatter.
- A motion phase is outside `[0, 1]`, has non-positive duration, uses an ease outside the chart-safe `smooth | sharp` subset of `EaseSchema`, or violates `entry.end <= reveal.start <= reveal.end <= emphasis.start <= emphasis.end <= annotation.start <= annotation.end <= exit.start <= exit.end`.
- A `single` group does not contain exactly one item, or a `sequence` group contains outside two-to-four items or has overlapping item visibility intervals `[entry.start, exit.end]`.

The same semantic boundary runs for built-in catalog parsing, User composition create/update/load, and wire round-trip validation. No renderer repairs invalid data.

## Layout and editorial chrome

Shared deterministic layout owns plot bounds, safe areas, linear scales, required zero baselines, axes, grid lines, category/value labels, legends, counters, grouping, highlights, source notes, and collision-aware callouts. It reflows the same declaration at 3840×2160 and 2160×3840 from target safe areas. V1 has no chart orientation-override schema; deterministic layout handles both targets without changing facts or creating sibling Presets.

Data marks remain accurate 2D geometry. Existing composition staging may add restrained depth to non-data plates, labels, or camera presentation, but perspective, extrusion, or lighting must not change perceived magnitude.

## Pack appearance and mark-local fills

The declaration names semantic fill roles such as `default`, `series`, and `emphasis`; it does not contain literal colors, gradients, dither matrices, fonts, or Pack IDs. Each chart Pipeline Identity Spec resolves mark fill, axis/grid ink, label ink, annotation ink, edge, depth, and light through chart-specific Roles with mandatory core fallbacks.

Packs may resolve a mark Role to solid, gradient, or ordered-dither treatment. The renderer clips that treatment to each data mark. Axes, labels, legends, callouts, backgrounds, transparent regions, and undeclared pixels remain crisp and unaffected. A mark-local dither animation may change threshold inside the mark; it must not become a full-frame post-process Effect.

## Motion plan

Chart motion is intrinsic to the chart declaration and Pipeline. Packs never choose its form, timing, or easing. Every chart item has exactly five ordered phase windows: `entry`, `reveal`, `emphasis`, `annotation`, and `exit`. Each window carries normalized `start`, positive `duration`, and an optional chart-safe `EaseSchema` value: `smooth` or `sharp`. `settled` and `bouncy` are rejected because their shipped back/elastic curves overshoot. Omitted eases resolve to these exact Pack-invariant defaults: entry `smooth`, reveal `smooth`, emphasis `sharp`, annotation `smooth`, and exit `smooth`. The Pipeline never supplies or moves phase timing.

Phase windows do not overlap and must satisfy `entry.end <= reveal.start <= reveal.end <= emphasis.start <= emphasis.end <= annotation.start <= annotation.end <= exit.start <= exit.end <= 1`. Gaps are holds. A chart is invisible before `entry.start` and after `exit.end`; this interval is also the sequence-mode visibility interval. Entry introduces non-data chrome, reveal animates data marks, emphasis changes only factual focus treatment, annotation introduces labels/callouts, and exit removes the complete chart.

Bars and columns grow from the factual zero baseline; stacks reveal in deterministic series order; unit marks resolve in deterministic allocation order; counters land on the precise value. Factual motion uses decisive bounded easing, never bounce or overshoot that changes perceived magnitude.

The chart phase contract compiles into the ADR-0035 composition animation manifest and timeline tracks. Each chart item ID is a Block timeline identity and may serve as an existing Cascade anchor for other elements, but Cascade does not replace, reorder, or overlap its internal phases. Every value derives from explicit composition timestamp/frame inputs, so paused scrubbing, preview, transition snapshots, and export agree.

## Authoring parity

Create-from-blank exposes the four chart types through the existing shared Preset model. The GUI inspector and agents both write the same bounded `surface.chart` group and chart items; neither owns a second chart schema. Defaults produce a valid, legible declaration but do not silently invent totals, repair domains, select a Pack-specific appearance, or fetch data.

## Verification fixture

`chart-domain-survey-fixture` is an unlisted `kind: fixture` full-frame Preset with `state.backgroundFill: "pack"`. It is proof corpus, not final video content. It uses the supplied Syntax survey facts:

- 1,104 responses total.
- 1 agent: 360 responses.
- 2 agents: 354 responses.
- 3 agents: 237 responses.
- 4 agents: 73 responses.
- 5 agents: 80 responses.
- The 2–5 categories sum to 744; 744 of 1,104 respondents, or 67.4%, run more than one coding agent.
- Editorial shorthand: “2 in 3 AI coders run multiple agents at once.”

The fixture uses `surface.chart.mode: "sequence"` with four chart items and non-overlapping visibility intervals, so the one Preset executes every initial Pipeline without changing any item's identity. Each item uses the complete 1–5 source distribution or its explicit 360/744 one-versus-multiple partition; no item invents missing facts. The same fixture must render natively in horizontal and vertical under every registered Pack, preserve preview/export pixels at equal timestamps, exercise each initial mark treatment, and receive Critic `ACCEPT` with no `pipeline-bug` or `default-too-permissive` findings.

## Engine work required

1. Strict structural and semantic chart declaration boundary.
2. Four Block Pipeline registrations, Identity Specs, core fallbacks, mounts, timeline identities, and authoring discovery entries.
3. Shared deterministic layout, scale, label, legend, source-note, highlight, and callout geometry.
4. Pack-resolved mark-local solid, gradient, and ordered-dither fills.
5. Bar/column and normalized unit-grid/dot-field renderers.
6. Frame-driven intrinsic reveal, emphasis, annotation, and exit choreography.
7. Shared GUI/agent create-from-blank and round-trip support.
8. The unlisted verification fixture and separate Critic pass.

## ADR required?

`already-filed: 0048-agent-authored-chart-domain`

## Documentation effects and closeout

The approved plan has eight documentation effects. They are intentionally split between design-time truth and shipped current-state truth:

| Document                                       | Design-time action                                       | Critic-`ACCEPT` closeout                                          |
| ---------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `docs/briefs/animated-chart-domain.md`         | Create and keep through verification.                    | Delete in the landing change.                                     |
| `docs/briefs/README.md`                        | Clarify domain-Brief closeout.                           | Keep the generic rule; no active-Brief catalog.                   |
| `docs/adr/0048-agent-authored-chart-domain.md` | Create with `Designed` status.                           | Change to `Canon (built)` only after implementation and ACCEPT.   |
| `docs/adr/README.md`                           | Index ADR-0048 as designed.                              | Reconcile its status to built.                                    |
| `docs/roadmap.md`                              | Mark the chart domain as building.                       | Remove it from active runway or record concise shipped context.   |
| `docs/CONTEXT.md`                              | Do not claim unshipped terms as current behavior.        | Add canonical chart-domain terms matching the shipped schema.     |
| `docs/preset-format.md`                        | Do not document an unavailable wire format.              | Document the exact shipped declaration, defaults, and examples.   |
| `docs/engine-architecture.md`                  | Do not add unregistered Pipelines to the live inventory. | Document the actual registry, validation, mount, and render path. |

The closeout task owns the final five reconciliations and Brief deletion in the same change as the accepted implementation.

## Open questions

None.

## What “done” looks like

The strict declaration, four chart Block Pipelines, deterministic layout and motion, Pack-resolved mark-local fills, shared GUI/agent authoring, and `chart-domain-survey-fixture` are implemented. The fixture Critic-`ACCEPT`s at 3840×2160 and 2160×3840 under every Pack with no orientation- or Pack-specific sibling. The ACCEPT landing change deletes this Brief and reconciles ADR-0048, its index, the roadmap, `docs/CONTEXT.md`, `docs/preset-format.md`, and `docs/engine-architecture.md` to shipped truth.
