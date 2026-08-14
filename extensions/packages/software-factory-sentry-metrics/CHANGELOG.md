# Changelog

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
