# Changelog

## 2026.08.16.5

- Bind each projected terminal summary and its emission verification to the exact observability cycle, journal revision, and report digest so recovery writes a distinct canonical summary.

## 2026.08.16.4

- Persist canonical projected terminal summaries before finalization and bind emission and coverage receipts to their digest.

## 2026.08.16.3

- Preserve unavailable, failed, and already-duplicate receipts unchanged on replay; only an emitted receipt can create an observed duplicate.
- Keep terminal-journal emission available to existing Factory consumers while Delivery uses explicit preterminal projection.

## 2026.08.16.2

- Treat complete unavailable and failed Sentry receipts as non-gating while preserving degraded coverage status and emission failure details.
- Restore compatibility with durable `2026.08.09.1` receipts.

## 2026.08.16.1

- Project and verify exact done, aborted, and escalated terminal outcomes from their recoverable observability stages before finalization.
- Bind projected receipts to the current preterminal stage and versioned Factory journal.

## 2026.08.07.2

- Emit one bounded `factory.run` transaction with reconstructed `factory.stage` spans alongside terminal effectiveness metrics.
- Add local receipt coverage verification with observed, degraded, and missing outcomes.
- Preserve low-cardinality trace attributes and omit work-item identifiers and creator content.

## 2026.08.07.1

- Add bounded per-stage visits, dispatches, and time-to-gate metrics for Factory profiling.
- Add human-touch, approval, rejection, and cycle-override distributions.
- Add exact failed-terminal stage counters so recurring parked and failed stages are visible.
- Expand explicit availability coverage for every new profiling fact.

## 2026.08.06.1

- Initial public release.
- Emit a bounded Software Factory terminal metric vocabulary through Sentry SDK `10.67.0`.
- Rebuild canonical flow reports from `@mgreten/software-factory-flow-metrics` data.
- Add terminal-only validation, explicit unavailable coverage, deterministic idempotency receipts, and non-gating failure handling.
- Keep DSNs sensitive and exclude work-item identifiers and creator content from metric attributes, logs, and receipts.
- Pin Zod to `npm:zod@4.4.3`.
