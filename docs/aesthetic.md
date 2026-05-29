# Aesthetic — moved to the syntax Pack folder

Per [ADR-0014](adr/0014-pack-preset-split.md), aesthetic vocabulary is no longer
engine-level — it belongs to a Pack. The Syntax channel aesthetic now lives at:

- **`docs/packs/syntax/aesthetic.md`** — the channel-specific aesthetic (palette,
  type system, surface vocabulary, collage system, motion vocabulary, anti-aesthetic).
- **`docs/packs/syntax/manifest.ts`** — the Pack manifest declaring the Roles
  every Identity Spec `viaPack` clause resolves through (per [ADR-0019](adr/0019-identity-spec-via-pack.md)).

The Critic spawn prompt at [`docs/critic.md`](critic.md) loads the active
Preset's Pack aesthetic — `docs/packs/<preset.pack>/aesthetic.md` — rather than
a global aesthetic. A future Pack (editorial-minimal, neo-brutalist) ships its
own folder under `docs/packs/<slug>/` with the same shape.

This file remains only as a redirect for older references.
