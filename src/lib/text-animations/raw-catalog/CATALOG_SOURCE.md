# Text-animation catalog provenance

These JSON files are vendored verbatim from the upstream
[`pixel-point/animate-text`](https://github.com/pixel-point/animate-text)
project so the Hiviz text-animation engine can ship offline-deterministic
output without a runtime fetch or git submodule.

## Pinned upstream

- Repository: `https://github.com/pixel-point/animate-text`
- Commit SHA: `0f783e459d62d851b7e5308e0596fa5fbac00c7e`
- Upstream paths copied from `skills/animate-text/assets/`:
  - `specs/*.json` → `raw-catalog/specs/`
  - `effects/*.json` → `raw-catalog/effects/`
  - `runtime-presets.json`, `stage-presets.json`,
    `library-adapters.json`, `samples.json`

## Counts

- 24 portable specs (`raw-catalog/specs/`)
- 24 site effects (`raw-catalog/effects/`)
- 4 shared catalog JSON files

20 of the 24 are `visibility: 'visible'` upstream and carry a full
`showcase` block. The four `visibility: 'hidden'` effects
(`stagger-from-center`, `stagger-from-edges`, `shared-axis-x`,
`depth-parallax-words`) keep `showcase: null`; Hiviz dispatches those
through the `generic-stagger` renderer using their `portable_spec`
`enter` / `exit` keyframes directly.

## License

The upstream project's
[`LICENSE`](https://github.com/pixel-point/animate-text/blob/main/LICENSE)
governs reuse of these files. The Hiviz repository ships the vendored
JSON unchanged; any modification belongs in the wrapping engine modules
under `src/lib/text-animations/`, not in `raw-catalog/`.

## Re-syncing

Run `node --experimental-strip-types scripts/sync-text-animation-catalog.ts`
to pull a fresh copy of the catalog from the pinned SHA above. The
script is idempotent: it re-clones into a temp directory, copies the
four JSON file types, refuses to clobber edits that don't match what was
last synced from `CATALOG_SOURCE.md`, and bumps the SHA in this file on
success. CI can optionally invoke the script and fail the build if the
diff is non-empty after a run.
