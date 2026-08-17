# Fleet driver loop

## 1. Establish central state

1. Require a clean parent checkout.
2. Load the `software-factory` skill and refresh `supers-delivery`.
3. Project active work-item ids with `swamp data query`; do not inspect `.swamp/` files directly.
4. Run the approval-bound Delivery claim saga only for leaves receiving a lane now.
5. Prove one active leaf per effective open root. Unrelated roots may coexist; ambiguous ancestry parks.

## 2. Validate and reserve the wave

For each allocated work item, read current `status-<workItem>` and construct exactly one matching workflow, method, dispatch, or interactive invocation.

For Pi work:

1. Construct one top-level request with `agent: "worker"`, `async: true`, `worktree: true`, `context: "fork"`, `artifacts: true`, the exact skills/task, strict worker output schema, and `acceptance: false`. The stable lane identity remains `factory:<root>:<leaf>` in the schema; it is not a `runs.all` key.
2. Call `checkFactoryDispatchPrerequisites`. A caller-constructed `{passed:true}` is invalid.
3. Pass the complete set of opaque plans to `coordinateFactoryPiDispatchWave`. It consumes and refreshes the complete wave, rejects duplicate roots/digests/lanes, and calls `reserve_pi_dispatch` for every root before Factory accounting.
4. A reservation stores the exact request, request digest, task digest, root, work item, stage, cycle, expected attempt, bounded transport budget, and content-addressed dispatch token. The profile re-reads current Factory work and rejects changed or caller-substituted inputs. Reservation failure consumes no Factory attempt.

Workflow/method work continues through `dispatchValidatedFactoryRequest` and the profile's `execute_work_boundary`. That is the sole execution owner and persists an exact operational failure when its real call fails.

## 3. Dispatch one root at a time

Process reserved roots in deterministic root-id order:

1. Refresh Git, Dex ancestry/blockers, dependency/tool probes, current Factory status/work, and the immutable request.
2. Call generic `record_dispatch` with `runId` equal to the exact frozen Pi request digest.
3. Make no unrelated operation between successful recording and Pi submission.
4. Invoke one top-level Pi request with `async: true` and `worktree: true`. Do not use a workflow wrapper or `runs.all`.
5. The coordinator adds only its code-owned transport preamble. It carries `SUPERS_FACTORY_DISPATCH_TOKEN`, the task digest, and the mandatory `claim_pi_execution` command. The approved semantic task remains byte-identical in the durable outbox.
6. Bind the returned real `piRunId` through `bind_pi_launch`. The profile re-reads fixed Pi `status.json` and child session artifacts; caller-authored launch JSON is never a receipt.
7. Continue to the next root. Earlier accepted workers are already running, so independent roots execute concurrently up to Pi capacity without one aggregate failure domain.

Pi's durable contract is:

- lifecycle status under the package-owned `async-subagent-runs/<piRunId>/status.json` root;
- one top-level `mode: parallel` group containing exactly one worktree worker rooted at the expected repository;
- a package-owned child session file under `~/.pi/agent/sessions/` containing the exact transport task, not only marker fragments;
- an immediate acknowledgement containing `runId` and `asyncDir` but no required run-level launch digest;
- on completion, one child status carrying the launch-contract digest, resolved extensions, exact structured-output schema path, and matching async handoff.

`scripts/factory-pi-runtime-receipt.ts` is the diagnostic wrapper around the same fixed verifier used by the profile. Unknown fields are ignored, but missing identity pauses.

## 4. Transport reconciliation

`record_dispatch` and Pi launch cannot be one distributed transaction. The durable outbox is the recovery boundary:

