# Authoring a factory definition

A factory definition lives in the model instance's `globalArguments`:
`stages` (the machine) and optional `globalTransitions`. There is no
workItem in the definition — one factory serves many work items, passed as
a method argument on every call. Start from one of the bundled examples in
`references/examples/` — `minimal.yaml`, `feature-factory.yaml`, or
`sdlc-classic.yaml`, `retry-feedback.yaml` — then run `validate` and `describe` until clean and
confirmed by the human.

`swamp model create @swamp/software-factory <name>` writes the definition
file to `models/@swamp/software-factory/<id>.yaml` in the repo — edit that
file directly (it's git-tracked YAML). The stage document goes under
`globalArguments:`; `reports:` and `checks:` selections are top-level keys
beside it, not inside it.

## Stages

```yaml
stages:
  - id: plan-review              # lowercase, -/_ separators
    description: optional prose
    initial: true                # exactly one stage
    terminal: true               # at least one stage (no transitions out)
    maxCycles: 5                 # re-entry circuit breaker, default 5
    maxDispatchesPerCycle: 2     # dispatches allowed per entry, default 2
    work: { ... }                # how the work gets done (below)
    artifacts: [ ... ]           # declared data products (below)
    evidence: [ ... ]            # declared external facts, each with a schema (below)
    transitions: [ ... ]         # gated edges (below)
```

## Work modes

| mode | executor | keys |
| --- | --- | --- |
| `interactive` | the driving agent in conversation | `skills`, `systemPrompt`, `constraints` |
| `dispatch` | one subagent per listed skill, parallel | + `command` template |
| `workflow` | a named swamp workflow | `workflow: {name, inputs}`, `resultEvidence` |
| `method` | one model method call | `method: {modelIdOrName, methodName, inputs}`, `resultEvidence` |

`workflow`/`method` stages should declare `resultEvidence` (the evidence name
the driver records the outcome under) — `validate` warns otherwise. They may
also declare `inputsSchema` to validate their resolved inputs before dispatch
(see "Declaring schemas"). Tracker integrations are `method` stages invoking
tracker-specific models.

**Run-data bindings** use platform CEL syntax and resolve at stage execution
time against the run's own records:

```yaml
inputs:
  ref: '${{ data.latest(self.name, "evidence-change-request").payload.headSha }}'
```

Bindings may only reference data written by earlier stages. `status` returns
the work spec with bindings already resolved.

## Artifacts

```yaml
artifacts:
  - name: plan-review
    kind: findings        # unlocks findings gates + resolve_findings
    reviews: plan         # subject link: pins subject version on record
    schema:               # JSON-Schema-flavored subset, compiled to zod
      type: object
      required: [summary]
      properties:
        summary: { type: string, minLength: 1 }
```

Schema subset: `type` (object/array/string/number/integer/boolean),
`properties`, `required`, `additionalProperties`, `items`, `enum`, `pattern`,
`minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems`. Unknown
keywords are rejected at authoring time. `kind: findings` payloads must contain
`findings: [{id, severity, description, category?, resolved?, resolutionNote?}]`
with severity in critical/high/medium/low.

**Every artifact must declare a `schema` or be `kind: findings`** — there is no
unvalidated artifact. See "Declaring schemas" below for the full contract
(evidence schemas, strict-by-default, the `resultEvidence` outcome schema, and
`inputsSchema`).

Artifact and evidence names are **global to the machine** — declare each
once, on the stage that records it, and reference them from any stage's
gates. At run time every record is namespaced per work item
(`artifact-<workItem>-<name>`), so parallel work items never collide; the
binding/gate vocabulary stays logical (`artifact-plan`).

**The schema you declare is also the retrieval contract.** Records store the
envelope as their content, with the schema-validated payload at
`attributes.payload.<field>` — so a driver fetches exactly the fields it
needs with `swamp data query … --select attributes.payload.<field>` instead
of pulling whole payloads. Well-named, well-structured schema fields pay off
at query time; see `driving.md` "Querying run data" for the definition →
query recipes.

## Declaring schemas

Every datum a stage produces is validated against a declared schema at the
moment it is recorded — a run never persists unvalidated data, and a
downstream stage never consumes a malformed upstream product.

- **Every artifact declares a `schema`** (the subset above) **or is
  `kind: findings`** (which carries the built-in findings contract). A
  schemaless artifact is a `validate` error.
- **Every declared `evidence` declares a `schema`** — opaque to gates, but its
  shape is checked on `record_evidence`:

  ```yaml
  evidence:
    - name: change-request
      schema:
        type: object
        required: [url]
        properties:
          url: { type: string }
          headSha: { type: string, minLength: 7 }
  ```

- **Object payloads are strict by default**: an undeclared key is rejected.
  This is what catches LLM drift — a stray field, a typo'd key — at the
  producing seam instead of letting it flow downstream. Opt back into
  open-ended payloads only where you mean to, per object:

  ```yaml
  schema:
    type: object
    additionalProperties: true   # this object accepts undeclared keys
    properties: { ... }
  ```

- **`resultEvidence` needs no schema of its own**: a `workflow`/`method`
  stage's recorded outcome inherits the engine's built-in contract —
  `{ status: succeeded|failed, runId: string, outputs?: object }` (extra keys
  allowed). So a workflow that reports success but records an empty or garbage
  outcome fails loudly at the write, instead of leaving the gate quietly
  unsatisfied — which is how a driver ends up re-dispatching the same stage
  forever. Declare an explicit `evidence` entry of the same name to constrain
  the outcome further.

- **`inputsSchema` validates a `method`/`workflow` stage's resolved inputs**
  before dispatch. Once the input bindings resolve, the engine checks them
  against this schema and surfaces any mismatch in `status` as `invalidInputs`
  — catching an upstream value that drifted shape (a list recorded as a
  string, a number as text) at the boundary the factory owns, rather than deep
  inside the called method:

  ```yaml
  work:
    mode: method
    method: { modelIdOrName: "@my/planner", methodName: generate, inputs: { ... } }
    inputsSchema:
      type: object
      required: [risks]
      properties:
        risks: { type: array, items: { type: string } }
  ```

Artifact, evidence, and `inputsSchema` schemas are all top-level `type:
object` — payloads and inputs are JSON objects.

## Retry-with-feedback for LLM-driven stages

When a stage's recorded product fails its schema (an LLM drifted on a field
type, returned a list as a string…), the engine rejects it loudly **and
records the failure** — the rejected value plus the path-bearing errors — as a
`validation-<target>` record. A retry binds that record straight back into the
model's prompt, so the next attempt sees exactly what was wrong.

