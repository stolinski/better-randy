# Datamosh Effect

> Captured 2026-08-07 from Scott's idea. Speculation tier — not designed, not scheduled.

## Pitch

Add a datamoshing Effect inspired by [Supermosh](https://supermosh.github.io). The intended visual territory is temporal smearing, displaced compression blocks, and motion that appears to drag pixels from earlier frames into later ones.

## Boundary

- This is an Effect idea, not an implementation plan or Dex task.
- Do not assume a simple single-frame glitch shader is sufficient; convincing datamoshing may require deterministic access to prior rendered frames or motion history.
- Any future design must preserve frame-deterministic preview/export parity, native target resolution, alpha behavior, and Pack-neutral Presets.
- Inspiration establishes the visual target, not permission to copy Supermosh's implementation or interface.

## Pick-up questions

- Which datamosh behaviors belong in GFX's constrained vocabulary rather than a general glitch tool?
- Can the effect work over transparent compositions without inventing opaque pixels or corrupting premultiplied alpha?
- What temporal state must the renderer retain so arbitrary frame seeks and export produce identical pixels?
- Which controls expose useful art direction without becoming a codec simulator?

## Graduation evidence

Brainstorm and write an approved Brief that defines the visual vocabulary, temporal-rendering model, alpha rules, controls, and verification targets. Only then may the idea graduate to the roadmap and Dex for execution.
