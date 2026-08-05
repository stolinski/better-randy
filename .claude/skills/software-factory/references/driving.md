# Driving a factory run

You are a generic interpreter. The loop below works for every factory; the
definition supplies all meaning.

## The loop

```
1. swamp model method run <factory> status --input workItem=<ref>
                                              → refreshes the status-<workItem>
                                                record; query the fields you need
2. record_dispatch --input workItem=<ref>   (the stage's work is about to run)
3. execute the stage's work spec
4. record products through the model (always passing workItem=<ref>)
5. re-check status; advance or stop for the human; repeat
```

Step 2 is mandatory before executing a stage that has a `work` block: it
records that the stage ran (a work-bearing stage **cannot advance** until it
has — the work can't be silently skipped) and it arms the runaway-loop guard.
Pass `mode=` and, for workflow/method stages, `runId=` so the journal carries
the attempt history.

One factory serves many work items: every call is scoped by `workItem`, and
`status` without it returns a factory-wide overview
(`{"factory": true, "runs": [...]}`) — useful for picking up parked runs.

## Reading the status record

`status` doesn't print a packet for you to parse — it **persists** one as the
data record `status-<workItem>` (and `status-_factory` for the no-workItem
overview) and returns it as a data handle. It is a read-time materialized view,
refreshed on every `status` call. Pull exactly the fields you need with
`swamp data query` (see "Querying run data" below) instead of holding the whole
blob in context. The record's content — addressed as `attributes.<field>` —
has this shape:

```json
{
	"started": true,
	"workItem": "PAY-218",
	"stage": { "id": "plan-review", "cycle": 2, "maxCycles": 5, "terminal": false },
	"work": { "mode": "dispatch", "skills": ["architecture"], "systemPrompt": "…resolved…" },
	"unresolvedBindings": [],
	"transitions": [
		{
			"name": "approve",
			"to": "implementing",
			"satisfied": false,
			"manual": false,
			"cycleLimitBlocked": false,
			"gates": [
				{
					"type": "human-approval",
					"pass": false,
					"reasons": ["awaiting human approval 'plan-approval' (0/1)…"]
				}
			]
		},
		{ "name": "rework", "to": "planning", "satisfied": true, "gates": [] }
	],
	"contextManifest": [
		{
			"name": "plan",
			"type": "artifact",
			"role": "subject",
			"recorded": true,
			"version": 2,
			"declaredIn": "planning"
		}
	],
	"cycles": { "planning": 2, "review": 2 },
	"pendingApprovals": ["approve"]
}
```

The questions you actually ask each loop are one projection each — never the
whole record:

```bash
# the propulsion decision: which transitions are satisfied right now?
swamp data query 'modelName == "<factory>" && name == "status-PAY-218"' \
  --select 'attributes.transitions.filter(t, t.satisfied).map(t, t.name)' --json

# why is the gated transition blocked? (gate reasons are the instructions)
swamp data query 'modelName == "<factory>" && name == "status-PAY-218"' \
  --select 'attributes.transitions.filter(t, !t.satisfied).map(t, {"transition": t.name, "blockedBy": t.gates.filter(g, !g.pass).map(g, g.reasons)})' --json

# the resolved work spec for the current stage
swamp data query 'modelName == "<factory>" && name == "status-PAY-218"' \
  --select 'attributes.work' --json

# what's parked for a human?
swamp data query 'modelName == "<factory>" && name == "status-PAY-218"' \
  --select 'attributes.pendingApprovals' --json
```

Field notes (whichever you project):

- `work` arrives with run-data bindings already resolved; anything in
  `unresolvedBindings` references data that doesn't exist yet — usually
  meaning an earlier product wasn't recorded.
- `invalidInputs` lists any resolved `method`/`workflow` input that fails the
  stage's `inputsSchema` (each entry is `{path, message}`). A non-empty list
  means an upstream value drifted shape — fix it at the producing stage before
  dispatching, not by coercing it here.
- `dispatch` is the loop guard's counter for the current entry:
  `{cycle, attempts, limit, required, executed}`. `required: true` means the
  stage has work and must be dispatched (`record_dispatch`) before it can
  advance; `executed: false` means you haven't yet. `attempts` approaching
  `limit` means you are re-running the same stage entry — see below.
- `validations` lists open (uncleared) payload-validation failures —
  `{target, errors, attempt, …}`. A non-empty entry means a recorded product
  was rejected for the wrong shape; the rejected value and errors are persisted
  as `validation-<target>` so a retry stage can bind them back into the model
  (`feedback: '${{ data.latest(self.name, "validation-<target>") }}'`). They
  clear automatically when the target records cleanly.
- `contextManifest` is the discovery index, not injected context. Roles:
  `subject` (what this stage reviews — always fetch it), `own` (this stage's
  artifacts; prior versions hold last round's findings — fetch when
  re-entering), `lineage` (earlier stages' products — fetch on judgment),
  `evidence`. Fetch exactly the fields you need with the query recipes in
  "Querying run data" below.

## Querying run data

Run records are swamp data. `swamp data query` loads _specific fields_ into
context instead of whole payloads — never guess at the syntax; it follows
mechanically from the definition:

```
swamp data query '<predicate>' --select '<projection>' --json
```

**Predicate** — filters catalog rows. Legal fields are catalog metadata
(`modelName`, `modelType`, `name`, `version`, `isLatest`, `createdAt`,
`tags`, `specName`, `ownerRef`, `workflowRunId`, …) plus `attributes`
(parsed JSON content) and `content` (raw JSON string). There is **no
`workItem` field** — the work item is baked into the physical instance name
(`artifact-<workItem>-<artifact>`, `evidence-<workItem>-<name>`,
`journal-<workItem>`, `state-<workItem>`, `approval-<workItem>-<gateId>`),
so scope every query with `modelName` and `name`.

**Projection** (`--select`) — a CEL expression evaluated per matching
record; the result replaces the record in the output. Full CEL including
macros. A record whose projection fails becomes `null`, not an error.

Rules that remove the guesswork:

1. **`attributes` is the record's parsed content — the envelope.** Your
   artifact's declared schema is its `payload`:
   `attributes.payload.<field-from-schema>`. Envelope provenance sits
   beside it: `attributes.stageId`, `.cycle`, `.subjectVersion`,
   `.recordedAt`, `.workItem`.
2. **Latest-only by default.** Mentioning `version` or `isLatest` in the
   predicate opts into history (`version > 0` matches every version).
3. **Old versions have no parsed `attributes`** — when you pin
   `version == N`, project `content` (the raw JSON string) and parse it
   yourself. Only the latest version carries `attributes`.
4. **Macros only in projections.** `filter`/`exists`/`map` work in
   `--select` but are rejected in the predicate (their bound variables read
   as unknown fields). Plain comparisons on attributes are fine in
   predicates: `attributes.payload.status == "succeeded"`.
5. **Use `--json`** for machine-readable results. Avoid `size(...)` in a
   `--json` projection (BigInt serialization error) — project the filtered
   list and count it yourself.
6. **Map literals project several fields at once:**
   `--select '{"stage": attributes.stageId, "v": version}'`.
7. `swamp data query 'modelName == "<factory>"' --select name` lists what
   exists (add `name.startsWith("artifact-<workItem>-")` to scope it).

### Definition → query, worked examples

The artifact schema in the definition is the query contract. Given:

```yaml
- id: planning
  artifacts:
    - name: plan
      schema:
        type: object
        required: [summary, steps, testingStrategy]
        properties:
          summary: { type: string }
          steps:
            type: array
            items:
              type: object
              properties:
                description: { type: string }
                files: { type: array, items: { type: string } }
          testingStrategy: { type: string }
```

`record_artifact` stores instance `artifact-<workItem>-plan` whose content
is the envelope — the declared schema lives under `payload`:

```json
{ "name": "plan", "workItem": "greet-by-name", "stageId": "planning",
  "cycle": 1, "recordedAt": "…",
  "payload": { "summary": "…", "steps": [...], "testingStrategy": "…" } }
```

So, for work item `greet-by-name` on factory `hello-factory`:

```bash
# one scalar field of the payload (the schema's `summary`)
swamp data query 'modelName == "hello-factory" && name == "artifact-greet-by-name-plan"' \
  --select 'attributes.payload.summary' --json

# project over a nested array (the schema's steps[].description)
swamp data query 'modelName == "hello-factory" && name == "artifact-greet-by-name-plan"' \
  --select 'attributes.payload.steps.map(s, s.description)' --json
```

A `kind: findings` artifact (`payload.findings[]` carries
`{id, severity, category?, description, resolved, resolutionNote?}`):

```yaml
- id: plan-review
  artifacts:
    - name: plan-review
      kind: findings
      reviews: plan
```

```bash
# unresolved findings only, as "ID (severity)" strings
swamp data query 'modelName == "hello-factory" && name == "artifact-greet-by-name-plan-review"' \
  --select 'attributes.payload.findings.filter(f, !f.resolved).map(f, f.id + " (" + f.severity + ")")' --json

# which plan version this review covered (envelope field, not payload)
swamp data query 'modelName == "hello-factory" && name == "artifact-greet-by-name-plan-review"' \
  --select 'attributes.subjectVersion' --json

# the findings as they stood BEFORE resolve_findings (pinned version → raw content)
swamp data query 'modelName == "hello-factory" && name == "artifact-greet-by-name-plan-review" && version == 1' \
  --select 'content' --json
```

Evidence is schema-free — its payload is whatever the driver recorded.
Fetch one record whole (`--json`, no `--select`) before projecting blind:

```bash
swamp data query 'modelName == "hello-factory" && name == "evidence-greet-by-name-test-run"' \
  --select 'attributes.payload.status' --json
```

Across work items — every envelope is stamped with `workItem`, so suffix
matching plus attribute predicates answer fleet questions:

```bash
# every run's position on this factory
swamp data query 'modelName == "hello-factory" && name.startsWith("state-")' \
  --select '{"workItem": attributes.workItem, "stage": attributes.stageId, "status": attributes.status}' --json

# which work items recorded a succeeded test-run
swamp data query 'modelName == "hello-factory" && name.endsWith("-test-run") && attributes.payload.status == "succeeded"' \
  --select 'attributes.workItem' --json
```

The journal is one event per version — open history to read it:

```bash
swamp data query 'modelName == "hello-factory" && name == "journal-greet-by-name" && version > 0' \
  --select 'attributes.summary' --json
# or structured: --select '{"event": attributes.event, "stage": attributes.stageId, "at": attributes.at}'
```

Approvals:

```bash
swamp data query 'modelName == "hello-factory" && name == "approval-greet-by-name-plan-approval"' \
  --select '{"decision": attributes.decision, "actor": attributes.actor, "note": attributes.note}' --json
```

When the goal is the whole story rather than specific fields, run the
`summary` method (see "Reporting on a work item") instead of stitching
queries together.

## Executing work

- **interactive** — do it yourself. Load each listed skill; read the
  `constraints` file if present and follow it.
- **dispatch** — spawn one subagent per listed skill, in parallel, each with
  the stage's `systemPrompt` (and the `command` template if given,
  substituting prompt/work-item placeholders). Give each subagent the
  context manifest and the `swamp data query` recipe so it pulls its own
  context. On re-entry (cycle > 1), tell reviewers to fetch their prior
  findings and verify claimed resolutions rather than trusting them. Merge
  findings into one `record_artifact` call with stable ids (ARCH-1, A11Y-2…).
- **workflow** — trigger the named swamp workflow with the resolved inputs
  (`swamp workflow run <name> --input k=v`) and wait for completion. Then query
  every declared artifact and `resultEvidence`. If the workflow already
  recorded a product, preserve that resource and its `workflowRunId`; never
  overwrite workflow-produced artifacts or evidence with uncorrelated driver
  records. Only when no result evidence exists should the driver record
  `record_evidence name=<resultEvidence>
payload='{"status":"succeeded|failed","runId":"…"}'`. The outcome must
  satisfy the built-in contract (`status` + `runId` required) — an empty or
  malformed record is rejected, so a workflow that "succeeded" without
  recording surfaces as a loud `record_evidence` error rather than a silent
  re-dispatch. The `pass` branch is usually gated on `workflow-succeeded`,
  which verifies against swamp's own run records — recording evidence does not
  bypass it.
- **method** — same, for a single model method
  (`swamp model method run <model> <method> --input …`).

## Propulsion rules

- Exactly one transition `satisfied`, no pending human gate, no
  `manual: true` → advance without asking.
- Only human-approval gates failing → present the full picture (see
  "Presenting for human approval" below) and **stop**. Never call `approve`
  without the human explicitly saying so; record rejections with their
  reason verbatim via `reject`.
- Multiple transitions satisfied → ask the human which to take.
- `cycleLimitBlocked: true` → the run is parked. Present the cycle history
  from the journal query (see "Resuming and recovery") — not from memory —
  and let the human grant `approve gateId=cycle-override:<stage>` (one grant
  = one entry) or abort/escalate.

## Presenting for human approval

The human approves the **record**, not your recollection of it. Before
presenting a pending `human-approval` gate:

1. From `contextManifest`, take every recorded entry with role `subject`,
   plus the current stage's recorded `own` artifacts (e.g. the review
   findings about the subject).
