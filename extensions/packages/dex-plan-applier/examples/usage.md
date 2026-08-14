# Clean consumer validation

Run this sequence in a disposable directory with Swamp and Dex installed. It
creates a real consumer model, applies a two-task graph, and replays the
identical plan to verify that no duplicate tasks are created.

```sh
mkdir clean-plan-applier-consumer
cd clean-plan-applier-consumer
git init
mkdir -p .dex
swamp repo init --json
swamp extension pull @club_aqua_back_deck/dex-plan-applier
swamp model create @club_aqua_back_deck/dex-plan-applier consumer-dex-plan-applier \
  --global-arg ownerToken=consumer-planning-factory --json
swamp model validate consumer-dex-plan-applier --json
```

Copy `approved-plan.json` from this package into the disposable repository, then
apply it:

```sh
swamp model method run consumer-dex-plan-applier apply-plan \
  --stdin < approved-plan.json --json
```

Replay the byte-identical approved plan:

```sh
swamp model method run consumer-dex-plan-applier apply-plan \
  --stdin < approved-plan.json --json
```

Inspect typed outputs through Swamp and inspect the repository ledger through
the supported Dex interface:

```sh
swamp data list consumer-dex-plan-applier --json
dex list --all --json
```

The second application should return the same client-reference-to-Dex-ID
mapping, and Dex should still contain one epic with two child tasks. Remove the
disposable directory after inspection.
