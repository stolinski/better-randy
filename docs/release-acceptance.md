# Release acceptance

```
pnpm seal:release-acceptance
```

Binds every acceptance claim for this release to one release identity and writes
`docs/release-acceptance-manifest.json`. Exits non-zero, naming what is wrong,
whenever the release cannot be sealed.

The manifest is regenerated per run and is not committed: a checked-in copy would
always name its parent commit rather than the one it sits in. The authority is
the run — its exit code, the rejections it prints, and the digest it reports.

## Why it exists

Acceptance was spread across six independently-run verifiers, each writing its
own evidence file whenever somebody happened to run it. Read one at a time they
all said "verified". Read together they were describing five different builds —
the image gate measured one commit, the decode matrix another, the demo-serving
gate a third, and the authoring scenario recorded no build at all. That is not a
weaker form of acceptance. It is none, because no single build was ever shown to
pass everything at once.

The seal makes that disagreement fatal instead of invisible.

## The release identity is local

The release is a commit in this repository plus the image and configuration built
from it — never a deployed URL's self-report. `gfx.computer` has no live origin
to interrogate; [ADR-0052](adr/0052-public-runtime-and-retention-architecture.md)
ships a production-shaped local origin instead.

A release is sealed from a committed tree. Uncommitted work means the evidence
and the manifest describe different source, so it blocks the seal. The manifest
itself is excluded — it is the seal's output, not one of its inputs.

## What it reads

`RELEASE_ACCEPTANCE_EVIDENCE_INVENTORY` in
[`src/lib/platform/release-acceptance-manifest.ts`](../src/lib/platform/release-acceptance-manifest.ts)
is the list, one row per artifact: where it lives, the one command that
regenerates it, where it states the release it measured, how it reports its own
outcome, and which subjects it is trusted for. Adding a verifier means adding its
row — an artifact absent from that list contributes nothing to acceptance no
matter how green it is.

The seal runs nothing itself. A stale artifact is the thing it exists to catch,
so refreshing one silently would defeat it. When a row is rejected, re-run the
producer named in the rejection against a build of the current commit.

## Why it fails

Every rejection names one artifact and one reason:

| Code                          | What it means                                           |
| ----------------------------- | ------------------------------------------------------- |
| `evidence-absent`             | The producer has never run.                             |
| `release-identity-unreadable` | The artifact cannot say which build it measured.        |
| `release-identity-mismatch`   | The artifact measured a different commit — it is stale. |
| `objective-check-failed`      | The artifact reports its own failure.                   |
| `subject-value-absent`        | The artifact is missing a value it is trusted for.      |
| `subject-uncovered`           | Nothing in the repository produces that subject at all. |
| `worktree-not-committed`      | The sealed tree is not the released tree.               |
| `human-decision-pending`      | An aesthetic decision has not been made.                |

`sealed: false` is the ordinary outcome mid-epic. `sealed: true` means one commit
was shown to pass everything at once, which is a rarer and stronger claim than
six green files.

## The human decisions

Deterministic checks decide pass and fail. Two things about this release are
Scott's alone, and a decision still outstanding blocks the seal exactly like a
failed check does.

| Decision               | State                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `identity-mark`        | **Ratified 2026-08-31** — the Slate ([`docs/identity/README.md`](identity/README.md)), retiring the achromatic Quarter ratified three days earlier. |
| `scenario-composition` | **Pending.** Judged from the frames and exports in `docs/browser-probes/gfx-authoring-scenario.json`, collected by the gfx-factory aesthetic gate.  |

`RELEASE_ACCEPTANCE_HUMAN_DECISIONS` carries both. Ratifying the outstanding one
means replacing its row with a `ratified` decision naming the choice, the date,
and the record that holds it.
