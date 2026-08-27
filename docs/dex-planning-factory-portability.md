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

A profile may add the generic `applicationBundle.validator` phase hook. The
compiler then declares an opaque consumer payload inside a strict bundle
envelope, requires a read-only validator before review, and routes accepted
bundles directly from review to application. The envelope says only whether
approval and Dex mappings are required. Consumer adapters own operation names,
paths, mutation policy, payload validation, and audit. Approval-free bundles
bypass the graduation gate; approval-bound bundles cross the native human gate
on the transition immediately before application.

## Lifecycle

1. `inventory` records deterministic repository facts.
2. `tracker-inventory` records related Dex work to prevent duplicate proposals.
3. `clarification` grills only unresolved judgment, or records `not-needed`.
4. `clarified-intent` fixes outcome, scope, constraints, acceptance criteria,
   and taste decisions.
5. `documentation-effects` proposes create, update, retire, or no-change effects
   without applying them.
6. `graph-proposal` records a normalized Dex graph. A bundle-enabled consumer
   also records the complete application preview; non-Dex routes may use an
   empty graph.
7. Bundle-enabled profiles run their read-only validator before review.
8. `plan-review` stores independent findings and an accept, revise, reject, or
   park verdict over the full preview.
9. Legacy profiles cross the current-cycle native human gate into `approval`,
   which records an exact `approved-plan`. Bundle-enabled profiles route
   approval-free work directly to application or require that gate immediately
   before application.
10. `plan-application` invokes the consumer workflow. In bundle mode the
    workflow records the exact reviewed plan before applying the validated
    payload; in legacy mode it calls the fan-out Plan Applier with only `plan`.
11. `planning-audit` verifies the applied effects before `handoff` records the
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
  `@club_aqua_back_deck/dex-planning-factory@2026.08.27.1`;
- `supers-planning` is the compiled
  `@swamp/software-factory@2026.06.24.1` target.

Six declarative workflows implement the repository seams without shelling
around a typed model: `supers-planning-inventory`,
`supers-planning-tracker-inventory`, `supers-planning-documentation-effects`,
`supers-planning-validate-promotion-bundle`,
`supers-planning-apply-approved-plan`, and `supers-planning-audit`. The validator
binds one complete capture, Idea-to-Roadmap, Roadmap-to-Planning, or
Planning-to-Dex preview to the immutable source chain. Capture requires neither
graduation approval nor Dex tasks. The other routes require native current-cycle
human approval immediately before application; only Planning-to-Dex permits a
non-empty graph.

The application workflow revalidates the preview, records the exact reviewed
plan, and calls `supers-planning-promotion.apply-promotion`. That orchestrator
dispatches to one of four strict recoverable handlers. `repo-audit` normalizes
authority, cleanup, failure guidance, and optional Dex mappings into the
portable application artifact. The audit workflow verifies the content-addressed
promotion receipt and reads official Dex only for Planning-to-Dex.

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
