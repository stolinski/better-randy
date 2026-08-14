# Clean consumer example

Initialize a disposable Git repository and install the package:

```sh
git init planning-consumer
cd planning-consumer
swamp init . --tool none --json
swamp extension pull @club_aqua_back_deck/dex-planning-factory
swamp model create @club_aqua_back_deck/dex-planning-factory consumer-planning-profile --json
```

Copy the object in `profile.json` into the generated model definition as `globalArguments`. Its names are intentionally generic. Replace them with repository-owned adapters before running a materialized Factory; do not put absolute source-repository paths, secrets, or project-specific task data in the profile.

Validate and compile without executing any adapter:

```sh
swamp model validate consumer-planning-profile --json
swamp model method run consumer-planning-profile compile
swamp data get consumer-planning-profile compiled-profile --json
```

The compiled resource targets exactly `@swamp/software-factory@2026.06.24.1`. Create that Factory through Swamp, then copy only the compiled `factoryArguments` into its `globalArguments`:

```sh
swamp model create @swamp/software-factory consumer-planning-factory --json
swamp model validate consumer-planning-factory --json
```

Before a live run, implement and validate all five consumer adapters. The first four declared read-only adapters must not write repository state. The application adapter must call the pinned `@club_aqua_back_deck/dex-plan-applier@2026.08.06.1` boundary only after native current-cycle human approval.
