---
name: gfx-domain-aware-implementation
description: Load the typed GFX Delivery work-domain route before implementing a Factory work item.
---

# GFX domain-aware implementation

Before reading or editing source, retrieve the exact preflight route for the current Factory work item:

```bash
swamp data query 'modelName == "repo-audit" && specName == "work-domain-route"' --json
```

Select the one record whose `attributes.workItem` equals the current work item. Require:

- `schemaVersion == 2`;
- `routingAuthority == "human-task-intent-additive"`;
- the current work item;
- a non-empty `routeDigest`, `taskSnapshotDigest`, `sourceResourceName`, and `sourceWorkflowRunId`;
- schema-shaped `intent.selectedSkills` and `intent.constraintPaths` arrays.

Load every listed skill and read every listed constraint path. Use the exact union: do not remove an obligation because the task appears narrower. Free-text domain terms come only from the canonical human-authored task name. The description may add typed `GFX-Delivery-*` directives and explicit project-relative file hints; metadata may add the typed `metadata.gfxDelivery` route. The Legacy Supers spellings `Supers-Delivery-*` and `metadata.supersDelivery` are read as deprecated aliases (ADR-0053) and route identically. Never add a domain from description examples or exclusions, agent summaries, implementation prose, or changed paths at this pre-route boundary. An `unknown` intent route still enters implementation with the universal repository guidance; trusted integrated paths make the final verification decision.

Do not accept changed paths from this route or from the caller. After integration, `repo-audit.classify-change` derives paths only from the verified integration receipt and unions those trusted obligations with this additive intent.
