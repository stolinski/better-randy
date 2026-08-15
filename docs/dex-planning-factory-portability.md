# Portable Dex Planning Factory

`@club_aqua_back_deck/dex-planning-factory` compiles repository policy into a
human-gated `@swamp/software-factory` profile. The compiler defines the
lifecycle and strict artifacts; consumers provide typed adapters and prompts.

## Boundary

Planning gathers facts and proposes documentation and Dex effects. Before
approval, inventory, tracker, and documentation-policy adapters must declare
`readOnly: true`; audit is also read-only and runs after application. The
compiler exposes no documentation writer and emits no pre-approval write-adapter
slot. The plan-application workflow is unreachable until an independent review
is clear and the current proposal receives the native human approval gate.

`readOnly: true` is a consumer capability attestation, not workflow sandboxing:
Factory cannot inspect an arbitrary workflow's transitive effects. A conforming
consumer must prove those adapters read only through adapter tests and review.
Mislabeling a mutating workflow violates the profile contract; the compiler does
not claim to contain malicious consumer configuration.

The profile ends with a typed planning handoff. It does not start Delivery;
repository-specific ready-leaf ownership and dispatch belong to a later handoff
workflow.

## Lifecycle

1. `inventory` records deterministic repository facts.
2. `tracker-inventory` records related Dex work to prevent duplicate proposals.
3. `clarification` grills only unresolved judgment, or records `not-needed`.
4. `clarified-intent` fixes outcome, scope, constraints, acceptance criteria,
   and taste decisions.
5. `documentation-effects` proposes create, update, retire, or no-change effects
   without applying them.
6. `graph-proposal` records a complete normalized Dex graph.
7. `plan-review` stores independent findings and an accept, revise, reject, or
   park verdict.
8. A current-cycle native human approval admits the proposal to `approval`;
   stale decisions cannot approve or reject a revised cycle.
9. `approval` records an exact-equality copy as `approved-plan`.
10. `plan-application` passes that approved graph through CEL to a typed
    workflow. The workflow calls the fan-out Plan Applier with only `plan` and
    normalizes its checkpoint, receipt, and result resources into the strict
    Factory artifact.
11. `planning-audit` verifies the applied graph before `handoff` records the
    terminal planning outcome.

Every work stage has explicit cycle and dispatch limits. Rejected, parked,
failed-apply, failed-audit, aborted, and done are distinct terminal outcomes.

## Normalized approved plan

The pinned Factory schema language cannot represent a discriminated
`create | attachExisting` union. The approved artifact therefore stores two
strict arrays:

- `createTasks` with normalized `parentKind` and `parentClientRef` fields;
- `attachExistingTasks` with normalized selector, expected snapshot, parent, and
  dependency fields.

A compiler-owned CEL expression deterministically assembles the Plan Applier
union at the method boundary. The emitted input schema checks the shared
envelope, and `dex-plan-applier` performs its strict Zod and graph validation
again before mutation. This keeps both approved variants typed without weakening
the human-reviewed artifact.

## Consumer contract

A profile supplies:

- read-only inventory, tracker, documentation-policy, and audit adapters;
- one plan-application workflow that accepts compiler-owned `workItem` and
  `plan`, calls the strict Plan Applier `apply-plan` method with only `plan`,
  and records normalized checkpoint/receipt/result evidence on both semantic
  success and failure;
- clarification, intent, proposal, review, approval-recording, and handoff
  prompts;
- one required human approval gate;
- explicit cycle and per-cycle dispatch budgets.

Adapter input values require matching declared schemas. `workItem` and the
approved `plan` binding are compiler-owned and cannot be overridden. Workflow
gates require exact artifact and evidence step outputs; method gates require
cycle-scoped succeeded evidence. `clarified-intent.documentationDirectives` is
the repository-neutral handoff to documentation policy: the planning agent
states at least one typed `create | update | retire | no-change` directive, and
the repository adapter validates paths and policy before emitting
`documentation-effects`. Planning inventory must also publish an immutable
`sourceSnapshotName` and `sourceSnapshotFingerprint`. Tracker inventory carries
that snapshot fingerprint plus the planning-inventory fingerprint; documentation
effects carries the snapshot, inventory, tracker, and clarified-intent
fingerprints. Consumer wrappers must resolve the named snapshot from the current
Factory artifact, never a process-wide `latest` resource.

