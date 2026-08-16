# Project control plane

The generated project control plane keeps the planning tiers —
`docs/roadmap.md`, `docs/adr/`, `docs/briefs/`, `docs/ideas/` + `docs/history/`,
and the dex task graph — mechanically reconciled with shipped implementation. It
grew out of the 2026-08-04 baseline reconciliation (dex `6qlggrda`) and is
executed by the Swamp workspace (dex epic `t040a0vs`).

## The audits

All four repo audits are methods on the `@supers/repo-audit` Swamp model
(`extensions/models/repo-audit.ts`); each stores a schema'd, versioned,
CEL-queryable resource. A method **succeeds whenever the audit ran** — findings
are data; the workflow assert steps are what turn findings into a red run.

| Method           | Script                               | Resource          | Checks                                                                                |
| ---------------- | ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| `audit-timing`   | `scripts/audit-timing-coverage.ts`   | `timing-latest`   | Every fraction-timed schema field is rescaled by `rescaleCompositionTimings`          |
| `audit-tracking` | `scripts/audit-tracking-coverage.ts` | `tracking-latest` | Every `surface.content` schema field is read by the authoring-dependency tracker      |
| `audit-parity`   | `scripts/audit-inspector-parity.ts`  | `parity-latest`   | GUI↔agent parity — schema fields have GUI editors; param-bearing effects ship Editors |
| `audit-planning` | `scripts/audit-planning-state.ts`    | `planning-latest` | Planning-state drift (below)                                                          |

The same model captures a work-item-keyed `change-baseline` HEAD before
implementation. `classify-change(workItem)` then unions committed paths in
`baselineHead...HEAD` with NUL-delimited tracked, staged, deleted,
renamed/copied, and untracked working-tree paths. Its work-item-keyed report
carries `baselineHead`, a content-sensitive `treeFingerprint`, and conservative
verification lanes; an empty change set still selects `policy-sweep`. No agent
supplies paths or re-records the report.

## Objective render matrices

`@supers/render-matrix-verification` owns browser/GPU verification separately
from the static corpus model. Its single `verify-render-matrix` method derives
an immutable live deliverable-Preset and Pack snapshot, binds every coordinate
to the content-sensitive tree fingerprint, and fans out internally by
Preset × Pack × orientation with concurrency two. Every cell retains all 18
closed objective checks. Missing signals are `unavailable`; aesthetic
observations remain advisory with no routing authority. The method checks the
local and served checkout before and after capture and rejects stale registry,
source, cell, or evidence identities before storing the bundle.

Two generated workflows define the operational boundary:

- `supers-verify-affected-render-cells` consumes the canonical `change-impact`
  paths for the exact work item and fingerprint. It unions narrow Preset, Pack,
  and typed Pipeline impacts, expands unknown pixel-affecting paths to the full
  matrix, and records `not-applicable` only for proven non-render changes.
- `supers-verify-full-render-matrix` enumerates the exact live deliverable
  Preset × Pack × horizontal/vertical × deterministic-sample cross-product. It
  is the root-epic completion gate, not a replacement for human visual review.

Both workflows assert change state before and after the one model call and gate
only the `render-matrix-run` resource tagged with their own workflow run id.
Read retained evidence without changing its verdict:

```bash
swamp workflow run supers-verify-affected-render-cells \
  --input workItem=<dex-id> \
  --input expectedFingerprint=<change-impact-treeFingerprint>
swamp workflow run supers-verify-full-render-matrix \
  --input workItem=<root-epic-or-leaf-id> \
  --input expectedFingerprint=<change-impact-treeFingerprint>
swamp report get @supers/render-matrix --model supers-render-verification --markdown
swamp report get @supers/render-matrix --model supers-render-verification --json
```

## The planning-state audit

`scripts/planning-state-checks.ts` holds the pure check logic (fixture-tested in
`scripts/planning-state-checks.test.ts`, wired into `test:structural`);
`scripts/audit-planning-state.ts` assembles real inputs from the repo docs, the
built-in Preset listing (`kind: deliverable | fixture`), and the dex graph — via
the dex CLI when installed, falling back to the committed `.dex/tasks.jsonl`
store (CI has no dex binary).

