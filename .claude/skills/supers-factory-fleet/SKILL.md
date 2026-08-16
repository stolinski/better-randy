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
- Launch independent writers together in one Pi `runs.all` call with `worktree: true`. Do not impose a product lane limit; runtime capacity schedules the set.
- Require a clean parent checkout before fanout.
- Record Factory dispatch before work. Consume Pi handoff manifests and patch files after work; child prose is not evidence.
- Integrate one queued handoff at a time while that work item is still in `implementation`. Record `change-summary` only after integration.
- Never integrate during reconciliation. Reconciliation is read-only and completion-only. Classification, deterministic verification, and the exact-bundle human gate catch objective or subjective incompleteness before reconciliation.
- Define `integratedTreeFingerprint` only as lowercase SHA-256 of the raw, unmodified stdout bytes from `git ls-tree -r -z --full-tree <integratedRevision>`.
- Route stale, malformed, or conflicting handoffs back to implementation without partially mutating the target.
- Do not start every Dex task before runner allocation. Claim only approval-bound leaves that receive a lane.

## Driver checklist

- [ ] Refresh the Factory fleet and approval-bound Delivery claims.
- [ ] Prove one selected leaf per approved effective open execution root.
- [ ] Record dispatch for each allocated implementation lane.
- [ ] Launch one isolated writer per root with strict structured output.
- [ ] Queue durable handoff manifest paths.
- [ ] Validate and integrate one handoff.
- [ ] Record only the concise `summary` and digest-verified, content-addressed `integrationReceipt` in `change-summary`.
- [ ] Run the deterministic bundle, including exact fanout/policy/corpus/browser/matrix receipts selected for the change.
- [ ] When rendering is affected, bind the human decision to that exact bundle; never route from Critic prose.
- [ ] Drive that work item through completion-only reconciliation and the rest of the Factory tail.
- [ ] Confirm terminal Factory state and the recorded integrated revision/fingerprint still match the clean central checkout.
- [ ] Repeat for the next queued handoff. A pending human gate pauses the entire queue.

Stop for the human when a Factory gate requires approval, several transitions are satisfied, root ancestry is ambiguous, or another parent appears to own integration.
