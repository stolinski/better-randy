---
name: software-factory
description: >
  Drive @swamp/software-factory runs: a fully generic, model-driven state
  machine for software development lifecycles with adversarial review gates,
  verified testing, and human approvals. Use when the user wants to start
  factory work on a work item, check factory status, drive a run forward,
  author a new factory definition, report on how a work item was
  implemented, or pull specific fields out of recorded run data (plans,
  review findings, evidence, the journal). Triggers on "software factory",
  "factory run", "start work on", "factory status", "advance the factory",
  "author a factory", "what happened with <work item>", "work item
  history/report/summary", and any question about artifacts or findings a
  factory recorded. Consult this skill the moment a message mentions a
  factory, factory run, or work item — before answering or running any
  command.
---

# Software Factory Skill

Drive `@swamp/software-factory` model instances. A factory instance is a
**state machine defined as data** (in the definition's `globalArguments`)
that serves **many work items concurrently** — every method takes `workItem`,
and all run data is namespaced per work item. You are a generic interpreter:
the definition is the program, each work item's run state is a program
counter, and `status` tells you what is required next. You never need to
know what any stage _means_.

## Core principles

1. **`status` is the contract.** Always ask the model what is required;
   never assume a lifecycle. `status` persists a `status-<workItem>` record —
   a self-describing packet: current stage, work spec (with run-data bindings
   resolved), per-transition gate results with reasons, context manifest, and
   cycle counts — and returns it as a data handle. Read exactly the fields you
   need with `swamp data query` (e.g. the satisfied transitions, the failing
   gates' reasons), never the whole blob.
2. **Never satisfy a `human-approval` gate without explicit human
   instruction.** Calling `approve` on a human's behalf without their say-so
   is forbidden. Rejections need the human's reason verbatim. When
   presenting a human gate, show the recorded artifact(s) fetched fresh via
   `swamp data query` — humans approve records, not summaries from memory.
3. **Persist everything through the model.** Work products go in
   `record_artifact` / `record_evidence`, not just conversation. State must
   survive sessions and compaction.
4. **Resume with `status`, never `start`.** `start` fails on an existing run
   by design; `reset` destroys progress and needs `confirm=reset` plus
   explicit human intent.
5. **Factory selection is always explicit.** Find instances with
   `swamp model search` / `swamp data query`; the human names which factory
   definition to use. Never infer one.
6. **Ask the platform, not your memory.** When unsure of a method's
   arguments or the definition format,
   `swamp model type describe @swamp/software-factory` returns the full
   method/argument surface, and gate-failure messages tell you exactly what
   a transition still needs.

Read only the reference you need: [references/driving.md](references/driving.md)
to run work items (the loop, querying run data, presenting approvals),
[references/authoring.md](references/authoring.md) to write or edit a
definition. You rarely need both at once.

## Starting work

Create the factory once, then start as many work items on it as you like:

```
swamp model create @swamp/software-factory <factory-name>
swamp model edit <factory-name>      # fill globalArguments: stages
swamp model method run <factory-name> validate
swamp model method run <factory-name> start --input workItem=<ref>
```

Definitions can be seeded from the bundled
[references/examples/](references/examples/) — `minimal.yaml`,
`feature-factory.yaml`, `sdlc-classic.yaml`, `retry-feedback.yaml` — read
[references/authoring.md](references/authoring.md) before writing or editing
one. Have the human confirm the definition (run `describe` and show them the
Mermaid) before `start`.

## The drive loop

Read [references/driving.md](references/driving.md) for the full loop and
method reference. In short:

1. `swamp model method run <factory> status --input workItem=<ref>` refreshes
   the `status-<workItem>` record; query the fields you need. (Without
   `workItem` it refreshes `status-_factory`, a factory-wide overview of every
   run.)
2. If the stage has a `work` block, `record_dispatch workItem=<ref>` **before**
   executing it — a work-bearing stage can't advance until its execution is
   recorded, and this arms the runaway-loop guard (a repeat dispatch warns; the
   third hard-fails). Then execute the current stage's `work` spec:
   - `interactive`: do the work yourself, loading the listed `skills` and
     the `constraints` file if present.
   - `dispatch`: spawn one subagent **per listed skill** in parallel, each
     with the configured `systemPrompt`; merge findings into the stage's
     artifact.
   - `workflow` / `method`: trigger the named swamp workflow / model method
     with the (already resolved) inputs and wait. Query the stage's declared
     artifacts and `resultEvidence` after execution; if the work already
     recorded any product, never overwrite it with a driver-authored record
     that lacks the work run's correlation.
3. Record products: `record_artifact workItem=<ref> name=<n>
payload='<json>'`, `record_evidence workItem=<ref> name=<n>
payload='<json>'`.
4. Re-check `status`. **Propulsion rule**: if exactly one transition is
   `satisfied` and it has no failing or pending `human-approval` gate and no
   `manual: true`, advance automatically. If a human gate is the only
   blocker, fetch the recorded subject/own artifacts with `swamp data
query`, present their actual payloads, and stop. If several transitions
   are satisfied, ask the human.
5. `advance transition=<name>`. Gate failures return actionable reasons —
   follow them; they are the factory steering you.

After an advance reaches a terminal stage, refresh `status` and confirm the
expected terminal stage before completing any external tracker item. A profile
may expose a tracker-specific disposition field; for `supers-delivery`, require
`stage.id == "done"`, `stage.terminal == true`, and
`reconciliation.dexDisposition == "ready-for-completion"` before Dex completion.
`reframed` remains open.

`supers-delivery` reconciliation is read-only. Any source, documentation, Brief,
or tracker-file edit it discovers must return to implementation so the trusted
Git classifier and verification lanes cover that edit before postflight.

## Cycle limits

Every stage has `maxCycles` (default 5). When an entry is blocked at the
limit, the run is parked for a human: present the history and let them
`approve gateId=cycle-override:<stage>` (one grant = one entry), take an
escalation/abort transition, or rethink the approach.

## Quick reference

| I want to…                     | Command                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview of all runs           | `swamp model method run <factory> status`                                                                                                                                            |
| See what's next                | `swamp model method run <factory> status --input workItem=<ref>`                                                                                                                     |
| Start a work item              | `swamp model method run <factory> start --input workItem=<ref>`                                                                                                                      |
| Mark a stage's work as running | `swamp model method run <factory> record_dispatch --input workItem=<ref>` (before executing the work)                                                                                |
| Record a work product          | `swamp model method run <factory> record_artifact --input workItem=<ref> --input name=<n> --input payload='<json>'`                                                                  |
| Record an external fact        | `swamp model method run <factory> record_evidence --input workItem=<ref> --input name=<n> --input payload='<json>'`                                                                  |
| Resolve review findings        | `swamp model method run <factory> resolve_findings --input workItem=<ref> --input artifact=<n> --input resolutions='<json>'`                                                         |
| Human approves a gate          | `swamp model method run <factory> approve --input workItem=<ref> --input gateId=<id> --input actor=<who>`                                                                            |
| Human rejects a gate           | `swamp model method run <factory> reject --input workItem=<ref> --input gateId=<id> --input actor=<who> --input note='<why>'`                                                        |
| Move forward                   | `swamp model method run <factory> advance --input workItem=<ref> --input transition=<name>`                                                                                          |
| Lint a definition              | `swamp model method run <factory> validate`                                                                                                                                          |
| Render the machine             | `swamp model method run <factory> describe`                                                                                                                                          |
| Report a work item's history   | `swamp model method run <factory> summary --input workItem=<ref>`                                                                                                                    |
| Discover the method surface    | `swamp model type describe @swamp/software-factory`                                                                                                                                  |
| List what's recorded           | `swamp data query 'modelName == "<factory>"' --select name`                                                                                                                          |
| Fetch a payload field          | `swamp data query 'modelName == "<factory>" && name == "artifact-<workItem>-<artifact>"' --select attributes.payload.<field> --json` (see references/driving.md "Querying run data") |
