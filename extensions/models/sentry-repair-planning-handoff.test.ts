import assert from "node:assert/strict";
import { z } from "npm:zod@4.4.3";

import {
  createSentryDexTriageFingerprint,
  SentryDexTriageSchema,
} from "./sentry-dex-triage.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
  SentryIssueReconciliationSchema,
  SentryIssueSnapshotSchema,
} from "./sentry-issue-intake-adapter.ts";
import {
  executeSentryRepairPlanningHandoff,
  SentryRepairIntentEnvelopeSchema,
  type SentryRepairPlanningHandoffArgs,
  SentryRepairPlanningHandoffSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import { model } from "./sentry-repair-planning-handoff.ts";

const NOW = "2026-08-18T21:00:00.000Z";
const TARGET = "scott-tolinski-projects/supers";
const RELEASE = "supers@abc123";
const SOURCE_INTAKE_MODEL_ID = "97e8375f-5908-482d-846e-2a5b037ae9cf";
const SOURCE_DELIVERY_MODEL_ID = "90fac686-c724-4aee-97c4-e31b9af4c5e2";

type Recommendation =
  | "create-task"
  | "attach-existing"
  | "reproduce-first"
  | "human-review"
  | "ignore";
type TriageBlockingReason = z.infer<
  typeof SentryDexTriageSchema
>["blockingReasons"][number];

type SourceBundleOptions = {
  disposition?:
    | "current-release"
    | "recent"
    | "historical-unresolved"
    | "ambiguous";
  recommendation?: Recommendation;
  exactMatchTaskIds?: string[];
  lexicalMatchTaskIds?: string[];
  blockingReasons?: TriageBlockingReason[];
  snapshotComplete?: boolean;
  automationEligible?: boolean;
  queueIntent?: "confirmed-repair" | "reproduction-required" | null;
  additionalIssue?: boolean;
  capturedAt?: string;
};

async function sourceBundle(options: SourceBundleOptions = {}) {
  const disposition = options.disposition ?? "current-release";
  const queueIntent = options.queueIntent ??
    (disposition === "current-release"
      ? "confirmed-repair"
      : disposition === "recent"
      ? "reproduction-required"
      : null);
  const recommendation = options.recommendation ?? "create-task";
  const issues = [
    {
      id: "7659756211",
      shortId: "SUPERS-17",
      title: "Identifier allowedKeys has already been declared",
      priority: "high" as const,
      level: "error" as const,
      firstSeen: "2026-08-01T00:00:00.000Z",
      status: "unresolved" as const,
    },
    ...(options.additionalIssue
      ? [{
        id: "7659756212",
        shortId: "SUPERS-18",
        title: "Second current release failure",
        priority: "medium" as const,
        level: "error" as const,
        firstSeen: "2026-08-02T00:00:00.000Z",
        status: "unresolved" as const,
      }]
      : []),
  ];
  const capturedAt = options.capturedAt ?? NOW;
  const snapshotBase = {
    source: "sentry-cli" as const,
    target: TARGET,
    capturedAt,
    lookbackDays: 7,
    historyDays: 90,
    limit: 100,
    currentRelease: RELEASE,
    complete: options.snapshotComplete ?? true,
    coverage: {
      historyHasMore: options.snapshotComplete === false,
      recentHasMore: false,
      releaseHasMore: false,
    },
    issues,
    recentIssueIds: issues.map((issue) => issue.id),
    currentReleaseIssueIds: disposition === "current-release"
      ? issues.map((issue) => issue.id)
      : [],
  };
  const snapshotFingerprint = await createSentrySha256(JSON.stringify({
    target: snapshotBase.target,
    args: {
      lookbackDays: snapshotBase.lookbackDays,
      historyDays: snapshotBase.historyDays,
      limit: snapshotBase.limit,
      currentRelease: snapshotBase.currentRelease,
    },
    capturedAt,
    issues: snapshotBase.issues,
    recentIds: snapshotBase.recentIssueIds,
    releaseIds: snapshotBase.currentReleaseIssueIds,
    complete: snapshotBase.complete,
  }));
  const snapshot = SentryIssueSnapshotSchema.parse({
    ...snapshotBase,
    fingerprint: snapshotFingerprint,
  });
  const reconciliationBase = {
    sourceSnapshot: `sentry-issue-snapshot-${snapshotFingerprint}`,
    sourceFingerprint: snapshotFingerprint,
    generatedAt: capturedAt,
    automationEligible: options.automationEligible ?? true,
    items: snapshot.issues.map((issue) => ({
      ...issue,
      disposition,
      queueIntent,
    })),
  };
  const reconciliationFingerprint = await createSentrySha256(
    canonicalSentryJson({
      sourceSnapshot: reconciliationBase.sourceSnapshot,
      sourceFingerprint: reconciliationBase.sourceFingerprint,
      automationEligible: reconciliationBase.automationEligible,
      items: reconciliationBase.items,
    }),
  );
  const reconciliation = SentryIssueReconciliationSchema.parse({
    ...reconciliationBase,
    fingerprint: reconciliationFingerprint,
  });
  const triageBase = {
    sourceReconciliation: `sentry-issue-reconciliation-${snapshotFingerprint}`,
    sourceFingerprint: snapshotFingerprint,
    sourceReconciliationFingerprint: reconciliationFingerprint,
    dexTaskCount: 0,
    activeTaskIds: [] as string[],
    queueEligible: (options.automationEligible ?? true) &&
      (options.blockingReasons?.length ?? 0) === 0 && queueIntent !== null,
    executionCapacity: "available" as const,
    blockingReasons: options.blockingReasons ?? [],
    items: snapshot.issues.map((issue) => ({
      issueId: issue.id,
      shortId: issue.shortId,
      queueIntent,
      quarantineReason:
        options.blockingReasons?.find((reason) =>
          reason === "multiple-exact-matches" ||
          reason === "completed-exact-match" ||
          reason === "lexical-review" ||
          reason === "ambiguous-source"
        ) ?? null,
      recommendation,
      exactMatchTaskIds: options.exactMatchTaskIds ?? [],
      lexicalMatchTaskIds: options.lexicalMatchTaskIds ?? [],
      ancestorTaskIds: [] as string[],
      descendantTaskIds: [] as string[],
      reasons: ["fixture recommendation"],
    })),
  };
  const triageFingerprint = await createSentryDexTriageFingerprint(triageBase);
  const triage = SentryDexTriageSchema.parse({
    ...triageBase,
    generatedAt: capturedAt,
    fingerprint: triageFingerprint,
  });
  const resources = new Map<string, Record<string, unknown>>([
    [reconciliationBase.sourceSnapshot, structuredClone(snapshot)],
    [triageBase.sourceReconciliation, structuredClone(reconciliation)],
    [`sentry-dex-triage-${triageFingerprint}`, structuredClone(triage)],
  ]);
  const args: SentryRepairPlanningHandoffArgs = {
    sourceSnapshot: reconciliationBase.sourceSnapshot,
    expectedSnapshotFingerprint: snapshotFingerprint,
    sourceReconciliation: triageBase.sourceReconciliation,
    expectedReconciliationFingerprint: reconciliationFingerprint,
    sourceTriage: `sentry-dex-triage-${triageFingerprint}`,
    expectedTriageFingerprint: triageFingerprint,
    issuePlans: snapshot.issues.map((issue) => ({
      issueId: issue.id,
      scope: [`Repair ${issue.shortId} without changing public APIs.`],
      acceptanceCriteria: [
        `The affected flow completes without ${issue.shortId}.`,
      ],
    })),
    priorIntents: [],
  };
  return { resources, args, snapshot, reconciliation, triage };
}

function dexTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-17",
    parent_id: null,
    name: "Repair SUPERS-17 duplicate declaration",
    description: "Current release regression.",
    priority: 2,
    completed: false,
    result: null,
    metadata: null,
    created_at: NOW,
    updated_at: NOW,
    started_at: null,
    completed_at: null,
    blockedBy: [],
    blocks: [],
    children: [],
    ...overrides,
  };
}

