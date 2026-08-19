# Starter template coverage audit

Baseline: 2026-08-19 · Dex `fer3iq38` · policy: [ADR-0039](adr/0039-pack-neutral-compositions-and-listing-hygiene.md)

This audit measures the corpus as a creator-facing Starter-template library. It does not add category metadata to the Preset schema or create a second catalog. “Picker family” records the grouping already visible on the homepage. “Creator job” is the plain-language reason a creator would start from the Preset.

## Honest baseline

- Corpus: **101 Presets** — **48 listed** and **53 fixtures**.
- Structurally distinct Starter candidates: **39**.
- Listing inflation: **5 folds** (re-text, re-dress, or same composition language) and **4 feature proofs that should become fixtures**.
- No listed Preset has an orientation or Pack suffix.
- This is a structural count, not final aesthetic ratification. A Preset counts toward the finished epic only after the current deterministic matrix and exact-evidence human gate pass for its integrated revision.
- `pnpm verify-presets --all` passes all **192 Preset × Pack axes in both orientations**. It reports **18 non-blocking G12 warnings** on nine direct-on-field Presets under `crt-terminal`: `apollo-lunar-travelers`, `bar-chart-apollo-sample-return`, `column-us-population-1950-2020`, `counter-milestone`, `docu-flowchart`, `docu-timeline-build`, `plastic-msw-destinations`, `text-3d-cylinder`, and `wake-conversation-flow`. Each warning appears once per orientation. The warnings are existing linter output, not failures introduced by this audit.

A **Count** disposition means the Preset expresses a materially different register, composition language, creator job, or content domain. It does not mean a similarly named Pipeline variant automatically earns another listing. **Fold** means one Starter must represent the job. **Demote** means the composition is useful proof corpus but not a creator-facing starting point.

## Listed Preset dispositions

