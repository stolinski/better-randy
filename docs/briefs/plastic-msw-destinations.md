# U.S. plastic MSW destinations unit grid

**Kind:** preset
**Slug:** plastic-msw-destinations
**Pack:** syntax

## Pitch

A focused full-frame 100-unit explainer showing how the U.S. EPA estimated plastic in municipal solid waste was managed in 2018. It isolates the recycled share as one precise editorial point: 3,090 of 35,680 thousand U.S. tons, or 8.7%—approximately 1 in 12.

## Surface involved

A `plain` Surface with `backgroundFill: "pack"` and one `unit-grid-chart` Block. No literal appearance, orientation override, effect, external asset, or live fetch.

## Content sample

- Title: “U.S. plastic in municipal waste, 2018”
- Recycled: 3,090 thousand U.S. tons
- Combustion with energy recovery: 5,620 thousand U.S. tons
- Landfilled: 26,970 thousand U.S. tons
- Source: “Source: U.S. EPA, plastics in MSW, 2018 · thousand U.S. tons”

Keep the factual scope exact: plastic materials in U.S. municipal solid waste, not all plastic ever produced or all plastic pollution.

## Chart declaration

Use `surface.chart.mode: "single"` with one `unit-grid-chart` item:

- ID `plastic-msw-management-grid`;
- declaration-order categories `recycled`, `energy-recovery`, `landfilled` with the official labels;
- one `plastic-msw` series labeled “Thousand U.S. tons” with exact values 3,090, 5,620, and 26,970;
- normalization `{ total: 35680, unitCount: 100 }`;
- category, value, and legend labels on so exact values and their unit remain visible despite mark quantization;
- semantic series fill;
- one highlight on `recycled`;
- one data-bound `approximate-fraction-and-percent` callout on recycled, denominator at most 20 and precision 1.

Exact arithmetic: `3,090 + 5,620 + 26,970 = 35,680`; recycled is 8.6603% → 8.7%. Largest-remainder allocation produces 9 recycled, 16 energy-recovery, and 75 landfilled marks. Exact labels retain the authored values; the 100-mark grid does not pretend the quantized allocation is the raw percentage. The nearest bounded fraction is 1 in 12.

## Motion plan

Ten seconds at 30 fps, with whole-frame boundaries:

- entry: 0.04 + 0.03333333333333333 (10 frames), smooth;
- reveal: 0.12 + 0.24, smooth;
- emphasis: 0.40 + 0.08, sharp;
- annotation: 0.50 + 0.08, smooth;
- exit: 0.90 + 0.02666666666666667 (8 frames), smooth.

The 100 marks allocate in deterministic declaration order, nine recycled marks isolate without changing magnitude, and the computed `1 in 12 · 8.7%` annotation arrives after emphasis. Hold the settled reading for 3.2 seconds before the shorter exit. No bounce, overshoot, camera move, Pack-owned motion, or wall-clock playback.

## Channel chrome notes

Hierarchy: title → literal 100-mark field → three exact categories → recycled fraction callout → source. Keep the official “Combustion with energy recovery” label; reflow it rather than replacing it with an inaccurate euphemism. Do not add explanatory body, decorations, overlays, effects, or authored numeric callouts. The same declaration must remain legible under all four Packs and both native orientations.

## Verification

Verify EPA values/scope, exact sum, percentages, 9/16/75 largest-remainder allocation, computed 1-in-12 callout, labels/units, listed hygiene, strict semantics/wire round trip, whole-frame phases, repeated-seek determinism, and native H/V rendering under all four Packs. Run quality/animation rubrics and a separate Critic loop until ACCEPT with no `pipeline-bug` or `default-too-permissive` findings. Delete this Brief only in the ACCEPT landing change.

## Source

U.S. EPA, “Plastics: Material-Specific Data,” 1960–2018 data on plastics in MSW by weight: <https://www.epa.gov/facts-and-figures-about-materials-waste-and-recycling/plastics-material-specific-data>.

## Open questions

None.
