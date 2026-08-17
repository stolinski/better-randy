# Clean consumer example

Initialize a disposable consumer and install this package:

```sh
git init clean-factory-consumer
cd clean-factory-consumer
mkdir -p .dex workflows
swamp repo init --json
swamp extension pull @club_aqua_back_deck/dex-software-factory
```

Create the tracker and target Factory first. Read the Factory back and preserve its exact generated ID before creating the profile:

```sh
swamp model create @club_aqua_back_deck/dex-task-tracker consumer-dex-tracker \
  --global-arg ownerToken=consumer-factory --json
swamp model create @swamp/software-factory project-delivery --json
PROJECT_DELIVERY_ID="$(swamp model get project-delivery --json | jq -er '.id')"
test -n "$PROJECT_DELIVERY_ID"
swamp model create @club_aqua_back_deck/dex-software-factory \
  project-delivery-profile --json
```

Install and validate the shipped failure-authorizer workflow. The example uses the configurable name `project-failure-authorizer`:

```sh
cp .swamp/pulled-extensions/@club_aqua_back_deck/dex-software-factory/examples/project-failure-authorizer.workflow.yaml \
  workflows/workflow-project-failure-authorizer.yaml
swamp workflow validate project-failure-authorizer --json
```

Create a concrete profile argument file from the shipped fragment. The marker is intentionally not a valid UUID, so compilation cannot silently bind an example ID:

```sh
sed "s/REPLACE_WITH_PROJECT_DELIVERY_ID/$PROJECT_DELIVERY_ID/" \
  .swamp/pulled-extensions/@club_aqua_back_deck/dex-software-factory/examples/profile-arguments.yaml \
  > /tmp/project-delivery-profile-arguments.yaml
grep -F "sourceFactoryId: $PROJECT_DELIVERY_ID" /tmp/project-delivery-profile-arguments.yaml
swamp model edit project-delivery-profile
```

In the editor, replace `globalArguments` with the mapping from `/tmp/project-delivery-profile-arguments.yaml`, then replace the remaining example adapter names and prompts with consumer-owned configuration. Validate and compile only after the exact target Factory ID and `profileModelName: project-delivery-profile` are present:

```sh
swamp model validate project-delivery-profile --json
swamp model method run project-delivery-profile compile
swamp data get project-delivery-profile compiled-profile --json
```

The profile also references consumer-owned preflight, classify, and postflight workflows. Define and validate those before materializing or running the generated Factory. Compilation is deterministic and does not execute them.
