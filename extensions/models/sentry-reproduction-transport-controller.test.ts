import assert from "node:assert/strict";

import { PASSTHROUGH_DEX_REPOSITORY_LOCK } from "./dex-repository-lock.ts";
import { containsExactSentryShortId } from "./sentry-dex-triage.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryRepairIntentEnvelopeSchema,
  SentryRepairIntentSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import { SentryRepairPlanningQueueSelectionSchema } from "./sentry-repair-planning-queue.ts";
import { SentryReproductionRequestSchema } from "./sentry-reproduction-controller.ts";
import {
  createStableSentryReproductionRepositorySnapshot,
  createTrustedSentryReproductionOutcome,
  executeAcquireSentryReproductionLease,
  executeHeartbeatSentryReproductionLease,
  executeMapReproducedSentryRepair,
  executeReserveSentryReproductionTransport,
  type RepositorySnapshot,
  SentryRepairDeliveryAdmissionSchema,
  SentryRepairTaskCreationIntentSchema,
  SentryRepairTaskMappingSchema,
  SentryReproductionExecutionClaimSchema,
  SentryReproductionLaunchArtifactSchema,
  type SentryReproductionTransportContext,
  SentryReproductionTransportLeaseSchema,
  SentryReproductionTransportOutboxSchema,
  SentryReproductionWorkerObservationSchema,
  SentryReproductionWorkerResultSchema,
} from "./sentry-reproduction-transport-controller.ts";

const NOW = new Date("2026-08-21T20:00:00.000Z");
const REVISION = "d".repeat(40);
const REPRODUCTION_MODEL_ID = "c7f54688-995b-4d7d-b4fb-21a310e1bfdc";
const REPAIR_MODEL_ID = "43609d3c-92b1-4509-9ed0-db25b48ee7c1";

type Fixture = ReturnType<typeof contextFixture>;

function contextFixture(): {
  context: SentryReproductionTransportContext;
  resources: Map<string, Record<string, unknown>>;
  sourceResources: Map<string, Record<string, unknown>>;
} {
  const resources = new Map<string, Record<string, unknown>>();
  const sourceResources = new Map<string, Record<string, unknown>>();
  return {
    resources,
    sourceResources,
    context: {
      repoDir: "/repo",
      globalArgs: {
        sourceReproductionModelId: REPRODUCTION_MODEL_ID,
        sourceRepairModelId: REPAIR_MODEL_ID,
      },
      dataRepository: {
        getContent: (_type, _modelId, name) => {
          const resource = sourceResources.get(name);
          return Promise.resolve(
            resource === undefined
              ? null
              : new TextEncoder().encode(JSON.stringify(resource)),
          );
        },
      },
      readResource: (name) => Promise.resolve(resources.get(name) ?? null),
      writeResource: (_spec, name, data) => {
        resources.set(name, data);
        return Promise.resolve({ name });
      },
      logger: { info: () => {}, warning: () => {} },
    },
  };
}

async function addressed<T extends Record<string, unknown>>(
  base: T,
): Promise<T & { fingerprint: string }> {
  return {
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  };
}

