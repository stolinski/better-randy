# Clean consumer example

Initialize a disposable consumer and install the dependencies before installing this package:

```sh
git init clean-factory-consumer
cd clean-factory-consumer
mkdir -p .dex
swamp repo init --json
swamp extension pull @swamp/software-factory
swamp extension pull @club_aqua_back_deck/dex-task-tracker
swamp extension pull @club_aqua_back_deck/dex-software-factory
swamp model create @club_aqua_back_deck/dex-task-tracker consumer-dex-tracker   --global-arg ownerToken=consumer-factory --json
swamp model create @club_aqua_back_deck/dex-software-factory consumer-profile --json
```

Edit `consumer-profile` in an interactive terminal and copy the `globalArguments` mapping from `profile-arguments.yaml`. Then compile and validate the output:

```sh
swamp model validate consumer-profile --json
swamp model method run consumer-profile compile
swamp data get consumer-profile compiled-profile --json
```

The example references three consumer-owned workflows. Define and validate those workflows before materializing or running the generated Factory. Compilation itself is deterministic and does not execute them.