Worked example — a planning stage whose plan comes from an LLM-backed method,
with the failure fed back on retry:

```yaml
stages:
  - id: planning
    initial: true
    work:
      mode: method
      method:
        modelIdOrName: "@my/planner"
        methodName: generate
        inputs:
          workItem: '${{ self.workItem }}'
          # Whole record, null-safe: null on the first attempt, the recorded
          # failure (its .rejected value + .errors) on a retry. NEVER bind a
          # sub-field like `…"validation-plan").errors` — that throws on the
          # first attempt (no record yet) and leaves the input unresolved.
          feedback: '${{ data.latest(self.name, "validation-plan") }}'
      resultEvidence: plan-run     # captures the run outcome {status, runId}
    artifacts:
      - name: plan
        schema:
          type: object
          required: [scope, risks]
          properties:
            scope: { type: string, minLength: 1 }
            risks: { type: array, items: { type: string } }   # the field LLMs drift on
    transitions:
      - name: submit
        to: done
        gates:
          - { type: artifact-exists, config: { artifact: plan } }
  - id: done
    terminal: true
```

How it runs (the driver loop, unchanged):

1. `record_dispatch` → run `@my/planner.generate` (`feedback` resolves to
   `null`) → `record_artifact name=plan` with the method's output (and
   `record_evidence name=plan-run` with the run outcome).
2. If the model returned `risks: "- a\n- b"` (a string), `record_artifact`
   rejects it — `risks: expected array, received string` — and the engine
   writes `validation-plan` holding that `rejected` value and the `errors`.
3. Retry within the dispatch budget: `record_dispatch` (attempt 2) → re-run the
   method. Now `feedback` binds to the `validation-plan` record, so the method
   re-prompts the model with what failed and records a corrected plan →
   `record_artifact` succeeds and the engine **auto-clears** `validation-plan`.
4. If it never converges, the dispatch guard hard-fails
   (`runaway-loop-suspected`) — `maxDispatchesPerCycle` is the retry budget;
   there is no separate retry cap.

The method (`@my/planner.generate`) owns the re-prompt — it declares an
optional `feedback` input and, when it's present and not `cleared`, prepends
something like:

```
Your previous output was rejected.
Rejected value: {{feedback.rejected}}
Validation errors: {{feedback.errors}}
Return corrected JSON that satisfies the schema.
```

The engine never calls the model — it only detects, records, and clears the
failure deterministically; the re-prompt lives with whoever owns the model
call (the method here, or the driver). `feedback == null` or
`feedback.cleared == true` both mean "clean attempt, no feedback."

This factory is bundled runnable as
`references/examples/retry-feedback.yaml`.