- Reservation only, no journal entry: discard or retry; no Factory attempt exists.
- Matching Factory dispatch journal plus an exact durable submission-attempt receipt, no Pi run after a complete fixed-root scan: mark `submission-retryable`, then read the request only through `swamp model method run supers-delivery-profile get_pi_dispatch_request --input '{"dispatchToken":"<token>"}' --json`. Recompute its request digest, task digest, and content-addressed token before recording a fresh attempt and resubmitting it under the same Factory attempt. Never accept retry request bytes or digests from the caller, and never reconcile before the prior receipt exists.
- Existing matching Pi run: bind it; never launch another because an acknowledgement was lost.
- Pi runtime root unavailable, malformed, or ambiguous: mark `submission-uncertain` and pause.
- Immediately before each actual launch, call `record_pi_submission_attempt`; only a response with `newlyConsumed: true` and its explicit `ordinal` authorizes that launch. Replaying the same submission-attempt ID returns `newlyConsumed: false` and must reconcile or bind existing state without launching. `retryFactoryPiSubmission` accepts only the dispatch token and a fresh attempt ID as retry identity; its request comes from `get_pi_dispatch_request`.
- Exact `rejected`, `failed`, or `stopped` lifecycle before an execution claim is a definite transport failure and retries only under a fresh submission-attempt ID. `paused` or unavailable lifecycle remains uncertain.
- Exact `rejected`, `failed`, or `stopped` lifecycle after the authorized claim creates launch- and claim-bound `execution-failed` evidence; run the existing failure-authorizer and operational recovery path to enter a fresh Factory cycle. Claimed `paused` lifecycle remains a human decision.
- During a lost-ack full scan, use the durable attempt timestamp plus package-owned run metadata, mission/repository identity, and exact session task. Any new unreadable candidate that cannot be ruled out is `submission-uncertain`; proven old or unrelated malformed artifacts do not block retry.
- Bounded recorded submission attempts exhausted: mark `submission-parked` for explicit human operational action. Do not reset.
- A coordinator failure while recording the submission attempt does not reconcile or launch. It returns a typed error for that root, leaves the dispatch-recorded boundary for repair, and continues unrelated roots.
- Reconciliation accepts only `submit-pending`, `submitted`, `execution-claimed`, or `handoff-ready` with the exact current attempt receipt. It rejects retryable, uncertain, parked, completed, and execution-failed state instead of reviving them from an old attempt.
- A human may call `authorize_pi_submission_retry` with `resolution: human-confirmed-no-live-run` to move an unbound uncertain or parked submission to retryable while budget remains. Exhausted budget requires a fresh Factory cycle.
- Reconciliation is read-only and never consumes transport budget or submits work itself. `factory-pi-dispatch-reconciliation` only compares outbox, Factory journal, and fixed Pi artifacts.

A rejected submission for which no Pi execution claim exists is transport failure, not Factory execution failure. Only failure after an execution claim uses the trusted current-dispatch operational failure authority and fresh-cycle Factory recovery.

## 5. Single-writer admission and handoff

Before reading or editing repository files, every worker calls:

```bash
swamp model method run supers-delivery-profile claim_pi_execution \
  --input '{"dispatchToken":"<token>","piRunId":"'"$PI_SUBAGENT_RUN_ID"'"}' --json
```

The profile verifies the current Factory journal, exact current submission-attempt receipt, and real Pi artifacts, then atomically grants one opaque claim nonce. Claim admission exists only from submit-pending or submitted state for that exact run. Any later duplicate claim is rejected and must stop without edits. Claims never expire or transfer automatically.

Only `bind_pi_handoff` may admit a handoff. It requires the dispatch token, claimed `piRunId`, exact claim nonce, handoff digest, and the final child launch-contract digest. The profile verifies Pi's normalized top-level one-worker `workflow` lifecycle and its completed inner worktree handoff, then writes a content-addressed handoff-acceptance resource. The integration gate reads the trusted current outbox, current Factory status, and acceptance resource and matches the exact Factory, token, work item, stage, cycle, attempt, run, nonce digest, handoff digest, and launch-contract digest. Caller-supplied identity fields and old-cycle acceptances are not authority. Duplicate delivery can create a disposable worktree, but only one claim and one handoff are accepted.

Queue durable handoff manifests, not prose. Require completed child state, readable patch, matching base commit, sorted unique changed paths, no protected paths, and exact claim binding. Hash manifest and patch bytes before integration.

## 6. Drain the integration queue

Use `integration-gate.md`. The central parent integrates one item at a time while it remains in `implementation`, then records only the concise `change-summary` and digest-verified integration receipt. Classification, deterministic verification, exact-bundle human aesthetic approval when required, reconciliation, postflight, and terminal handling remain serialized on the shared checkout.

Critic prose is advisory. Objective evidence routes only through its typed correlated owner. Missing evidence pauses. Human aesthetic approval binds the exact stored evidence bundle.

## Failure routes

- Prerequisite or reservation failure: no Factory attempt; repair and validate again.
- `record_dispatch` failure: harmless reservation remains; refresh before retrying.
- Submission rejection/crash/lost acknowledgement: reconcile the outbox under the same Factory attempt.
- Runtime unavailable or ambiguous: pause for human operations; do not infer no-run.
- Failure after execution claim: use the trusted operational execution-failure receipt and fresh-cycle retry budget.
- Invalid/duplicate/unclaimed handoff: reject integration and preserve evidence.
- Objective verification failure: retain the correlated objective route; generic recovery cannot consume it.
- Human approval pending: present exact stored artifacts and stop.
- Reset is only for explicit abandonment or corrupted state, never ordinary recovery.