2. Fetch each one's payload with a data query — scoped tightly for token
   economy (the gate-relevant artifacts only, latest payload only; not the
   version history, not the journal):

   ```
   swamp data query 'modelName == "<factory>" && name == "artifact-<workItem>-<name>"' --select attributes.payload --json
   ```

3. Show the human the actual payload from the query result — rendered
   readably, content verbatim — with its name, version, and recording
   stage/cycle, alongside the failing gate reasons.

Never present from conversation memory, even for an artifact you recorded
moments ago in this session: the stored record (post-validation,
post-`resolve_findings`) is the source of truth, and your context copy may
be stale or compacted away.

## Gate failures are instructions

`advance` failures (and pre-flight check output) tell you exactly what is
missing — "re-record 'plan-review' against the current subject", "record
fresh evidence", "a human must run approve with gateId=…". Follow them
literally; do not work around them. They exist because the factory author
configured them.

## The dispatch guard (don't loop on a stage)

Call `record_dispatch` once per stage entry, _before_ doing the work. It is the
deterministic record that the stage ran, and it counts re-dispatches of the
same `(stage, cycle)`:

- **Attempt 1** — normal. Do the work, record products, advance.
- **Attempt 2** — recorded, but `record_dispatch` returns a loud
  `repeat-dispatch warning` naming the products still missing and the gates
  still failing. **Stop and read it.** You are about to re-run a stage that
  didn't get what it needed last time — usually because a workflow/method
  "succeeded" but didn't record its `resultEvidence`, or recorded the wrong
  shape. Fix the recording, don't re-run blindly.
