# ADR-0054 — Lock the WebMCP operation, transaction, and security contract

## Status

**Canon (contract ratified; the operation layer, the WebMCP controller, and the parity gate it governs are separate changes).** **Amended 2026-08-31:** the body opens on gfx.computer going public, which [ADR-0052](0052-public-runtime-and-retention-architecture.md) descoped that day. Nothing in the operation, transaction, or security contract depends on that: a browser agent authors through `document.modelContext` on whichever origin serves the app, and §7's same-origin, top-level, secure-context registration rule is the same rule on a local origin.

Date: 2026-08-28

Builds on: [ADR-0032](0032-gui-agent-parity-authoring.md) (GUI ↔ agent parity over one composition model), [ADR-0034](0034-gui-design-authoring-interface.md) (the Workspace the agent shares), [ADR-0035](0035-generalized-keyframes-and-cascade.md) (the keyframe and Cascade grammar), [ADR-0045](0045-composition-media-library-and-video-track.md) (Media library and Video track), [ADR-0052](0052-public-runtime-and-retention-architecture.md) (the public Node/ffmpeg origin and zero retention), and [ADR-0053](0053-gfx-namespace-and-legacy-supers-compatibility.md) (the GFX namespace and the Public demo session)

## Context

gfx.computer goes public as a no-account authoring demo where a browser agent is a first-class author. WebMCP is the transport: the page registers tools on `document.modelContext`, and a supported browser's agent calls them.

The measured surface is small. Chrome 152 exposes `registerTool`, `getTools`, `executeTool`, and `ontoolchange`, protocol version 1.3, behind the `WebMCP` Blink feature, with `tools` in the effective Permissions Policy ([`../standard-browser-rendering-probe.md`](../standard-browser-rendering-probe.md)). Everything that makes agent authoring safe or unsafe is ours to decide on top of that.

Three tempting shapes have to be rejected before anything is built, because each of them looks like progress and each of them ends somewhere we cannot return from.

**UI automation.** Tools named `click`, `open_panel`, `select_tab`. It demos in an afternoon and it is not authoring — it couples the agent to pixel positions and rail modes, it cannot report what changed, and it breaks on every layout change. WebMCP is a transport for decisions, not for gestures.

**One raw patch tool.** `gfx_apply_patch(pointer, value)` covers the whole schema in a single afternoon too. It is also the end of the contract: it has no preconditions, no ownership, no undo label, no bounded receipt, and no way to say "that Pack does not exist, here are the four that do". A schema is not an interface.

**A thin proof.** Three tools that create a composition, set a title, and export. It is honest about being a demo and it forecloses the actual product claim, which is that a person and an agent are co-equal authors over the same visible state.

So the decision here is the contract itself: which decisions exist, who owns each one, what a caller must prove before making one, what comes back, and what the page will never let an agent do.

One more constraint shapes all of it. This runs in the visitor's browser, on the visitor's origin, inside a Public demo session ([ADR-0053](0053-gfx-namespace-and-legacy-supers-compatibility.md)). A tool is reachable by any agent the visitor has attached to the page, and composition content is untrusted text that will pass through a model. The security decisions are not a hardening pass afterwards; they are part of the shape.

## Decision

### 1. Operations are the unit, and the inventory is the contract

An **operation** is one authoring decision — "set the orientation", "add an Overlay", "weld this entrance to that one". Every operation exists once, in [`../../src/lib/platform/webmcp-operation-inventory.ts`](../../src/lib/platform/webmcp-operation-inventory.ts), which records for each row: the family that owns it, the WebMCP tool that exposes it, the composition pointers it may write, the state in which its tool is registered, whether it needs the caller's observed revision, whether it is undoable, whether it is cancellable, the Workspace focus it must move, the **exposure** that says which transports reach it, and the GUI surface that owns the same decision.

That file is machine-readable on purpose. The bidirectional parity gate reads it and rejects a row reachable from only one transport; the WebMCP controller registers exactly its tools; the operation layer implements exactly its rows. A tool with no row has no contract, and a row with no tool is a gap, not a nuance — unless the row itself declares the absence, which is what `exposure` is for (§2).

Both transports run the same operation. There is no WebMCP-only edit path, no WebMCP-only encoder, and no agent-only branch inside an operation.

### 2. Fifteen families, each owning its own subtrees

