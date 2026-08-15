# Serialized handoff integration gate

Run this gate for exactly one queued Pi handoff. The central parent is the only integration owner. Feed the derived non-mutating facts into `verifyFactoryHandoffIntegrationGate` from `scripts/factory-handoff-integration-gate.ts`; only its accepted result may proceed to target mutation.

## Validate without target mutation

1. Read the durable Pi handoff manifest and patch as bytes. Compute their SHA-256 digests.
2. Strictly validate the selected manifest child and structured output:
   - allocated effective execution root and active task ids match;
   - status is `completed`;
   - manifest `baseCommit` equals structured `baseCommit`;
   - patch is marked changed and its path is readable;
   - structured `childCommittedRevision` exists as a Git commit;
   - the diff from `baseCommit` to `childCommittedRevision` is byte-equivalent to the captured patch after the same normalization used by Pi;
   - changed paths derived from the patch equal the sorted, unique structured paths.
3. Require `baseCommit` to be an ancestor of the current target. A handoff from unrelated or rewritten history is stale.
4. Capture the current target HEAD as `targetBaselineRevision`. Require a clean target index and worktree.
5. Run a non-mutating three-way applicability check against an alternate temporary index: set `GIT_INDEX_FILE`, load the captured target with `git read-tree`, then run `git apply --cached --3way <patch>`. Remove the temporary index afterward. Do not rely on `git apply --check --3way`; it can report success even when the real three-way apply would conflict. A non-zero alternate-index apply rejects the handoff.
6. Immediately re-read target HEAD and status. They must still equal the captured baseline and clean state.

Do not trust a child summary, branch name, patch filename, or claimed commit without these checks.

## Mutate once

1. Apply the already-checked patch without `--reject`.
2. Recompute changed paths from the target and require the exact validated set.
3. Run the work item's focused checks when they are safe before classification; classification and full Factory verification still follow.
4. Commit only this handoff.
5. Record:
   - integrated revision (`HEAD`);
   - integrated tree fingerprint from the exact command `git ls-tree -r -z --full-tree <integratedRevision>`: hash stdout bytes directly with SHA-256, preserve every NUL byte, perform no text decoding or newline/path normalization, and encode the digest as lowercase hex;
   - verified child revision evidence;
   - manifest and patch digests;
   - base commit and captured target baseline;
   - sorted changed paths.
6. Require `childRevisionEvidence.status: "verified"` and the exact verified child committed revision. Compute `receiptId` from the canonical receipt without `receiptId`, then validate its content address with `verifySupersFactoryIntegrationReceipt`.
7. Record the integrated receipt in Factory `change-summary`. Classification now measures the integrated shared checkout.

If the apply fails despite the precheck, stop. Confirm the target is unchanged and clean. If it is not, preserve the state for manual recovery; do not continue or integrate another handoff.

## Rejected receipt

Use `disposition: "rejected"` with one closed reason:

- `manifest-invalid`
- `stale-target-baseline`
- `patch-digest-mismatch`
- `child-revision-mismatch`
- `changed-path-mismatch`
- `patch-conflict`

Set unavailable base/patch/integration values to `null`; never manufacture them. Only a rejected receipt may use `childRevisionEvidence.status: "not-provided"`. A rejected receipt is driver evidence for rework, not a valid `change-summary.integrationReceipt`.

## Anti-patterns

| Wrong                                        | Correct                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Parallel writers in the parent checkout      | One Pi worktree writer per approved effective execution root                                                                   |
| Apply all completed patches at once          | Validate and integrate one, then drive its Factory tail                                                                        |
| Integrate during reconciliation              | Integrate in implementation before `change-summary`                                                                            |
| Add Supers lease methods to `@swamp/git`     | Use Pi's existing managed worktrees and handoff manifest                                                                       |
| Start every ready Dex task before launch     | Claim only work receiving a runner lane                                                                                        |
| Treat successful fanout as integration proof | Keep filesystem-isolation proof separate from stale-base, digest, revision, path, drift, and conflict integration-safety proof |