async function coherentSources(options: {
  shortId?: string;
  issueId?: string;
  existingDexTaskId?: string | null;
} = {}) {
  const shortId = options.shortId ?? "SUPERS-12";
  const issueId = options.issueId ?? "7650068914";
  const existingDexTaskId = options.existingDexTaskId ?? null;
  const intentBase = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: "1".repeat(64),
    sourceReconciliation: "reconciliation",
    sourceReconciliationFingerprint: "2".repeat(64),
    sourceTriage: "triage",
    sourceTriageFingerprint: "3".repeat(64),
    sentryTarget: "scott-tolinski-projects/supers",
    issueId,
    shortId,
    title: "untrusted title",
    priority: "high" as const,
    level: "error" as const,
    firstSeen: "2026-08-20T12:00:00.000Z",
    severityRank: 4,
    priorityRank: 3,
    observedAt: "2026-08-21T19:00:00.000Z",
    currentRelease: `supers@${REVISION}`,
    disposition: "recent" as const,
    queueIntent: "reproduction-required" as const,
    requiresReproduction: true,
    recommendation: existingDexTaskId === null
      ? "reproduce-first" as const
      : "attach-existing" as const,
    existingDexTaskId,
    scope: ["Reproduce bounded evidence."],
    acceptanceCriteria: ["Record exact evidence."],
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: "scott-tolinski-projects/supers",
      issueId,
      shortId,
    },
    planningWorkItem: `sentry-${issueId}`,
    supersedesIntentFingerprint: null,
    idempotencyKey: "4".repeat(64),
  };
  const intent = SentryRepairIntentSchema.parse(await addressed(intentBase));
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "5".repeat(64),
    planningWorkItem: intent.planningWorkItem,
    intent,
  };
  const envelope = SentryRepairIntentEnvelopeSchema.parse(
    await addressed(envelopeBase),
  );
  const intentName = `sentry-repair-intent-${envelope.fingerprint}`;
  const selectionBase = {
    schemaVersion: 1 as const,
    status: "selected" as const,
    action: "await-reproduction" as const,
    reason: "next-reproduction-intent" as const,
    selectedWorkItem: envelope.planningWorkItem,
    selectedIntentFingerprint: envelope.fingerprint,
    queuedWorkItems: [envelope.planningWorkItem],
    activeWorkItems: [],
  };
  const selection = SentryRepairPlanningQueueSelectionSchema.parse(
    await addressed(selectionBase),
  );
  const selectionName = "sentry-repair-planning-queue-selection";
  const recipe = { kind: "browser-route" as const, route: "/p/lower-third" };
  const frozenSemanticTask = canonicalSentryJson({
    contract: "sentry-reproduction-v3",
    checkoutRelease: `supers@${REVISION}`,
    checkoutRevision: REVISION,
    evidenceFingerprint: "a".repeat(64),
    issueId,
    queueSelectionFingerprint: selection.fingerprint,
    recipe,
    sourceEventId: "evt_123",
    sourceEventOccurredAt: "2026-08-21T19:00:00.000Z",
    sourceLastSeen: "2026-08-21T19:00:00.000Z",
  });
  const requestBase = {
    schemaVersion: 3 as const,
    state: "pending-transport" as const,
    workItem: `sentry-reproduction-${issueId}`,
    repairIntentName: intentName,
    repairIntentFingerprint: envelope.fingerprint,
    queueSelectionName: selectionName,
    queueSelectionFingerprint: selection.fingerprint,
    issueId,
    shortId,
    checkoutRelease: `supers@${REVISION}`,
    checkoutRevision: REVISION,
    evidenceName: "evidence-a",
    evidenceFingerprint: "a".repeat(64),
    sourceEventId: "evt_123",
    sourceEventOccurredAt: "2026-08-21T19:00:00.000Z",
    sourceLastSeen: "2026-08-21T19:00:00.000Z",
    recipe,
    requiredWorkerContract: "sentry-reproduction-transport-v1" as const,
    frozenSemanticTask,
    frozenTaskDigest: await createSentrySha256(frozenSemanticTask),
  };
  const request = SentryReproductionRequestSchema.parse(
    await addressed(requestBase),
  );
  const requestName = `sentry-reproduction-request-${request.fingerprint}`;
  return {
    envelope,
    intentName,
    selection,
    selectionName,
    request,
    requestName,
  };
}

function installSources(
  fixture: Fixture,
  sources: Awaited<ReturnType<typeof coherentSources>>,
): void {
  fixture.sourceResources.set(sources.intentName, sources.envelope);
  fixture.sourceResources.set(sources.selectionName, sources.selection);
  fixture.sourceResources.set(sources.requestName, sources.request);
}

async function acquireAndReserve(
  fixture: Fixture,
  suppliedSources?: Awaited<ReturnType<typeof coherentSources>>,
  snapshot: RepositorySnapshot = { revision: REVISION, clean: true },
) {
  const sources = suppliedSources ?? await coherentSources();
  installSources(fixture, sources);
  await executeAcquireSentryReproductionLease(
    { ownerId: "driver-a", ttlSeconds: 60 },
    fixture.context,
    { now: () => NOW },
  );
  const lease = SentryReproductionTransportLeaseSchema.parse(
    fixture.resources.get("sentry-reproduction-transport-lease"),
  );
  await executeReserveSentryReproductionTransport(
    {
      ownerId: lease.ownerId,
      fencingToken: lease.fencingToken,
      requestName: sources.requestName,
      expectedRequestFingerprint: sources.request.fingerprint,
    },
    fixture.context,
    { now: () => NOW, repositorySnapshot: () => Promise.resolve(snapshot) },
  );
  const outboxName = [...fixture.resources.keys()].find((name) =>
    name.startsWith("sentry-reproduction-transport-outbox-")
  );
  assert.ok(outboxName);
  const outbox = SentryReproductionTransportOutboxSchema.parse(
    fixture.resources.get(outboxName),
  );
  return { ...sources, lease, outbox, outboxName };
}

