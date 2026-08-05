# Project control plane

The generated project control plane keeps the planning tiers — `docs/roadmap.md`, `docs/adr/`, `docs/briefs/`, `docs/ideas/` + `docs/history/`, and the dex task graph — mechanically reconciled with shipped implementation. It grew out of the 2026-08-04 baseline reconciliation (dex `6qlggrda`) and is executed by the Swamp workspace (dex epic `t040a0vs`).

## The audits

All four repo audits are methods on the `@supers/repo-audit` Swamp model (`extensions/models/repo-audit.ts`); each stores a schema'd, versioned, CEL-queryable resource. A method **succeeds whenever the audit ran** — findings are data; the workflow assert steps are what turn findings into a red run.

| Method           | Script                               | Resource          | Checks                                                                                |
| ---------------- | ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| `audit-timing`   | `scripts/audit-timing-coverage.ts`   | `timing-latest`   | Every fraction-timed schema field is rescaled by `rescaleCompositionTimings`          |
| `audit-tracking` | `scripts/audit-tracking-coverage.ts` | `tracking-latest` | Every `surface.content` schema field is read by the authoring-dependency tracker      |
| `audit-parity`   | `scripts/audit-inspector-parity.ts`  | `parity-latest`   | GUI↔agent parity — schema fields have GUI editors; param-bearing effects ship Editors |
| `audit-planning` | `scripts/audit-planning-state.ts`    | `planning-latest` | Planning-state drift (below)                                                          |

The same model captures a work-item-keyed `change-baseline` HEAD before implementation. `classify-change(workItem)` then unions committed paths in `baselineHead...HEAD` with NUL-delimited tracked, staged, deleted, renamed/copied, and untracked working-tree paths. Its work-item-keyed report carries `baselineHead`, a content-sensitive `treeFingerprint`, and conservative verification lanes; an empty change set still selects `policy-sweep`. No agent supplies paths or re-records the report.

## The planning-state audit

`scripts/planning-state-checks.ts` holds the pure check logic (fixture-tested in `scripts/planning-state-checks.test.ts`, wired into `test:structural`); `scripts/audit-planning-state.ts` assembles real inputs from the repo docs, the built-in Preset listing (`kind: deliverable | fixture`), and the dex graph — via the dex CLI when installed, falling back to the committed `.dex/tasks.jsonl` store (CI has no dex binary).

Gating findings (`clean: false`, exit 1):

- **`adr-index-coverage`** — every `docs/adr/NNNN-*.md` has an index row and every index row resolves to a file.
- **`adr-status-drift`** — each ADR's `## Status` line classifies as Canon / Build-harness / Superseded / Designed (prefix-matched), and the index row's category agrees with the file's.
- **`roadmap-adr-reference`** — every ADR the roadmap references exists.
- **`roadmap-ship-claim`** — no roadmap line claims shipped work (✅ / **shipped**) against an ADR still categorized "Designed, not built".
- **`stale-brief`** — no Brief targets (by filename slug, `**Slug:**`, or declared verification preset) a preset that ships as `kind: "deliverable"` — the [Brief invariant](briefs/README.md) requires deleting the Brief when its target ACCEPTs.
- **`ideas-inventory`** — `docs/ideas/` and `docs/history/` folder contents match their README indexes exactly.
- **`ideas-historical`** — no idea doc self-declares shipped/complete status; historical explorations belong in `docs/history/`.
- **`dex-shipped-claim`** — no _open_ task claims completion in its **name** (✅ / all-caps COMPLETE / SHIPPED / DONE).
- **`dex-blocker-contradiction`** — no _completed_ task is still edge-blocked by an open task.
- **`dex-active-work`** — at most one open leaf task is started; the factory WIP limit is one active work item.
- **`dex-ready-runway`** — at most one un-started ready leaf holds the top priority: `dex list --ready` must expose one strategic first move, not a pile of co-equal priority-1 leaves (roadmap § Active factory runway).

Advisories (reported, never gating): completion markers in an open task's _description_ — a half-shipped grab-bag needs human judgment, not an automatic red. An open task whose blocker completed is dex-normal and not flagged at all.

## Running and reading it

