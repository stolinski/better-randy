# Pack-diff evidence — low-res regression lock

Everything in this directory is produced by `scripts/probe-pack-diff.ts`: per-pack captures (`<preset>--<pack>.png`) at **25% of native 4K** and `pack-diff-results.json`, the attributable catalog-wide diff matrix (per-Pipeline region masks, every catalog pack pair, inverse immunity checks, source hashes).

**This is machine regression evidence only.** The captures are quarter-scale and the thresholds are calibrated for that scale — none of this is Calibration Trio evidence. Pack ratification requires native-4K captures judged at human scale (`docs/packs/authoring-playbook.md` §5).

Freshness: `npx tsx scripts/probe-pack-diff.ts --check` re-hashes every input (probe script, Pipeline/appearance source trees, each pack's sources, each covered Preset) against `pack-diff-results.json` and rejects the report if anything moved. A rejected report means the evidence here describes code that no longer exists — re-run the probe.
