# Apollo lunar travelers dot field

**Kind:** preset
**Slug:** apollo-lunar-travelers
**Pack:** syntax

## Pitch

A focused full-frame literal dot field: among the 24 distinct people who flew on Apollo missions to the Moon, 12 walked on the lunar surface and 12 did not. Every dot represents one person, making the 1-in-2 story tangible rather than decorative.

## Surface involved

A `plain` Surface with `backgroundFill: "pack"` and one `dot-field-chart` Block. No literal appearance, orientation override, effect, external asset, or live fetch.

## Content sample

- Title: “Half of Apollo’s lunar travelers walked”
- Walked on the Moon: 12
- Flew without walking: 12
- Source: “Source: NASA, Apollo program mission roster”

NASA’s crew rosters for Apollo 8, 10–17 contain 27 Moon-bound seats. Deduplicating repeat travelers Jim Lovell, John Young, and Gene Cernan yields 24 distinct people. NASA independently records 12 moonwalkers; the exhaustive remainder is 12.

## Chart declaration

Use `surface.chart.mode: "single"` with one `dot-field-chart` item:

- ID `apollo-lunar-travelers-dot-field`;
- categories `walked` (“Walked on the Moon”) and `did-not-walk` (“Flew without walking”);
- one `people` series labeled “People,” with exact values 12 and 12;
- normalization `{ total: 24, unitCount: 24 }`, so one dot literally equals one person and no quantization occurs;
- category, value, and legend labels on;
- semantic series fill;
- one highlight on `walked`;
- one computed `approximate-fraction-and-percent` callout on walked with denominator at most 2 and precision 0, resolving to `1 in 2 · 50%`.

The categories are disjoint and exhaustive: 12 + 12 = 24. Do not add a free-text numeric claim or treat 27 mission seats as distinct people.

## Motion plan

Ten seconds at 30 fps, every boundary on a whole frame:

- entry: 0.04 + 0.03333333333333333 (10 frames), smooth;
- reveal: 0.12 + 0.24, smooth;
- emphasis: 0.40 + 0.10, sharp;
- annotation: 0.52 + 0.08, smooth;
- exit: 0.88 + 0.02666666666666667 (8 frames), smooth.

Reveal all 24 people in deterministic allocation order; isolate the 12 moonwalkers without changing magnitude; then bring in the computed 1-in-2 callout. Hold the settled chart for 2.8 seconds before the shorter exit. No bounce, overshoot, camera move, Pack motion, or wall-clock playback.

## Channel chrome notes

Hierarchy: compact title → literal 24-dot field → two exact category labels → computed fraction callout → source. Keep the title short enough for portrait title-safe width; the category label supplies “on the Moon.” Do not add body copy, astronaut names, mission badges, flags, decorations, overlays, or effects. The active Pack must clearly distinguish both 12-dot groups in both native orientations.

## Verification

Verify the NASA roster derivation, 24 distinct travelers, 12/12 exhaustive split, exact one-dot-per-person allocation, computed `1 in 2 · 50%`, labels/source, mark-safe callout routing, all-Pack group separation, listed hygiene, strict semantics/wire round trip, whole-frame motion, repeated-seek determinism, and native H/V rendering. Run quality/animation rubrics and a separate Critic loop until ACCEPT with no `pipeline-bug` or `default-too-permissive` findings. Delete this Brief only in the ACCEPT landing change.

## Sources

- NASA, “What Was the Apollo Program?” crew rosters and 12-moonwalker statement: <https://www.nasa.gov/learning-resources/for-kids-and-students/what-was-the-apollo-program-grades-k-4/>
- NASA Science, “Moon Exploration,” 12 Apollo moonwalkers: <https://science.nasa.gov/moon/exploration/>

## Open questions

None.
