---
name: supers-factory-fleet
description: Drive multiple approved Supers Delivery Factory epics concurrently in isolated Pi worktrees. Use when asked to "run multiple Factory epics", "drive the Factory fleet", "work on several Dex epics at once", or resume concurrent supers-delivery work without sharing a checkout.
---

# Supers Factory Fleet

Compose the `software-factory` and `pi-subagents` skills. Swamp owns work-item state, gates, artifacts, and evidence. Pi owns agent processes and worktree isolation. Never add Git methods to Swamp for this driver.

Read only the reference needed for the current phase:

| Phase                                      | Reference                        |
| ------------------------------------------ | -------------------------------- |
| Select, dispatch, and drive lanes          | `references/driver-loop.md`      |
| Validate and integrate a completed handoff | `references/integration-gate.md` |

## Invariants

- Keep one central parent as the only integration owner.
- Use the existing `supers-delivery` Factory. A Dex leaf id is its `workItem`.
- Run at most one writer for each approved effective open execution root.
- Launch one top-level asynchronous Pi worker per independent root, in deterministic sequence, with `worktree: true`. Each accepted run starts immediately and therefore executes concurrently up to Pi capacity; never combine roots in `runs.all`.
- Require a clean parent checkout before fanout.
- Build and validate the complete immutable request wave first. Reserve every exact canonical request in the Supers-owned Pi outbox without consuming a Factory attempt. For each root, refresh all facts, call `record_dispatch` with the exact request digest, then call `record_pi_submission_attempt` immediately before launching that request and bind Pi's real normalized workflow artifacts. Retry reads request bytes only through the profile's `get_pi_dispatch_request` trusted method and recomputes every binding; callers provide only the token and fresh attempt ID. Only explicit submission recording consumes transport budget; read-only reconciliation remains under that Factory attempt. Consume only current-outbox claim-bound handoff manifests and patch files; child prose and caller-authored JSON are not evidence.
- Integrate one queued handoff at a time while that work item is still in `implementation`. Record `change-summary` only after integration.
- Never integrate during reconciliation. Reconciliation is read-only and completion-only. Classification, deterministic verification, and the exact-bundle human gate catch objective or subjective incompleteness before reconciliation.
- Define `integratedTreeFingerprint` only as lowercase SHA-256 of the raw, unmodified stdout bytes from `git ls-tree -r -z --full-tree <integratedRevision>`.
- Route stale, malformed, or conflicting handoffs back to implementation without partially mutating the target.
- Do not start every Dex task before runner allocation. Claim only approval-bound leaves that receive a lane.

## Driver checklist

- [ ] Refresh the Factory fleet and approval-bound Delivery claims.
- [ ] Prove one selected leaf per approved effective open execution root.
- [ ] Validate the complete wave and durably reserve every exact per-root request without Factory attempts.
- [ ] Refresh, record, and top-level async-launch one isolated writer per root; bind each real Pi run receipt.
- [ ] Queue durable handoff manifest paths.
- [ ] Validate and integrate one handoff.
- [ ] Record only the concise `summary` and digest-verified, content-addressed `integrationReceipt` in `change-summary`.
- [ ] Run the deterministic bundle, including exact fanout/policy/corpus/browser/matrix receipts selected for the change.
- [ ] When rendering is affected, bind the human decision to that exact bundle; never route from Critic prose.
- [ ] Drive that work item through completion-only reconciliation and the rest of the Factory tail.
- [ ] Confirm terminal Factory state and the recorded integrated revision/fingerprint still match the clean central checkout.
- [ ] Repeat for the next queued handoff. A pending human gate pauses the entire queue.

Stop for the human when a Factory gate requires approval, several transitions are satisfied, root ancestry is ambiguous, another parent appears to own integration, or operational escalation is required. Ordinary failures use typed recovery transitions and preserve history; never reset a run as routine recovery.