Gating findings (`clean: false`, exit 1):

- **`adr-index-coverage`** — every `docs/adr/NNNN-*.md` has an index row and
  every index row resolves to a file.
- **`adr-status-drift`** — each ADR's `## Status` line classifies as Canon /
  Build-harness / Superseded / Designed (prefix-matched), and the index row's
  category agrees with the file's.
- **`roadmap-adr-reference`** — every ADR the roadmap references exists.
- **`roadmap-ship-claim`** — no roadmap line claims shipped work (✅ /
  **shipped**) against an ADR still categorized "Designed, not built".
- **`stale-brief`** — no Brief targets (by filename slug, `**Slug:**`, or
  declared verification preset) a preset that ships as `kind: "deliverable"` —
  the [Brief invariant](briefs/README.md) requires a separately classified
  retirement change when the declared boundary ships.
- **`ideas-inventory`** — `docs/ideas/` and `docs/history/` folder contents
  match their README indexes exactly.
- **`ideas-historical`** — no idea doc self-declares shipped/complete status;
  historical explorations belong in `docs/history/`.
- **`dex-shipped-claim`** — no _open_ task claims completion in its **name** (✅
  / all-caps COMPLETE / SHIPPED / DONE).
- **`dex-blocker-contradiction`** — no _completed_ task is still edge-blocked by
  an open task.
- **`dex-graph-invalid`** — unknown blocker ids and missing or cyclic ancestry
  in the open graph fail closed and never enter a lane. A completed parent is
  historical context: its open child begins a new effective execution root.
- **`dex-active-work`** — at most one open leaf task is started inside each
  effective open execution root; independent roots may run concurrently in
  isolated lanes.
- **`dex-ready-runway`** — at most one un-started ready leaf holds the top
  priority inside each effective open execution root. Co-equal leaves in
  different roots are valid concurrent lanes; co-equal leaves in one root
  require ordering. A leaf that inherits an open ancestor blocker is a gating
  runway finding, not ready work.

Advisories (reported, never gating): completion markers in an open task's
_description_ — a half-shipped grab-bag needs human judgment, not an automatic
red. An open task whose blocker completed is dex-normal and not flagged at all.

## Running and reading it

```bash
npm run audit:planning                                        # direct; exit 1 on findings
swamp model method run repo-audit audit-planning              # store the versioned resource
swamp report get @supers/planning-state --model repo-audit    # findings + advisories with repo paths / dex ids
swamp workflow run policy-sweep                               # all five checks + assert steps as one DAG
swamp workflow run factory-policy-sweep --input workItem=<id> --input evidenceName=preflight-run
```

The `@supers/planning-state` report extension
(`extensions/reports/planning-state.ts`, attached as a `@supers/repo-audit` type
default) renders each finding with its actionable paths — repo file paths for
doc drift, `dex:<id>` entries for graph drift. On a red run the structured
resource is still stored, so the report names exactly what to fix.

`planning-latest.runway` is the typed read-side runway preview. Its authoritative
`activeLanes[]` and `readyLanes[]` preserve every effective open execution root
and that root's one active or unique highest-priority unstarted leaf. The schema
retains `rootEpicId` as the established user-facing compatibility field. The singular active/next
fields remain deterministic compatibility projections only; they never select
or authorize a lane. `readyLeafCount` remains the total across roots. Planning
inventory consumes the complete arrays instead of reparsing roadmap prose. The
preview is not mutation authorization: Delivery refreshes Factory fleet state
and recomputes the strict official-Dex runway inside the repository lock before
any claim.

### Planning Factory read adapters

`@supers/repo-audit@2026.08.06.2` also owns the repository-specific, read-only
adapters used by the reusable Dex Planning Factory:

- `collect-planning-inventory` receives `planning-latest.runway` as typed model
  data, reads the Roadmap, ADR index/statuses, active Briefs, ideas/history
  indexes, and official `dex list --all --json` exactly once, then writes
  `supers-planning-source-snapshot` plus the bounded `supers-planning-inventory`
  artifact;
