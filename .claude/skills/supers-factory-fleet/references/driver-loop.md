# Fleet driver loop

## 1. Establish central state

1. Require a clean parent checkout. Pi worktree fanout refuses ordinary dirty state, and integration needs a stable target.
2. Load the `software-factory` skill and refresh the fleet:

   ```bash
   swamp model method run supers-delivery status
   ```

3. Project active work-item ids from `status-_factory` with `swamp data query`; do not parse logs or read `.swamp/` directly.
4. Run the approval-bound `supers-planning-delivery-handoff` saga for each approved Planning handoff being allocated now. The Dex claim is root-scoped: unrelated active roots may coexist, but ambiguous ancestry or two active leaves in one root park at a human gate.
5. Refresh `supers-delivery` and each claimed work item. Only allocate work whose current Factory stage is `implementation`.

Do not start a backlog of Dex tasks and hope runners catch up. A claim and Factory start belong to a lane that is being allocated in this dispatch wave.

## 2. Build the dispatch wave

Group claimed leaves by the proven `approvedEpicTaskId`. Refuse duplicate roots. Do not infer roots from names or prose.

For every allocated work item:

1. Call `supers-delivery record_dispatch` before execution.
2. Fetch the resolved implementation work spec from the current `status-<workItem>` record.
3. Build one Pi child request with:
   - stable key equal to the approved effective open execution root id;
   - `agent: "worker"`;
   - `worktree: true`;
   - the exact Dex leaf scope and resolved Factory prompt;
   - an instruction to commit its work;
   - strict structured output containing `rootEpicId`, `activeTaskId`, `baseCommit`, `childCommittedRevision`, sorted unique `changedPaths`, `commandsRun`, and `residualRisks`.

Launch the complete set in one `runs.all` call. Omit a hardcoded concurrency value. Pi runtime capacity controls execution. Attach this schema to every item, not only the aggregate call.

```javascript
const FLEET_WORKER_OUTPUT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: [
		'rootEpicId',
		'activeTaskId',
		'baseCommit',
		'childCommittedRevision',
		'changedPaths',
		'commandsRun',
		'residualRisks'
	],
	properties: {
		rootEpicId: { type: 'string', pattern: '^[a-z0-9][a-z0-9._:-]{0,127}$' },
		activeTaskId: { type: 'string', pattern: '^[a-z0-9][a-z0-9._:-]{0,127}$' },
		baseCommit: { type: 'string', pattern: '^[0-9a-f]{40,64}$' },
		childCommittedRevision: { type: 'string', pattern: '^[0-9a-f]{40,64}$' },
		changedPaths: {
			type: 'array',
			minItems: 1,
			maxItems: 2000,
			uniqueItems: true,
			items: {
				type: 'string',
				minLength: 1,
				maxLength: 1000,
				pattern: '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$)).+$'
			}
		},
		commandsRun: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['command', 'result', 'summary'],
				properties: {
					command: { type: 'string', minLength: 1 },
					result: { type: 'string', enum: ['passed', 'failed', 'not-run'] },
					summary: { type: 'string', minLength: 1 }
				}
			}
		},
		residualRisks: {
			type: 'array',
			uniqueItems: true,
			items: { type: 'string', minLength: 1 }
		}
	}
};

const results = await runs.all(
	allocated.map((lane) => ({
		key: lane.rootEpicId,
		agent: 'worker',
		worktree: true,
		task: lane.task,
		acceptance: lane.acceptance,
		outputSchema: FLEET_WORKER_OUTPUT_SCHEMA
	}))
);
return results.map(({ key, artifactPaths, structuredOutput }) => ({
	key,
	artifactPaths,
	structuredOutput
}));
```

## 3. Queue evidence, not prose

For each result, retain the durable handoff manifest path from `artifactPaths`. Read the manifest and select the child by stable lane key/index. Require:

- child status `completed`;
- one changed patch with a readable patch path;
- group `baseCommit` matching structured `baseCommit`;
- cleanup state understood (partial cleanup is not automatic rejection, but preserved work must be reported);
- strict structured output matching the allocated root and leaf.

Hash the manifest bytes and patch bytes with SHA-256. Queue the immutable evidence tuple; do not mutate the parent yet.

## 4. Drain the integration queue

Use `integration-gate.md`. Only the central parent drains the queue, one item at a time. After one integration succeeds:

1. Record `change-summary` with the verified integrated receipt, concise summary, and visual targets.
2. Drive that work item through classification, verification, optional review/human approval, read-only reconciliation, postflight, and terminal handling by following the `software-factory` status loop.
3. Do not integrate the next handoff until the current work item's full shared-checkout tail is terminal and no human decision is pending. A parked state awaiting a human does not release the queue.
4. Re-read the central HEAD, clean status, and canonical tree fingerprint. They must still equal the integrated revision and fingerprint recorded for the terminal work item.

This serialized tail is intentional today: classification, render verification, postflight, and completion inspect the shared target checkout. A pending human gate pauses the entire integration queue; there is no parked-tail exception.

## Failure routes

- Unknown/cyclic Dex ancestry or duplicate lane for one root: human gate; launch nothing for that root.
- Child failed or no patch captured: keep the Factory item in implementation and rework.
- Handoff validation or integration rejection: record the rejected receipt in driver evidence, re-enter/re-dispatch implementation, and never record it as an integrated `change-summary`.
- Human approval pending: present stored Factory artifacts exactly as the `software-factory` skill requires and stop.