Tools are grouped into families, and a family is defined by **what an author decides**, not by which panel the control lives in:

| Family         | Decides                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `capability`   | What the engine can express, and the limits the public demo enforces         |
| `composition`  | Which composition exists and is open, and how the document identifies itself |
| `session`      | What the browser-scoped session holds, and how it is emptied                 |
| `transport`    | How the piece is framed and classified on output                             |
| `layer`        | Which Layer entities exist, in what order, as which registered variant       |
| `content`      | The words, values, and data an author writes into the piece                  |
| `placement`    | Where an element sits in the frame, at each orientation                      |
| `appearance`   | How the piece looks under its Pack                                           |
| `motion`       | When and how things move                                                     |
| `sound`        | What the piece plays                                                         |
| `media`        | The composition Media library and the Video track cut from it                |
| `playhead`     | Where the visible playhead sits, in exact frames                             |
| `validation`   | What is wrong with the composition without rendering it                      |
| `verification` | What the composition actually renders, measured on real pixels               |
| `delivery`     | Turning the composition into a file the visitor receives                     |

Non-overlap is mechanical, not editorial. Each family declares the composition pointers it owns, and **no two families declare the same pointer**. Where pointers nest, **the longest pointer wins**: `layer` owns `/state/overlays` and may add, remove, and reorder entries, while `placement` owns `/state/overlays/*/position` and `motion` owns `/state/overlays/*/enter`. A family whose ownership is marked `membership` may only add, remove, reorder, and set the identifying `type` / `id` of entries — never rewrite a field a deeper owner holds. An operation may write only pointers its own family owns.

Two boundary calls are worth recording, because both were genuinely ambiguous:

- **Pack belongs to `appearance`, not `transport`.** A Pack is appearance only ([ADR-0023](0023-pack-is-appearance-only.md)); `transport` is framing and output classification, which is why `backgroundFill` sits there — declaring one is what makes a piece a full-frame segment rather than a transparent overlay.
- **The dimensional stage belongs to `appearance`, not `placement`.** The stage is a whole-composition look decision — grade, key light, defocus. `placement` is per-element geometry. Splitting the stage across two families would have produced exactly the ambiguity the family model exists to prevent.

**`verification` is internal-only, by design.** Every family above is reachable over WebMCP except this one. Measuring real pixels — rendering an exact frame, auditing what it reads — serves this project's own render gates, and no authoring decision needs it: an agent repairs a piece from `validation`, which reads the document and costs nothing, and looks at a frame through `playhead`. Registering the rendered-verification operations would instead hand any attached agent a way to drive repeated full-frame render work with no authoring result at the end of it, on a public origin whose export limits are decided elsewhere ([ADR-0052](0052-public-runtime-and-retention-architecture.md)).

The operations still exist, still run in-process, and still name their GUI surface. The narrowing is on the transport only, and it is **recorded rather than inferred**: both rows carry `exposure: 'internal-only'`, so the parity gate reads them as an intended absence and every other row as a promise that a tool exists. "Unexposed on purpose" and "not built yet" have to be distinguishable by a machine, or the gate degrades into an argument. Adding a family or a row to this disposition means editing that field and this paragraph together.

### 3. Every edit is a revisioned, atomic transaction

The composition carries a monotonic **revision**. Every mutating operation takes the revision the caller last observed.

- **Stale revision fails.** A mismatch returns `stale_revision` with the current revision and a bounded summary of what moved, and applies nothing. An agent that read the composition, thought for ten seconds while the human dragged an Overlay, and then wrote, does not silently overwrite that drag.
- **Preflight, then apply.** The operation validates its arguments, resolves its targets, and runs schema and semantic validation on the prospective document **before** touching live state. A rejected edit leaves the composition byte-identical.
- **All or nothing.** An operation that writes several pointers writes all of them or none. There is no half-applied edit, including on cancellation.
- **One receipt.** A successful mutating operation returns the new revision, a bounded description of what changed, the validation findings that appeared or cleared, the undo label it recorded, and the focus it moved. The receipt is the only thing the agent needs in order to continue; it never has to re-read the whole document to learn what it just did.

Read-only operations carry no revision requirement and record no history. Destroying work is the exception: `composition.revert-to-starter`, `session.delete-composition`, undo, redo, and export all require the observed revision, because each one either discards or ships a specific version.