- `derive-tracker-inventory` consumes that stored source snapshot through CEL
  and identifies current, ancestor, descendant, dependency, and lexical
  duplicate candidates without re-reading Dex;
- `propose-documentation-effects` consumes the stored snapshot plus
  `clarified-intent.documentationDirectives`, validates canonical Supers
  planning-tier paths and index-update obligations, and stores a typed
  `create | update | retire | no-change` proposal without writing a document;
- `normalize-plan-application` validates the Plan Applier
  checkpoint/receipt/result chain and preserves exact client-reference mappings
  or a coded retry disposition in the Factory artifact;
- `audit-planning-application` reads official Dex once after successful
  application and verifies mapped task identity, disposition, content,
  hierarchy, blockers, and documentation proposal integrity.

Every resource is strict, versioned, content-fingerprinted, and stored under an
immutable work-item/fingerprint-scoped name. The collector is the only
pre-approval source read; its Factory inventory artifact carries
`sourceSnapshotName` and `sourceSnapshotFingerprint`, and downstream workflows
resolve exactly that named resource rather than a process-wide latest snapshot
or shell reconstruction. Each derived artifact carries and checks its upstream
fingerprints. Planning documents and Dex remain unchanged until the separate
approved-plan and Delivery boundaries.

### Planning-item promotions

`@supers/planning-promotion` is the repository mutation boundary for the
document-only part of the planning lifecycle. One stable `planningItemId`
follows a work item through `capture-idea`, `idea-to-roadmap`, and
`roadmap-to-planning`. Capture is idempotent and needs no graduation approval;
reject and park are explicit no-ops. Promotions bind source and destination
revisions, index edits, and source deletion in one digest.

The applier shares the repository lock with Dex writes and records a durable
roll-forward journal: `prepared → destination-written → destination-verified →
committed → source-cleaned → audited`. The source remains authoritative until
commit. Recovery accepts only the approved preimage or already-applied
postimage, so it never overwrites later work. Source, destination, and index
paths must be distinct. Planning-to-Dex remains composed with the existing Dex
Plan Applier rather than being exposed as a second direct mutation path.

This is routine Swamp control-plane behavior, defined by typed contracts,
schemas, tests, and this current-state document. It does not require an ADR.

The concrete control plane is the `supers-dex-planning-factory` compiler model
plus the materialized `supers-planning` Factory. Its five wrappers are
`supers-planning-inventory`, `supers-planning-tracker-inventory`,
`supers-planning-documentation-effects`, `supers-planning-apply-approved-plan`,
and `supers-planning-audit`. The application wrapper invokes
`supers-dex-plan-applier.apply-plan` with only the compiler-owned `plan`; all
Factory context and normalization stay outside that strict mutation method.
`fixtures/dex-planning-factory-consumer/supers-profile.json` is the checked-in
consumer profile used to materialize the 17-stage lifecycle.

## Delivery factory

The `supers-delivery` `@swamp/software-factory` instance is the controller above
these audits. Its generic lifecycle is compiled by the local
`supers-delivery-profile` instance of
`@club_aqua_back_deck/dex-software-factory`; Supers supplies only the policy
adapters and typed artifact extensions. The separate `supers-dex-task-tracker`
instance owns normalized Dex operations and receipts. The
`supers-dex-delivery-handoff-authorized` instance extends that typed tracker
boundary with HMAC-authorized `claim-next-ready`; the
`supers-planning-delivery-handoff` saga validates human-approved Planning
provenance, resumes active Factory ownership inside the approved effective open
execution root before selection, and converges each root to at most one Factory state. Other roots may
claim independently under the same short repository lock. One Factory instance
serves many Dex work-item ids concurrently; leaf ids remain Factory work items. It does not own roadmap, ADR, Brief,
idea/history, or task prose; it records only compact execution artifacts and
evidence.