async function trustedAuthority(
  fixture: Fixture,
  reserved: Awaited<ReturnType<typeof acquireAndReserve>>,
  options: {
    outcome?: "reproduced" | "not-reproduced" | "inconclusive";
    commandExitCode?: number;
    recipeKind?:
      | "http-route"
      | "browser-route"
      | "export-flow"
      | "allowlisted-test-command";
    freshEventId?: string;
    freshLastSeen?: string;
  } = {},
) {
  const piRunId = "11111111-1111-1111-1111-111111111111";
  const claimNonce = "6".repeat(64);
  const claimNonceDigest = await createSentrySha256(claimNonce);
  const outcome = options.outcome ?? "reproduced";
  const commandExitCode = options.commandExitCode ??
    (outcome === "reproduced" ? 1 : outcome === "not-reproduced" ? 0 : 2);
  const recipeKind = options.recipeKind ?? reserved.request.recipe.kind;
  const launch = SentryReproductionLaunchArtifactSchema.parse(
    await addressed({
      schemaVersion: 1 as const,
      contract: "sentry-reproduction-pi-launch-v1" as const,
      dispatchToken: reserved.outbox.dispatchToken,
      requestFingerprint: reserved.request.fingerprint,
      checkoutRevision: reserved.request.checkoutRevision,
      piRunId,
      launchContractDigest: "8".repeat(64),
      runtimeRequestDigest: "a".repeat(64),
      launchedAt: NOW.toISOString(),
    }),
  );
  const claim = SentryReproductionExecutionClaimSchema.parse(
    await addressed({
      schemaVersion: 1 as const,
      contract: "sentry-reproduction-pi-claim-v1" as const,
      dispatchToken: reserved.outbox.dispatchToken,
      requestFingerprint: reserved.request.fingerprint,
      piRunId,
      claimNonce,
      claimNonceDigest,
      claimedAt: NOW.toISOString(),
    }),
  );
  const observation = SentryReproductionWorkerObservationSchema.parse(
    await addressed({
      schemaVersion: 1 as const,
      contract: "sentry-reproduction-worker-observation-v1" as const,
      dispatchToken: reserved.outbox.dispatchToken,
      requestFingerprint: reserved.request.fingerprint,
      piRunId,
      recipeKind,
      outcome,
      commandExitCode,
      observedAt: NOW.toISOString(),
    }),
  );
  const worker = SentryReproductionWorkerResultSchema.parse({
    schemaVersion: 1,
    contract: "trusted-pi-reproduction-worker-v1",
    dispatchToken: reserved.outbox.dispatchToken,
    requestFingerprint: reserved.request.fingerprint,
    checkoutRevision: reserved.request.checkoutRevision,
    piRunId,
    claimNonce,
    outcome,
    recipeKind,
    commandExitCode,
    observationDigest: observation.fingerprint,
  });
  const workerResultDigest = await createSentrySha256(
    canonicalSentryJson(worker),
  );
  const { fingerprint: _reservedFingerprint, ...reservedBase } =
    reserved.outbox;
  const authorityOutbox = SentryReproductionTransportOutboxSchema.parse(
    await addressed({
      ...reservedBase,
      state: "result-ready" as const,
      piRunId,
      claimNonceDigest,
      launchContractDigest: launch.launchContractDigest,
      launchArtifactFingerprint: launch.fingerprint,
      executionClaimFingerprint: claim.fingerprint,
      workerObservationFingerprint: observation.fingerprint,
      workerResultDigest,
      updatedAt: NOW.toISOString(),
    }),
  );
  fixture.resources.set(reserved.outboxName, authorityOutbox);
  const trustedOutcome = await createTrustedSentryReproductionOutcome({
    requestName: reserved.requestName,
    request: reserved.request,
    outbox: authorityOutbox,
    launchArtifact: launch,
    executionClaim: claim,
    workerObservation: observation,
    workerResult: worker,
    freshEventId: options.freshEventId ?? reserved.request.sourceEventId,
    freshLastSeen: options.freshLastSeen ?? reserved.request.sourceLastSeen,
  });
  const outcomeName =
    `sentry-trusted-reproduction-outcome-${trustedOutcome.fingerprint}`;
  fixture.resources.set(outcomeName, trustedOutcome);
  return { trustedOutcome, outcomeName, worker, launch, claim, observation };
}

