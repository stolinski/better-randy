import assert from "node:assert/strict";

import {
  createSupersPlanningApprovalDigest,
  createSupersPlanningHash,
} from "./supers-planning-promotion-applier.ts";
import {
  model,
  SupersPlanningPromotionFailureReceiptSchema,
  SupersPlanningPromotionGlobalArgumentsSchema,
  SupersPlanningPromotionReceiptResourceSchema,
} from "./supers-planning-promotion.ts";

async function factoryAuthorization(
  preview: Parameters<typeof createSupersPlanningApprovalDigest>[0],
  approvalRequired = false,
) {
  const payloadHash = await createSupersPlanningApprovalDigest(preview);
  return {
    preview,
    validation: {
      schemaVersion: 1 as const,
      status: "validated" as const,
      kind: preview.operation,
      approvalRequired,
      expectsDexMappings: preview.operation === "planning-to-dex",
      payloadHash,
      sourceSnapshotFingerprint: "1".repeat(64),
      documentationEffectsFingerprint: "2".repeat(64),
      planHash: "3".repeat(64),
      summary: "Validated fixture promotion preview.",
    },
    approvalGateId: approvalRequired
      ? "planning-approval" as const
      : "not-required" as const,
    humanApproval: approvalRequired
      ? {
        gateId: "planning-approval" as const,
        workItem: preview.planningItemId,
        decision: "approved" as const,
        actor: "fixture-reviewer",
        stageId: "plan-review" as const,
        cycle: 1,
        decidedAt: "2026-08-27T00:00:00.000Z",
      }
      : null,
  };
}

Deno.test("model exposes one authorized orchestrator and five durable resource types", () => {
  assert.equal(model.type, "@supers/planning-promotion");
  assert.equal(model.version, "2026.08.27.2");
  assert.deepEqual(Object.keys(model.methods), ["apply-promotion"]);
  assert.deepEqual(Object.keys(model.resources).sort(), [
    "dex-checkpoint",
    "dex-receipt",
    "dex-result",
    "promotion-receipt",
    "promotion-result",
  ]);
  assert.equal(model.resources["promotion-result"].lifetime, "infinite");
  assert.throws(() =>
    SupersPlanningPromotionGlobalArgumentsSchema.parse({ unexpected: true })
  );
});

Deno.test("orchestrator rejects no-op decisions and mismatched validation evidence", async () => {
  const preview = {
    schemaVersion: 2 as const,
    planningItemId: "strict-handler",
    operation: "capture-idea" as const,
    source: null,
    destination: {
      path: "docs/ideas/strict-handler.md",
      expectedRevision: null,
      content: "# Strict handler\n",
      revision: await createSupersPlanningHash("# Strict handler\n"),
    },
    indexMutations: [],
    graph: null,
  };
  const authorization = await factoryAuthorization(preview);
  assert.throws(() =>
    model.methods["apply-promotion"].arguments.parse({
      ...authorization,
      preview: { ...preview, decision: "reject", reason: "No mutation." },
    })
  );
  await assert.rejects(() =>
    model.methods["apply-promotion"].execute(
      {
        ...authorization,
        validation: {
          ...authorization.validation,
          payloadHash: "f".repeat(64),
        },
      },
      {
        repoDir: "/unused",
        globalArgs: {},
        logger: { info: () => undefined, warning: () => undefined },
        readResource: () => Promise.resolve(null),
        writeResource: () => Promise.resolve({ name: "unexpected" }),
      },
    )
  );
});