## Gates

All gates on a transition must pass for `advance`.

| type | config | passes when |
| --- | --- | --- |
| `artifact-exists` | `artifact` | ≥1 version recorded |
| `artifact-fresh` | `artifact`, `recordedThisCycle?` | pinned subject version is current; with `recordedThisCycle`, latest version was recorded during the current stage entry (forces re-review on re-entry) |
| `findings-clear` | `artifact`, `blocking: [severities]` | no unresolved finding at a blocking severity |
| `human-approval` | `id`, `minApprovals?` | enough `approve` records for the current (stage, cycle); any rejection blocks |
| `evidence-recorded` | `name`, `requireField?` | evidence recorded during the current (stage, cycle); optional dot-path field matching, e.g. `{status: succeeded}` |
| `cooldown` | `afterEvidence`\|`afterArtifact`, `seconds` | enough wall-clock time since the record |
| `max-cycles` | `stage`, `limit`, `invert?` | routing only (e.g. make `escalate` live after N rounds) — the safety net is the per-stage `maxCycles` |
| `cel` | `expr`, `message?` | the CEL predicate is true over `artifacts.<snake_name>`, `evidence.<snake_name>`, `approvals`, `state`, `workItem` |
| `workflow-succeeded` | `workflow`, `requireStepOutputs?` | swamp's own run record for the named workflow shows the latest run succeeded during this stage entry — verified, not attested |

Reserved: `human-approval` ids must not start with `cycle-override:`.

## Transitions

```yaml
transitions:
  - name: approve
    to: implementing
    manual: true        # optional: human "go" even when all gates pass
    gates: [ ... ]
globalTransitions:      # available from every non-terminal stage
  - name: abort
    to: aborted
    gates: [{ type: human-approval, config: { id: abort-confirmation } }]
```

Loop-backs ("send back to implementation") are ordinary transitions to
earlier stages. Re-entry increments the stage's cycle: approvals and
evidence are cycle-scoped, so stale sign-offs and stale test runs cannot
carry across rework automatically.

## Validation rules (`validate` / enforced on every method)

Exactly one initial, ≥1 terminal stage; unique stage ids; globally unique
artifact/evidence names; transition targets exist; non-terminal stages have a
way out (global transitions count); gate references resolve; `findings-clear`
targets `kind: findings`; `artifact-fresh` targets need `reviews:`; reviews
links acyclic; artifact schemas compile; **every artifact declares a schema or
is `kind: findings`; every declared evidence declares a schema; artifact,
evidence, and `inputsSchema` schemas are `type: object`**; every stage
reachable from initial. Enforced at run time: advancing out of a work-bearing
stage requires a `record_dispatch` for the current entry (`stage-executed`).
Warnings: terminal stages with transitions, workflow/method stages without
`resultEvidence`, stages from which no terminal is reachable.

## Execution tracking and the loop guard

Every stage with a `work` block must be **dispatched through the model**
(`record_dispatch`) before it can advance — its execution is a recorded fact,
so a stage can't be silently skipped, and the engine has a deterministic count
of how many times each stage entry was run. Re-dispatching the same entry warns
loudly on the second attempt and **hard-fails** on the third
(`runaway-loop-suspected`), which is the deterministic fix for the
"workflow succeeded but recorded nothing → driver re-dispatches forever" loop.

`maxDispatchesPerCycle` (default **2**) tunes the cap per stage; it pairs with
`maxCycles` (re-entry cap) — together they bound total work at
`maxCycles × maxDispatchesPerCycle`. Global escape-hatch transitions (abort,
escalate) are exempt, so a run is never trapped. Driving agents call
`record_dispatch` as a fixed step of the loop; see `driving.md`.

## Sharing stages across factories

Definitions are CEL-evaluated by the platform, so a team template instance
can hold the canonical stages and other factory instances can reference it:

```yaml
globalArguments:
  stages: "${{ model.acme-sdlc-template.definition.globalArguments.stages }}"
```

## Scoping the work-item summary report

The extension ships a `@swamp/software-factory/work-item-summary` report (a
model-type default) that persists the `summary` method's markdown history
through swamp's report machinery. Method-scope reports run after **every**
method and persist even empty results, so an unscoped default buries the
stored summaries under empty placeholder versions from `record_artifact`,
`advance`, etc. Standard practice — like `checks: { require: [...] }` — is
to scope it in the definition file (a top-level key, sibling of
`globalArguments`):

```yaml
reports:
  require:
    - { name: "@swamp/software-factory/work-item-summary", methods: [summary] }
```

With this, the report fires only after `summary`, every stored version is a
real history, and `require` makes it immune to `--skip-reports`.