function mappingDependencies(
  initialTasks: Array<Record<string, unknown>> = [],
) {
  let tasks = initialTasks;
  const calls: string[][] = [];
  return {
    calls,
    dependencies: {
      now: () => NOW,
      dexRepositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
      runDex: (args: readonly string[]) => {
        calls.push([...args]);
        if (args[0] === "list") {
          return Promise.resolve({ code: 0, stdout: JSON.stringify(tasks) });
        }
        if (args[0] === "create") {
          tasks = [{
            id: "repair-task-1",
            name: args[1],
            description: args[3],
            completed: false,
            started_at: null,
          }];
          return Promise.resolve({ code: 0, stdout: "created" });
        }
        if (args[0] === "edit") {
          tasks = tasks.map((task) =>
            task.id === args[1] ? { ...task, description: args[3] } : task
          );
          return Promise.resolve({ code: 0, stdout: "edited" });
        }
        return Promise.resolve({ code: 1, stdout: "" });
      },
    },
  };
}

Deno.test("lease fencing permits one owner and rejects an expired owner", async () => {
  const fixture = contextFixture();
  await executeAcquireSentryReproductionLease(
    { ownerId: "driver-a", ttlSeconds: 30 },
    fixture.context,
    { now: () => NOW },
  );
  await assert.rejects(
    () =>
      executeAcquireSentryReproductionLease(
        { ownerId: "driver-b", ttlSeconds: 30 },
        fixture.context,
        { now: () => new Date(NOW.getTime() + 1_000) },
      ),
    /owns the lease/,
  );
  await executeAcquireSentryReproductionLease(
    { ownerId: "driver-b", ttlSeconds: 30 },
    fixture.context,
    { now: () => new Date(NOW.getTime() + 31_000) },
  );
  const replacement = SentryReproductionTransportLeaseSchema.parse(
    fixture.resources.get("sentry-reproduction-transport-lease"),
  );
  assert.equal(replacement.fencingToken, 2);
  await assert.rejects(
    () =>
      executeHeartbeatSentryReproductionLease(
        {
          ownerId: "driver-a",
          fencingToken: 1,
          ttlSeconds: 30,
          status: "healthy",
          activeRequestFingerprint: null,
        },
        fixture.context,
        { now: () => new Date(NOW.getTime() + 32_000) },
      ),
    /fenced/,
  );
});

Deno.test("reservation reads authoritative sources and rejects forged request content", async () => {
  const fixture = contextFixture();
  const reserved = await acquireAndReserve(fixture);
  await executeReserveSentryReproductionTransport(
    {
      ownerId: reserved.lease.ownerId,
      fencingToken: reserved.lease.fencingToken,
      requestName: reserved.requestName,
      expectedRequestFingerprint: reserved.request.fingerprint,
    },
    fixture.context,
    {
      now: () => NOW,
      repositorySnapshot: () =>
        Promise.resolve({ revision: REVISION, clean: true }),
    },
  );
  assert.equal(
    [...fixture.resources.keys()].filter((name) =>
      name.startsWith("sentry-reproduction-transport-outbox-")
    ).length,
    1,
  );

  const forgedFixture = contextFixture();
  const forgedSources = await coherentSources();
  installSources(forgedFixture, forgedSources);
  forgedFixture.sourceResources.set(forgedSources.requestName, {
    ...forgedSources.request,
    frozenSemanticTask: "{}",
  });
  await executeAcquireSentryReproductionLease(
    { ownerId: "driver-a", ttlSeconds: 60 },
    forgedFixture.context,
    { now: () => NOW },
  );
  const forgedLease = SentryReproductionTransportLeaseSchema.parse(
    forgedFixture.resources.get("sentry-reproduction-transport-lease"),
  );
  await assert.rejects(
    () =>
      executeReserveSentryReproductionTransport(
        {
          ownerId: forgedLease.ownerId,
          fencingToken: forgedLease.fencingToken,
          requestName: forgedSources.requestName,
          expectedRequestFingerprint: forgedSources.request.fingerprint,
        },
        forgedFixture.context,
        {
          now: () => NOW,
          repositorySnapshot: () =>
            Promise.resolve({ revision: REVISION, clean: true }),
        },
      ),
    /fingerprint verification failed|semantic payload mismatch/,
  );
  assert.equal(
    [...forgedFixture.resources.keys()].some((name) => name.includes("outbox")),
    false,
  );
});