async function replaceTriage(
  bundle: Awaited<ReturnType<typeof sourceBundle>>,
  update: (triage: Record<string, unknown>) => void,
): Promise<void> {
  const triage = structuredClone(bundle.triage) as Record<string, unknown>;
  update(triage);
  const base = Object.fromEntries(
    Object.entries(triage).filter(([key]) => key !== "generatedAt" && key !== "fingerprint"),
  );
  const fingerprint = await createSentryDexTriageFingerprint(
    base as Parameters<typeof createSentryDexTriageFingerprint>[0],
  );
  const updated = { ...triage, fingerprint };
  bundle.resources.delete(bundle.args.sourceTriage);
  bundle.args.sourceTriage = `sentry-dex-triage-${fingerprint}`;
  bundle.args.expectedTriageFingerprint = fingerprint;
  bundle.resources.set(bundle.args.sourceTriage, updated);
  bundle.triage = SentryDexTriageSchema.parse(updated);
}

async function runHandoff(
  bundle: Awaited<ReturnType<typeof sourceBundle>>,
  tasks: unknown[],
) {
  const writes: Array<{
    specName: string;
    name: string;
    data: Record<string, unknown>;
  }> = [];
  const calls: string[][] = [];
  const repositoryReads: Array<{
    type: unknown;
    modelId: string;
    name: string;
  }> = [];
  await executeSentryRepairPlanningHandoff(
    bundle.args,
    {
      repoDir: "/fixture/supers",
      globalArgs: { sourceIntakeModelId: SOURCE_INTAKE_MODEL_ID },
      dataRepository: {
        getContent: (type, modelId, name) => {
          repositoryReads.push({ type, modelId, name });
          const resource = bundle.resources.get(name);
          return Promise.resolve(
            resource === undefined
              ? null
              : new TextEncoder().encode(JSON.stringify(resource)),
          );
        },
      },
      logger: { info: () => undefined, warning: () => undefined },
      writeResource: (specName, name, data) => {
        writes.push({ specName, name, data });
        return Promise.resolve({ name });
      },
    },
    {
      dexCommandRunner: {
        run: (args) => {
          calls.push([...args]);
          return Promise.resolve({
            code: 0,
            stdout: JSON.stringify(tasks),
            stderr: "",
          });
        },
      },
    },
  );
  return {
    calls,
    repositoryReads,
    writes,
    write: writes[0],
    handoff: SentryRepairPlanningHandoffSchema.parse(writes[0]?.data),
  };
}

