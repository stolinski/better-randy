# @club_aqua_back_deck/dex-task-tracker

Connect Swamp workflows to Dex without parsing terminal output or editing Dex
storage directly.

## What is Dex?

[Dex](https://github.com/zeeg/dex) is a repository-local task tracker designed
for work performed by humans and coding agents. A Dex task has a stable ID,
description, priority, lifecycle state, result, relationships, and optional
commit. The `dex` CLI and MCP server are the supported interfaces; task state
stays with the repository instead of living only in an agent conversation.

This extension does **not** replace Dex. It exposes Dex operations as a typed
Swamp model so workflows can safely read and update the same task ledger.

## Why use this extension?

- Typed `get`, `start`, `complete`, `reopen`, `add-note`, and `claim-next-ready`
  methods.
- Stable task resources instead of CLI prose.
- Versioned receipts for successful and failed actions.
- Serialized repository mutations for concurrent workflows.
- Bounded Dex subprocesses and schema validation at every trust boundary.
- No direct reads from `.dex/tasks.jsonl` and no persisted command diagnostics.

## Requirements

- Swamp initialized in a Git repository.
- The `dex` executable available on `PATH`.
- Repository-local Dex storage (`dex dir` should resolve inside the repository).
- An owner token naming the automation or Factory profile performing mutations.
  It is attribution, not a credential.

## Install and create a tracker

```sh
swamp extension pull @club_aqua_back_deck/dex-task-tracker
swamp model create @club_aqua_back_deck/dex-task-tracker project-dex-tracker \
  --global-arg ownerToken=factory-automation --json
swamp model validate project-dex-tracker --json
```

Always use `swamp model create`; Swamp owns the model ID and definition
scaffold.

## Read and start a task

```sh
swamp model method run project-dex-tracker get --input taskId=TASK-123
swamp model method run project-dex-tracker start --input taskId=TASK-123
```

## Complete a task

Completion requires an explicit decision about whether a commit belongs to the
task.

Without a commit:

```sh
printf '%s' '{
  "taskId": "TASK-123",
  "result": "Implemented and verified the requested behavior.",
  "commit": { "kind": "noCommit" }
}' | swamp model method run project-dex-tracker complete --stdin
```

With a commit:

```sh
printf '%s' '{
  "taskId": "TASK-123",
  "result": "Implemented and verified the requested behavior.",
  "commit": {
    "kind": "commit",
    "sha": "0123456789abcdef0123456789abcdef01234567"
  }
}' | swamp model method run project-dex-tracker complete --stdin
```

Repositories that configure the completion-approval globals fail closed unless
a repository completion workflow supplies the exact Factory state,
reconciliation artifact, successful postflight evidence, current-cycle human
approval, deterministic source names, and a sensitive vault capability. The
tracker binds the approved task to the exact result and commit disposition and
rejects fabricated, stale, or replayed evidence before any Dex command. Agents
and workflows must not create the human approval on a user's behalf.

## Claim an approved ready leaf

`claim-next-ready` accepts a compact audited Planning approval plus the active
Delivery Factory work-item ids. The approval must include an HMAC-SHA-256
signature from a trusted repository authorizer, and the tracker model must be
configured with the matching sensitive `deliveryHandoffAuthorizationKey` vault
reference. The key is never written to model data. The claim method also
requires a sensitive `authorizationCapability` input; the repository workflow
resolves it directly from the vault, while ordinary method callers cannot obtain
it. A caller-minted checksum, a missing capability, or a model without the key
is rejected before any Dex read or mutation. Under the canonical Dex repository
lock it scopes active Factory ids, started tasks, priority, and ambiguity to the
approved root epic. It starts only that root's unique highest-priority approved
leaf; independently approved roots serialize their brief claim/start mutations
through that same shared lock. Unknown or cyclic ancestry, unknown blocker ids,
inherited open blockers, completed boundaries, same-root duplicate
ownership, out-of-boundary work, and no-work conditions are persisted
as typed outcomes; Planning does not create or select backlog through this
method.

The claim is the first half of a repository-owned saga. A workflow must start or
resume its Delivery Factory for `selectedTaskId`, then verify that exactly one
Factory state exists. Retrying the same approval reuses a deterministic claim
resource and never starts a second Dex leaf.

Reopen a task or append a note:

```sh
swamp model method run project-dex-tracker reopen --input taskId=TASK-123
swamp model method run project-dex-tracker add-note \
  --input taskId=TASK-123 --input note='Verification is in progress.'
```

## Data written by the model

Each successful lifecycle action writes a normalized `task-<id>` resource and a
deterministic receipt. A failed action writes a receipt when safe persistence
remains possible. `claim-next-ready` writes a deterministic `ready-leaf-intent`
before Dex mutation and a replayable `ready-leaf-claim` after verification.
Receipts use bounded error codes and exclude raw stdout, stderr, stack traces,
repository paths, and command arguments.

See [`examples/usage.md`](examples/usage.md) for a disposable clean-repository
validation sequence.

## License

MIT. See [`LICENSE.txt`](LICENSE.txt).
