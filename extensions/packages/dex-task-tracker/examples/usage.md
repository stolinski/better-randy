# Clean consumer example

Run this in a disposable Git repository with Swamp and Dex installed. The example creates its model through Swamp so no model ID is fabricated.

```sh
git init clean-consumer
cd clean-consumer
mkdir -p .dex
swamp repo init --json
swamp extension pull @club_aqua_back_deck/dex-task-tracker
swamp model create @club_aqua_back_deck/dex-task-tracker consumer-dex-tracker   --global-arg ownerToken=consumer-example --json
swamp model validate consumer-dex-tracker --json
dex create "Consumer validation task" --description "Disposable extension validation task"
```

Copy the ID returned by Dex and use it only in the disposable repository:

```sh
swamp model method run consumer-dex-tracker get --input taskId=REPLACE_WITH_TASK_ID
swamp data list consumer-dex-tracker --json
```

Mutation methods are intentionally not automated in this example. A consumer should decide explicitly whether a test task may be started, completed, reopened, or retained for inspection.