Deno.test("graduation orchestrator requires matching current plan-review approval", async () => {
  const destinationContent = "# Roadmap\n";
  const preview = {
    schemaVersion: 2 as const,
    planningItemId: "approval-bound",
    operation: "idea-to-roadmap" as const,
    source: {
      path: "docs/ideas/approval-bound.md",
      expectedRevision: "4".repeat(64),
    },
    destination: {
      path: "docs/roadmap.md",
      expectedRevision: "5".repeat(64),
      content: destinationContent,
      revision: await createSupersPlanningHash(destinationContent),
    },
    indexMutations: [],
    graph: null,
  };
  const authorization = await factoryAuthorization(preview, true);
  const context = {
    repoDir: "/unused",
    globalArgs: {},
    logger: { info: () => undefined, warning: () => undefined },
    readResource: () => Promise.resolve(null),
    writeResource: () => Promise.resolve({ name: "unexpected" }),
  };
  await assert.rejects(() =>
    model.methods["apply-promotion"].execute(
      { ...authorization, humanApproval: null },
      context,
    )
  );
  await assert.rejects(() =>
    model.methods["apply-promotion"].execute(
      {
        ...authorization,
        humanApproval: {
          ...authorization.humanApproval!,
          workItem: "another-item",
        },
      },
      context,
    )
  );
});

Deno.test("capture handler stores a verified result and audit receipt", async () => {
  const repoDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${repoDir}/.dex`);
    const content = "# Captured idea\n";
    const destination = {
      path: "docs/ideas/captured-idea.md",
      expectedRevision: null,
      content,
      revision: await createSupersPlanningHash(content),
    };
    const preview = {
      schemaVersion: 2 as const,
      planningItemId: "captured-idea",
      operation: "capture-idea" as const,
      source: null,
      destination,
      indexMutations: [],
      graph: null,
    };
    const writes: Array<{
      specName: string;
      name: string;
      data: Record<string, unknown>;
    }> = [];
    const execute = model.methods["apply-promotion"].execute;
    const execution = await execute(await factoryAuthorization(preview), {
      repoDir,
      globalArgs: {},
      logger: { info: () => undefined, warning: () => undefined },
      readResource: () => Promise.resolve(null),
      writeResource: (specName, name, data) => {
        writes.push({ specName, name, data: structuredClone(data) });
        return Promise.resolve({ name });
      },
    });

    assert.equal(
      await Deno.readTextFile(`${repoDir}/docs/ideas/captured-idea.md`),
      content,
    );
    assert.deepEqual(
      writes.map((write) => write.specName),
      ["promotion-result", "promotion-receipt"],
    );
    assert.equal(writes[0]?.data.status, "audited");
    const receipt = SupersPlanningPromotionReceiptResourceSchema.parse(
      writes[1]?.data,
    );
    assert.equal(receipt.status, "audited");
    assert.equal(receipt.authorityState, "destination-authoritative");
    assert.deepEqual(
      execution.dataHandles.map((handle) => handle.name),
      writes.map((write) => write.name),
    );
  } finally {
    await Deno.remove(repoDir, { recursive: true });
  }
});

Deno.test("Factory orchestrator dispatches a validated preview to the exact capture handler", async () => {
  const repoDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${repoDir}/.dex`);
    const content = "# Orchestrated idea\n";
    const preview = {
      schemaVersion: 2 as const,
      planningItemId: "orchestrated-idea",
      operation: "capture-idea" as const,
      source: null,
      destination: {
        path: "docs/ideas/orchestrated-idea.md",
        expectedRevision: null,
        content,
        revision: await createSupersPlanningHash(content),
      },
      indexMutations: [],
      graph: null,
    };
    const writes: Array<{ specName: string; data: Record<string, unknown> }> =
      [];

    await model.methods["apply-promotion"].execute(
      await factoryAuthorization(preview),
      {
        repoDir,
        globalArgs: {},
        logger: { info: () => undefined, warning: () => undefined },
        readResource: () => Promise.resolve(null),
        writeResource: (specName, name, data) => {
          writes.push({ specName, data: structuredClone(data) });
          return Promise.resolve({ name });
        },
      },
    );

    assert.equal(
      await Deno.readTextFile(`${repoDir}/docs/ideas/orchestrated-idea.md`),
      content,
    );
    assert.equal(writes[0]?.data.operation, "capture-idea");
    const invalidAuthorization = await factoryAuthorization(preview, true);
    await assert.rejects(() =>
      model.methods["apply-promotion"].execute(
        invalidAuthorization,
        {
          repoDir,
          globalArgs: {},
          logger: { info: () => undefined, warning: () => undefined },
          readResource: () => Promise.resolve(null),
          writeResource: () => Promise.resolve({ name: "unexpected" }),
        },
      )
    );
  } finally {
    await Deno.remove(repoDir, { recursive: true });
  }
});