See `fixtures/dex-planning-factory-consumer/profile.json` and
`lifecycle-paths.json` for a repository-neutral profile and clean, revised,
rejected, parked, and failed-apply paths.

## Supers materialization

Supers materializes that contract as two repository-local models:

- `supers-dex-planning-factory` compiles
  `fixtures/dex-planning-factory-consumer/supers-profile.json` with
  `@club_aqua_back_deck/dex-planning-factory@2026.08.06.1`;
- `supers-planning` is the compiled 17-stage
  `@swamp/software-factory@2026.06.24.1` target.

Five declarative workflows implement the repository seams without shelling
around a typed model: `supers-planning-inventory`,
`supers-planning-tracker-inventory`, `supers-planning-documentation-effects`,
`supers-planning-apply-approved-plan`, and `supers-planning-audit`. Each
workflow records both the exact Factory artifact and its correlated result
evidence. The application workflow passes only its compiler-owned `plan` input
to `supers-dex-plan-applier.apply-plan`; it then normalizes checkpoint, receipt,
result, mapping, retry, and coded failure fields through
`repo-audit.normalize-plan-application`. The audit workflow calls
`repo-audit.audit-planning-application`, which reads official Dex once and
verifies every client reference, task id, disposition, content field, parent,
and blocker before handoff.

A live materialization probe reached `plan-review` through all three read-only
wrappers. With clear findings and an accept verdict, `approve` still failed
solely on `planning-approval (0/1)`; the probe was then parked. No approval or
Dex mutation occurred. Application success/failure normalization and fresh
mapping audits are covered with typed fixtures, including recoverable failure
receipts and graph drift.

## Repository Delivery handoff

Planning remains terminal and data-only. The separate
`supers-planning-delivery-handoff` workflow validates the exact graph proposal,
`approved-plan` copy, native `planning-approval` decision, successful Plan
Applier mappings, clean planning audit, and terminal `planning-handoff`. It
compacts those resources into an HMAC-authorized approval carrying fingerprints
of the full proposal, approved plan, human decision (including actor),
application, audit, and terminal handoff plus the mapped epic boundary and
audited task ids. The signing key is shared only through the audited local Swamp
vault by `supers-delivery-handoff-authorizer` and
`supers-dex-delivery-handoff-authorized`. The workflow alone resolves the same
vault value as a sensitive claim capability, so invoking the published method
with a caller-minted checksum or oracle-produced signature cannot cross the Dex
boundary.

The `supers-dex-delivery-handoff-authorized` model then runs `claim-next-ready`
under the same canonical repository-wide Dex lock used by all mutations. It
first scopes active `supers-delivery` work items and started tasks to the
approved effective open execution root, including repair of interrupted tracker
start. Ancestry stops at a completed parent, which remains historical context,
so its open child begins a new execution root and may itself be the ready leaf.
With no owner inside that root the model recomputes its runway from one bounded,
strict `dex list --all --json` snapshot. Same-root ties or multiple owners,
unknown or cyclic open ancestry, unknown blocker ids, inherited open blockers,
missing or completed boundaries, and candidates outside the approved mappings
return typed `human-gate` or `no-ready-work` as appropriate. Only the unique
highest-priority approved leaf in that root is started. Independently approved roots may claim and run concurrently; the
repository lock serializes only the short Dex mutation.

Dex and Factory cannot share an ACID transaction, so the workflow is an
idempotent saga: a deterministic claim/outbox resource precedes an
`allowFailure` Factory start, and `normalize-delivery-handoff` requires the
selected id to converge to exactly one active Factory state. A competing retry
sees the already-started Dex task, reuses the same claim identity, and converges
instead of selecting a second leaf. Planning never invokes this workflow and
never starts Delivery itself.
