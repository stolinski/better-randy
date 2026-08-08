# U.S. population column chart, 1950–2020

**Kind:** preset
**Slug:** column-us-population-1950-2020
**Pack:** syntax

## Pitch

A focused full-frame change-over-time chart using eight exact U.S. decennial census counts. The columns make one durable fact immediate: the resident population more than doubled from 1950 to 2020. It is a listed catalog starting point, not a renderer demonstration.

## Surface involved

A `plain` Surface with `backgroundFill: "pack"` and one `column-chart` Block. The declaration contains no literal appearance, orientation override, effect, external asset, or live data fetch.

## Content sample

- Title: “The U.S. population more than doubled, 1950–2020”
- Decennial resident counts: 151,325,798; 179,323,175; 203,211,926; 226,545,805; 248,709,873; 281,421,906; 308,745,538; 331,449,281
- Source note: “Source: U.S. Census Bureau · decennial census counts”

The U.S. Census Bureau’s fixed Historical Population Change Data table supplies the eight values. `331,449,281 / 151,325,798 = 2.1903…`; therefore “more than doubled” is exact. The Preset embeds this completed historical series and performs no runtime fetch.

## Chart declaration

Use `surface.chart.mode: "single"` with one `column-chart` item:

- ID `us-population-columns`;
- ordered categories `y1950` through `y2020`, labeled by decade;
- one `resident-population` series labeled “Resident population” with all eight exact values;
- `layout.mode: "single"`, domain 0–350,000,000, and semantic base fill `default`;
- category labels on, value labels off, and one-series legend off to keep eight large integers from colliding;
- datum highlights on the 1950 and 2020 endpoints;
- one computed `{ kind: "value" }` callout for the 2020 datum; no meaningless percent-of-series-total formatter.

## Motion plan

Ten seconds at 30 fps. Every boundary lands on a whole frame:

- entry: start 0.04, duration 0.03333333333333333 (10 frames), smooth;
- reveal: start 0.11, duration 0.29, smooth;
- emphasis: start 0.47, duration 0.08, sharp;
- annotation: start 0.60, duration 0.08, smooth;
- exit: start 0.90, duration 0.02666666666666667 (8 frames), smooth.

Chrome establishes first; all eight columns grow from factual zero in chronological order; the endpoints receive emphasis; the exact 2020 count arrives as the sole callout; the chart holds for 2.2 seconds before a shorter exit. No bounce, overshoot, camera move, Pack motion, or wall-clock playback.

## Channel chrome notes

Keep the hierarchy title → ordered columns → exact endpoint callout → source. Use no explanatory body, overlays, effects, ornamental plates, extra series, per-decade value labels, or redundant legend. The callout leader may occupy the chart’s annotation lane but must not collide with the 2020 column or safe areas. Both native orientations and every Pack must preserve decade order and endpoint focus.

## Verification

Verify exact Census values and 2.1903× arithmetic, zero-baseline domain, ordered categories, endpoint targets, listed-deliverable hygiene, strict semantics/wire round trip, whole-frame phases, repeated-seek determinism, and native H/V rendering under all four Packs. Run quality/animation rubrics and a separate Critic loop until ACCEPT with no `pipeline-bug` or `default-too-permissive` findings. Delete this Brief only in the ACCEPT landing change.

## Source

U.S. Census Bureau, “Historical Population Change Data (1910–2020),” United States resident population row, published 2021: <https://www.census.gov/data/tables/time-series/dec/popchange-data-text.html>.

## Open questions

None.
