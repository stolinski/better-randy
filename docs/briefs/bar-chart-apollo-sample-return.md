# Apollo sample return bar chart

**Kind:** preset
**Slug:** bar-chart-apollo-sample-return
**Pack:** syntax

## Pitch

A focused full-frame comparison of lunar sample mass returned by Apollo 11 and Apollo 17. Two horizontal bars turn a completed NASA mission record into one immediate editorial fact: Apollo's returned sample mass grew 5.1×. This is a listed catalog composition, not a chart-domain demo.

## Surface involved

A `plain` Surface with `backgroundFill: "pack"`. The single `bar-chart` Block uses the shared deterministic chart layout; it declares no orientation override, literal color, Pack-specific recipe, or fixture-only behavior.

## Content sample

- Title: “Apollo’s sample return grew 5.1×”
- Apollo 11: 21.5 kg
- Apollo 17: 110.5 kg
- Source note: “Source: NASA NTRS 20090011852”

NASA’s Technical Reports Server record 20090011852 states that Apollo 11 returned 21.5 kg of lunar material and Apollo 17 returned 110.5 kg. The title uses `110.5 / 21.5 = 5.1395…`, rounded to 5.1×. The Preset stores the endpoint facts inline and performs no live fetch.

## Chart declaration

Use `surface.chart.mode: "single"` with one `bar-chart` item:

- stable ID `apollo-returned-sample-mass`;
- categories `apollo-11` / “Apollo 11” and `apollo-17` / “Apollo 17”;
- one `returned-sample-mass` series labeled “Returned sample mass (kg)” with values 21.5 and 110.5;
- `layout.mode: "single"` and finite zero-baseline domain 0–120;
- category/value labels on and redundant one-series legend off;
- semantic base fill `default`;
- Apollo 17 datum highlight and computed `{ kind: "value" }` callout;
- no normalization, free-text numeric claim, custom mark color, or extra chart item.

## Motion plan

Ten seconds at 30 fps with whole-frame boundaries and only chart-safe easing:

- entry: start 0.04, duration 0.06, smooth;
- reveal: start 0.12, duration 0.22, smooth;
- emphasis: start 0.38, duration 0.08, sharp;
- annotation: start 0.50, duration 0.10, smooth;
- exit: start 0.88, duration 0.08, smooth.

The gaps are intentional reading holds. Chrome establishes first, both bars reveal from factual zero, Apollo 17 receives continuous semantic emphasis, exact labels/callout arrive, and the settled comparison remains readable before a shorter exit. Packs do not alter motion.

## Channel chrome notes

Keep the hierarchy title → two bars → Apollo 17 callout → source. Do not add overlays, effects, depth staging, explanatory body copy, legends, or ornamental plates. Let each Pack’s field, chart chrome, typography, and mark-fill recipe dress the same declaration. Horizontal and vertical must both read as intentional native layouts.

## Verification

Capture the listed Preset at 3840×2160 and 2160×3840 under `syntax`, `editorial-mono`, `crt-terminal`, and `clean-light`. Probe exact 21.5/110.5 facts, 0–120 domain, Apollo 17 target geometry, listing inclusion, semantic/wire round-trip validity, frame-deterministic repeated seeks, and the 5.1× title arithmetic. Run the quality and animation rubrics plus a separate Critic loop until ACCEPT with no `pipeline-bug` or `default-too-permissive` findings. Delete this Brief only in the ACCEPT landing change.

## Source

Judith H. Allton, NASA Johnson Space Center, “Lunar Samples: Apollo Collection Tools, Curation Handling, Surveyor III and Soviet Luna Samples,” NASA Technical Reports Server document 20090011852, JSC-17994, 2009: <https://ntrs.nasa.gov/citations/20090011852>.

## Open questions

None.
