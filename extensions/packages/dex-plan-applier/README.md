# @club_aqua_back_deck/dex-plan-applier

Apply a complete, already approved Dex task graph through one typed Swamp
method.

This extension is the write boundary after planning. It validates and
materializes a supplied graph; it does **not** invent tasks, choose priorities,
grill a user, approve a proposal, or mutate planning documents. Keep those
decisions in a separate human-gated Planning Factory and call `apply-plan` only
with its approved artifact.

## Why use this extension?

- One `apply-plan` fan-out method applies the graph serially under a
  repository-wide OS-backed lock.
- The production path verifies that `dex dir` is the canonical repository-local
  `.dex` directory and rejects symlinked store or lock paths.
- Strict schemas reject unknown fields, duplicate client references, missing
  references, cycles, invalid hierarchy depth, duplicate attachments, and
  mismatched existing tasks before mutation.
- Created and attached tasks preserve the approved names, descriptions,
  priorities, hierarchy, and blocker edges.
- A durable checkpoint advances after every confirmed mutation and supports
  bounded roll-forward retries without destructive rollback.
- An identical successful replay reuses its mapping only after the current Dex
  graph still passes content, hierarchy, blocker, and integrity verification.
- Dex MCP processes have a 30-second deadline and one-megabyte stdout/stderr
  limits; public errors and receipts exclude raw command diagnostics.
- Dex is accessed only through its supported CLI/MCP interface; the task store
  is never read or edited directly.

## Requirements

- Swamp initialized in a Git repository.
- The `dex` executable available on `PATH` with MCP support.
- Canonical repository-local Dex storage (`dex dir` resolves exactly to the
  repository's non-symlinked `.dex` directory).
- An `ownerToken` naming the Planning Factory or automation applying the plan.
  This is attribution, not a credential.
- A human-approved plan matching the versioned contract described below.

## Install and create an applier

```sh
swamp extension pull @club_aqua_back_deck/dex-plan-applier
swamp model create @club_aqua_back_deck/dex-plan-applier project-dex-plan-applier \
  --global-arg ownerToken=project-planning-factory --json
swamp model validate project-dex-plan-applier --json
```

Always create consumer instances with `swamp model create`; Swamp owns the model
ID and definition scaffold.

## Approved-plan contract

`apply-plan` accepts one object with a `plan` property. The plan contains:

- `schemaVersion: 1` and a stable `planId`.
- An optional new `epic`.
- Between one and 250 total task-graph nodes.
- `create` tasks with exact content, priority, parent target, and blocker
  references.
- `attachExisting` tasks selected by exact Dex ID or unambiguous exact name,
  with expected content and priority that must still match.
- Lowercase kebab-case `clientRef` values used only inside the plan. Results map
  each client reference to the authoritative Dex ID.

Parent and blocker fields refer to client references, never fabricated Dex IDs.
An existing task may preserve its current parent or be moved only as explicitly
approved. The applier validates the full graph before the first mutation.

See [`examples/approved-plan.json`](examples/approved-plan.json) for a complete
request.

## Apply and replay

```sh
swamp model method run project-dex-plan-applier apply-plan \
  --stdin < examples/approved-plan.json --json
```

Running the same command again with the same approved plan reuses the successful
result mapping when the current Dex graph still matches the approved result. A
changed plan must use a distinct `planId`; reusing an identity with different
content or replaying after external graph drift fails closed.

## Outputs and recovery

Each attempt writes versioned resources:

- `checkpoint-*` records the plan hash, phase, confirmed mappings, pending
  mutation, attempt, and recovery state.
- `receipt-*` records success or a bounded failure code plus retry disposition.
- `result-*` records the stable client-reference-to-Dex-ID mapping for a
  successful plan.

If an interruption leaves a create outcome uncertain, the next attempt searches
post-baseline Dex state for one exact content, priority, and parent match.
Multiple matches fail closed for human inspection. Dex does not expose a caller
idempotency key, so an incompatible external writer can still create an
identical task that is adopted, or alter the uncertain task before recovery and
leave a duplicate window. Use the shared lock for every compatible Dex writer,
stop unrelated direct Dex mutations during application, and inspect any
`manual-review` receipt before retrying. The extension never deletes tasks or
rewinds prior mutations.

The repository lock is shared with compatible Dex writers so graph creation and
task lifecycle changes do not race. The bundled lock implementation contains no
consumer repository path or credentials.

## Safety boundary

A caller is responsible for proving that the exact stored plan was approved. Do
not use this model as an approval mechanism, and do not transform the plan
between approval and application. In a Swamp workflow, pass the approved
artifact through CEL directly to `apply-plan` rather than rebuilding it in shell
code.

## License

MIT. See [`LICENSE.txt`](LICENSE.txt).