Deno.test("repair handoff emits one strict create intent and has deterministic replay identity", async () => {
  const bundle = await sourceBundle();
  const first = await runHandoff(bundle, []);
  const replay = await runHandoff(bundle, []);

  assert.deepEqual(first.calls, [["list", "--all", "--json"]]);
  assert.deepEqual(
    first.repositoryReads,
    [
      bundle.args.sourceSnapshot,
      bundle.args.sourceReconciliation,
      bundle.args.sourceTriage,
    ].map((name) => ({
      type: "@supers/sentry-issue-intake",
      modelId: SOURCE_INTAKE_MODEL_ID,
      name,
    })),
  );
  assert.equal(
    first.handoff.status,
    "ready",
    JSON.stringify(first.handoff.blockingReasons),
  );
  assert.equal(first.handoff.intents.length, 1);
  assert.deepEqual(first.writes.map((write) => write.specName), [
    "handoff",
    "repair-intent",
  ]);
  assert.equal(first.writes[1].data.planningWorkItem, "sentry-7659756211");
  const intent = first.handoff.intents[0];
  assert.equal(intent.queueIntent, "confirmed-repair");
  assert.equal(intent.recommendation, "create-task");
  assert.equal(intent.existingDexTaskId, null);
  assert.equal(intent.issueId, "7659756211");
  assert.equal(intent.currentRelease, RELEASE);
  assert.equal(intent.observedAt, NOW);
  assert.equal(intent.supersedesIntentFingerprint, null);
  assert.equal(intent.requestedSentryBacklink.mode, "post-planning-comment");
  assert.equal(intent.planningWorkItem, "sentry-7659756211");
  assert.equal(first.write.name, replay.write.name);
  assert.deepEqual(first.write.data, replay.write.data);
  assert.equal(first.handoff.fingerprint, replay.handoff.fingerprint);
  assert.equal(
    first.handoff.intents[0].idempotencyKey,
    replay.handoff.intents[0].idempotencyKey,
  );
});

