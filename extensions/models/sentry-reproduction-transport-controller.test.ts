import assert from "node:assert/strict";

import { PASSTHROUGH_DEX_REPOSITORY_LOCK } from "./dex-repository-lock.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import {
  SentryRepairIntentEnvelopeSchema,
  SentryRepairIntentSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  SentryReproductionRequestSchema,
} from "./sentry-reproduction-controller.ts";
import {
  createTrustedSentryReproductionOutcome,
  executeAcquireSentryReproductionLease,
  executeHeartbeatSentryReproductionLease,
  executeMapReproducedSentryRepair,
  executeReserveSentryReproductionTransport,
  type RepositorySnapshot,
  SentryRepairDeliveryAdmissionSchema,
  SentryRepairTaskCreationIntentSchema,
  SentryRepairTaskMappingSchema,
  type SentryReproductionTransportContext,
  SentryReproductionTransportLeaseSchema,
  SentryReproductionTransportOutboxSchema,
  SentryReproductionWorkerResultSchema,
  SentryTrustedReproductionOutcomeSchema,
} from "./sentry-reproduction-transport-controller.ts";

const NOW = new Date("2026-08-21T20:00:00.000Z");
const REVISION = "d".repeat(40);

function contextFixture(): {
  context: SentryReproductionTransportContext;
  resources: Map<string, Record<string, unknown>>;
} {
  const resources = new Map<string, Record<string, unknown>>();
  return {
    resources,
    context: {
      repoDir: "/repo",
      readResource: (name) => Promise.resolve(resources.get(name) ?? null),
      writeResource: (_spec, name, data) => {
        resources.set(name, data);
        return Promise.resolve({ name });
      },
      logger: { info: () => {}, warning: () => {} },
    },
  };
}

async function reproductionRequest() {
  const frozenSemanticTask = canonicalSentryJson({
    contract: "sentry-reproduction-v2",
    checkoutRelease: `supers@${REVISION}`,
    checkoutRevision: REVISION,
    evidenceFingerprint: "a".repeat(64),
    issueId: "7650068914",
    recipe: { kind: "browser-route", route: "/p/lower-third" },
    sourceEventId: "evt_123",
    sourceEventOccurredAt: "2026-08-21T19:00:00.000Z",
    sourceLastSeen: "2026-08-21T19:00:00.000Z",
  });
  const base = {
    schemaVersion: 2 as const,
    state: "pending-transport" as const,
    workItem: "sentry-reproduction-7650068914",
    repairIntentName: "sentry-repair-intent-a",
    repairIntentFingerprint: "b".repeat(64),
    issueId: "7650068914",
    shortId: "SUPERS-12",
    checkoutRelease: `supers@${REVISION}`,
    checkoutRevision: REVISION,
    evidenceName: "evidence-a",
    evidenceFingerprint: "a".repeat(64),
    sourceEventId: "evt_123",
    sourceEventOccurredAt: "2026-08-21T19:00:00.000Z",
    sourceLastSeen: "2026-08-21T19:00:00.000Z",
    recipe: { kind: "browser-route" as const, route: "/p/lower-third" },
    requiredWorkerContract: "factory-pi-outbox-v1" as const,
    frozenSemanticTask,
    frozenTaskDigest: await createSentrySha256(frozenSemanticTask),
  };
  return SentryReproductionRequestSchema.parse({
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  });
}

async function intentEnvelope(
  request: Awaited<ReturnType<typeof reproductionRequest>>,
) {
  const intentBase = {
    schemaVersion: 1 as const,
    sourceSnapshot: "snapshot",
    sourceSnapshotFingerprint: "1".repeat(64),
    sourceReconciliation: "reconciliation",
    sourceReconciliationFingerprint: "2".repeat(64),
    sourceTriage: "triage",
    sourceTriageFingerprint: "3".repeat(64),
    sentryTarget: "scott-tolinski-projects/supers",
    issueId: request.issueId,
    shortId: request.shortId,
    title: "untrusted title",
    priority: "high" as const,
    level: "error" as const,
    firstSeen: "2026-08-20T12:00:00.000Z",
    severityRank: 4,
    priorityRank: 3,
    observedAt: "2026-08-21T19:00:00.000Z",
    currentRelease: request.checkoutRelease,
    disposition: "recent" as const,
    queueIntent: "reproduction-required" as const,
    requiresReproduction: true,
    recommendation: "reproduce-first" as const,
    existingDexTaskId: null,
    scope: ["Reproduce bounded evidence."],
    acceptanceCriteria: ["Record exact evidence."],
    requestedSentryBacklink: {
      status: "requested" as const,
      mode: "post-planning-comment" as const,
      target: "scott-tolinski-projects/supers",
      issueId: request.issueId,
      shortId: request.shortId,
    },
    planningWorkItem: `sentry-${request.issueId}`,
    supersedesIntentFingerprint: null,
    idempotencyKey: "4".repeat(64),
  };
  const intent = SentryRepairIntentSchema.parse({
    ...intentBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(intentBase)),
  });
  const envelopeBase = {
    schemaVersion: 1 as const,
    sourceHandoff: "handoff",
    sourceHandoffFingerprint: "5".repeat(64),
    planningWorkItem: intent.planningWorkItem,
    intent,
  };
  return SentryRepairIntentEnvelopeSchema.parse({
    ...envelopeBase,
    fingerprint: request.repairIntentFingerprint,
  });
}

