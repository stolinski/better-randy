# Dex software Factory portability

The reusable delivery package consists of two local model extensions:

- `@club_aqua_back_deck/dex-software-factory` compiles consumer-owned adapters,
  prompts, contract extensions, routing conditions, review policy, human gate,
  and cycle budgets into `@swamp/software-factory` arguments.
- `@club_aqua_back_deck/dex-task-tracker` owns normalized Dex reads and typed,
  receipt-backed lifecycle mutations. The generated Factory calls it only in
  `terminal-cleanup`, after successful reconciliation and postflight.

Consumers provide only the fields demonstrated by
`fixtures/dex-software-factory-consumer/profile.json`. Repository policy stays
behind the named preflight, classification, verification, and postflight
adapters. Consumer artifact fields can extend the compiler-owned contracts but
cannot replace their routing fields.

## Materialization

The compiler output is build-time data. Create the profile and Factory through
Swamp so their IDs remain platform-owned, place the documented profile fields
in the profile definition's `globalArguments`, then run:

```bash
swamp model method run <profile> compile
deno run --allow-run --allow-read --allow-write scripts/materialize-dex-software-factory.ts \
  <profile-model> <factory-definition-path> <expected-compiled-profile-name>
swamp model validate <factory>
```

Materialization preserves the Factory ID, tags, reports, checks, and methods.
It increments the definition version only when compiled arguments change, so
running the command twice is idempotent.

## Portability proof

`scripts/dex-software-factory-portability.test.ts` creates an isolated consumer
repository and validates the generated model with the actual pinned upstream
Factory loader. Its deterministic matrix covers terminal success, failed
verification and patch re-entry, review bypass and review use, human rejection
and approval, cycle-limit parking and override, abort, cleanup failure from a
missing Dex task, stale workflow evidence, exact `nextStep` routing, and a
second no-op materialization.

The fixture is not visual evidence and never claims to be. GFX remains the
representative policy-rich graph; a dirty shared worktree can validate that
generated graph but cannot honestly provide terminal render evidence for an
unrelated work item.