Deno.test("repair handoff replays an intent and chains newer authored evidence", async () => {
  const bundle = await sourceBundle();
  const first = await runHandoff(bundle, []);
  const firstEnvelope = SentryRepairIntentEnvelopeSchema.parse(
    first.writes[1].data,
  );

  bundle.args.priorIntents = [firstEnvelope];
  const replay = await runHandoff(bundle, []);
  const replayEnvelope = SentryRepairIntentEnvelopeSchema.parse(
    replay.writes[1].data,
  );
  assert.equal(replayEnvelope.fingerprint, firstEnvelope.fingerprint);

  bundle.args.issuePlans[0]!.scope = [
    "Use newer bounded authored repair scope.",
  ];
  const newer = await runHandoff(bundle, []);
  const newerEnvelope = SentryRepairIntentEnvelopeSchema.parse(
    newer.writes[1].data,
  );
  assert.notEqual(newerEnvelope.fingerprint, firstEnvelope.fingerprint);
  assert.equal(
    newerEnvelope.intent.supersedesIntentFingerprint,
    firstEnvelope.fingerprint,
  );
});

Deno.test("later identical collections supersede one head for confirmed and reproduction intents", async () => {
  for (
    const source of [
      {
        disposition: "current-release" as const,
        queueIntent: "confirmed-repair" as const,
        recommendation: "create-task" as const,
      },
      {
        disposition: "recent" as const,
        queueIntent: "reproduction-required" as const,
        recommendation: "reproduce-first" as const,
      },
    ]
  ) {
    const firstBundle = await sourceBundle({
      ...source,
      capturedAt: "2026-08-18T21:00:00.000Z",
    });
    if (source.queueIntent === "reproduction-required") {
      firstBundle.args.issuePlans = [];
    }
    const first = await runHandoff(firstBundle, []);
    const firstEnvelope = SentryRepairIntentEnvelopeSchema.parse(
      first.writes[1].data,
    );

    const laterBundle = await sourceBundle({
      ...source,
      capturedAt: "2026-08-18T22:00:00.000Z",
    });
    if (source.queueIntent === "reproduction-required") {
      laterBundle.args.issuePlans = [];
    }
    laterBundle.args.priorIntents = [firstEnvelope];
    const later = await runHandoff(laterBundle, []);
    const laterEnvelope = SentryRepairIntentEnvelopeSchema.parse(
      later.writes[1].data,
    );

    assert.notEqual(laterEnvelope.fingerprint, firstEnvelope.fingerprint);
    assert.equal(
      laterEnvelope.intent.supersedesIntentFingerprint,
      firstEnvelope.fingerprint,
    );
  }
});

Deno.test("repair handoff persists every eligible issue as an ordered queue resource", async () => {
  const bundle = await sourceBundle({ additionalIssue: true });
  const result = await runHandoff(bundle, []);
  assert.equal(result.handoff.status, "ready");
  assert.deepEqual(
    result.handoff.intents.map((intent) => intent.shortId),
    ["SUPERS-17", "SUPERS-18"],
  );
  assert.deepEqual(
    result.writes.map((write) => write.specName),
    ["handoff", "repair-intent", "repair-intent"],
  );
  assert.deepEqual(
    result.writes.slice(1).map((write) => write.data.planningWorkItem),
    ["sentry-7659756211", "sentry-7659756212"],
  );
});

Deno.test("repair handoff emits attach intent only for the same exact open task", async () => {
  const bundle = await sourceBundle({
    recommendation: "attach-existing",
    exactMatchTaskIds: ["task-17"],
  });
  const result = await runHandoff(bundle, [dexTask()]);

  assert.equal(result.handoff.status, "ready");
  assert.equal(result.handoff.intents[0].recommendation, "attach-existing");
  assert.equal(result.handoff.intents[0].existingDexTaskId, "task-17");
});

Deno.test("repair handoff returns no-candidate without mutation intent", async () => {
  const bundle = await sourceBundle({
    disposition: "historical-unresolved",
    recommendation: "ignore",
  });
  bundle.args.issuePlans = [];
  const result = await runHandoff(bundle, []);

  assert.equal(result.handoff.status, "no-candidate");
  assert.deepEqual(result.handoff.blockingReasons, []);
  assert.deepEqual(result.handoff.intents, []);
  assert.deepEqual(result.writes.map((write) => write.specName), ["handoff"]);
});

