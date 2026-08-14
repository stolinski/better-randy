# Clean consumer example

Run in a disposable Git repository with Swamp installed. A Sentry DSN is optional for schema and missing-configuration validation.

```sh
git init clean-sentry-metrics-consumer
cd clean-sentry-metrics-consumer
swamp repo init --json
swamp extension pull @club_aqua_back_deck/software-factory-sentry-metrics
swamp model create @club_aqua_back_deck/software-factory-sentry-metrics \
  consumer-factory-metrics --json
swamp model validate consumer-factory-metrics --json
```

Exercise the direct terminal contract without a DSN. This performs no network request and should write an `unavailable` receipt:

```sh
swamp model method run consumer-factory-metrics emit \
  --stdin < .swamp/pulled-extensions/@club_aqua_back_deck/software-factory-sentry-metrics/files/examples/direct-emission.json
swamp data list consumer-factory-metrics --json
```

For live emission, create a vault, store `SENTRY_DSN` through stdin, and bind the model's sensitive `dsn` global argument as shown in the package README. Use a dedicated Sentry project when Factory metrics should remain separate from application errors and traces.

For canonical flow emission, create and complete an `@swamp/software-factory` work item first. Pass the real Factory model UUID returned by `swamp model get <name> --json` to `emit_flow_report`; never reuse an example UUID.
