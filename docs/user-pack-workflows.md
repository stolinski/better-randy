# User Pack workflows

GUI authors and agents read and write the same **User Pack** document — a `PackManifest` (`src/lib/platform/packs/types.ts`) plus store metadata — through the local User Pack store ([ADR-0055](adr/0055-user-defined-packs.md)). A User Pack is renderable and selectable like a built-in, and that is all: it never enters the creator catalog, never produces verification evidence, and is never Calibration Trio input. It is the drafting lane for the concierge pack pipeline; promotion is the [authoring playbook](packs/authoring-playbook.md) § 7.

The local server is always `http://localhost:7263`. Files under the store are internal wrappers; the API is the interchange boundary.

**This whole surface is development-only.** The pack store and its font cache sit behind the same boundary as the composition store: a build configured for the browser-scoped Public demo session (`PUBLIC_GFX_COMPOSITION_STORE=browser`) answers 404 to every request below, and the WebMCP pack tools are not registered there at all ([ADR-0053](adr/0053-gfx-namespace-and-legacy-supers-compatibility.md)).

## Store location

Everything lives in macOS app data beside the composition store, never under a checkout:

```
~/Library/Application Support/GFX/
  compositions/   # User compositions
  packs/          # <slug>.json User Pack documents
  fonts/          # <sha256>.woff2 plus index.json, the same-origin font cache
  trash/packs/    # deleted packs; deleting never destroys
```

A verification run jails all of it through the composition variables it already sets (`GFX_VERIFICATION_RUN=1` plus `GFX_USER_COMPOSITION_STORE_DIRECTORY`): `packs` and `fonts` derive as siblings of the jailed composition directory, and a verification run has no delete authority over packs either.

## Agent store access

List the packs the store holds, with each document's `contentHash`:

```sh
curl -fsS http://localhost:7263/api/user-packs
```

Fork a built-in. The fork takes the built-in's cores, optional cores, chrome recipe, and fonts — never its per-Pipeline overrides, which would beat every core edit under the specific → core resolution ([ADR-0024](adr/0024-role-resolution-core-fallback.md)):

```sh
curl -fsS \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{ "slug": "sentry", "forkedFrom": "clean-light", "label": "Sentry" }' \
  http://localhost:7263/api/user-packs
```

Read one document:

```sh
curl -fsS http://localhost:7263/api/user-packs/sentry > sentry.json
```

Save a whole manifest against the revision you read. `expectedContentHash` is the `contentHash` from the list or the last response; a save over a document that moved answers `409` with the hash that stands:

```sh
curl -fsS \
  -X PUT \
  -H 'Content-Type: application/json' \
  --data '{ "manifest": <PackManifest>, "expectedContentHash": "<sha256>" }' \
  http://localhost:7263/api/user-packs/sentry
```

Delete one pack (it moves to trash):

```sh
curl -fsS -X DELETE http://localhost:7263/api/user-packs/sentry
```

Every save runs, in order, and refuses with named issues on the first failure: the structural contract a built-in passes at boot (mandatory cores, role contracts, chrome Effects), the Google Fonts catalog check, the no-shadowing rule (a User Pack slug is never a `PACK_REGISTRY` slug), then font materialization. Only a document that passed all four gets a `contentHash` and a place on disk. A `422` carries `issues[]` with a `path` per role, which is what the GUI shows inline.

## WebMCP tools

The same capabilities are `appearance`-family rows ([ADR-0054](adr/0054-webmcp-operation-transaction-and-security-contract.md)), registered once a composition is open on a host that serves the store: `gfx_appearance_inspect_user_pack_store`, `gfx_appearance_fork_user_pack`, `gfx_appearance_validate_user_pack`, and — once the store holds a pack — `gfx_appearance_save_user_pack` and `gfx_appearance_delete_user_pack`. `gfx_appearance_set_pack` binds the open composition to a User Pack slug as readily as to a catalog slug. Save takes either a whole `document` or `label` / `description` / `roles` / `fonts` changes (role and font shapes travel as JSON text, like Effect parameters), always against the `contentHash` the agent read. Delete refuses while the open composition wears the pack: bind another Pack first. Built-ins are never edited, deleted, or forked-from-a-fork through these tools, and no receipt ever claims a catalog status.

## GUI flow

The Pack section of the right rail lists the catalog, then every User Pack under its own group. **Fork** (shown while a built-in is bound) forks that built-in as `<slug>-copy`, labelled "<Label> copy", and binds the composition to it. With a User Pack bound, the section opens the editor in place: label, description, the four colour cores, field ink, edge mode, depth rig, scene light, and the two type voices — a Google Fonts family from the vendored catalog with the cuts the family ships. Roles the editor has no control for round-trip untouched.

Every edit previews on the render at once and autosaves half a second after the last change through the validated save. A refused save keeps the draft in the editor with the issues named per role and puts the last saved look back on the render, so the pixels never show a document the store rejected. **Delete pack** arms to "Delete pack?" with a Keep beside it; confirming rebinds the composition to the built-in the pack was forked from before the pack leaves the store.

## Fonts

A User Pack may claim any Google Fonts family. Claims validate offline against the vendored catalog snapshot (`src/lib/platform/google-fonts-catalog.json`, refreshed only by `pnpm refresh:google-fonts`): a weight is a real cut when the family ships it as a static file or inside its `wght` axis, and a `wght` axis never manufactures an italic. The playbook's never-synthesize law holds at save time, deterministically.

At save time the origin asks Google's CSS API for the current file URLs, downloads every slice once, pins the bytes under their sha-256 in the font cache, and records the claim in the index. The snapshot deliberately carries no file URLs, because Google versions and rotates them. A pinned claim is never re-fetched or replaced, so a render cannot change because Google updated a family; a claim that cannot be fetched fails the save closed. Renders load faces only from `/api/user-pack-fonts/<sha256>.woff2` — `fontsReady()` gates capture on every loaded User Pack's faces exactly as it gates on a built-in's bundled ones — and nothing is fetched from a third party at render time.

## Failure modes

- **A composition names a User Pack the store no longer holds.** It still loads (the store's own documents accept any well-formed User Pack slug) and the Workspace fails at resolution with the slug and the recovery named: bind another Pack, or restore the pack. Nothing substitutes another look.
- **A slug collides with a built-in.** Refused at save and by every tool; the catalog is never shadowed.
- **The store cannot be read.** The binding stays where it was and the cause is in the message; the WebMCP pack tools are absent rather than present-and-refusing.
- **Two writers.** The second save over a moved document is refused with the current `contentHash`; the GUI reloads the document and keeps its draft for the author to reapply.

## Verification

`pnpm probe:user-pack-render` (`scripts/probe-user-pack-render.ts`) is the deterministic CDP pass: it seeds a jailed store with a User Pack whose faces come from the bundled `@fontsource` files, opens a composition bound to it on the built artifact, and proves the pack decided the pixels, every face came from the same-origin cache, and no request reached Google. The recorded run is [`browser-probes/user-pack-render.json`](browser-probes/user-pack-render.json). Every deliverable gate — `verify-presets`, `probe-pack-diff`, calibration bundles, the layout-contract matrix — enumerates `PACK_REGISTRY` alone, guarded by `deliverable-gate-pack-scope.test.ts`.