Deno.test("repair handoff persists recent unresolved issues without an authored plan", async () => {
  const bundle = await sourceBundle({
    disposition: "recent",
    queueIntent: "reproduction-required",
    recommendation: "reproduce-first",
  });
  bundle.args.issuePlans = [];
  const result = await runHandoff(bundle, [
    dexTask({
      id: "unrelated-active-task",
      name: "Unrelated active work",
      description: "Different work item",
      started_at: NOW,
    }),
  ]);

  assert.equal(result.handoff.status, "ready");
  assert.deepEqual(result.handoff.blockingReasons, []);
  assert.equal(result.handoff.intents.length, 1);
  assert.equal(result.handoff.intents[0].queueIntent, "reproduction-required");
  assert.equal(result.handoff.intents[0].recommendation, "reproduce-first");
  assert.match(
    result.handoff.intents[0].scope[0],
    /Reproduce the bounded Sentry issue/,
  );
});

Deno.test("repair handoff preserves every triage fail-closed route as a human gate", async () => {
  const cases: Array<{
    reason: TriageBlockingReason;
    options: SourceBundleOptions;
  }> = [
    {
      reason: "source-ineligible",
      options: { snapshotComplete: false, automationEligible: false },
    },
    {
      reason: "multiple-exact-matches",
      options: {
        recommendation: "human-review",
        blockingReasons: ["multiple-exact-matches"],
      },
    },
    {
      reason: "completed-exact-match",
      options: {
        recommendation: "human-review",
        blockingReasons: ["completed-exact-match"],
      },
    },
    {
      reason: "lexical-review",
      options: {
        recommendation: "human-review",
        blockingReasons: ["lexical-review"],
      },
    },
    {
      reason: "ambiguous-source",
      options: {
        disposition: "ambiguous",
        recommendation: "human-review",
        blockingReasons: ["ambiguous-source"],
      },
    },
  ];

  for (const testCase of cases) {
    const bundle = await sourceBundle(testCase.options);
    bundle.args.issuePlans = [];
    const result = await runHandoff(bundle, []);
    assert.equal(result.handoff.status, "human-gate", testCase.reason);
    assert(result.handoff.blockingReasons.includes(testCase.reason));
    assert.deepEqual(result.handoff.intents, []);
  }

  const activeDexBundle = await sourceBundle();
  const activeDex = await runHandoff(activeDexBundle, [
    dexTask({
      id: "unrelated-active-task",
      name: "Unrelated active work",
      description: "Different work item",
      started_at: NOW,
    }),
  ]);
  assert.equal(activeDex.handoff.status, "ready");
  assert.deepEqual(activeDex.handoff.blockingReasons, []);
  assert.equal(activeDex.handoff.intents.length, 1);
});

Deno.test("repair handoff fails closed on inconsistent triage eligibility", async () => {
  const bundle = await sourceBundle();
  await replaceTriage(bundle, (triage) => {
    triage.queueEligible = false;
    triage.blockingReasons = [];
  });

  const result = await runHandoff(bundle, []);
  assert.equal(result.handoff.status, "human-gate");
  assert(result.handoff.blockingReasons.includes("source-ineligible"));
  assert.deepEqual(result.handoff.intents, []);
});

Deno.test("repair handoff cross-validates triage issue identity", async () => {
  const bundle = await sourceBundle();
  await replaceTriage(bundle, (triage) => {
    const items = triage.items as Array<Record<string, unknown>>;
    items[0].shortId = "SUPERS-99";
  });

  const result = await runHandoff(bundle, []);
  assert.equal(result.handoff.status, "human-gate");
  assert(result.handoff.blockingReasons.includes("stale-source"));
  assert.deepEqual(result.handoff.intents, []);
});

Deno.test("repair handoff rejects duplicate triage issue identities", async () => {
  const bundle = await sourceBundle();
  const duplicateIssue = {
    ...bundle.triage.items[0],
    shortId: "SUPERS-18",
  };
  assert.throws(
    () =>
      SentryDexTriageSchema.parse({
        ...bundle.triage,
        items: [...bundle.triage.items, duplicateIssue],
      }),
    /issueId values must be unique/,
  );
  const duplicateShortId = {
    ...bundle.triage.items[0],
    issueId: "other-issue",
  };
  assert.throws(
    () =>
      SentryDexTriageSchema.parse({
        ...bundle.triage,
        items: [...bundle.triage.items, duplicateShortId],
      }),
    /shortId values must be unique/,
  );
});