| Preset                              | Picker family      | Creator job                                   | Disposition                        | Reason                                                                           |
| ----------------------------------- | ------------------ | --------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| `achievement-complete`              | Plain              | Celebrate completed work                      | Count                              | Checklist-completion beat has its own authored form and timing.                  |
| `achievement-unlocked`              | Plain              | Announce an unlocked milestone                | Count                              | Unlock beat is materially different from checklist completion.                   |
| `apollo-lunar-travelers`            | Charts             | Explain a part-to-whole fact with dots        | Count                              | Distinct dot-field chart language.                                               |
| `bar-chart-apollo-sample-return`    | Charts             | Compare categories horizontally               | Count                              | Distinct bar-chart creator job.                                                  |
| `captions-karaoke-demo`             | Captions           | Caption speech with active-word context       | Count                              | Full-line karaoke register. Rename later to remove “demo.”                       |
| `captions-word-pop-demo`            | Captions           | Caption fast social speech one word at a time | Count                              | Word-pop register is materially different. Rename later to remove “demo.”        |
| `chapter-card-descent`              | Chapter card       | Introduce a chapter                           | Count                              | Dedicated chapter transition with depth staging.                                 |
| `checklist-project-setup`           | Checklist          | Show progress through a task list             | Count                              | Persistent checked/unchecked progress state.                                     |
| `checklist-show-rundown`            | Checklist          | Reveal an ordered rundown                     | Count                              | Sequential build-in differs materially from progress state.                      |
| `column-us-population-1950-2020`    | Charts             | Show change across ordered periods            | Count                              | Distinct column-chart temporal comparison.                                       |
| `counter-milestone`                 | Plain              | Land on a single milestone number             | Count                              | Usable counter outcome, not the counter Pipeline proof.                          |
| `cursor-trail-title-sweep`          | Type hero          | Demonstrate cursor-trail targeting            | Demote to fixture                  | Feature proof wrapped around a type hero; not a separate creator job.            |
| `docu-flowchart`                    | Flowcharts         | Explain a short linear process                | Count                              | Compact process diagram.                                                         |
| `docu-map-journey`                  | Docu               | Explain a geographic journey                  | Count                              | Distinct map composition and content domain.                                     |
| `docu-stat-build`                   | Docu               | Build one documentary stat                    | Count                              | Documentary stat-callout language.                                               |
| `docu-timeline-build`               | Docu               | Explain a dated sequence                      | Count                              | Timeline creator job and geometry.                                               |
| `imessage-friday-deploy`            | iMessage           | Recreate a short text conversation            | Count                              | Canonical choreographed conversation Starter.                                    |
| `imessage-the-bug`                  | iMessage           | Recreate a short text conversation            | Fold into `imessage-friday-deploy` | Same Surface and creator job with different copy and mark timing.                |
| `imessage-the-bug-dark`             | iMessage           | Recreate a short text conversation            | Fold into `imessage-friday-deploy` | Re-text plus field re-dress; Pack and content are dials.                         |
| `instagram-follow-demo`             | Social beats       | Ask viewers to follow on Instagram            | Count                              | Platform-specific creator CTA. Rename later to remove “demo.”                    |
| `lower-third`                       | Lower thirds       | Identify a speaker                            | Count                              | Canonical identifier overlay.                                                    |
| `optical-lens-showcase`             | Paper              | Demonstrate a refractive-lens Effect          | Demote to fixture                  | Effect study, not a durable creator job.                                         |
| `plastic-msw-destinations`          | Charts             | Explain a normalized part-to-whole fact       | Count                              | Distinct unit-grid chart language.                                               |
| `pullquote-cinematic`               | Pullquote on photo | Feature a quote over photography              | Fold into `pullquote-on-photo`     | Flat-path predecessor named as a demo; the depth-stage composition is canonical. |
| `pullquote-on-photo`                | Pullquote on photo | Feature a quote over photography              | Count                              | Canonical photographic pullquote with real depth staging.                        |
| `quote-lift-out`                    | Paper              | Pull one phrase out of a document             | Count                              | Distinct focal Annotation language.                                              |
| `quote-magnify`                     | Paper              | Magnify and annotate one phrase               | Count                              | Distinct optical focal treatment and side note.                                  |
| `quote-tear-out`                    | Paper              | Tear one quote away from its context          | Count                              | Distinct physical-document callout language.                                     |
| `research-paper-attention`          | Paper              | Explain a research paper passage              | Count                              | Citation-bearing paper explainer with guided marks.                              |
| `research-paper-critique`           | Paper              | Critique a research method                    | Count                              | Different creator job and annotation sequence from explanation.                  |
| `text-3d-cylinder`                  | Plain              | Demonstrate cylindrical 3D text               | Demote to fixture                  | Pipeline proof with a watermark, not a reusable composition job.                 |
| `title-card-newspaper`              | Newspaper          | Introduce a story as a newspaper artifact     | Count                              | Distinct faithful-document title register.                                       |
| `title-sequence-signal`             | Title sequence     | Open a titled segment                         | Count                              | Full-frame title-sequence language.                                              |
| `type-hero-drift`                   | Type hero          | Open on a large episode title                 | Fold into `type-hero-vantage`      | Same single-title composition language with modest copy/timing changes.          |
| `type-hero-vantage`                 | Type hero          | Open on a large episode title                 | Count                              | Canonical flat type-hero Starter.                                                |
| `wake-conversation-flow`            | Flowcharts         | Explain a branching conversation              | Count                              | Branching, annotation-heavy flow differs from the short linear flowchart.        |
| `watermark-channel-sig`             | Type hero          | Demonstrate a watermark Overlay               | Demote to fixture                  | Feature proof over a type hero; the library still needs a true corner-bug job.   |
| `web-document-github`               | Web document       | Quote a GitHub artifact                       | Count                              | Distinct faithful web content domain.                                            |
| `web-document-hackernews`           | Web document       | Quote a Hacker News discussion                | Count                              | Distinct faithful web content domain.                                            |
| `web-document-news`                 | Web document       | Quote a news article                          | Count                              | Distinct faithful web content domain.                                            |
| `web-document-pubmed-somatization`  | Web document       | Quote a PubMed paper page                     | Count                              | Distinct faithful web content domain.                                            |
| `web-document-reddit`               | Web document       | Quote a Reddit thread                         | Count                              | Distinct faithful web content domain.                                            |
| `web-document-twitter`              | Web document       | Quote a public X/Twitter post                 | Count                              | Canonical Twitter content domain.                                                |
| `web-document-twitter-adam-burnout` | Web document       | Quote a public X/Twitter post                 | Fold into `web-document-twitter`   | Same site composition with different baked post content.                         |
| `web-document-wikipedia`            | Web document       | Quote a Wikipedia article                     | Count                              | Distinct faithful web content domain.                                            |
| `web-document-youtube`              | Web document       | Quote a YouTube page                          | Count                              | Distinct faithful web content domain.                                            |
| `website-showcase`                  | Website screenshot | Present a creator-supplied website capture    | Count                              | Stored-capture job differs from structured site mocks.                           |
| `youtube-subscribe-demo`            | Social beats       | Ask viewers to subscribe on YouTube           | Count                              | Platform-specific creator CTA. Rename later to remove “demo.”                    |