### 4. One history, one focus, one visible state

**Undo and redo are shared.** Agent edits record into the same `CompositionEditHistory` the GUI uses, in one order. `gfx_composition_undo` undoes the most recent edit whoever made it. A separate agent history would let the two authors disagree about what "the last thing" was.

**Every mutating operation moves the Workspace focus** to the entity it touched — the Overlay it added, the Mark it retimed, the chart Block it filled. This is not decoration. It is how a person watching the screen sees what the agent did, and it is why the inventory requires a focus target on every `write` row. An operation whose subject can be more than one kind of element — a keyframe channel on the Surface, an Overlay, or a Block; a Cascade weld on any of the four anchorable entities — lists every target it may reveal, and the transaction core refuses one the row does not list. Listing one target for a multi-subject operation would force it to reveal an element it did not touch, which is the opposite of what this rule is for.

**Progressive enhancement is one-directional.** With WebMCP absent or its Permissions Policy denied, the Workspace behaves exactly as it does today. Nothing in the GUI may depend on a tool being registered.

### 5. Registration is state-aware and derived, never handwritten

Tools are registered against `document.modelContext` by a controller that owns the whole lifecycle:

- **Feature detection first.** No `document.modelContext`, no registration, no console noise.
- **Dynamic membership.** A tool is registered only in a state where it can succeed. `gfx_layer_remove_overlay` does not exist until an Overlay does; `gfx_composition_undo` does not exist with an empty history. An impossible verb should be absent, not present-and-refusing — that is what stops an agent from planning around a tool it cannot run.
- **A short cold-page menu.** At most `WEBMCP_ALWAYS_REGISTERED_CEILING` tools are registered before a composition is open. A visitor who has just landed gets "see what this can do" and "make something", not the whole inventory.
- **AbortSignal owns unregistration.** Registration is scoped to a signal the controller aborts on route change, state change, and teardown. Because the measured API's authority on what is registered is `getTools()`, the lifecycle tests assert against `getTools()` rather than against the controller's own bookkeeping, and an in-flight call whose tool has been unregistered resolves as `cancelled` rather than mutating a composition that has moved on.
- **Schemas are derived, never restated.** Every enum an agent picks from — Surface, Block, Annotation, Overlay, Effect and transition types, Pack slugs, Starter slugs, sound events, text effects, orientations, rates, formats — is generated from the live registries and the Zod schema. A handwritten list is rejected in review and caught by the schema digest the parity gate records: a registry change that does not move the digest means something was copied.

### 6. Budgets, because tool text is context

- Tool names: `gfx_<family>_<operation>`, lower snake case, at most `WEBMCP_TOOL_NAME_MAX_LENGTH` characters.
- Descriptions: at most `WEBMCP_TOOL_DESCRIPTION_MAX_LENGTH` characters, saying what the operation decides and what it costs — never how to click anything.
- Results: at most `WEBMCP_RESULT_CHARACTER_BUDGET` characters. Lists are bounded and report their true total and whether they were truncated.
- The single exception is `gfx_composition_export_json`, capped at `WEBMCP_WHOLE_DOCUMENT_CHARACTER_BUDGET`. `gfx_composition_inspect` returns structure — ids, kinds, order, counts, revision — not the document body, so the ordinary "what am I working on" call stays cheap.

### 7. Security, consent, and untrusted content

- **Same-origin, top-level, secure context only.** Tools are registered only in gfx.computer's own top-level document. Never in a cross-origin frame, never on another origin's behalf. The public response carries a Permissions Policy that grants `tools` to self only.
- **No tool fetches a URL the caller supplies.** There is no agent-reachable request to an arbitrary address. The site-capture surface stays development-only, as [ADR-0053](0053-gfx-namespace-and-legacy-supers-compatibility.md) classifies it.
- **No tool opens a file picker, and no tool reads the disk.** `gfx_media_add_library_entry` accepts a bundled demo asset or a handle the visitor has already granted this page through their own gesture. An agent may ask the person to grant one; it may not grant it for them. A missing grant returns `consent_required`.
- **Export waits for the real outcome.** `gfx_delivery_export_video` returns a receipt only after the browser download actually completes. A cancelled or failed export returns `cancelled` or `export_failed` — never a success receipt for a file that does not exist.
- **Composition content is untrusted.** Text, captured document bodies, media filenames, validation finding messages, and rendered readable-text audits are the visitor's content, not instructions. Results that carry it annotate it as untrusted so a model reading a receipt does not treat a caption as a command.
- **Nothing leaves the browser.** Composition JSON is never sent to the origin, never logged, and never attached to telemetry. The Export session receives rendered frames only, and destroys itself ([ADR-0052](0052-public-runtime-and-retention-architecture.md)).
- **Failures are corrective.** Every failure names one code from `WEBMCP_OPERATION_ERROR_CODES`, the exact target it rejected, and the valid alternatives. `unsupported_variant` says which variants exist. `stale_revision` says which revision is current. "Invalid input" on its own is a defect.

