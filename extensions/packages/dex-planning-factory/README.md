# @club_aqua_back_deck/dex-planning-factory

Compile repository-owned planning policy into a portable, human-gated Swamp Software Factory profile.

## What this package owns

The compiler generates this lifecycle:

```text
inventory → tracker inventory → clarification → clarified intent
          → documentation effects → graph proposal → independent review
          → human approval → plan application → planning audit → handoff
```

Rejected, parked, failed-apply, failed-audit, aborted, and successful outcomes are explicit terminal stages. The compiler owns the stage graph, typed artifacts, transition gates, cycle limits, and bindings between stages.

The package is a profile compiler, not a repository adapter and not another Factory engine. It contains no project paths, credentials, task data, tier names, or documentation policy. Profiles may add a generic `applicationBundle.validator` hook between graph proposal and review. The compiler then previews an opaque consumer payload in a typed envelope and leaves route names, payload validation, and mutation rules to the consumer.

## Safety boundary

You supply five repository-owned adapters, plus an optional bundle validator:

- Inventory, tracker inventory, documentation policy, planning audit, and optional application-bundle validation adapters must attest that they are read-only.
- The plan application adapter is the sole configured write slot.
- Legacy profiles receive the exact reviewed plan and deterministic Plan Applier normalization after the native human approval gate.
- Bundle-enabled profiles receive the complete validated preview. An approval-free bundle enters application directly; an approval-bound bundle crosses the current-cycle native human gate on the transition immediately before application.
- Planning ends with a typed handoff. It does not start Delivery.

The optional bundle envelope declares whether Dex mappings and human approval are required. The consumer validator must prove those claims against its strict payload. An approval from an earlier review cycle cannot unlock application.

## Versions

This release compiles for:

- `@swamp/software-factory@2026.06.24.1`
- `@club_aqua_back_deck/dex-plan-applier@2026.08.06.1`
- `npm:zod@4.4.3` bundled into the model

The manifest declares the two lifecycle packages as dependencies so Swamp resolves them when this extension is pulled.

## Install

```sh
swamp extension pull @club_aqua_back_deck/dex-planning-factory
swamp model create @club_aqua_back_deck/dex-planning-factory project-planning-profile --json
```

Always create the consumer instance with `swamp model create`; Swamp owns its ID and definition scaffold. Set its `globalArguments` from [`examples/profile.json`](examples/profile.json), replacing only the generic adapter, prompt, skill, gate, and budget values with repository-owned policy.

Then validate and compile it:

```sh
swamp model validate project-planning-profile --json
swamp model method run project-planning-profile compile
swamp data get project-planning-profile compiled-profile --json
```

The `compiled-profile` resource contains the exact `globalArguments` for an `@swamp/software-factory@2026.06.24.1` model. Compilation is deterministic and does not execute adapters or mutate Dex.

## Consumer responsibilities

- Implement and validate every named workflow or model method before running the materialized Factory.
- Let new-idea inventory begin from a bounded non-Dex work-item identifier when no approved graph exists; duplicate discovery must still inspect the official Dex snapshot without pretending the intake identifier is an existing task.
- Keep pre-approval adapters read-only and keep all repository writes behind the application adapter.
- Use `@club_aqua_back_deck/dex-plan-applier@2026.08.06.1` or an adapter with the same approved-plan boundary and recovery guarantees.
- Materialize the compiled arguments into a Factory definition created through `swamp model create`.
- Require a real human to approve every current-cycle bundle whose validated envelope declares approval; use approval-free routing only for consumer policy that explicitly permits it.
- Keep Delivery orchestration separate from the Planning profile.
- Configure `adapters.terminalObserver.workflow` when terminal observability is required. Done, rejected, parked, failed-apply, failed-audit, and aborted then pass through outcome-specific observability stages before becoming terminal.
- In repository-owned Delivery handoff workflows, normalize claimed/resumed and terminal `no-ready-work` or `human-gate` outcomes on separate guarded branches. Terminal branches must pass an empty Factory-state list rather than interpolate a null task ID.

See [`examples/usage.md`](examples/usage.md) for a clean-consumer walkthrough.

## License

MIT. See [`LICENSE.txt`](LICENSE.txt).