## Fixture inventory

Fixtures remain directly loadable proof corpus and do not inflate the Starter count.

| Preset                                          | Fixture family        | Proof job                          | Disposition  | Reason                                                               |
| ----------------------------------------------- | --------------------- | ---------------------------------- | ------------ | -------------------------------------------------------------------- |
| `annotation-box-demo`                           | Annotation proof      | Box focal geometry                 | Keep fixture | Isolated Pipeline proof.                                             |
| `blank`                                         | Authoring seed        | Create from blank                  | Keep fixture | System seed, not a curated Starter.                                  |
| `captions-pack-style-demo`                      | Caption proof         | Pack-resolved caption style        | Keep fixture | Style proof rather than another caption job.                         |
| `chart-domain-survey-fixture`                   | Chart proof           | Multi-item chart contract          | Keep fixture | Domain verification corpus.                                          |
| `chromatic-aberration-demo`                     | Effect proof          | Chromatic aberration               | Keep fixture | Isolated Effect proof.                                               |
| `cloth-bend-demo`                               | Simulation proof      | Cloth bend                         | Keep fixture | Isolated simulation proof.                                           |
| `counter-demo`                                  | Overlay proof         | Counter Pipeline                   | Keep fixture | Superseded as a Starter by `counter-milestone`.                      |
| `crt-tube-demo`                                 | Effect proof          | CRT tube                           | Keep fixture | Isolated Effect proof.                                               |
| `cursor-trail-demo`                             | Overlay proof         | Cursor trail                       | Keep fixture | Isolated Overlay proof.                                              |
| `depth-of-field-bokeh`                          | Depth proof           | Bokeh behavior                     | Keep fixture | Renderer calibration.                                                |
| `depth-of-field-rack-focus`                     | Depth proof           | Rack focus                         | Keep fixture | Renderer calibration.                                                |
| `depth-of-field-tabletop`                       | Depth proof           | Multiplane tabletop                | Keep fixture | Renderer calibration.                                                |
| `depth-stage-demo`                              | Depth proof           | Dimensional stage                  | Keep fixture | Engine branch proof.                                                 |
| `deterministic-imessage-readable-audit-fixture` | Audit proof           | Deterministic iMessage readability | Keep fixture | Closed-code audit input.                                             |
| `deterministic-readable-audit-fixture`          | Audit proof           | Deterministic mixed readability    | Keep fixture | Closed-code audit input.                                             |
| `diagram-schema-fixture`                        | Diagram proof         | Every primitive contract           | Keep fixture | Schema and renderer coverage.                                        |
| `dithering-demo`                                | Effect proof          | Dithering                          | Keep fixture | Isolated Effect proof.                                               |
| `docu-timeline-build-clean-light`               | Pack calibration      | Clean Light timeline re-dress      | Keep fixture | Calibration evidence, never a listing entry.                         |
| `dof-multiplane-check`                          | Depth proof           | Multiplane capture                 | Keep fixture | Regression check.                                                    |
| `fluid-ripple-demo`                             | Simulation proof      | Fluid ripple                       | Keep fixture | Isolated simulation proof.                                           |
| `fluted-glass-demo`                             | Effect proof          | Fluted glass                       | Keep fixture | Isolated Effect proof.                                               |
| `halftone-cmyk-demo`                            | Effect proof          | CMYK halftone                      | Keep fixture | Isolated Effect proof.                                               |
| `halftone-dots-demo`                            | Effect proof          | Dot halftone                       | Keep fixture | Isolated Effect proof.                                               |
| `heatmap-demo`                                  | Effect proof          | Heatmap                            | Keep fixture | Isolated Effect proof.                                               |
| `instance-stack-vertical`                       | Overlay proof         | Instance stack                     | Keep fixture | Feature proof, not a creator job.                                    |
| `isolate-demo`                                  | Annotation proof      | Isolate focal treatment            | Keep fixture | Isolated Pipeline proof.                                             |
| `keyframes-cascade-demo`                        | Animation proof       | Generalized keyframes and Cascade  | Keep fixture | Engine contract proof.                                               |
| `lower-third-cascade-reveal`                    | Animation proof       | Lower-third Cascade                | Keep fixture | Calibration/reference proof; canonical Starter is `lower-third`.     |
| `lower-third-clean-light`                       | Pack calibration      | Clean Light lower third            | Keep fixture | Calibration evidence, never a listing entry.                         |
| `newspaper-body-test`                           | Surface proof         | Newsprint body and tape            | Keep fixture | Pipeline regression input.                                           |
| `ntsc-signal-demo`                              | Effect proof          | NTSC signal                        | Keep fixture | Isolated Effect proof.                                               |
| `optical-glass-photo-fixture`                   | Effect proof          | Optical glass over photo           | Keep fixture | Isolated Effect proof.                                               |
| `quote-vertical`                                | Reflow proof          | Vertical paper quote               | Keep fixture | Historical orientation proof, not a sibling Starter.                 |
| `server-renders-again`                          | Pack proof            | Partial substrate immunity         | Keep fixture | Pack/Surface showcase retained outside listing.                      |
| `shader-fill-demo`                              | Overlay proof         | Shader fill                        | Keep fixture | Isolated Overlay proof.                                              |
| `shader-fill-syntax-gradient`                   | Pack proof            | Syntax shader-fill dress           | Keep fixture | Appearance proof, not a separate piece.                              |
| `show-open-in-focus`                            | Integration candidate | Show-open bumper                   | Keep fixture | Candidate remains blocked by CRT Pack evidence.                      |
| `sound-escape-hatches`                          | Sound proof           | Cue overrides and mute             | Keep fixture | Sound contract proof.                                                |
| `text-anim-showcase-generic`                    | Text-animation proof  | Generic stagger                    | Keep fixture | Renderer-family proof.                                               |
| `text-anim-showcase-kinetic-center-build`       | Text-animation proof  | Kinetic center build               | Keep fixture | Renderer-family proof.                                               |
| `text-anim-showcase-kinetic-top-build`          | Text-animation proof  | Kinetic top build                  | Keep fixture | Renderer-family proof.                                               |
| `text-anim-showcase-shared-slide-opacity`       | Text-animation proof  | Shared slide/opacity               | Keep fixture | Renderer-family proof.                                               |
| `tiled-deformation-demo`                        | Deformation proof     | Tiled deformation                  | Keep fixture | Isolated Effect proof.                                               |
| `title-sequence-drop`                           | Surface proof         | Title-sequence impact motion       | Keep fixture | Feature proof; canonical listed sequence is `title-sequence-signal`. |
| `transition-particle-dissolve-demo`             | Transition proof      | Particle dissolve                  | Keep fixture | Endpoint/Effect proof, not yet a creator Starter.                    |
| `transition-seeded-shatter-demo`                | Transition proof      | Seeded shatter                     | Keep fixture | Endpoint/Effect proof, not yet a creator Starter.                    |
| `transition-sheet-peel-demo`                    | Transition proof      | Sheet peel                         | Keep fixture | Endpoint/Effect proof, not yet a creator Starter.                    |
| `transition-wipe-demo`                          | Transition proof      | Mask wipe                          | Keep fixture | Endpoint/Effect proof, not yet a creator Starter.                    |
| `tweet-stack-reaction-flood`                    | Overlay proof         | Tweet-stack pile                   | Keep fixture | Feature proof pending a durable creator-job composition.             |
| `type-hero-vantage-clean-light`                 | Pack calibration      | Clean Light type hero              | Keep fixture | Calibration evidence, never a listing entry.                         |
| `washi-tape-corner-accent`                      | Overlay proof         | Washi edge and placement           | Keep fixture | Dressing proof, not channel chrome or a creator job.                 |
| `water-demo`                                    | Effect proof          | Water refraction                   | Keep fixture | Isolated Effect proof.                                               |
| `watermark-demo`                                | Overlay proof         | Watermark                          | Keep fixture | Isolated Overlay proof.                                              |