- **Attempt 3** — `record_dispatch` throws `runaway-loop-suspected` and refuses.
  This is the circuit breaker. Present the diagnostics (missing products, gate
  reasons, attempt history from the journal) to the human; do not try to work
  around it. It almost always means a real defect in the stage's work or its
  recording step, not a transient failure.

## Terminal completion ordering

Advancing to a terminal Factory stage completes the Factory lifecycle, not an
external tracker item. After the terminal transition:

1. Run `status --input workItem=<ref>` again and project `attributes.stage`.
2. Require the refreshed record to report the profile's expected terminal stage
   and `terminal: true` (`stage.id == "done"` for `supers-delivery`).
3. Only then inspect any profile-specific tracker disposition artifact and act
   on it. In `supers-delivery`, `reconciliation.dexDisposition` equal to
   `ready-for-completion` permits completing Dex; `reframed` leaves it open.

Never complete or close an external tracker during reconciliation or before
postflight/terminal confirmation. The ordering is generic; `dexDisposition` is
the Supers profile's field name, not a Factory engine convention.

For `supers-delivery`, reconciliation is also read-only. It reports `ready` only
when all source, documentation, Brief, and tracker-file changes already landed
during implementation. A missing reconciliation change reports `needs-rework`
and returns to implementation so classification and verification cover it.