async function acquireAndReserve(
  fixture: ReturnType<typeof contextFixture>,
  snapshot: RepositorySnapshot = { revision: REVISION, clean: true },
) {
  await executeAcquireSentryReproductionLease(
    { ownerId: "driver-a", ttlSeconds: 60 },
    fixture.context,
    { now: () => NOW },
  );
  const lease = SentryReproductionTransportLeaseSchema.parse(
    fixture.resources.get("sentry-reproduction-transport-lease"),
  );
  const request = await reproductionRequest();
  await executeReserveSentryReproductionTransport(
    {
      ownerId: lease.ownerId,
      fencingToken: lease.fencingToken,
      requestName: `sentry-reproduction-request-${request.fingerprint}`,
      request,
    },
    fixture.context,
    { now: () => NOW, repositorySnapshot: () => Promise.resolve(snapshot) },
  );
  const outbox = [...fixture.resources.values()].map((value) =>
    SentryReproductionTransportOutboxSchema.safeParse(value)
  ).find((parsed) => parsed.success)?.data;
  assert.ok(outbox);
  return { lease, request, outbox };
}

Deno.test("lease fencing permits one owner and rejects an expired owner's heartbeat", async () => {
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

Deno.test("reservation is replay-safe and pauses on dirty or wrong revision checkout", async () => {
  const cleanFixture = contextFixture();
  const first = await acquireAndReserve(cleanFixture);
  await executeReserveSentryReproductionTransport(
    {
      ownerId: first.lease.ownerId,
      fencingToken: first.lease.fencingToken,
      requestName: first.outbox.requestName,
      request: first.request,
    },
    cleanFixture.context,
    {
      now: () => NOW,
      repositorySnapshot: () =>
        Promise.resolve({ revision: REVISION, clean: true }),
    },
  );
  assert.equal(
    [...cleanFixture.resources.values()].filter((value) =>
      SentryReproductionTransportOutboxSchema.safeParse(value).success
    ).length,
    1,
  );

  const dirtyFixture = contextFixture();
  await assert.rejects(
    () => acquireAndReserve(dirtyFixture, { revision: REVISION, clean: false }),
    /clean central checkout/,
  );
  const driftFixture = contextFixture();
  await assert.rejects(
    () =>
      acquireAndReserve(driftFixture, {
        revision: "e".repeat(40),
        clean: true,
      }),
    /revision drift/,
  );
});

Deno.test("trusted outcome rejects wrong authority and advanced Sentry watermark", async () => {
  const fixture = contextFixture();
  const { request, outbox } = await acquireAndReserve(fixture);
  const claimNonce = "6".repeat(64);
  const worker = SentryReproductionWorkerResultSchema.parse({
    schemaVersion: 1,
    contract: "trusted-pi-reproduction-worker-v1",
    dispatchToken: outbox.dispatchToken,
    requestFingerprint: request.fingerprint,
    checkoutRevision: request.checkoutRevision,
    piRunId: "11111111-1111-1111-1111-111111111111",
    claimNonce,
    outcome: "reproduced",
    recipeKind: request.recipe.kind,
    commandExitCode: 1,
    observationDigest: "7".repeat(64),
  });
  const workerResultDigest = await createSentrySha256(
    canonicalSentryJson(worker),
  );
  const claimNonceDigest = await createSentrySha256(claimNonce);
  const authoritative = SentryReproductionTransportOutboxSchema.parse({
    ...outbox,
    state: "result-ready",
    piRunId: worker.piRunId,
    claimNonceDigest,
    launchContractDigest: "8".repeat(64),
    workerResultDigest,
    fingerprint: "9".repeat(64),
  });
  const accepted = await createTrustedSentryReproductionOutcome({
    requestName: authoritative.requestName,
    request,
    outbox: authoritative,
    workerResult: worker,
    freshEventId: request.sourceEventId,
    freshLastSeen: request.sourceLastSeen,
    verifiedLaunchContractDigest: "8".repeat(64),
    verifiedClaimNonceDigest: claimNonceDigest,
  });
  assert.equal(accepted.status, "reproduced");

  const wrongRevision = await createTrustedSentryReproductionOutcome({
    requestName: authoritative.requestName,
    request,
    outbox: authoritative,
    workerResult: { ...worker, checkoutRevision: "e".repeat(40) },
    freshEventId: request.sourceEventId,
    freshLastSeen: request.sourceLastSeen,
    verifiedLaunchContractDigest: "8".repeat(64),
    verifiedClaimNonceDigest: claimNonceDigest,
  });
  assert.equal(wrongRevision.status, "quarantined");
  assert.equal(wrongRevision.reason, "authority-mismatch");

  const advanced = await createTrustedSentryReproductionOutcome({
    requestName: authoritative.requestName,
    request,
    outbox: authoritative,
    workerResult: worker,
    freshEventId: "evt_124",
    freshLastSeen: "2026-08-21T19:05:00.000Z",
    verifiedLaunchContractDigest: "8".repeat(64),
    verifiedClaimNonceDigest: claimNonceDigest,
  });
  assert.equal(advanced.status, "quarantined");
  assert.equal(advanced.reason, "event-watermark-drift");
});

Deno.test("only reproduced authority creates one deterministic Dex mapping and admission", async () => {
  const fixture = contextFixture();
  const { request, outbox } = await acquireAndReserve(fixture);
  const envelope = await intentEnvelope(request);
  const claimNonce = "6".repeat(64);
  const worker = SentryReproductionWorkerResultSchema.parse({
    schemaVersion: 1,
    contract: "trusted-pi-reproduction-worker-v1",
    dispatchToken: outbox.dispatchToken,
    requestFingerprint: request.fingerprint,
    checkoutRevision: request.checkoutRevision,
    piRunId: "11111111-1111-1111-1111-111111111111",
    claimNonce,
    outcome: "reproduced",
    recipeKind: request.recipe.kind,
    commandExitCode: 1,
    observationDigest: "7".repeat(64),
  });
  const claimNonceDigest = await createSentrySha256(claimNonce);
  const workerResultDigest = await createSentrySha256(
    canonicalSentryJson(worker),
  );
  const authorityOutbox = SentryReproductionTransportOutboxSchema.parse({
    ...outbox,
    state: "result-ready",
    piRunId: worker.piRunId,
    claimNonceDigest,
    launchContractDigest: "8".repeat(64),
    workerResultDigest,
    fingerprint: "9".repeat(64),
  });
  const outcome = await createTrustedSentryReproductionOutcome({
    requestName: outbox.requestName,
    request,
    outbox: authorityOutbox,
    workerResult: worker,
    freshEventId: request.sourceEventId,
    freshLastSeen: request.sourceLastSeen,
    verifiedLaunchContractDigest: "8".repeat(64),
    verifiedClaimNonceDigest: claimNonceDigest,
  });
  const outcomeName =
    `sentry-trusted-reproduction-outcome-${outcome.fingerprint}`;
  fixture.resources.set(outcomeName, outcome);
  let tasks: Array<Record<string, unknown>> = [];
  let createCalls = 0;
  const dependencies = {
    now: () => NOW,
    dexRepositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
    runDex: (args: readonly string[]) => {
      if (args[0] === "list") {
        return Promise.resolve({ code: 0, stdout: JSON.stringify(tasks) });
      }
      createCalls += 1;
      tasks = [{
        id: "repair-task-1",
        name: args[1],
        description: args[3],
        completed: false,
        started_at: null,
      }];
      return Promise.resolve({ code: 0, stdout: "Created repair-task-1" });
    },
  };
  const args = {
    outcomeName,
    expectedOutcomeFingerprint: outcome.fingerprint,
    request,
    repairIntent: envelope,
  };
  await executeMapReproducedSentryRepair(args, fixture.context, dependencies);
  await executeMapReproducedSentryRepair(args, fixture.context, {
    ...dependencies,
    now: () => new Date(NOW.getTime() + 60_000),
  });
  assert.equal(createCalls, 1);
  const values = [...fixture.resources.values()];
  assert.ok(
    values.some((value) =>
      SentryRepairTaskCreationIntentSchema.safeParse(value).success
    ),
  );
  const mapping = values.map((value) =>
    SentryRepairTaskMappingSchema.safeParse(value)
  )
    .find((parsed) => parsed.success)?.data;
  assert.equal(mapping?.taskId, "repair-task-1");
  assert.ok(
    values.some((value) =>
      SentryRepairDeliveryAdmissionSchema.safeParse(value).success
    ),
  );
});

Deno.test("Dex create lost acknowledgement recovers exact marker and non-reproduced never mutates", async () => {
  const fixture = contextFixture();
  const { request, outbox } = await acquireAndReserve(fixture);
  const envelope = await intentEnvelope(request);
  const claimNonce = "6".repeat(64);
  const worker = SentryReproductionWorkerResultSchema.parse({
    schemaVersion: 1,
    contract: "trusted-pi-reproduction-worker-v1",
    dispatchToken: outbox.dispatchToken,
    requestFingerprint: request.fingerprint,
    checkoutRevision: request.checkoutRevision,
    piRunId: "11111111-1111-1111-1111-111111111111",
    claimNonce,
    outcome: "reproduced",
    recipeKind: request.recipe.kind,
    commandExitCode: 1,
    observationDigest: "7".repeat(64),
  });
  const claimNonceDigest = await createSentrySha256(claimNonce);
  const workerResultDigest = await createSentrySha256(
    canonicalSentryJson(worker),
  );
  const authorityOutbox = SentryReproductionTransportOutboxSchema.parse({
    ...outbox,
    state: "result-ready",
    piRunId: worker.piRunId,
    claimNonceDigest,
    launchContractDigest: "8".repeat(64),
    workerResultDigest,
    fingerprint: "9".repeat(64),
  });
  const outcome = await createTrustedSentryReproductionOutcome({
    requestName: outbox.requestName,
    request,
    outbox: authorityOutbox,
    workerResult: worker,
    freshEventId: request.sourceEventId,
    freshLastSeen: request.sourceLastSeen,
    verifiedLaunchContractDigest: "8".repeat(64),
    verifiedClaimNonceDigest: claimNonceDigest,
  });
  const outcomeName = `outcome-${outcome.fingerprint}`;
  fixture.resources.set(outcomeName, outcome);
  let listCount = 0;
  const dependencies = {
    now: () => NOW,
    dexRepositoryLock: PASSTHROUGH_DEX_REPOSITORY_LOCK,
    runDex: (args: readonly string[]) => {
      if (args[0] === "create") return Promise.resolve({ code: 1, stdout: "" });
      listCount += 1;
      const tasks = listCount === 1 ? [] : [{
        id: "repair-task-2",
        name: "Repair SUPERS-12 reproduced on HEAD",
        description:
          `[supers-sentry-repair issue=${outcome.issueId} reproduction=${outcome.fingerprint}]`,
        completed: false,
        started_at: null,
      }];
      return Promise.resolve({ code: 0, stdout: JSON.stringify(tasks) });
    },
  };
  await executeMapReproducedSentryRepair(
    {
      outcomeName,
      expectedOutcomeFingerprint: outcome.fingerprint,
      request,
      repairIntent: envelope,
    },
    fixture.context,
    dependencies,
  );
  const mapping = [...fixture.resources.values()].map((value) =>
    SentryRepairTaskMappingSchema.safeParse(value)
  ).find((parsed) => parsed.success)?.data;
  assert.equal(mapping?.status, "recovered-after-create");

  const nonReproduced = SentryTrustedReproductionOutcomeSchema.parse({
    ...outcome,
    status: "not-reproduced",
    reason: "worker-did-not-reproduce",
  });
  fixture.resources.set("non-reproduced", nonReproduced);
  await assert.rejects(
    () =>
      executeMapReproducedSentryRepair(
        {
          outcomeName: "non-reproduced",
          expectedOutcomeFingerprint: nonReproduced.fingerprint,
          request,
          repairIntent: envelope,
        },
        fixture.context,
        dependencies,
      ),
    /Only an exact trusted reproduced outcome/,
  );
});
