# Factory cockpit Prime Agent extension

Project-local telemetry foundation for measuring Factory agent cost and skill routing without storing prompts, tool outputs, paths, or work-item ids.

## Captured

- Per-turn input, output, cache-read, cache-write, total tokens, and provider cost
- Provider request byte size (size only; request content is never stored)
- Context usage after each turn
- Model/provider and stop reason
- Tool count, failures, and aggregate duration
- Compaction count and pre-compaction token level
- Visible skill count and metadata size
- Description-overlap candidates for skill cleanup
- Skill use inferred from skill-file or Python-import access; raw tool arguments are never stored

Runtime events are appended to `~/.prime/agent/telemetry/factory-cockpit/<project-fingerprint>.ndjson`. Each ledger rotates at 5 MiB. Project and session paths are represented by 16-character SHA-256 fingerprints and are never stored.

Optional bounded Factory dimensions can be supplied by the driver through `FACTORY_NAME`, `FACTORY_PROFILE`, `FACTORY_STAGE`, and `FACTORY_DEFINITION_VERSION`. Invalid or unbounded values are discarded. Do not add a work-item id.

## Commands

- `/factory-cockpit` — show current-session usage and execution telemetry
- `/factory-cockpit hide` — hide the cockpit widget
- `/factory-skills` — show skill metadata cost, inferred use, and overlapping descriptions

Use `/reload` after editing the extension. At `agent_end`, the extension sends the current prompt batch to `supers-factory-sentry-metrics.emit_agent_telemetry` through non-interactive Swamp stdin. That model reuses the existing vault-backed Factory DSN, emits bounded Sentry metrics plus a `gen_ai.agent` transaction, flushes, and stores an idempotent `agent-receipt`. The extension never reads or receives the DSN. Set `FACTORY_COCKPIT_SENTRY=off` to keep local capture while disabling emission.

## Test

```bash
node --experimental-strip-types --test .prime/agent/extensions/factory-cockpit/*.test.ts
```

## Global installation

This Mac installs `~/.prime/agent/extensions/factory-cockpit.ts` as a thin global loader, so the cockpit is available from every Prime Agent working directory. The loader delegates to this checked-in implementation and avoids double registration when Better Randy's project-local extension is already discoverable. Agent telemetry from other repositories uses Better Randy's Swamp observability model as the central DSN boundary while tagging the bounded source-project slug.
