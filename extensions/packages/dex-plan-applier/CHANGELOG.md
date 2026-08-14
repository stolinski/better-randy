# Changelog

## 2026.08.06.1 — 2026-08-06

- Package the typed Dex Plan Applier as a reusable public extension candidate.
- Document the approved-plan boundary, serialized graph application,
  checkpointed roll-forward recovery, and deterministic replay behavior.
- Add a clean-consumer create, validate, apply, and replay example.
- Pin Zod to `npm:zod@4.4.3` for reproducible bundles.
- Verify canonical repository-local Dex storage and reject symlinked store or
  lock paths.
- Bound Dex MCP runtime and output while keeping raw command diagnostics out of
  public errors.
- Make replay and uncertain-create recovery limitations explicit.

## 2026.08.05.1 — 2026-08-05

- Implement one typed `apply-plan` fan-out method.
- Add strict hierarchy and blocker validation, exact existing-task attachment
  checks, repository-wide mutation locking, durable checkpoints, bounded
  receipts, and stable result mappings.