Its path is
`preflight baseline capture → isolated implementation → serialized parent integration → change-summary → workflow-owned classification → deterministic verification route → exact-bundle human aesthetic gate when rendering is affected → reconciliation → postflight → terminal Dex cleanup`.
The project fleet driver is [`.claude/skills/supers-factory-fleet/SKILL.md`](../.claude/skills/supers-factory-fleet/SKILL.md).
It launches one Pi-managed worktree writer per approved root, with no fixed
product lane cap, then queues durable Pi handoffs. The single parent validates
and integrates one patch while that work item is still in implementation. The
parent records the canonical integration receipt in `change-summary` before
classification. Reconciliation never integrates or otherwise mutates the
repository.

Classification unions `baseline..HEAD`, staged/unstaged/deleted files, and untracked files, then seals a content-sensitive tree fingerprint. The deterministic Delivery workflow correlates the exact hash-named fanout resource, its content digest and workflow run, and canonical affected render matrix/report evidence to that fingerprint. The canonical `policy-sweep` first binds exact policy/corpus resource names, clean states, content digests, workflow identity, workflow run id, and an execution digest before its assertion steps can make that child run red. Delivery continues after the closed assertion result and accepts only the bound policy execution whose routing run is the current verification run; internally consistent stale sets and renamed copies are rejected. A completed render matrix never substitutes for a selected browser lane. The trusted router derives one closed disposition: verified policy, corpus, command, or render failures may route automatic rework; unavailable, stale, mismatched, incomplete, duplicate, extra, zero-signal, or unexecuted required-lane evidence pauses in `evidence-unavailable`; a passing affected matrix pauses the whole serialized queue for exact-bundle human aesthetic approval; proven render non-applicability reconciles directly. Mixed failure plus unavailable evidence remains unavailable. Critic observations are advisory only and appear in no gate CEL. Reconciliation is completion-only and cannot route subjective or prose-controlled rework. Postflight first asserts the classified tree fingerprint, then runs
policy. Only the generated `terminal-cleanup` stage calls the typed tracker
`complete` method with CEL-bound reconciliation data; no Factory stage embeds a
Dex shell command.

The compiler output is a build-time materialization artifact. The Factory engine
reparses raw definition arguments, so top-level stages cannot be dynamically
injected from `data.latest(...)`. After changing `supers-delivery-profile`,
compile and materialize it; the materializer preserves the Factory id, tags,
reports, and methods, changes only `globalArguments`, and increments the
definition version only when the graph changes:

```bash
swamp model method run supers-delivery-profile compile
deno run --allow-run --allow-read --allow-write scripts/materialize-dex-software-factory.ts \
  supers-delivery-profile models/@swamp/software-factory/90fac686-c724-4aee-97c4-e31b9af4c5e2.yaml \
  supers-dex-delivery
swamp model validate supers-delivery
```

Start or resume from the machine runway:

```bash
swamp data query 'modelName == "repo-audit" && name == "planning-latest"' --select attributes.runway --json
swamp model method run supers-dex-task-tracker start --input taskId=<dex-id>
swamp model method run supers-delivery start --input workItem=<dex-id>
swamp model method run supers-delivery status --input workItem=<dex-id>
```

The Factory status record is the execution contract. Drivers project only the
current work, satisfied transitions, and failing gate reasons; they do not load
the entire run history into model context. Because classification, render
verification, postflight, and completion inspect the shared target checkout,
the current driver completes that serialized Factory tail before integrating
the next queued handoff. Parallelism applies to isolated implementation lanes,
not simultaneous mutation or verification of one target checkout.

## Factory effectiveness

`@mgreten/software-factory-flow-metrics` runs alongside the built-in work-item
summary whenever `supers-delivery.summary` runs. It deterministically derives
per-run and cross-run flow metrics from Factory state, journals, artifacts,
evidence, and approvals: time to terminal, stage durations and yield, dispatch
attempts, first-pass acceptance, review/patch frequency, human decisions,
cleanup failures, parks, aborts, and cycle-limit overrides. Every value carries
source pointers and an availability label; missing facts stay `unavailable`
rather than becoming false zeroes.

