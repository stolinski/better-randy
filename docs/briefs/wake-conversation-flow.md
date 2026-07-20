# Wake Conversation Flow

**Kind:** preset
**Slug:** wake-conversation-flow

## Pitch

An animated systems explainer showing how Reachy Mini moves from passive wake-word listening into a continuous Hermes conversation, then returns to the listening loop when a stop phrase is heard. It lands for the channel because it turns a branching voice-assistant state machine into one direct, legible visual story: wake, understand, converse, sleep, repeat.

## Surface(s) involved

Use the `plain` Surface as an opaque full-frame warm-dark field in horizontal 16:9 at native 3840x2160. Art-direct the diagram explicitly rather than using an auto-layout: organize the passive wake path, wake-phrase branches, and continuous-conversation loop into distinct readable bands while keeping the return arrows visually separate from the forward path.

## Content sample

Title:

> HOW WAKE MODE WORKS

Nodes, verbatim:

- Start listening
- Reachy mic / WebRTC
- Capture 3s with VAD
- Whisper / audio -> text
- Wake phrase?
- Wait 350ms
- Quick acknowledgement
- Conversation mode
- Send request to Hermes
- Reachy speaks
- Listen -> STT -> Hermes -> TTS
- Stop phrase?
- Acknowledge sleep

Branch labels, verbatim:

- NO
- PHRASE ONLY
- + REQUEST
- YES

The `NO` branch returns from `Wait 350ms` to `Capture 3s with VAD`. `PHRASE ONLY` runs through `Quick acknowledgement` into `Conversation mode`. `+ REQUEST` runs through `Send request to Hermes` and `Reachy speaks` into `Conversation mode`. Conversation mode proceeds through `Listen -> STT -> Hermes -> TTS` to `Stop phrase?`; its `NO` branch returns to the listen/STT/Hermes/TTS node, while `YES` runs through `Acknowledge sleep` and returns to `Capture 3s with VAD`.

## Motion plan

Use a **boot trace** built from the Syntax Pack's lean-in vocabulary:

1. The mono title lands first with a fast `settled` entrance.
2. Each box node enters with `settled-place` motion.
3. Each connecting `edge-arrow` follows with `stroke-draw`, using Cascade welds in strict reading order: title -> node -> edge -> next node.
4. Reveal the primary wake path first, then the `NO` retry branch, then the phrase-only branch, then the request branch.
5. Reveal continuous conversation after both wake-success branches converge.
6. Close the conversation retry loop and sleep-return loop last so the topology resolves rather than appearing all at once.
7. Hold the completed diagram long enough to read before a short, decisive exit.

The total runtime is 16 seconds at 30 fps. Use approximately 420 ms strong-deceleration node entries and approximately 350 ms accelerated exits, with 80-120 ms Cascade offsets between a landed node and its outgoing stroke. Keep motion-emitted sound restrained: soft default impacts on node settles and default draw sounds on arrows, all derived from their motion windows.

Focal slots by beat are the currently entering node and its outgoing edge. Decision nodes (`Wake phrase?` and `Stop phrase?`) are the only persistent accent nodes. Avoid a live traversal pulse after the build; the final frame should settle into a readable static diagram.

## Channel chrome notes

- Mono signature thread: Space Mono carries the title, node labels, and branch labels.
- Card construction: flat opaque Syntax plates with visible borders, system radius, and restrained stepped hard-offset shadows.
- Accent: use the Syntax yellow only for the two decision nodes, branch labels, and any single active cue needed during their reveal. Do not introduce additional saturated hues.
- Diagram strokes: clean printed rules with `wobble: 0`; no scribbly or hand-jittered chrome.
- Grit: a subtle composition-wide `paper-grain` Effect bonds the diagram to the field without reducing text clarity.
- Torn edges and tape are intentionally omitted. The current Syntax Pack reserves tears and tape for quoted physical documents; this is channel chrome on a systems diagram.
- Registration jitter is intentionally omitted because the current Syntax diagram language is clean printed rules, not risograph misregistration.
- No gradients, glow, gaussian shadows, camera moves, or typewriter motion.

## Engine work required

None - compose from the existing Registry:

- Surface: `plain`
- Blocks: `node`, `edge-arrow`, and `label`
- Animation: `enter`, `exit`, and Block Cascade anchors
- Effect: `paper-grain`

Use `box` nodes for states and explicit `straight`, `elbow`, or `arc` routes as the authored layout requires. Branch captions are `label` Blocks placed beside their corresponding arrows. The composition is full-frame and therefore declares an opaque `backgroundFill`.

## ADR required?

no

## Open questions

## What 'done' looks like

`src/lib/presets/wake-conversation-flow.json` Critic-`ACCEPT`s at native 3840x2160 resolution.