The cap is per stage entry; advancing into a stage on rework is a fresh entry
with a fresh counter (`maxCycles` is the separate guard on how many times you
may re-enter). Tune the per-stage limit with `maxDispatchesPerCycle` in the
definition.

## Recording rules

- Artifacts only on the stage that declares them; payloads are validated
  against the declared schema — fix validation errors, don't reshape the
  declaration. Object payloads are strict: an "Unrecognized key" error means
  you sent a field the schema doesn't declare, not that the schema is wrong.
- Evidence payloads are validated too — against the evidence's declared
  schema, or (for a stage's `resultEvidence`) the built-in outcome contract
  `{status, runId, outputs?}`. A `record_evidence` "payload is invalid" error
  means the recorded outcome has the wrong shape (or is empty); record the
  real outcome rather than re-running the stage.
- Every rejection (artifact or evidence) is also **recorded** as a
  `validation-<target>` record — the rejected value plus the path-bearing
  errors. You don't record this yourself; the engine does. If the stage is set
  up for retry-with-feedback, the next attempt binds it automatically. Either
  way, fix the _shape_ the errors name — don't reshape the schema.
- `kind: findings` artifact payloads must carry
  `findings: [{id, severity, description, category?, resolved?, resolutionNote?}]`
  with severity exactly one of `critical`/`high`/`medium`/`low` — there is
  no "info" severity; record informational notes as `low`. Use stable,
  prefixed ids (`ARCH-1`, `SH-2`, …): `resolve_findings` and humans address
  findings by id across cycles.
- Artifacts with `reviews:` auto-pin the subject's current version; record
  the subject first.
- `resolve_findings` updates resolution notes but is **not** a fresh
  recording — `recordedThisCycle` gates still require re-recording after
  re-entry (re-review verifies the resolutions).
- Evidence is cycle-scoped: re-entering a stage means re-recording its
  evidence (fresh test runs, fresh PR state).

## Reporting on a work item

When the human asks "what happened with X?", how a work item was
implemented, or for a write-up of a run:

```bash
swamp model method run <factory> summary --input workItem=<ref>
```

It prints a linear markdown history — every stage visit, artifact version,
finding and resolution, approval, evidence record, and transition, including
rework loops — built statically from the run data (no LLM; do not paraphrase
it from memory when the human wants the record). A `SUMMARY_JSON` log line
carries the same timeline structured for programmatic use. The
`@swamp/software-factory/work-item-summary` report persists the identical
markdown; retrieve stored copies with `swamp report search` /
`swamp report get`. Works on in-flight runs too (shows the current
position).

## Resuming and recovery

- Resume: `status --input workItem=<ref>`. Never `start` (it fails on an
  existing run by design).
- Run history: `summary --input workItem=<ref>` for the rendered narrative;
  `swamp data query 'modelName == "<factory>" && name == "journal-<workItem>" && version > 0' --select attributes.summary --json`
  for the raw append-only audit trail (one event per version — `version > 0`
  opens the history).
- Start over: `reset workItem=<ref> confirm=reset` — destructive; only on
  explicit human instruction. Pre-reset records become invisible to gates
  (era filtering by the new startedAt).
- "Current stage no longer exists": the definition changed incompatibly
  mid-run. Show the human; fix the definition or reset.