```bash
swamp model method run supers-delivery summary --input workItem=<dex-id>
swamp report get @mgreten/software-factory-flow-metrics --model supers-delivery --json
```

The Prime Agent `factory-cockpit` extension is checked in project-locally and
loaded globally on this Mac. It records a bounded, home-scoped NDJSON ledger of per-turn tokens and cost, cache reads/writes, provider
payload byte size, context use, tool duration/failures, compactions, visible
skill metadata cost, route-overlap candidates, and inferred skill use. It stores
no prompt, response, tool payload, repository path, session path, or work-item
id. Session paths are one-way fingerprints. Optional Factory name/profile/stage/
definition dimensions come only from bounded driver environment variables. At each `agent_end`, the extension submits only the current numeric batch to
`supers-factory-sentry-metrics.emit_agent_telemetry` through non-interactive
Swamp stdin. The model reuses its existing vault-backed DSN, emits bounded
Application Metrics plus a `gen_ai.agent` transaction, flushes, and stores an
idempotent local `agent-receipt`; the extension never reads the DSN. Emission is
best-effort and cannot become a Factory delivery dependency. Prime Agent's common
usage contract does not expose reasoning tokens separately, so coverage is
explicitly emitted as zero.

The flow report measures how safely and efficiently work moved through the
Factory. It does not by itself prove that shipped behavior remained healthy.
Sentry supplies that later outcome signal, under these attribution rules:

The same available flow measurements should also be emitted to Sentry
**Application Metrics** so their trends live beside Supers errors, logs, and
traces. Application Metrics are independent of trace sampling and support
counters, gauges, and distributions in the installed `@sentry/sveltekit` SDK.
The bounded vocabulary is:

| Metric                          | Type         | Value / bounded attributes                                                                           |
| ------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `factory.run.completed`         | count        | `1`; outcome, project, factory, profile, definition version, accepted-first-pass, visual-review-used |
| `factory.run.duration`          | distribution | terminal duration in milliseconds; outcome, project, and factory                                     |
| `factory.stage.duration`        | distribution | stage duration in milliseconds; project, factory, and stage id                                       |
| `factory.run.dispatch_attempts` | distribution | attempts per run; project, factory, and outcome                                                      |
| `factory.run.human_decisions`   | distribution | distinct decisions per run; project, factory, and outcome                                            |
| `factory.run.patch_cycles`      | distribution | patch cycles per run; project, factory, and outcome                                                  |
| `factory.run.cleanup_failure`   | count        | `1` only for cleanup-required outcomes; project and factory                                          |
| `factory.metric.coverage`       | gauge        | `1` available / `0` unavailable; one bounded `metric` attribute                                      |

All Factory telemetry goes to one dedicated Sentry project so dashboards compare
repositories directly. Every metric carries four shared, bounded attributes:
`factory.project` (an explicit stable project slug such as `better-randy`, never
inferred from an absolute path), `factory.name` (the local Factory instance),
`factory.profile` (the reusable profile name/version), and
`factory.definition_version`. Never attach work-item ids, changed paths, error
text, capture paths, actor identities, repository URLs, or other unbounded
values. Emit only after a terminal run, preserve the Swamp report as the source
of truth, and flush the buffered SDK before the short-lived emitter exits.
Sentry is the trend surface, not the canonical lifecycle store or a Factory
gate.

- **Contained development defect:** a new issue first appears between Factory
  start and verification, overlaps a changed path, and has no occurrence after
  the final verification evidence. It is useful learning, not an escape. A
  still-open Sentry status is hygiene debt but does not override the event
  timeline.
- **Escaped defect candidate:** an issue first appears after terminal completion
  and overlaps a changed path. Confidence becomes high only when the Factory
  records a commit and the Sentry event's `release` / `git.release` matches
  `supers@<sha>`; without that release link it remains a candidate.
- **Pre-existing:** the issue predates Factory start, regardless of later
  occurrences, unless a post-change release materially increases its event rate.
