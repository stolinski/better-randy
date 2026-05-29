# research-paper-attention — Critic REVISE findings (open)

**Status:** open. Surfaced 2026-05-22 by `/critic research-paper-attention`
run that verified paper-surface-paint-bug (ADR-0017) had no regression.

The Critic returned **REVISE** with zero `pipeline-bug` and zero
`default-too-permissive` findings — the paint-bug regression test
PASSED. The findings below are pre-existing rubric items in
`research-paper-attention` that the Critic surfaced incidentally. None
are blocking; the paper-surface-paint-bug Brief was deleted on its
own merits (the R-rule-gating regression test passed).

## Preset-choice findings (Producer-actionable; require a /author rewrite Brief)

1. **Body cap-height below G4 floor.**
   `.tmp-baselines/research-paper-attention/p0.50.png` measured cap-height ~27 px at coord (1246, 720).
   G4 surface body band is 32–56 px. Suggested fix: enlarge body
   font-size by ~20% so rendered cap-height lands at ~32 px. The lever
   is the paper Surface Pipeline's body proportionality in
   `src/lib/pipelines/surfaces/paper/CanvasSource.svelte`, not the
   Preset JSON directly. See rubric-gap #1 below before acting — the
   floor itself may need revision.

2. **Body line-height loose for G4-density serif band.**
   Measured 67 px baseline-to-baseline against ~38 px letterform height
   = ratio ~1.7 against the 1.28–1.42 band. Suggested fix: tighten body
   line-height to ~1.40 so the abstract reads as a paragraph block.
   Same lever: paper Surface Pipeline CSS, not Preset JSON.

3. **Mark ease `smooth` vs preferred `sharp` for explainer voice.**
   `marks.timings[0].ease = "smooth"` in
   `src/lib/presets/research-paper-attention.json:25`. Per
   `docs/animation-rubric.md` § G7, `sharp` is channel-preferred for
   explainer / news content; a research-paper-attention preset reads
   as explainer. Suggested fix: change to `"sharp"`. Preset-level
   one-line edit; doesn't need a Brief.

## Aesthetic-miss findings (Pipeline-level, may need a Brief)

4. **Surface enter is pure vertical slide (no arc).**
   `docs/animation-rubric.md` § G8c flags pure axis-aligned slides
   as the most common AI-motion failure. The settled ease already
   supplies follow-through, so this is acceptable per the rubric;
   flagged only as channel preference. Lever: paper Surface Pipeline's
   enter motion at `src/lib/pipelines/surfaces/paper/CanvasSource.svelte`
   (introduced under ADR-0017's transform-based motion). If revised,
   consider whether the arc is added at the Pipeline level (affects
   every paper-hosted preset) or as a per-Preset opt-in.

5. **Card drop shadow is single-zone vs Q16 multi-zone preference.**
   Alpha scan along y=1000 in
   `.tmp-baselines/research-paper-attention/p0.50.png` from x=2803
   outward: one continuous gentle falloff, no tight occlusion zone.
   Q16 wants contact + diffuse zones. Note: this is the photo-real
   substrate shadow (correct *not* to use hard-offset collage shadow
   per MEMORY.md `project_research_paper_aesthetic`); the fix is to
   give the photographic shadow a contact + diffuse zone, not to
   switch shadow style. Lever: paper Surface Pipeline shadow shader.

## Rubric-gap findings (Doc work for the user)

6. **[RESOLVED 2026-05-24] Q15 "10%-of-lifetime reveal envelope" conflicts with G6's absolute enter/exit duration bands on long-duration presets.**
   `research-paper-attention` surface enter is 360 ms (G6-compliant,
   in 250–400 ms band) but only 4.7% of 7.7-second surface lifetime
   (Q15 required ≥ 10% = 770 ms under the old wording). **Resolution:**
   `docs/quality-rubric.md` Q15 amended to tie the no-pop floor to G6's
   absolute ms bands. Q15's 10% rule still binds on short presets
   (sub-2.5 s element lifetime) where 10% lands inside G6's band; on
   longer presets G6's absolute ms floor is the no-pop guarantee.
   `docs/animation-rubric.md` G6 amended with a forward reference to
   Q15 documenting the relationship. Future Critic runs will stop
   surfacing this as a rubric-gap.

7. **[RESOLVED 2026-05-25] G4 surface body band floor (32 px) appeared to be above the rule's own derivation (25–31 px).**
   `docs/animation-rubric.md` § G4's "note on band sources" was
   ambiguous about which source bound the rule. **Resolution:** the
   note was rewritten to clarify that the **empirical observation
   (40–55 px body / 80–110 px title at 4K, measured from real
   research-paper YouTube footage) is the binding source**, not the
   print-typography derivation. The published 32–56 band brackets the
   empirical observation with headroom; the print-derivation lands
   slightly below (25–31 px) and serves as a sanity check confirming
   the floor isn't arbitrary. When sources disagree, the empirical
   observation wins because it matches the rule's actual visual
   target ("cards that read as photographic documents, not signage").
   Finding #1 above (body cap-height 27 px below the 32 px floor) is
   therefore correctly classified as a `preset-choice` violation, not
   a rubric defect. Finding #1 above depends on this resolution.

## Routing

- Items 1, 2, 4, 5 → likely a single follow-up Brief
  (`paper-surface-content-tuning` or similar) that revises the paper
  Surface Pipeline's body proportionality, line-height, enter arc, and
  shadow shader.
- Item 3 → can land as a one-line preset edit anytime; not Brief-worthy.
- Items 6, 7 → user-side doc revisions to `docs/quality-rubric.md` and
  `docs/animation-rubric.md`. Doc-only PRs, not Briefs.

All findings come from the full Critic transcript on 2026-05-22; the
captures live under `.tmp-baselines/research-paper-attention/`.
