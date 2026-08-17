# @club_aqua_back_deck/software-factory-sentry-metrics

Send bounded Software Factory effectiveness metrics and reconstructed lifecycle traces to Sentry from a durable terminal run or an exact terminal projection owned by an active preterminal observability stage.

## What does this connect?

[`@swamp/software-factory`](https://github.com/swamp-club/swamp-extensions) is a model-driven state machine for repeatable software delivery. Each work item moves through consumer-defined stages such as implementation, verification, review, and reconciliation.

[`@mgreten/software-factory-flow-metrics`](https://github.com/meagerfindings/swamp-software-factory-flow-metrics) deterministically derives trusted flow facts from the Factory's persisted journal and resources.

This extension projects a small, fixed subset of those facts into [Sentry Application Metrics](https://docs.sentry.io/product/explore/metrics/) and one bounded run transaction with stage spans. Teams can compare outcomes, inspect one run's stage timings, and locate recurring failure or rework stages over time. It does not replace either dependency and does not make Sentry part of Factory correctness.

```text
terminal Factory data OR active preterminal data + exact projectedTerminal
        ↓ canonical persisted projection + deterministic flow report
bounded metrics + reconstructed run/stage trace
        ↓ best-effort flush
Sentry Metrics and Traces + local receipt + verified coverage
```

## Properties

- **Terminal or exact preterminal projection:** an unprojected run must already be terminal. An active run is accepted only with a `projectedTerminal` triple that matches its current generated observability stage; other active and unknown runs are rejected.
- **Best effort:** a missing DSN writes a complete `unavailable` receipt, while an SDK or flush error writes a complete `failed` receipt. Verification classifies either as degraded and non-gating for delivery.
- **Idempotent:** terminal journal identity and, for a projection, the exact projected summary digest become a one-way SHA-256 receipt key, preventing duplicate or automatic retry emission.
- **Explicit availability:** unavailable facts emit coverage markers rather than invented zeroes.
- **Operational trace:** each emitted run creates a `factory.run` transaction with explicit-time `factory.stage` spans reconstructed from the durable journal.
- **Bounded cardinality:** project, Factory, profile, stage, and outcome values use strict bounded schemas.
- **Secret-safe:** the DSN is a sensitive global argument; receipts and logs never contain it.

## Metrics

| Metric                            | Type             | Meaning                                                             |
| --------------------------------- | ---------------- | ------------------------------------------------------------------- |
| `factory.run.completed`           | Counter          | One terminal run, grouped by outcome and bounded Factory dimensions |
| `factory.run.duration`            | Distribution, ms | Time from run start to terminal state                               |
| `factory.stage.duration`          | Distribution, ms | Time spent in each completed stage                                  |
| `factory.stage.entries`           | Distribution     | Visits to each stage, including rework cycles                       |
| `factory.stage.dispatch_attempts` | Distribution     | Dispatch attempts grouped by stage                                  |
| `factory.stage.first_entered`     | Distribution, ms | Time from Factory start to first reaching each stage                |
| `factory.run.dispatch_attempts`   | Distribution     | Recorded work dispatches                                            |
| `factory.run.human_decisions`     | Distribution     | Distinct trusted approval or rejection decisions                    |
| `factory.run.human_touches`       | Distribution     | All recorded approvals and rejections                               |
| `factory.run.approvals`           | Distribution     | Recorded approvals                                                  |
| `factory.run.rejections`          | Distribution     | Recorded rejections                                                 |
| `factory.run.patch_cycles`        | Distribution     | Rework or patch cycles                                              |
| `factory.run.cycle_overrides`     | Distribution     | Human overrides of bounded stage-cycle limits                       |
| `factory.run.cleanup_failure`     | Counter          | Terminal `cleanup-required` outcomes                                |
| `factory.run.failed_terminal`     | Counter          | Non-done terminal runs grouped by exact failed or parked stage      |
| `factory.metric.coverage`         | Gauge, 0/1       | Whether each optional fact was available                            |

`accepted-first-pass` and `visual-review-used` are bounded attributes on the completion metric. Work-item IDs, prompts, source code, artifact content, user identity, filenames, command output, and DSNs are never emitted.

## Install

Pulling the extension also resolves Software Factory and the canonical flow-metrics report:

```sh
swamp extension pull @club_aqua_back_deck/software-factory-sentry-metrics
```

## Store the Sentry DSN

Keep the DSN in a Swamp vault rather than writing it into a model definition:

```sh
swamp vault create local_encryption factory-metrics-secrets \
  --audit-reads --json
printf '%s' "$SENTRY_DSN" | \
  swamp vault put factory-metrics-secrets SENTRY_DSN
```

Create the emitter with a vault expression:

```sh
swamp model create \
  @club_aqua_back_deck/software-factory-sentry-metrics \
  factory-sentry-metrics \
  --global-arg 'dsn=${{ vault.get(factory-metrics-secrets, SENTRY_DSN) }}' \
  --global-arg flushTimeoutMs=5000 \
  --json
swamp model validate factory-sentry-metrics --json
```

Swamp stores the expression, not the resolved DSN. Omitting `dsn` is valid and causes emissions to produce an `unavailable` receipt.

## Emit from Factory data

`emit_flow_report` is the preferred method. It reads the named Factory model's persisted data and rebuilds the canonical flow report. For a run that is already terminal, provide exactly `workItem`, `sourceFactory`, `factory`, and `visualReviewStages`:

```sh
printf '%s' '{
  "workItem": "TASK-123",
  "sourceFactory": {
    "id": "REPLACE_WITH_SWAMP_FACTORY_MODEL_UUID",
    "name": "project-delivery"
  },
  "factory": {
    "project": "example-project",
    "name": "project-delivery",
    "profile": "standard"
  },
  "visualReviewStages": ["review"]
}' | swamp model method run factory-sentry-metrics emit_flow_report --stdin
```

Obtain the source Factory ID from `swamp model get <factory-name> --json`; do not invent or copy an ID from an example. Without `projectedTerminal`, an active or unknown run is rejected.

For normal lifecycle integration, the Factory remains active in one generated preterminal observability stage. Add the required `projectedTerminal` object to the same four source arguments. Only these exact route triples are valid:

| `preterminalStage`        | `targetStage`            | `outcome` |
| ------------------------- | ------------------------ | --------- |
| `done-observability`      | `done`                   | `done`    |
| `aborted-observability`   | `aborted`                | `aborted` |
| `escalated-observability` | `operational-escalation` | `parked`  |

For example:

```sh
cat > projected-terminal.json <<'JSON'
{
  "workItem": "TASK-123",
  "sourceFactory": {
    "id": "REPLACE_WITH_SWAMP_FACTORY_MODEL_UUID",
    "name": "project-delivery"
  },
  "factory": {
    "project": "example-project",
    "name": "project-delivery",
    "profile": "standard"
  },
  "visualReviewStages": ["review"],
  "projectedTerminal": {
    "preterminalStage": "done-observability",
    "targetStage": "done",
    "outcome": "done"
  }
}
JSON
swamp model method run factory-sentry-metrics persist_projected_summary \
  --stdin < projected-terminal.json
swamp model method run factory-sentry-metrics emit_flow_report \
  --stdin < projected-terminal.json
swamp model method run factory-sentry-metrics verify_flow_receipt \
  --stdin < projected-terminal.json
```

All three methods require that exact argument shape. Run them strictly in `persist_projected_summary` → `emit_flow_report` → `verify_flow_receipt` order. Persistence binds the current preterminal cycle, latest durable journal revision, route, and report digest. Emission and verification reject a missing, stale, or substituted summary. The observer workflow never advances the Factory; after it succeeds, the generated preterminal stage owns the `workflow-succeeded`-gated `finalize` transition.

The lower-level `emit` method accepts an already-derived terminal payload. See [`examples/direct-emission.json`](examples/direct-emission.json) for its strict contract.

## Receipts and retries

The first emission attempt writes `receipt-<sha256>` with status `emitted`, `unavailable`, or `failed`. Replaying a successfully emitted key records `duplicate`. Any complete `unavailable` or `failed` receipt is preserved for that key: adding a DSN, repairing the SDK, or replaying the workflow does not create a sink and does not auto-retry the emission. This avoids double-counting after an uncertain attempt. A later recovered preterminal cycle has a new projected-summary identity and therefore a new receipt key; it is not a retry of the old key.

Call `verify_flow_receipt` with the exact same source and `projectedTerminal` arguments after emission. It writes `coverage-<sha256>` as `observed`, `degraded`, or `missing`. An `emitted` or `duplicate` receipt is observed. A complete missing-DSN `unavailable` receipt or SDK/flush `failed` receipt is preserved, degraded, and non-gating. Only a missing or mismatched receipt produces missing coverage and fails verification so the preterminal route can recover without changing its projected Factory outcome.

For automatic coverage, route done, aborted, and operational-escalation outcomes through outcome-specific preterminal observability stages and keep the required persist → emit → verify order. A manual post-run command is recovery tooling, not lifecycle integration.

See [`examples/usage.md`](examples/usage.md) for clean-consumer setup and verification.

## License

MIT. See [`LICENSE.txt`](LICENSE.txt).
