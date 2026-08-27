# Changelog

## 2026.08.27.1

- Add an optional generic typed application-bundle validation phase.
- Permit consumer policy to route approval-free capture and approval-bound application directly into one post-review mutation workflow.

## 2026.08.07.1

- Add an optional terminal-observer workflow adapter.
- Route done, rejected, parked, failed-apply, failed-audit, and aborted outcomes through required observability stages when configured.
- Keep existing profiles backward compatible when no observer is configured.

## 2026.08.06.1 — 2026-08-06

- Initial publication candidate.
- Compile repository-owned adapters, prompts, gates, and bounded cycle budgets into a deterministic `@swamp/software-factory@2026.06.24.1` Planning profile.
- Keep inventory, tracker lookup, documentation policy, and audit adapters read-only.
- Reserve the only configured write boundary for post-approval application through `@club_aqua_back_deck/dex-plan-applier@2026.08.06.1`.
- Require an independent review and current-cycle native human approval of the exact normalized graph before application.
- Emit both the reviewed graph and deterministic Plan Applier normalization so consumers can validate the pre-mutation boundary.
- Route documentation-policy rejection back to clarified intent for bounded revision without mutating Dex.
- Emit a typed Planning handoff without starting Delivery.
- Pin Zod to `npm:zod@4.4.3` for reproducible bundles.
- Add a generic consumer profile and clean-consumer compile instructions.