Deno.test("repair handoff routes fingerprint and source-chain staleness to a human gate", async () => {
  const expectedMismatch = await sourceBundle();
  expectedMismatch.args.expectedTriageFingerprint = "f".repeat(64);
  const mismatchResult = await runHandoff(expectedMismatch, []);
  assert.equal(mismatchResult.handoff.status, "human-gate");
  assert(mismatchResult.handoff.blockingReasons.includes("stale-source"));
  assert.equal(
    mismatchResult.handoff.sourceTriageFingerprint,
    expectedMismatch.triage.fingerprint,
  );

  const chainMismatch = await sourceBundle();
  const reconciliation = structuredClone(chainMismatch.reconciliation);
  reconciliation.sourceSnapshot = "different-snapshot";
  chainMismatch.resources.set(
    chainMismatch.args.sourceReconciliation,
    reconciliation,
  );
  const chainResult = await runHandoff(chainMismatch, []);
  assert.equal(chainResult.handoff.status, "human-gate");
  assert(chainResult.handoff.blockingReasons.includes("stale-source"));
});

Deno.test("repair handoff detects Dex recommendation drift after triage", async () => {
  const createBundle = await sourceBundle();
  const createDrift = await runHandoff(createBundle, [dexTask()]);
  assert.equal(createDrift.handoff.status, "human-gate");
  assert(createDrift.handoff.blockingReasons.includes("dex-drift"));

  const attachBundle = await sourceBundle({
    recommendation: "attach-existing",
    exactMatchTaskIds: ["task-17"],
  });
  const attachDrift = await runHandoff(
    attachBundle,
    [dexTask({ id: "task-other" })],
  );
  assert.equal(attachDrift.handoff.status, "human-gate");
  assert(attachDrift.handoff.blockingReasons.includes("dex-drift"));
});

Deno.test("repair handoff detects completed result-only Dex matches", async () => {
  const bundle = await sourceBundle();
  const result = await runHandoff(bundle, [
    dexTask({
      id: "completed-result-match",
      name: "Repair duplicate declaration",
      description: "Current release regression.",
      result: "Verified and resolved Sentry issue SUPERS-17.",
      completed: true,
      completed_at: NOW,
    }),
  ]);

  assert.equal(result.handoff.status, "human-gate");
  assert(result.handoff.blockingReasons.includes("dex-drift"));
  assert.deepEqual(result.handoff.intents, []);
});

Deno.test("repair handoff supplies bounded defaults and rejects unrelated authored plans", async () => {
  const missingBundle = await sourceBundle();
  missingBundle.args.issuePlans = [];
  const missing = await runHandoff(missingBundle, []);
  assert.equal(missing.handoff.status, "ready");
  assert.match(missing.handoff.intents[0].scope[0], /Diagnose and repair/);

  const unknownBundle = await sourceBundle();
  unknownBundle.args.issuePlans.push({
    issueId: "unrelated-issue",
    scope: ["Unrelated scope"],
    acceptanceCriteria: ["Unrelated acceptance"],
  });
  const unknown = await runHandoff(unknownBundle, []);
  assert(unknown.handoff.blockingReasons.includes("unknown-authored-plan"));
  assert.deepEqual(unknown.handoff.intents, []);
});

Deno.test("repair model separates read-only queueing from evidence-bound Sentry mutations", () => {
  assert.equal(model.type, "@supers/sentry-repair-planning-handoff");
  assert.deepEqual(Object.keys(model.methods), [
    "record-machine-backlink",
    "resolve-verified",
    "record-backlink",
    "select-next",
    "prepare",
  ]);
  assert.deepEqual(Object.keys(model.resources), [
    "handoff",
    "repair-intent",
    "queue-selection",
    "backlink-receipt",
    "resolution-attempt",
    "resolution-receipt",
  ]);
  const globalArguments = model.globalArguments.parse({
    sourceIntakeModelId: SOURCE_INTAKE_MODEL_ID,
    sourceDeliveryModelId: SOURCE_DELIVERY_MODEL_ID,
    sourceReplayModelId: "8c39d96c-8fdd-4a44-8942-b7faa606f766",
  });
  assert.equal(globalArguments.sourceIntakeModelId, SOURCE_INTAKE_MODEL_ID);
  assert.equal(globalArguments.sourceDeliveryModelId, SOURCE_DELIVERY_MODEL_ID);
  assert.equal(
    globalArguments.sourceReplayModelId,
    "8c39d96c-8fdd-4a44-8942-b7faa606f766",
  );
});