```bash
npm run audit:planning                                        # direct; exit 1 on findings
swamp model method run repo-audit audit-planning              # store the versioned resource
swamp report get @supers/planning-state --model repo-audit    # findings + advisories with repo paths / dex ids
swamp workflow run policy-sweep                               # all five checks + assert steps as one DAG
swamp workflow run factory-policy-sweep --input workItem=<id> --input evidenceName=preflight-run
```

The `@supers/planning-state` report extension (`extensions/reports/planning-state.ts`, attached as a `@supers/repo-audit` type default) renders each finding with its actionable paths — repo file paths for doc drift, `dex:<id>` entries for graph drift. On a red run the structured resource is still stored, so the report names exactly what to fix.

`planning-latest.runway` is the machine handoff to the delivery factory. It names the one active leaf (if work is in progress), that leaf's root epic, the unique highest-priority unstarted leaf, and the total ready-leaf count. Factory drivers query these fields instead of reparsing roadmap prose or the full Dex graph.

## Delivery factory

The `supers-delivery` `@swamp/software-factory` instance is the controller above these audits. Its generic lifecycle is compiled by the local `supers-delivery-profile` instance of `@club_aqua_back_deck/dex-software-factory`; Supers supplies only the policy adapters and typed artifact extensions. The separate `supers-dex-task-tracker` instance owns normalized Dex operations and receipts. One Factory instance serves many Dex work-item ids. It does not own roadmap, ADR, Brief, idea/history, or task prose; it records only compact execution artifacts and evidence.

Its path is `preflight baseline capture → implementation → workflow-owned classification → complete required verification → optional Critic/human review → reconciliation → postflight → terminal Dex cleanup`. Classification unions `baseline..HEAD`, staged/unstaged/deleted files, and untracked files, then seals a content-sensitive tree fingerprint. Executed lane ids must be unique and exactly equal classified ids. Pixel evidence is `changed`, `unchanged`, or `unavailable`; unavailable or contradictory results rework. Changed pixels need visual targets and reach an isolated Critic; unchanged pixels reconcile directly. The profile retains typed `visual-review` findings and a typed `visual-verdict` carrying status, recommendation, summary, and evidence. Reconciliation is read-only: any missing documentation, Brief, or tracker-file edit returns to implementation so classification and verification cover it. Postflight first asserts the classified tree fingerprint, then runs policy. Only the generated `terminal-cleanup` stage calls the typed tracker `complete` method with CEL-bound reconciliation data; no Factory stage embeds a Dex shell command.

The compiler output is a build-time materialization artifact. The Factory engine reparses raw definition arguments, so top-level stages cannot be dynamically injected from `data.latest(...)`. After changing `supers-delivery-profile`, compile and materialize it; the materializer preserves the Factory id, tags, reports, and methods, changes only `globalArguments`, and increments the definition version only when the graph changes:

```bash
swamp model method run supers-delivery-profile compile
deno run --allow-run --allow-read --allow-write scripts/materialize-dex-software-factory.ts \
  supers-delivery-profile models/@swamp/software-factory/90fac686-c724-4aee-97c4-e31b9af4c5e2.yaml
swamp model validate supers-delivery
```

Start or resume from the machine runway:

```bash
swamp data query 'modelName == "repo-audit" && name == "planning-latest"' --select attributes.runway --json
swamp model method run supers-dex-task-tracker start --input taskId=<dex-id>
swamp model method run supers-delivery start --input workItem=<dex-id>
swamp model method run supers-delivery status --input workItem=<dex-id>
```

The Factory status record is the execution contract. Drivers project only the current work, satisfied transitions, and failing gate reasons; they do not load the entire run history into model context.

## Factory effectiveness

`@mgreten/software-factory-flow-metrics` runs alongside the built-in work-item summary whenever `supers-delivery.summary` runs. It deterministically derives per-run and cross-run flow metrics from Factory state, journals, artifacts, evidence, and approvals: time to terminal, stage durations and yield, dispatch attempts, first-pass acceptance, review/patch frequency, human decisions, cleanup failures, parks, aborts, and cycle-limit overrides. Every value carries source pointers and an availability label; missing facts stay `unavailable` rather than becoming false zeroes.

