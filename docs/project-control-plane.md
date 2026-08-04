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
- **`dex-ready-runway`** — at most one un-started ready leaf holds the top priority: `dex list --ready` must expose one strategic first move, not a pile of co-equal priority-1 leaves (roadmap § Active factory runway).

Advisories (reported, never gating): completion markers in an open task's _description_ — a half-shipped grab-bag needs human judgment, not an automatic red. An open task whose blocker completed is dex-normal and not flagged at all.

## Running and reading it

```bash
npm run audit:planning                                        # direct; exit 1 on findings
swamp model method run repo-audit audit-planning              # store the versioned resource
swamp report get @supers/planning-state --model repo-audit    # findings + advisories with repo paths / dex ids
swamp workflow run policy-sweep                               # all five checks + assert steps as one DAG
```

The `@supers/planning-state` report extension (`extensions/reports/planning-state.ts`, attached as a `@supers/repo-audit` type default) renders each finding with its actionable paths — repo file paths for doc drift, `dex:<id>` entries for graph drift. On a red run the structured resource is still stored, so the report names exactly what to fix.

## Gates

- **`policy-sweep` workflow** (`workflows/workflow-5eb573fe….yaml`) — the five audits fan out, then one assert per resource (`data.latest("repo-audit", "planning-latest").attributes.clean == true`, and siblings) turns any finding into a red run.
- **CI** (`.github/workflows/quality.yml`) — the `Planning audit` step runs `pnpm audit:planning` on every push/PR (hermetic: docs + presets + committed `.dex/tasks.jsonl`); the fixture tests run inside `Structural tests`.