Deno.test("stable repository snapshot rejects a HEAD race", async () => {
  const outputs = [
    new TextEncoder().encode(`${REVISION}\n`),
    new Uint8Array(),
    new TextEncoder().encode(`${"e".repeat(40)}\n`),
  ];
  await assert.rejects(
    () =>
      createStableSentryReproductionRepositorySnapshot(() =>
        Promise.resolve(outputs.shift()!)
      ),
    /changed during inspection/,
  );
});

Deno.test("trusted outcome enforces typed authority, recipe, exit semantics, and watermark", async () => {
  const fixture = contextFixture();
  const reserved = await acquireAndReserve(fixture);
  const accepted = await trustedAuthority(fixture, reserved);
  assert.equal(accepted.trustedOutcome.status, "reproduced");

  const wrongRecipe = await trustedAuthority(fixture, reserved, {
    recipeKind: "http-route",
  });
  assert.equal(wrongRecipe.trustedOutcome.status, "quarantined");
  assert.equal(wrongRecipe.trustedOutcome.reason, "authority-mismatch");

  const wrongExit = await trustedAuthority(fixture, reserved, {
    commandExitCode: 0,
  });
  assert.equal(wrongExit.trustedOutcome.status, "quarantined");
  assert.equal(wrongExit.trustedOutcome.reason, "authority-mismatch");

  const advanced = await trustedAuthority(fixture, reserved, {
    freshEventId: "evt_124",
    freshLastSeen: "2026-08-21T19:05:00.000Z",
  });
  assert.equal(advanced.trustedOutcome.status, "quarantined");
  assert.equal(advanced.trustedOutcome.reason, "event-watermark-drift");
});

Deno.test("only exact authoritative reproduced sources create one replay-safe mapping", async () => {
  const fixture = contextFixture();
  const reserved = await acquireAndReserve(fixture);
  const authority = await trustedAuthority(fixture, reserved);
  const mapping = mappingDependencies();
  const args = {
    outcomeName: authority.outcomeName,
    expectedOutcomeFingerprint: authority.trustedOutcome.fingerprint,
  };
  await executeMapReproducedSentryRepair(
    args,
    fixture.context,
    mapping.dependencies,
  );
  await executeMapReproducedSentryRepair(
    args,
    fixture.context,
    mapping.dependencies,
  );
  assert.equal(
    mapping.calls.filter(([command]) => command === "create").length,
    1,
  );
  const values = [...fixture.resources.values()];
  assert.ok(
    values.some((value) =>
      SentryRepairTaskCreationIntentSchema.safeParse(value).success
    ),
  );
  assert.ok(
    values.some((value) =>
      SentryRepairTaskMappingSchema.safeParse(value).success
    ),
  );
  assert.ok(
    values.some((value) =>
      SentryRepairDeliveryAdmissionSchema.safeParse(value).success
    ),
  );
});

Deno.test("forged intent content has zero Dex and admission side effects", async () => {
  const fixture = contextFixture();
  const reserved = await acquireAndReserve(fixture);
  const authority = await trustedAuthority(fixture, reserved);
  fixture.sourceResources.set(reserved.intentName, {
    ...reserved.envelope,
    intent: { ...reserved.envelope.intent, existingDexTaskId: "attacker-task" },
  });
  const mapping = mappingDependencies();
  await assert.rejects(
    () =>
      executeMapReproducedSentryRepair(
        {
          outcomeName: authority.outcomeName,
          expectedOutcomeFingerprint: authority.trustedOutcome.fingerprint,
        },
        fixture.context,
        mapping.dependencies,
      ),
    /fingerprint verification failed|Attach intents/,
  );
  assert.equal(mapping.calls.length, 0);
  assert.equal(
    [...fixture.resources.values()].some((value) =>
      SentryRepairDeliveryAdmissionSchema.safeParse(value).success
    ),
    false,
  );
});

