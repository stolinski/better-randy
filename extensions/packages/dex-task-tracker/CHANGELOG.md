# Changelog

## 2026.08.15.1

- Scope approved ready-leaf ownership, active Factory runs, started tasks, priority, and ambiguity to one proven root epic.
- Permit unrelated approved roots to claim independently while preserving the repository lock, HMAC authorization, and crash-safe intent.
- Fail closed on unknown/cyclic ancestry and inherited open blockers.

## 2026.08.06.2

- Add optional fail-closed human completion approval enforcement backed by authoritative current-cycle Factory state, reconciliation, postflight, deterministic source names, and a sensitive repository-workflow capability.
- Add atomic `claim-next-ready` ownership under the canonical Dex repository
  lock.
- Resume active Delivery ownership before recomputing the global ready-leaf
  runway.
- Enforce unique highest priority, human-approved task/epic boundaries, and
  typed no-work or human-gate outcomes.
- Persist deterministic claim/outbox resources for concurrent and crash-recovery
  convergence.

## 2026.08.06.1

- Explain Dex, its repository-local task model, and how this extension relates
  to it.
- Clarify lifecycle methods, persisted data, safety boundaries, and completion
  examples.
- Correct the README license section to identify the included MIT license.

## 2026.08.05.1

- Initial publication candidate.
- Add typed `get`, `start`, `complete`, `reopen`, and `add-note` methods.
- Normalize Dex task data into stable camelCase resources.
- Add versioned, diagnostic-safe receipts and deterministic error codes.
- Serialize repository mutations with an ownership-safe cross-process lock.
- Pin Zod to `npm:zod@4.4.3`.