- **Unattributed:** no changed-path overlap, no trustworthy observation window,
  or an uncommitted dirty tree carrying an older HEAD release. Unattributed
  events are reported, never charged to the work item.

Sentry is local-development telemetry for Supers, not production-user telemetry.
Error counts therefore need an exposure denominator (traces or relevant
route/export attempts); raw counts alone mostly measure how much the app was
exercised. Performance comparisons require the same operation and route,
release-linked samples, and a minimum sample count before reporting a p50/p95
delta. Missing release, denominator, or sample volume must remain `unavailable`.

The field-ink run demonstrates the distinction: `SUPERS-16` occurred once in
changed `preset-rubric.ts` during implementation, stopped before final
verification, and final browser checks passed. Because the dirty working tree
was tagged with the previous HEAD, it is a medium-confidence
contained-development candidate, not evidence of an escaped release defect.

The local `@club_aqua_back_deck/software-factory-sentry-metrics` model is the
single Sentry network boundary. It rebuilds trusted facts from
`@mgreten/software-factory-flow-metrics`, emits through the Sentry SDK using a
vault-backed DSN, flushes before exit, and records a versioned local receipt.
It emits outcome and duration metrics plus bounded stage visits, stage
dispatches, time-to-gate, human touches, approvals, rejections, cycle overrides,
and exact failed-terminal-stage counters. It also reconstructs one `factory.run`
transaction with explicit-time `factory.stage` spans from the durable terminal
journal. Missing facts remain explicit coverage zeros rather than invented values.

Observability is part of both Factory lifecycles. Every `supers-delivery` and
`supers-planning` terminal route first enters an outcome-specific observability
stage. The configured terminal-observability workflow advances to the durable
terminal state, persists the built-in and canonical flow reports, invokes
`emit_flow_report` as an `allowFailure` step, then runs `verify_flow_receipt`.
The receipt check writes `observed`, `degraded`, or `missing` coverage and fails
the observer workflow when Sentry did not emit, but it runs only after the
Factory is already terminal, so observability availability cannot change the
Factory outcome. An emitted or duplicate receipt is required for a clean
observer workflow. No separate manual telemetry command is part of the normal
path.

Do not wrap the Sentry CLI in `command/shell`, send metrics from a report
extension, or make transition into a terminal Factory state depend on Sentry
availability. The legacy `factory-terminal-summary` workflow is retained only
for historical receipt recovery and is not an authoring or operations path.

## Gates

- **`policy-sweep` workflow** (`workflows/workflow-5eb573fe….yaml`) — five
  collection methods fan out, then the canonical Delivery receipt is bound for
  the exact current run before one assert per resource turns findings into a red
  child run. Delivery can therefore retain closed failures as route evidence.
- **`factory-policy-sweep`** — runs policy, captures the work-item baseline,
  then records correlated preflight evidence with `run.id`.
- **`factory-classify-change`** — classifies trusted Git state, then records the
  exact current-run report and evidence inside one workflow.
- **`supers-delivery-deterministic-verification`** — rejects tree-fingerprint drift, runs canonical policy and static corpus gates, executes the selected check/unit/structural commands through one fan-out method, verifies the affected render matrix, and records only the router-derived disposition.
- **`supers-bind-human-aesthetic-decision`** — binds the current-cycle human approval identity to the exact work item, integrated revision and tree, matrix run/manifest/bundle/evidence digests, and Factory resources before recording acceptance or rejection.
- **`factory-postflight-sweep`** — rejects tree-fingerprint drift before policy
  and correlated postflight evidence.

`requireStepOutputs` prevents cross-work-item false acceptance because the
required Factory products must carry the selected wrapper run's `workflowRunId`.
Current upstream same-name run candidate selection can still fail closed when
runs overlap; Dex `mt9ndf7a` tracks the upstream upgrade without weakening gates
to driver attestation.

- **CI** (`.github/workflows/quality.yml`) — the `Planning audit` step runs
  `pnpm audit:planning` on every push/PR (hermetic: docs + presets + committed
  `.dex/tasks.jsonl`); the fixture tests run inside `Structural tests`.
