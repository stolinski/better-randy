# Sources and decisions

## Source inventory

| Source                                                                 | Authority                                        | Used for                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `.claude/skills/software-factory/SKILL.md` and `references/driving.md` | Pulled `@swamp/software-factory` driver contract | Status-first loop, dispatch recording, artifacts, human gates, concurrent work-item state       |
| Pi Subagents `references/execution-controls.md`                        | Installed Pi runtime documentation               | top-level async runs, `worktree: true`, durable lifecycle/handoff artifacts, cleanup behavior    |
| Pi Subagents `src/shared/types.ts` and `src/runs/shared/worktree.ts`   | Installed runtime source                         | Honest manifest fields (`baseCommit`, child status, patch path/stat) and patch capture behavior |
| `extensions/models/dex-ready-leaf-handoff.ts`                          | Repository authority boundary                    | HMAC approval, repository lock, crash intent, root-scoped claim behavior                        |
| `extensions/models/supers-deterministic-factory-contract.ts`           | Repository Factory evidence contract             | Strict integration receipt and canonical digest                                                 |
| `docs/project-control-plane.md`                                        | Canonical Supers control-plane documentation     | Delivery stage order and read-only reconciliation boundary                                      |
| Swamp manual: workflow execution model and workflows reference         | Upstream platform documentation                  | DAG concurrency, runtime concurrency limits, model-method workflow steps                        |

## Decisions

- Class: `workflow-process`.
- Keep Swamp as state/evidence authority and Pi as process/worktree authority.
- Preserve leaf task ids as Factory `workItem` identities; group them by approved effective open execution root only for concurrency control.
- Perform integration during implementation. Classification and verification must observe the integrated target.
- Serialize the entire shared-checkout Factory tail before applying the next queued patch.
- Require committed child revisions through structured output because Pi manifests do not contain child HEAD.
- Do not add a product lane cap. Select allocated approval-bound lanes; Pi runtime capacity schedules them.

## Coverage matrix

| Required dimension       | Covered in                                   |
| ------------------------ | -------------------------------------------- |
| Preconditions            | `SKILL.md`, `references/driver-loop.md`      |
| Ordered flow             | `references/driver-loop.md`                  |
| Failure handling         | Both references                              |
| Safety boundaries        | `SKILL.md`, `references/integration-gate.md` |
| Stale/conflict behavior  | `references/integration-gate.md`             |
| Human approval boundary  | `references/driver-loop.md`                  |
| Anti-pattern corrections | `references/integration-gate.md`             |

## Remaining platform gap

Pi's handoff manifest records the common base commit and captured patch but not the child's committed HEAD. The driver therefore requires a strict child structured output and verifies the named commit against the patch before integration. A future Pi manifest version could make that revision native evidence.

Further source retrieval is low-yield: the upstream Factory, Pi handoff runtime, Dex claim adapter, and Supers control-plane contracts cover every execution seam this skill owns.