## Coverage findings

### Current picker coverage

The homepage exposes implementation-shaped families alongside creator-shaped families. `Charts`, `Captions`, `Flowcharts`, `Lower thirds`, and `Social beats` are useful. `Plain`, `Paper`, and `Type hero` still mix unrelated jobs because grouping falls back to Surface type. The audit does not change that mechanism; the listing-reconciliation task must use the current visible families and plain labels rather than hidden metadata.

The 39 structurally honest candidates cover:

- title and chapter work: chapter card, title sequence, type hero, newspaper title;
- identification and progress: lower third, counter, checklists, achievements;
- quotations and evidence: photographic pullquote, paper callouts, research-paper treatments;
- factual explanation: four chart languages, map, stat, timeline, and two flowchart registers;
- faithful artifacts: eight web domains, iMessage, and creator-supplied website capture;
- platform beats: Instagram follow and YouTube subscribe;
- caption registers: karaoke and word-pop.

### Missing creator jobs

1. **Show-open bumper:** `show-open-in-focus` is only a fixture and still has the tracked CRT kicker gap (`tqwhuoms`).
2. **Outro/end card:** there is no full-frame closing composition with a title, next action, and clean hold for end-screen placement.
3. **Persistent identifier/bug:** watermark proofs exist, but no listed creator-ready corner bug or source identifier independent of the website-showcase composition.
4. **Creator-facing transition:** all four transition compositions are demos/fixtures; none is admitted as a reusable editorial transition Starter.
5. **Coordinated episode suite:** useful members exist, but they are not yet authored and export-verified as one coherent title/lower-third/pullquote/stat/outro set.

