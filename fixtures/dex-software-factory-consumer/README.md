# Dex software Factory clean-room fixture

This fixture intentionally contains no Supers names, contracts, workflows, or
policy. `profile.json` is the complete consumer input to
`@club_aqua_back_deck/dex-software-factory`.

The portability test creates a temporary Git, Dex, and Swamp repository; loads
only the two local reusable model extensions; pulls the pinned
`@swamp/software-factory` dependency; creates model definitions through the
Swamp CLI; compiles and materializes the profile; and validates the generated
Factory with the upstream loader.

The named `consumer-policy` methods are deliberately external adapter slots.
The fixture driver records deterministic method outcomes so the test remains
independent of any repository policy implementation. Terminal cleanup uses the
real `@club_aqua_back_deck/dex-task-tracker` instance against temporary Dex
tasks.

Run the complete matrix from the repository root:

```bash
~/.swamp/deno/deno test --allow-all scripts/dex-software-factory-portability.test.ts
```

The test requires the `swamp`, `dex`, and `git` executables plus registry access
to pull the version-pinned upstream Factory. It never reads or writes the
repository's `.dex` or `.swamp` run data.
