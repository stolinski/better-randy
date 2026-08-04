# WebMCP Agent Access — an in-session copilot in the Workspace

> Captured 2026-08-03 from a brainstorm; split out of [[shared-asset-service]] 2026-08-04. Speculation tier — not designed, not scheduled. WebMCP itself is proposal-stage (Chrome flag today, origin trial from Chrome 149), so this idea is deliberately downstream of the standard stabilizing.

## Pitch

The Workspace page declares the composition model's verbs as [WebMCP](https://developer.chrome.com/docs/ai/webmcp) tools. A browser-resident agent can then co-edit the **open session** with the user: add an overlay, set a keyframe, retime a beat, switch the Pack, kick an export — while the user watches the same canvas, timeline, and inspector update live.

This is a genuinely new client class, distinct from every agent Supers serves today. Claude Code editing Preset JSON is an *offline author* — it produces a document, and the human reviews the render. A WebMCP agent is an *in-session collaborator* — it works inside the user's live editing session, its mutations land through the same engineState path the inspector uses, and fork-on-edit, autosave, and undo all apply, visibly.

## Why

- **Parity doctrine makes the surface nearly free.** GUI↔agent parity ([ADR-0032](../adr/0032-gui-agent-parity-authoring.md)) means every schema field already has both an inspector editor and a programmatic path. A WebMCP tool set is a veneer over operations that already exist — declaring them to the browser is wiring, not capability work.
- **Session semantics come for free.** Because mutations ride the inspector's own path, an agent edit is undoable, autosaved, and fork-guarded exactly like a human edit. No parallel mutation channel to keep honest.
- **Auth rides the page session.** If the [[shared-asset-service]] auth path ships, WebMCP calls are automatically user- and team-scoped — the agent acts as the logged-in user, with no separate agent-identity or token machinery.
- **A flagged Chrome is already home turf.** Supers requires `--enable-blink-features=CanvasDrawElement` to render at all; a flag-gated browser capability is far less alien here than in a normal web product. The experiment can run in the same sanctioned profile the engine already demands.

## Not gated on the hosted service

This idea seeded as "connect agents to the hosted tool," but WebMCP doesn't actually depend on hosting. The Workspace page is a page — the **local** app at `localhost:7263` can declare tools today (behind the flag) and an in-browser agent can co-edit a local session. The hosted service only changes what the session is scoped to (team assets, remote store); it doesn't create the capability. That makes this independently explorable, and independently shelvable.

## Two transports, one operation set

WebMCP is the enhancement, never the foundation. The agent-access architecture is two transports over the same domain verbs:

1. **Standard remote MCP server** — boring, shipping-today MCP over HTTP. Serves external and headless agents (Claude Code, CI, Critics, batch renders) and every workflow that needs determinism. If the [[shared-asset-service]] exists, this is its registry/store/render API; locally, the shipped CLI lane in [`user-composition-workflows.md`](../user-composition-workflows.md) already covers headless render.
2. **WebMCP in the Workspace page** — the same verbs declared to in-browser agents for live co-editing sessions. Structurally browsing-context-only: it cannot serve headless work, and it should never be asked to.

Both transports front one operation set. A verb that exists in one and not the other is a parity bug.

## Tool surface: composition verbs, not UI verbs

Expose the composition model — get/patch composition JSON, add overlay, set keyframe, retime, switch pack, export — never UI-shaped tools ("click the inspector field," "set input X"). Agents already speak Preset JSON fluently, coarse domain verbs survive chrome redesigns, and the schema is the one contract both the GUI and every agent already bind to.

## Status and caveats (as of capture)

- **Proposal-stage.** Behind a Chrome flag now; origin trial from Chrome 149; API explicitly subject to change. Nothing here is build-ready.
- **Browsing-context-only.** Tools exist only while the page is open in a participating browser. No headless, no external agents — that's what transport 1 is for.
- **Security model is origin isolation + Permissions Policy** (`allow="tools"`), with tools declared as JSON-Schema-typed functions via imperative JS or declarative HTML. The browser owns the permission UX.
- Treat the whole thing as **progressive enhancement over the real API** — if WebMCP dies as a standard, transport 1 loses nothing.

## Non-goals

- **No UI-shaped tools.** The tool surface is the composition model, full stop.
- **Never the only agent path.** Headless, CI, and Critic flows stay on standard MCP / the CLI lane regardless of what WebMCP becomes.
- **No building against the flag.** Exploration waits for at least the origin trial; shipping waits for the standard.

## Remaining opens

- **Which agent consumes it.** Chrome's built-in agent surface, extension-based clients, something else — and what permission/consent UX the browser actually provides.
- **Verb-set boundary.** Full parity with the schema, or a curated safe subset — is `export` exposed? Anything destructive?
- **Keeping declarations in lockstep with the schema.** Hand-maintained tool declarations will drift; generating them from the Zod schema / pipeline registry is probably the only honest answer.
- **Critic interaction.** An in-session agent is a producer — does its work hand off to the Critic like any other producer, or does the live human-in-the-loop count as the critic (as it does for GUI authoring today)?
- **Visibility of agent edits.** Whether the GUI distinguishes agent mutations from human ones (attribution, presence), or whether undo-grouping alone is enough.
