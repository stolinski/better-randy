# ADR-0029 — Image substrate as a depth-stage backdrop plane

**Status:** Accepted (2026-06-22)
**Context:** dex p20 (image-substrate half) · unblocks pullquote-on-photo · builds on [ADR-0028](0028-dimensional-depth-stage.md)

## Context

The corpus needed a real **image substrate** — an actual photo behind composition content — to ship the on-photo/collage family (starting with `pullquote-on-photo`). There was none: `pullquote-on-photo` faked a "photo" with a procedural backdrop shaderPass. Two render homes were possible: a flat substrate pass composited under the surface, or the dimensional depth stage (ADR-0028) with the photo on the backdrop plane.

We chose the **depth stage** — a real photo on the far plane, the Surface (the quote) on the near plane, the camera push reprojecting them at different rates (true parallax) and the rack focus pulling soft→sharp. This advances the standing direction to use the 3D compositor in more real content, and the depth-stage plane fragment already had a `textured` branch ready.

## Decision

1. **Schema:** `state.stage.backdrop.image.asset` — a slug into a registered, bundled substrate-asset map. (The substrate lives on the *stage* because here it IS the backdrop plane; a flat `surface.substrate` remains the future home for non-depth substrates.)
2. **Assets are bundled, Vite-imported images only** (like the self-hosted fonts) — deterministic, no network, identical pixels every export frame. URL / data-uri / video sources deferred.
3. **`substrate-textures.ts`** decodes the image (async, memoised) and uploads it once to a resident `rgba8unorm` GPU texture (`copyExternalImageToTexture`, the existing marks-upload pattern); cached by `(host, slug)`. Sampled per frame, never decoded per frame → frame-deterministic. Gated into first paint alongside `fontsReady()` so preview and export both have it.
4. **Depth stage:** `DepthStageInput.backdropTextureView` (optional). The backdrop plane samples it via the existing `textured` branch (`misc.z=1`, `discard=0` — opaque, unlike the Surface plane's transparent-surround discard), reusing the plane layout's single `surfaceTexture` slot — **no bind-group contract change**. Absent → solid `backgroundColor` as before.
5. **The depth-stage path consumes the raw surface pipeline output** (`pipeline.getOutputTexture()`), which bypasses the surface's own backdrop shaderPass — so `pullquote-on-photo` outputs only the quote+scrim on transparent (the near plane) and the real photo is the only photo.

## Consequences

- `pullquote-on-photo` ships as a Critic-ACCEPTed deliverable on the 3D compositor (real substrate, measured parallax, rack focus). The old assumption that it was blocked on the edge-treatment primitive was wrong — a full-bleed depth photo has no edge to treat.
- The **edge-treatment** half of p20 (clean/soft/irregular/torn/none, shader-side alpha mask + a `resolveEdgeTreatment` that finally makes the inert pack `edge-treatment` Role reach pixels) remains — it serves the FLAT collage/torn-clipping family, not the full-bleed depth photo.
- Opaque substrate → opaque export lane; the preset keeps `backgroundFill` as the backstop.
- The shipped asset is a deterministic **synthetic** atmospheric image (web fetch is sandboxed in the build env); swappable for a real photograph with zero code change.
- Forward hook: a `surface.substrate` flat path (substrate under a non-depth surface) and video substrates (deterministic per-`progress` frame seek) are deferred, not precluded — the `source` field is a discriminated union.