Deno.test("recovery failure receipt preserves durable audited authority", async () => {
  const repoDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${repoDir}/.dex`);
    const content = "# Durable authority\n";
    const preview = {
      schemaVersion: 2 as const,
      planningItemId: "durable-authority",
      operation: "capture-idea" as const,
      source: null,
      destination: {
        path: "docs/ideas/durable-authority.md",
        expectedRevision: null,
        content,
        revision: await createSupersPlanningHash(content),
      },
      indexMutations: [],
      graph: null,
    };
    const resources = new Map<string, Record<string, unknown>>();
    const writes: Array<{
      specName: string;
      data: Record<string, unknown>;
    }> = [];
    const context = {
      repoDir,
      globalArgs: {},
      logger: { info: () => undefined, warning: () => undefined },
      readResource: (name: string) =>
        Promise.resolve(resources.get(name) ?? null),
      writeResource: (
        specName: string,
        name: string,
        data: Record<string, unknown>,
      ) => {
        const copy = structuredClone(data);
        resources.set(name, copy);
        writes.push({ specName, data: copy });
        return Promise.resolve({ name });
      },
    };
    const authorization = await factoryAuthorization(preview);
    await model.methods["apply-promotion"].execute(authorization, context);
    await Deno.writeTextFile(
      `${repoDir}/docs/ideas/durable-authority.md`,
      "external drift",
    );

    await assert.rejects(() =>
      model.methods["apply-promotion"].execute(authorization, context)
    );

    const failure = SupersPlanningPromotionFailureReceiptSchema.parse(
      writes.at(-1)?.data,
    );
    assert.equal(failure.errorCode, "stale-destination");
    assert.equal(failure.authorityState, "destination-authoritative");
    assert.equal(failure.cleanupDisposition, "not-required");
  } finally {
    await Deno.remove(repoDir, { recursive: true });
  }
});

Deno.test("typed promotion failure writes repair guidance and authority state", async () => {
  const repoDir = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${repoDir}/.dex`);
    await Deno.mkdir(`${repoDir}/docs/ideas`, { recursive: true });
    await Deno.writeTextFile(`${repoDir}/docs/ideas/stale.md`, "changed");
    const destinationContent = "# Roadmap\n";
    const preview = {
      schemaVersion: 2 as const,
      planningItemId: "stale",
      operation: "idea-to-roadmap" as const,
      source: {
        path: "docs/ideas/stale.md",
        expectedRevision: "1".repeat(64),
      },
      destination: {
        path: "docs/roadmap.md",
        expectedRevision: null,
        content: destinationContent,
        revision: await createSupersPlanningHash(destinationContent),
      },
      indexMutations: [],
      graph: null,
    };
    const authorization = await factoryAuthorization(preview, true);
    const writes: Array<Record<string, unknown>> = [];
    await assert.rejects(() =>
      model.methods["apply-promotion"].execute(authorization, {
        repoDir,
        globalArgs: {},
        logger: { info: () => undefined, warning: () => undefined },
        readResource: () => Promise.resolve(null),
        writeResource: (_specName, name, data) => {
          writes.push(structuredClone(data));
          return Promise.resolve({ name });
        },
      })
    );
    assert.equal(writes.length, 1);
    const failure = SupersPlanningPromotionFailureReceiptSchema.parse(
      writes[0],
    );
    assert.equal(failure.status, "failed");
    assert.equal(failure.errorCode, "stale-source");
    assert.equal(failure.authorityState, "source-authoritative");
    assert.equal(failure.cleanupDisposition, "pending");
    assert.equal(failure.repairGuidance, "inspect-source-drift");
    await assert.rejects(() => Deno.stat(`${repoDir}/docs/roadmap.md`));
  } finally {
    await Deno.remove(repoDir, { recursive: true });
  }
});
