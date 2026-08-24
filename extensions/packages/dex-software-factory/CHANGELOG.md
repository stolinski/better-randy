# Changelog

## 2026.08.24.1

- Accept the optional machine-completion profile argument at the model boundary.
- Remove reproduction identity from machine completion authorization; observed Sentry evidence plus ordinary passing Delivery checks now authorizes completion.

## 2026.08.22.1

- Add an optional machine-completion lane that is gated by exact non-visual verification and leaves the ordinary human completion gate unchanged.
- Keep machine and human task completion behind one explicit consumer workflow boundary.

## 2026.08.16.14

- Bind every Pi reservation, launch claim, runtime receipt, and handoff to the trusted current profile model instance name instead of a project-specific name.
- Make operational failure authorization workflow routing configurable and ship an exact portable workflow asset with installation and validation instructions.
- Require clean consumers to create and read the target Factory before substituting its exact ID into profile arguments.

## 2026.08.16.13

- Persist the exact canonical frozen Pi request and expose it only through the trusted `get_pi_dispatch_request` method.
- Make retry accept only a dispatch token and fresh attempt ID, then recompute the stored request, task, and token bindings before launch.
- Restrict submission parking to unbound pending or uncertain transport states.
- Clarify that terminal observers persist and verify projected done, aborted, and operational-escalation outcomes without advancing the Factory; generated preterminal stages own gated finalization.

## 2026.08.16.12

- Make Pi submission-attempt replay explicit and prevent a consumed attempt identity from launching twice.
- Require the exact durable attempt receipt before reconciliation and return typed per-root errors without reconciling attempt-recording failures.
- Gate launch, claim, handoff, retry authorization, and reconciliation by explicit source-state transition tables so old attempts cannot revive paused or terminal delivery.
- Classify pre-claim transport terminals separately from claimed execution failures and bind claimed failures into operational recovery.
- Fail closed on newly created malformed lost-ack candidates while ignoring package-proven old or unrelated artifacts.

## 2026.08.16.11

- Verify installed Pi normalized one-worker workflow lifecycle artifacts and defer child launch-contract proof until completion.
- Consume transport budget only through explicit submission-attempt recording; reconciliation remains read-only and idempotent.
- Keep bound dispatch states monotonic and require current outbox, Factory status, and profile-owned handoff acceptance at integration.
- Correct the published profile example and setup ordering for the required target Factory identity.

## 2026.08.16.9

- Add durable per-root Pi dispatch outbox, fixed runtime receipt verification, single-writer execution claims, and handoff binding.
- Replace fictional atomic batch dispatch with sequential top-level async submission and idempotent transport reconciliation.

## 2026.08.16.8

- Persist a dispatch-boundary claim before trusted work execution and reject every repeated or stale claim.
- Require the authoritative latest current dispatch journal run identity.

## 2026.08.16.7

- Make the trusted profile boundary the sole execution path for workflow and method work after dispatch, with schema-v5 exact dispatch-run receipts on failure and no rerun by the driver.
- Fail dispatch prerequisites when the selected open leaf or any open ancestor has a known blocker that is not completed.

## 2026.08.16.6

- Bind operational workflow recovery to the exact failed run id returned by the current invocation and reject missing or stale run identities.
- Validate and submit the exact immutable Pi `runs.run` request, including compiled skills, prompt, command, constraints, output schema, context, and acceptance.

## 2026.08.16.5

- Bound recovery receipts to the exact Supers Factory id and current dispatch attempt.
- Replaced caller-controlled execution with fixed probes and authoritative current-work execution.
- Failed Pi handoffs now fail closed to human escalation when no trusted Pi query interface is available.
- Compiled implementation as isolated dispatch work and projected terminal observability before finalization.

## 2026.08.16.4

- Added a trusted execution-boundary owner that issues durable operational failure receipts only after a real failed command/workflow or a verified failed Pi handoff manifest, then revalidates the exact current Factory dispatch.
- Required a successful failure-authorizer workflow plus exact stage/cycle/attempt/digest bindings before operational recovery opens.
- Kept terminal observability recoverable until summary and receipt verification succeed, including human operational escalation.
- Hardened dispatch prerequisites with opaque content-addressed plans and exact workflow, method, dispatch, and interactive work-mode binding.

## 2026.08.16.3

- Cover every generated work-bearing nonterminal stage with history-preserving operational recovery.
- Require content-addressed, current-cycle execution receipts; generic failure artifacts no longer authorize objective rework.
- Keep objective verification failures on each profile's existing correlated verification route.

## 2026.08.16.2

- Add typed per-stage execution failures, operational recovery stages, and explicit human escalation.
- Re-enter recovered stages as fresh Factory cycles instead of resetting run history.
- Keep objective failures on the implementation rework path.

## 2026.08.16.1

- Add closed-objective verification routing with a non-mutating unavailable-evidence pause.
- Add human aesthetic approval and decision-binding stages tied to the exact work item, integrated revision/tree, matrix run/manifest/bundle/evidence digests, and approval identity, without Critic authority.
- Make reconciliation completion-only for closed-objective profiles.

## 2026.08.15.1

- Inject `change-summary` into read-only reconciliation so consumers can confirm pre-classification integration evidence.
- Make the reconciliation prompt explicitly forbid repository and tracker mutation.

## 2026.08.07.1

- Add an optional terminal-observer workflow adapter.
- Route done and aborted outcomes through required observability stages when configured.
- Keep existing profiles backward compatible when no observer is configured.

## 2026.08.06.2

- Add a distinct postflight `completionGate` that parks Delivery until a human explicitly approves the exact task cycle.
- Require a repository-owned completion workflow for gated profiles and provide a rejection route back to implementation.

## 2026.08.06.1

- Explain Dex, Swamp Software Factory, and how the profile compiler connects them.
- Document the generated lifecycle, consumer-owned configuration, and portability boundaries.
- Simplify dependency installation and correct the README license section for MIT.

## 2026.08.05.1

- Initial publication candidate.
- Compile consumer-owned adapters, prompts, contracts, routing, and cycle budgets into deterministic `@swamp/software-factory` arguments.
- Preserve project policy behind named workflow and model adapters.
- Enforce terminal Dex completion ordering and bounded review/rework loops.
- Emit a versioned profile resource identifying the target Factory type and version.
- Pin Zod to `npm:zod@4.4.3`.
