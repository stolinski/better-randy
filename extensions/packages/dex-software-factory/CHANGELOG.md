# Changelog

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