Deno.test("non-reproduced, inconclusive, and quarantined outcomes have zero Dex side effects", async () => {
  for (
    const options of [
      { outcome: "not-reproduced" as const },
      { outcome: "inconclusive" as const },
      {
        outcome: "reproduced" as const,
        freshEventId: "evt_124",
        freshLastSeen: "2026-08-21T19:05:00.000Z",
      },
      { outcome: "reproduced" as const, recipeKind: "http-route" as const },
    ]
  ) {
    const fixture = contextFixture();
    const reserved = await acquireAndReserve(fixture);
    const authority = await trustedAuthority(fixture, reserved, options);
    const mapping = mappingDependencies();
    await assert.rejects(
      () =>
        executeMapReproducedSentryRepair(
          {
            outcomeName: authority.outcomeName,
            expectedOutcomeFingerprint: authority.trustedOutcome.fingerprint,
          },
          fixture.context,
          mapping.dependencies,
        ),
      /Only an exact trusted reproduced outcome/,
    );
    assert.equal(mapping.calls.length, 0);
    assert.equal(
      [...fixture.resources.values()].some((value) =>
        SentryRepairDeliveryAdmissionSchema.safeParse(value).success
      ),
      false,
    );
  }
});

Deno.test("exact Sentry ID matching rejects prefix collisions", () => {
  assert.equal(
    containsExactSentryShortId("Fix SUPERS-1 crash", "SUPERS-1"),
    true,
  );
  assert.equal(
    containsExactSentryShortId("Fix SUPERS-12 crash", "SUPERS-1"),
    false,
  );
});

Deno.test("existing-task attachment persists the exact marker before admission", async () => {
  const fixture = contextFixture();
  const sources = await coherentSources({ existingDexTaskId: "existing-task" });
  const reserved = await acquireAndReserve(fixture, sources);
  const authority = await trustedAuthority(fixture, reserved);
  const mapping = mappingDependencies([{
    id: "existing-task",
    name: "Investigate SUPERS-12",
    description: "Existing reproduction investigation.",
    completed: false,
    started_at: null,
  }]);
  await executeMapReproducedSentryRepair(
    {
      outcomeName: authority.outcomeName,
      expectedOutcomeFingerprint: authority.trustedOutcome.fingerprint,
    },
    fixture.context,
    mapping.dependencies,
  );
  assert.equal(mapping.calls.some(([command]) => command === "edit"), true);
  assert.ok(
    [...fixture.resources.values()].some((value) =>
      SentryRepairDeliveryAdmissionSchema.safeParse(value).success
    ),
  );
});

Deno.test("prefix collision or missing attachment marker cannot admit Delivery", async () => {
  for (const mode of ["prefix", "missing-marker"] as const) {
    const fixture = contextFixture();
    const shortId = mode === "prefix" ? "SUPERS-1" : "SUPERS-12";
    const sources = await coherentSources({
      shortId,
      issueId: mode === "prefix" ? "1" : "7650068914",
      existingDexTaskId: "existing-task",
    });
    const reserved = await acquireAndReserve(fixture, sources);
    const authority = await trustedAuthority(fixture, reserved);
    const calls: string[][] = [];
    const task = {
      id: "existing-task",
      name: "Investigate SUPERS-12",
      description: "Existing reproduction investigation.",
      completed: false,
      started_at: null,
    };
    await assert.rejects(
      () =>
        executeMapReproducedSentryRepair(
          {
            outcomeName: authority.outcomeName,
            expectedOutcomeFingerprint: authority.trustedOutcome.fingerprint,
          },
          fixture.context,
          {
            now: () => NOW,
            dexRepositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
            runDex: (args) => {
              calls.push([...args]);
              if (args[0] === "list") {
                return Promise.resolve({
                  code: 0,
                  stdout: JSON.stringify([task]),
                });
              }
              return Promise.resolve({ code: 1, stdout: "" });
            },
          },
        ),
      mode === "prefix"
        ? /conflicts with the triaged/
        : /did not persist one exact/,
    );
    assert.equal(
      [...fixture.resources.values()].some((value) =>
        SentryRepairDeliveryAdmissionSchema.safeParse(value).success
      ),
      false,
    );
  }
});
