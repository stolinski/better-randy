# Shared Asset Service — team libraries and community registry

> Captured 2026-08-03 from a brainstorm. Speculation tier — not designed, not scheduled. Two threads folded into one arc: a centralized asset service and an auth path with team libraries. The agent-access thread lives in its own doc: [[webmcp-agent-access]].

## Pitch

Local Supers installs talk to one centralized asset service. Sound effects and other composition assets can be shared, rated, tagged, and attributed to the user who uploaded them. Logged-in users get their **team's** private library — the brand's asset vault — synced into the local app. Later, the same plumbing carries a public commons, and eventually shared compositions and packs.

The app itself stays local. The service is a distribution layer, not a runtime dependency.

## Why

- **It matches the product definition.** Supers is shipped to creators; Packs = customer brands ([roadmap § pack catalog](../roadmap.md)). A brand is almost never one person — it's a creator plus an editor plus whoever. "Team" and "brand" are nearly the same object, and a team library is just the brand's asset vault: its sound alternates, logos, b-roll, substrate photos.
- **The Foley catalog proved curation is the value.** The current 28-cue checked-in Foley library gives semantic events useful defaults while preserving per-motion sample choice ([ADR-0033](../adr/0033-sound-design-motion-emitted-cues.md)). Community and team sounds would slot in as additional `sound.sample` alternates routed through that existing grammar; ratings and tags become the discovery layer for the picker.
- **The network-effect endgame is presets and packs, not sounds.** [ADR-0039](../adr/0039-pack-neutral-compositions-and-listing-hygiene.md) pack-neutrality is exactly what makes a shared composition valuable: anyone's preset re-dresses under your brand automatically. That is the Figma-Community-shaped prize. Sounds are the wedge that proves the sync/ownership/curation machinery first.

## Shape: hybrid, not hosted

A fully hosted app fights the engine's physics and re-litigates grilled decisions:

- Rendering needs a Chrome with `--enable-blink-features=CanvasDrawElement` (HTML-in-Canvas is not in stable), native-4K WebGPU work, the local ffmpeg/ProRes lane, and the Resolve bridge. Capture and export happen in the *user's* browser and machine — hosting the editor moves none of that.
- The roadmap already ruled that Electron and content-scale tooling wait because output quality is the bottleneck, and that multi-user/product-document work is deferred.

The hybrid — self-hosted/local app + centralized asset service — re-litigates nothing. It is a thin network seam on an otherwise unchanged local product.

## Architectural gifts already in place

- **Content-addressed media store** ([ADR-0043](../adr/0043-source-video-underlay.md) / [ADR-0045](../adr/0045-composition-media-library-and-video-track.md)): assets are already globally deduplicated, hash-keyed bytes served locally. A registry is *the same store with a sync seam* — presets pin assets by content hash, the client syncs missing bytes at browse/install time, and frame-determinism survives untouched. Immutable hash-keyed bytes cannot conflict, so asset sync is conflict-free by construction.
- **Transport-agnostic composition persistence port** ([ADR-0032](../adr/0032-gui-agent-parity-authoring.md), "Electron-ready"): a team-backed remote composition store is a second implementation of a port that already exists, not a rearchitecture.
- **GUI ↔ agent parity doctrine**: every schema field already has both an inspector editor and a programmatic path. Any agent-facing tool surface (MCP or WebMCP) is a veneer over existing operations, not new capability.

## The invariant: auth gates sync, never render

- Logged out, the app is exactly today's app — fully functional, local-only.
- Logged in, team assets sync down into the existing content-addressed store. The network exists only at browse/install time.
- Rendering never touches the network or auth state. Token expired mid-session → renders still work, because the bytes are already local.

Auth is purely a distribution feature. Frame-determinism and the local-only doctrine stay binding.

## Sequencing (each stage de-risks the next)

1. **Team asset libraries (immutable assets; sounds first).** Valuable at n=2 — one team sharing one cue library is useful day one, no critical mass needed. A team is a trust boundary, so licensing provenance collapses to "your team is responsible for its own rights" — the hard moderation machinery isn't needed yet. Sounds are small, rights-simple, and already routed through the event grammar.
2. **Read-only composition sharing.** Fork-on-open, riding the store's existing fork semantics. A teammate reuses your lower-third by forking it — no live co-editing, no conflict resolution.
3. **Public commons.** Same plumbing, plus the machinery teams let us defer: own-work/CC0/CC-BY declarations, takedown path, and a curated/verified tier distinct from the open pool (ratings feed promotion between tiers). An unmoderated flat commons imports mediocrity into a product whose identity is taste — the curation tier is not optional.
4. **Packs as shared units.** The biggest prize and the biggest fence: it collides with the ratified V1 pack decisions (one shared app bundle, no runtime pack loading, no licensing gates). Requires an ADR-level reversal — last, deliberately.

Ownership note: attribution ("which user uploaded it") is the easy 20%. Licensing provenance is the historically fatal part of asset marketplaces, and accounts are the first genuinely multi-user surface in the product — stage 1 keeps both inside the team trust boundary on purpose.

## Agent access

The hosted service exposes a **standard remote MCP server** — the registry/store/render API for external and headless agents (Claude Code, CI, Critics). Boring, shipping-today MCP over HTTP; serves every workflow that needs determinism. The complementary in-browser transport — WebMCP tools declared by the live Workspace page for co-editing agents — is its own idea: [[webmcp-agent-access]].

## Non-goals

- **No fully hosted app.** The editor, capture, and export stay on the user's machine.
- **No live co-editing.** Composition sharing is fork-on-open; CRDTs/conflict resolution are a separate product.
- **No network at render time.** Ever. Sync is the only networked operation.
- **No pack distribution in v1.** Team libraries carry composition inputs (sounds, media), not packs — nothing in stages 1–3 touches the V1 pack decisions.
- **No open uploads without a curation tier.** The commons launches with verified/open separation or not at all.

## Remaining opens

- **Identity provider and account model** — and whether a team is its own entity or just a shared namespace.
- **Where the service lives.** Supers is local-only by doctrine; the service is a separate deployable. First-party hosted only, or also self-hostable (the "self-hosted app + central DB" variant that seeded this idea)?
- **Sync vs the local store's lifecycle** — how synced team bytes interact with the media store's cleanup/GC and bounded export sessions.
- **Ratings scope** — global, per-team, or both; and what signal actually feeds tier promotion.
- **Versioning for shared compositions** — fork-on-open dodges conflicts but not "the original improved since I forked."
- **Monetization** — free community pool vs paid marketplace with revenue share; interacts with the licensing model.
- **The V1 pack-decision reversal** — what evidence (demand, catalog scale) would justify runtime pack loading, and what the licensing gate looks like when it arrives.