### Smallest ordered runway

1. **Reconcile listing hygiene first — Dex `6o9l7x3p`.** Fold five duplicates into their canonical Starters, demote four feature proofs, and remove “demo” from four counted Starter names/slugs without changing their composition meaning. This produces the honest 39-entry baseline in the picker.
2. **Close identifier and ending gaps — Dex `8zy3t3du`.** Author one persistent corner identifier and one full-frame outro/end card. They are new creator jobs and can join the episode suite.
3. **Close opening and transition gaps — Dex `75u4vxtf`.** Resolve `tqwhuoms`, then author or promote one Pack-neutral show-open bumper and one creator-facing editorial transition. Do not promote the existing demos by changing only `kind`.
4. **Build the coordinated episode suite — Dex `u0twmy3w`.** Use existing canonical Starters where possible; re-author only where consistent content/choreography requires it. The suite must include title/open, lower third, pullquote/callout, stat, and outro.
5. **Run final admission — Dex `viga7o0n`.** Execute the deterministic affected matrix and bind exact human aesthetic decisions for every counted Starter. The final count should be reported after any aesthetic rejection; the structural forecast is **43** after four genuinely new jobs, so weak or redundant candidates must be retired rather than preserving a quota.

## Mechanical check

Run:

```bash
node --experimental-strip-types scripts/audit-starter-template-coverage.ts
pnpm verify-presets --all
```

The audit script fails when a corpus Preset is added, removed, reclassified, duplicated in this audit, or given a listed Pack/orientation suffix without updating the disposition inventory.