```bash
swamp model method run supers-delivery summary --input workItem=<dex-id>
swamp report get @mgreten/software-factory-flow-metrics --model supers-delivery --json
```

The flow report measures how safely and efficiently work moved through the Factory. It does not by itself prove that shipped behavior remained healthy. Sentry supplies that later outcome signal, under these attribution rules:

The same available flow measurements should also be emitted to Sentry **Application Metrics** so their trends live beside Supers errors, logs, and traces. Application Metrics are independent of trace sampling and support counters, gauges, and distributions in the installed `@sentry/sveltekit` SDK. The bounded vocabulary is:

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

All Factory telemetry goes to one dedicated Sentry project so dashboards compare repositories directly. Every metric carries four shared, bounded attributes: `factory.project` (an explicit stable project slug such as `better-randy`, never inferred from an absolute path), `factory.name` (the local Factory instance), `factory.profile` (the reusable profile name/version), and `factory.definition_version`. Never attach work-item ids, changed paths, error text, capture paths, actor identities, repository URLs, or other unbounded values. Emit only after a terminal run, preserve the Swamp report as the source of truth, and flush the buffered SDK before the short-lived emitter exits. Sentry is the trend surface, not the canonical lifecycle store or a Factory gate.

- **Contained development defect:** a new issue first appears between Factory start and verification, overlaps a changed path, and has no occurrence after the final verification evidence. It is useful learning, not an escape. A still-open Sentry status is hygiene debt but does not override the event timeline.
- **Escaped defect candidate:** an issue first appears after terminal completion and overlaps a changed path. Confidence becomes high only when the Factory records a commit and the Sentry event's `release` / `git.release` matches `supers@<sha>`; without that release link it remains a candidate.
- **Pre-existing:** the issue predates Factory start, regardless of later occurrences, unless a post-change release materially increases its event rate.
- **Unattributed:** no changed-path overlap, no trustworthy observation window, or an uncommitted dirty tree carrying an older HEAD release. Unattributed events are reported, never charged to the work item.

Sentry is local-development telemetry for Supers, not production-user telemetry. Error counts therefore need an exposure denominator (traces or relevant route/export attempts); raw counts alone mostly measure how much the app was exercised. Performance comparisons require the same operation and route, release-linked samples, and a minimum sample count before reporting a p50/p95 delta. Missing release, denominator, or sample volume must remain `unavailable`.

The field-ink run demonstrates the distinction: `SUPERS-16` occurred once in changed `preset-rubric.ts` during implementation, stopped before final verification, and final browser checks passed. Because the dirty working tree was tagged with the previous HEAD, it is a medium-confidence contained-development candidate, not evidence of an escaped release defect.

The local `@club_aqua_back_deck/software-factory-sentry-metrics` model accepts the bounded flow payload, emits through the Sentry SDK using a vault-backed DSN, flushes before exit, and records the emission result as versioned Swamp data. It remains unpublished and is not yet wired to `supers-delivery.summary`; until that integration lands, the flow report is the only automatic effectiveness output. The optional retrospective error/performance enrichment needs a separate Sentry API read model. Do not wrap the Sentry CLI in `command/shell`, send metrics from a report extension, or make Factory completion depend on Sentry availability.

## Gates

- **`policy-sweep` workflow** (`workflows/workflow-5eb573fe….yaml`) — unchanged standalone DAG: five audits fan out, then one assert per resource turns findings into a red run.
- **`factory-policy-sweep`** — runs policy, captures the work-item baseline, then records correlated preflight evidence with `run.id`.
- **`factory-classify-change`** — classifies trusted Git state, then records the exact current-run report and evidence inside one workflow.
- **`factory-postflight-sweep`** — rejects tree-fingerprint drift before policy and correlated postflight evidence.

`requireStepOutputs` prevents cross-work-item false acceptance because the required Factory products must carry the selected wrapper run's `workflowRunId`. Current upstream same-name run candidate selection can still fail closed when runs overlap; Dex `mt9ndf7a` tracks the upstream upgrade without weakening gates to driver attestation.

- **CI** (`.github/workflows/quality.yml`) — the `Planning audit` step runs `pnpm audit:planning` on every push/PR (hermetic: docs + presets + committed `.dex/tasks.jsonl`); the fixture tests run inside `Structural tests`.