### 8. What is forbidden

- **UI verbs.** No tool clicks, taps, scrolls, drags, focuses an element, opens a panel, switches a rail mode, or takes a screenshot. Enforced on tool names by `WEBMCP_FORBIDDEN_TOOL_NAME_FRAGMENTS`, and in review on behavior.
- **Raw patching.** No `apply_json_patch`, no `set_field(pointer, value)`, no expression evaluation. Every write goes through a named operation that owns its pointers.
- **Direct reactive writes.** A tool handler never assigns to engine state. It calls the operation layer, which owns preflight, atomicity, history, autosave, and focus.
- **Silent partial success.** An operation either applies and reports, or fails and reports. There is no "applied most of it".

## Alternatives rejected

- **A generic patch tool over the Zod schema.** Total coverage in one tool, and no preconditions, no ownership, no undo labels, no corrective errors, no way to hide an impossible verb. Rejected in §Context; the inventory exists so that coverage does not have to mean genericity.
- **UI-actuation tools.** Rejected as not-authoring: coupled to layout, unable to describe its own effect, and permanently behind the GUI.
- **A separate agent edit history.** Simpler to implement and it makes "undo the last thing" ambiguous for both authors. Rejected for one shared stack.
- **Registering the whole inventory at all times.** Simplest lifecycle, worst agent behavior: a cold page would offer dozens of verbs that cannot run, and an agent would plan around them. Rejected for state-aware registration plus the cold-page ceiling.
- **An export progress-polling tool.** Invites a busy loop and gives an agent a second way to ask about work it already started. Rejected: one call, one AbortSignal, one receipt.
- **Family-per-inspector-panel.** Would have made the boundaries obvious to whoever wrote the panels and meaningless to an agent, and it would break the moment the GUI reorganizes. Rejected for ownership by composition subtree.

## Consequences

- Implementation stops re-deciding. The operation layer, the WebMCP controller, the tool registrations, the agent evals, and the parity gate all read one inventory; a change to the authoring surface is a change to that file plus its two implementations.
- The parity gate becomes mechanical. Every row names its transports, so "GUI-only" and "agent-only" are detectable rather than argued, and the one deliberate exception is a declared value rather than a missing tool. It runs as [`../../scripts/audit-webmcp-operation-parity.ts`](../../scripts/audit-webmcp-operation-parity.ts) (`pnpm audit:webmcp-parity`), which resolves each row against the tool set `listWebmcpToolDefinitions()` actually registers, the operation module that claims it, and whether a route still reaches its GUI surface — then records the schema, registry, and tool digests for release acceptance. The same resolution runs under `pnpm test` in [`../../src/lib/platform/webmcp-operation-parity.test.ts`](../../src/lib/platform/webmcp-operation-parity.test.ts).
- Adding a capability now costs a row. That is deliberate: an operation without an owning family, a precondition, and a GUI path is not finished.
- Non-overlap is testable. Family pointer ownership is checked in [`../../src/lib/platform/webmcp-operation-inventory.test.ts`](../../src/lib/platform/webmcp-operation-inventory.test.ts), so a new operation cannot quietly reach into another family's subtree.
- The registered tool set changes as the composition changes. `ontoolchange` fires more often than a static registration would, and an agent that caches a tool list will occasionally call a tool that has just been unregistered — which is why in-flight calls resolve as `cancelled` instead of applying.
- Two things stay outside this contract on purpose: how the standard-browser fallback renders frames, and what the public origin's export limits are. Both are decided elsewhere ([ADR-0052](0052-public-runtime-and-retention-architecture.md) and the browser-rendering lane) and surface here only through `gfx_capability_inspect_limits` and the corrective codes.
