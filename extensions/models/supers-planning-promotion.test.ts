import assert from "node:assert/strict";

import { createSupersPlanningHash } from "./supers-planning-promotion-applier.ts";
import {
  model,
  SupersPlanningPromotionGlobalArgumentsSchema,
  SupersPlanningPromotionMethodArgumentsSchema,
  SupersPlanningPromotionResourceSchema,
} from "./supers-planning-promotion.ts";

Deno.test("model exposes one bounded promotion method and one infinite result resource", () => {
  assert.equal(model.type, "@supers/planning-promotion");
  assert.equal(model.version, "2026.08.10.1");
  assert.deepEqual(Object.keys(model.methods), ["apply-promotion"]);
  assert.deepEqual(Object.keys(model.resources), ["result"]);
  assert.equal(model.resources.result.lifetime, "infinite");
  assert.throws(() =>
    SupersPlanningPromotionGlobalArgumentsSchema.parse({ unexpected: true })
  );
  assert.throws(() =>
    SupersPlanningPromotionMethodArgumentsSchema.parse({
      schemaVersion: 1,
      planningItemId: "unsafe-transition",
      operation: "planning-to-dex",
      decision: "reject",
      reason: "Even no-op planning-to-dex is not an exposed operation.",
    })
  );
  assert.throws(() =>
    SupersPlanningPromotionMethodArgumentsSchema.parse({
      schemaVersion: 1,
      planningItemId: "strict-boundary",
      operation: "capture-idea",
      decision: "reject",
      reason: "Not ready",
      unexpected: true,
    })
  );
});

Deno.test("method applies a capture in context.repoDir and stores a verified deterministic result", async () => {
  // Keep the OS spelling (`/var` on macOS) to prove production canonicalization.
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
    const arguments_ = SupersPlanningPromotionMethodArgumentsSchema.parse({
      schemaVersion: 1,
      planningItemId: "captured-idea",
      operation: "capture-idea",
      decision: "apply",
      source: null,
      destination,
      indexMutations: [],
      graph: null,
      approval: null,
    });
    const writes: Array<{
      specName: string;
      name: string;
      data: Record<string, unknown>;
    }> = [];
    const execute = model.methods["apply-promotion"].execute;
    const execution = await execute(arguments_, {
      repoDir,
      globalArgs: {},
      logger: { info: () => undefined },
      writeResource: (specName, name, data) => {
        writes.push({ specName, name, data: structuredClone(data) });
        return Promise.resolve({ name });
      },
    });

    assert.equal(
      await Deno.readTextFile(`${repoDir}/docs/ideas/captured-idea.md`),
      content,
    );
    assert.equal(writes.length, 1);
    assert.equal(writes[0]?.specName, "result");
    const result = SupersPlanningPromotionResourceSchema.parse(writes[0]?.data);
    assert.equal(result.status, "audited");
    assert.equal(result.operation, "capture-idea");
    assert.equal(result.dexResult, null);
    assert.equal(
      writes[0]?.name,
      `planning-promotion-${await createSupersPlanningHash(result)}`,
    );
    assert.deepEqual(execution.dataHandles, [{ name: writes[0]?.name }]);
  } finally {
    await Deno.remove(repoDir, { recursive: true });
  }
});
