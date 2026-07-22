# Per-tool routes → unified preset engine

Supers originally organized each generator as a self-contained tool: a route at `src/routes/tools/<tool>/`, a feature module at `src/lib/tools/<tool>/` (state + pipeline + canvas source + controls + export), and dedicated platform glue (`ToolWorkspace`, `ToolRunner`, `tool.ts`). The cost of that shape compounded: every new visual idea required a parallel set of files, the platform layer carried per-tool variants, presets couldn't share blocks or annotation styles, and AI authoring of new presets was effectively a code-generation task rather than a data task. We replaced it with a single preset engine that composes five layers (surface / block / annotation / overlay / effect) from a registry of pipelines, driven by JSON presets declared against the `supers@1` schema; the per-tool directories were deleted, a unified `Workspace` / `Composition` / `SurfaceMount` / `OverlayMount` shell mounted in their place, and routing collapsed to a single preset-picker UI.

## Considered options

Keep the per-tool shape and share code via utilities only (rejected: shared utilities couldn't reach into pipeline behavior without becoming a registry anyway), build a tool-author SDK that codifies the per-tool shape (rejected: still leaves new visuals as code work rather than data work), and the preset-engine approach (chosen: presets become authorable artifacts, the registry is the only extension point, and pipelines can compose).

## Consequences

Every visual variant is a JSON preset against the registry, not a new route. New surface / block / annotation / overlay / effect types are registered in `src/lib/platform/pipelines/` and become available to every preset. The five-layer model is a foundational data-model decision in its own right and may warrant a follow-up ADR if its boundaries are revisited. Some files (`src/lib/tools/<tool>/*`, `src/lib/platform/ToolRunner.svelte`, `ToolWorkspace.svelte`, `tool.ts`) are deleted from the repo; the architectural rationale lives here so a future reader doesn't try to reconstruct the per-tool shape from git history.
