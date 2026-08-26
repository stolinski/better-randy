import { z } from "npm:zod@4.4.3";

import { supersRenderMatrixRunnerTimeoutMs } from "../../scripts/supers-render-matrix-runner.ts";
import {
  computeRepositoryScopedTreeFingerprint,
  computeRepositoryTreeFingerprint,
} from "../../src/lib/utils/repository-tree-fingerprint.server.ts";
import {
  createSupersDeterministicContractHash,
  SupersAdvisoryVisualObservationSchema,
  SupersRenderMatrixBundleSchema,
  SupersRenderMatrixManifestSchema,
  SupersRenderRegistrySnapshotSchema,
  verifySupersFullRenderMatrixBundle,
  verifySupersRenderMatrixBundle,
} from "./supers-deterministic-factory-contract.ts";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40,64}$/);
const DomainIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._:-]{0,127}$/);
const RepositoryPathSchema = z.string().min(1).max(1_000).regex(
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/,
);
const RENDER_INVENTORY_TIMEOUT_MS = 2 * 60 * 1000;
const RENDER_ARCHIVE_TIMEOUT_MS = 10 * 60 * 1000;

const UniqueRepositoryPathsSchema = z.array(RepositoryPathSchema).max(2_000)
  .superRefine((paths, context) => {
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        message: "Changed paths must be unique",
      });
    }
    const sorted = [...paths].sort((left, right) => left.localeCompare(right));
    if (paths.some((path, index) => path !== sorted[index])) {
      context.addIssue({
        code: "custom",
        message: "Changed paths must be sorted",
      });
    }
  });

export const SupersRenderMatrixVerificationArgumentsSchema = z
  .discriminatedUnion("scope", [
    z.strictObject({
      schemaVersion: z.literal(1),
      scope: z.literal("affected"),
      workItem: DomainIdSchema,
      expectedTreeFingerprint: Sha256Schema,
      expectedSourceRevision: GitRevisionSchema.optional(),
      changedPaths: UniqueRepositoryPathsSchema.min(1),
      renderRequired: z.boolean(),
    }),
    z.strictObject({
      schemaVersion: z.literal(1),
      scope: z.literal("full"),
      workItem: DomainIdSchema,
      expectedTreeFingerprint: Sha256Schema,
    }),
  ]);

const CompletedRunSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("completed"),
  scope: z.enum(["affected", "full"]),
  workItem: DomainIdSchema,
  sourceRevision: GitRevisionSchema,
  expectedTreeFingerprint: Sha256Schema,
  registrySnapshotName: z.string().min(1),
  registrySnapshotDigest: Sha256Schema,
  manifestName: z.string().min(1),
  manifestDigest: Sha256Schema,
  bundleName: z.string().min(1),
  bundleDigest: Sha256Schema,
  evidenceArchiveName: z.string().min(1),
  evidenceArchiveDigest: Sha256Schema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  executionMode: z.literal("bounded-internal-fanout"),
  freshness: z.strictObject({
    localBefore: Sha256Schema,
    servedBefore: Sha256Schema,
    servedAfter: Sha256Schema,
    localAfter: Sha256Schema,
  }),
  counts: z.strictObject({
    presets: z.number().int().nonnegative(),
    packs: z.number().int().nonnegative(),
    orientations: z.number().int().nonnegative(),
    samples: z.number().int().nonnegative(),
    cells: z.number().int().positive(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
  }),
  outcome: z.enum(["pass", "fail", "unavailable"]),
  advisories: z.array(SupersAdvisoryVisualObservationSchema),
});

const NotApplicableRunSchema = z.strictObject({
  schemaVersion: z.literal(1),
  status: z.literal("not-applicable"),
  scope: z.literal("affected"),
  workItem: DomainIdSchema,
  sourceRevision: GitRevisionSchema,
  expectedTreeFingerprint: Sha256Schema,
  changedPathsDigest: Sha256Schema,
  reason: z.literal("no-deliverable-render-impact"),
  advisories: z.tuple([]),
});

export const SupersRenderMatrixRunSchema = z.discriminatedUnion("status", [
  CompletedRunSchema,
  NotApplicableRunSchema,
]);

interface DataHandle {
  name: string;
  specName?: string;
  version?: number;
}
interface FileWriter {
  writeAll: (content: Uint8Array) => Promise<DataHandle>;
  writeText: (content: string) => Promise<DataHandle>;
}
interface MethodContext {
  repoDir: string;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<DataHandle>;
  createFileWriter: (specName: string, name: string) => FileWriter;
}

type VerificationArguments = z.infer<
  typeof SupersRenderMatrixVerificationArgumentsSchema
>;

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  const child = new Deno.Command(command, {
    args,
    cwd,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGTERM");
    } catch {
      // The process may finish between the timeout and signal.
    }
  }, timeoutMs);
  try {
    const result = await child.output();
    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);
    if (timedOut) {
      throw new Error(
        `${command} ${args[0] ?? ""} timed out after ${timeoutMs}ms`,
      );
    }
    if (result.code !== 0) {
      throw new Error(
        `${command} ${args[0] ?? ""} exited ${result.code}: ${
          (stderr || stdout).slice(0, 2_000)
        }`,
      );
    }
    return { stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function resourceStem(
  args: VerificationArguments,
  manifestDigest: string,
): string {
  return `${args.scope}-${args.workItem}-${
    args.expectedTreeFingerprint.slice(0, 16)
  }-${manifestDigest.slice(0, 16)}`;
}

async function verifyRetainedRenderEvidence(
  tempDirectory: string,
  bundle: z.infer<typeof SupersRenderMatrixBundleSchema>,
  evidenceIndex: readonly { path: string; sha256: string; bytes: number }[],
): Promise<void> {
  const indexed = new Map<string, { sha256: string; bytes: number }>();
  for (const entry of evidenceIndex) {
    if (indexed.has(entry.path)) {
      throw new TypeError(`Duplicate retained evidence path: ${entry.path}`);
    }
    indexed.set(entry.path, entry);
  }
  const referenced = new Map<string, string>();
  for (const cell of bundle.cells) {
    for (const check of cell.checks) {
      for (const evidence of check.evidence) {
        const existing = referenced.get(evidence.path);
        if (existing && existing !== evidence.sha256) {
          throw new TypeError(
            `Conflicting retained evidence digest: ${evidence.path}`,
          );
        }
        referenced.set(evidence.path, evidence.sha256);
      }
    }
  }
  if (indexed.size !== referenced.size) {
    throw new TypeError("Retained evidence contains missing or extra files");
  }
  for (const [path, expectedDigest] of referenced) {
    const receipt = indexed.get(path);
    if (!receipt || receipt.sha256 !== expectedDigest) {
      throw new TypeError(`Retained evidence index mismatch: ${path}`);
    }
    const content = await Deno.readFile(`${tempDirectory}/${path}`);
    if (
      content.byteLength !== receipt.bytes ||
      await sha256Bytes(content) !== expectedDigest
    ) {
      throw new TypeError(`Retained evidence content mismatch: ${path}`);
    }
  }
}

async function readRenderSourceRevision(repoDir: string): Promise<string> {
  const result = await new Deno.Command("git", {
    args: ["rev-parse", "--verify", "HEAD"],
    cwd: repoDir,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (result.code !== 0) {
    throw new Error("Unable to read the render source revision");
  }
  const revision = new TextDecoder().decode(result.stdout).trim();
  if (!/^[0-9a-f]{40,64}$/.test(revision)) {
    throw new Error("Render source revision is invalid");
  }
  return revision;
}

/** Execute one immutable registry inventory plus one bounded internal CDP fan-out. */
export async function executeSupersRenderMatrixVerification(
  args: VerificationArguments,
  context: MethodContext,
): Promise<{ dataHandles: DataHandle[] }> {
  const parsedArgs = SupersRenderMatrixVerificationArgumentsSchema.parse(args);
  const startedAt = new Date().toISOString();
  if (parsedArgs.scope === "affected" && !parsedArgs.renderRequired) {
    const run = SupersRenderMatrixRunSchema.parse({
      schemaVersion: 1,
      status: "not-applicable",
      scope: "affected",
      workItem: parsedArgs.workItem,
      sourceRevision: parsedArgs.expectedSourceRevision ??
        await readRenderSourceRevision(context.repoDir),
      expectedTreeFingerprint: parsedArgs.expectedTreeFingerprint,
      changedPathsDigest: await createSupersDeterministicContractHash(
        parsedArgs.changedPaths,
      ),
      reason: "no-deliverable-render-impact",
      advisories: [],
    });
    const handle = await context.writeResource(
      "render-matrix-run",
      `render-matrix-run-affected-${parsedArgs.workItem}-${parsedArgs.expectedTreeFingerprint}`,
      run,
    );
    return { dataHandles: [handle] };
  }

  const localBefore = parsedArgs.scope === "affected"
    ? await computeRepositoryScopedTreeFingerprint(
      context.repoDir,
      parsedArgs.changedPaths,
    )
    : await computeRepositoryTreeFingerprint(context.repoDir);
  if (localBefore.treeFingerprint !== parsedArgs.expectedTreeFingerprint) {
    throw new Error("Local source identity drifted before render inventory");
  }
  const tempDirectory = await Deno.makeTempDir({
    prefix: "supers-render-matrix-",
  });
  try {
    const collector = await runCommand(
      "node",
      [
        "--experimental-strip-types",
        "scripts/derive-supers-render-matrix-manifest.ts",
        parsedArgs.scope,
        localBefore.sourceRevision,
        parsedArgs.expectedTreeFingerprint,
        JSON.stringify(
          parsedArgs.scope === "affected" ? parsedArgs.changedPaths : [],
        ),
      ],
      context.repoDir,
      RENDER_INVENTORY_TIMEOUT_MS,
    );
    const collected = z.strictObject({
      snapshot: SupersRenderRegistrySnapshotSchema,
      manifest: SupersRenderMatrixManifestSchema.nullable(),
    }).parse(JSON.parse(collector.stdout));
    const expectedSnapshotDigest = await createSupersDeterministicContractHash({
      schemaVersion: collected.snapshot.schemaVersion,
      sourceRevision: collected.snapshot.sourceRevision,
      engineFingerprint: collected.snapshot.engineFingerprint,
      deliverablePresets: collected.snapshot.deliverablePresets,
      packs: collected.snapshot.packs,
      orientations: collected.snapshot.orientations,
    });
    if (
      collected.snapshot.snapshotDigest !== expectedSnapshotDigest ||
      collected.snapshot.sourceRevision !== localBefore.sourceRevision ||
      collected.snapshot.engineFingerprint !==
        parsedArgs.expectedTreeFingerprint
    ) {
      throw new Error(
        "Collected render registry snapshot identity is stale or invalid",
      );
    }
    const snapshotName =
      `render-registry-snapshot-${collected.snapshot.snapshotDigest}`;
    const snapshotHandle = await context.writeResource(
      "render-registry-snapshot",
      snapshotName,
      collected.snapshot,
    );
    if (collected.manifest === null) {
      if (parsedArgs.scope !== "affected") {
        throw new Error("Full render matrices cannot be not-applicable");
      }
      const run = SupersRenderMatrixRunSchema.parse({
        schemaVersion: 1,
        status: "not-applicable",
        scope: "affected",
        workItem: parsedArgs.workItem,
        sourceRevision: localBefore.sourceRevision,
        expectedTreeFingerprint: parsedArgs.expectedTreeFingerprint,
        changedPathsDigest: await createSupersDeterministicContractHash(
          parsedArgs.changedPaths,
        ),
        reason: "no-deliverable-render-impact",
        advisories: [],
      });
      const handle = await context.writeResource(
        "render-matrix-run",
        `render-matrix-run-affected-${parsedArgs.workItem}-${parsedArgs.expectedTreeFingerprint}`,
        run,
      );
      return { dataHandles: [snapshotHandle, handle] };
    }
    const stem = resourceStem(parsedArgs, collected.manifest.manifestDigest);
    const manifestPath = `${tempDirectory}/manifest.json`;
    const snapshotPath = `${tempDirectory}/snapshot.json`;
    const runnerPath = `${tempDirectory}/runner-result.json`;
    await Promise.all([
      Deno.writeTextFile(manifestPath, JSON.stringify(collected.manifest)),
      Deno.writeTextFile(snapshotPath, JSON.stringify(collected.snapshot)),
    ]);
    const runner = await runCommand(
      "node",
      [
        "--experimental-strip-types",
        "scripts/run-supers-render-matrix.mjs",
        manifestPath,
        snapshotPath,
        runnerPath,
        JSON.stringify(
          parsedArgs.scope === "affected" ? parsedArgs.changedPaths : [],
        ),
      ],
      context.repoDir,
      supersRenderMatrixRunnerTimeoutMs(parsedArgs.scope),
    );
    const runnerResult = z.strictObject({
      bundle: SupersRenderMatrixBundleSchema,
      evidenceIndex: z.array(
        z.strictObject({
          path: RepositoryPathSchema,
          sha256: Sha256Schema,
          bytes: z.number().int().nonnegative(),
        }),
      ),
      servedBefore: z.strictObject({
        schemaVersion: z.literal(1),
        sourceRevision: GitRevisionSchema,
        treeFingerprint: Sha256Schema,
      }),
      servedAfter: z.strictObject({
        schemaVersion: z.literal(1),
        sourceRevision: GitRevisionSchema,
        treeFingerprint: Sha256Schema,
      }),
    }).parse(JSON.parse(await Deno.readTextFile(runnerPath)));
    if (parsedArgs.scope === "full") {
      await verifySupersFullRenderMatrixBundle(
        collected.snapshot,
        collected.manifest,
        runnerResult.bundle,
      );
    } else {
      await verifySupersRenderMatrixBundle(
        collected.manifest,
        runnerResult.bundle,
      );
    }
    await verifyRetainedRenderEvidence(
      tempDirectory,
      runnerResult.bundle,
      runnerResult.evidenceIndex,
    );
    const localAfter = parsedArgs.scope === "affected"
      ? await computeRepositoryScopedTreeFingerprint(
        context.repoDir,
        parsedArgs.changedPaths,
      )
      : await computeRepositoryTreeFingerprint(context.repoDir);
    if (localAfter.treeFingerprint !== parsedArgs.expectedTreeFingerprint) {
      throw new Error("Local source identity drifted after render fan-out");
    }
    for (
      const receipt of [runnerResult.servedBefore, runnerResult.servedAfter]
    ) {
      if (
        receipt.sourceRevision !== localBefore.sourceRevision ||
        receipt.treeFingerprint !== parsedArgs.expectedTreeFingerprint
      ) throw new Error("Served source identity drifted during render fan-out");
    }
    const archivePath = `${tempDirectory}/render-matrix-evidence.tar.gz`;
    await runCommand(
      "tar",
      [
        "-czf",
        archivePath,
        "-C",
        tempDirectory,
        "render-matrix-evidence",
      ],
      context.repoDir,
      RENDER_ARCHIVE_TIMEOUT_MS,
    );
    const archiveBytes = await Deno.readFile(archivePath);
    const archiveDigest = await sha256Bytes(archiveBytes);
    const manifestHandle = await context.writeResource(
      "render-matrix-manifest",
      `render-matrix-manifest-${stem}`,
      collected.manifest,
    );
    const bundleHandle = await context.writeResource(
      "render-matrix-bundle",
      `render-matrix-bundle-${stem}`,
      runnerResult.bundle,
    );
    const archiveHandle = await context.createFileWriter(
      "evidence-archive",
      `render-matrix-evidence-${archiveDigest}`,
    ).writeAll(archiveBytes);
    const logHandle = await context.createFileWriter(
      "log",
      `render-matrix-log-${stem}`,
    ).writeText(`${collector.stderr}\n${runner.stdout}\n${runner.stderr}`);
    const cells = runnerResult.bundle.cells;
    const run = SupersRenderMatrixRunSchema.parse({
      schemaVersion: 1,
      status: "completed",
      scope: parsedArgs.scope,
      workItem: parsedArgs.workItem,
      sourceRevision: localBefore.sourceRevision,
      expectedTreeFingerprint: parsedArgs.expectedTreeFingerprint,
      registrySnapshotName: snapshotHandle.name,
      registrySnapshotDigest: collected.snapshot.snapshotDigest,
      manifestName: manifestHandle.name,
      manifestDigest: collected.manifest.manifestDigest,
      bundleName: bundleHandle.name,
      bundleDigest: runnerResult.bundle.bundleDigest,
      evidenceArchiveName: archiveHandle.name,
      evidenceArchiveDigest: archiveDigest,
      startedAt,
      completedAt: new Date().toISOString(),
      executionMode: "bounded-internal-fanout",
      freshness: {
        localBefore: localBefore.treeFingerprint,
        servedBefore: runnerResult.servedBefore.treeFingerprint,
        servedAfter: runnerResult.servedAfter.treeFingerprint,
        localAfter: localAfter.treeFingerprint,
      },
      counts: {
        presets: collected.manifest.presets.length,
        packs: collected.manifest.packs.length,
        orientations: collected.manifest.orientations.length,
        samples: collected.manifest.presets.reduce(
          (total, preset) => total + preset.samples.length,
          0,
        ),
        cells: cells.length,
        passed: cells.filter((cell) => cell.outcome === "pass").length,
        failed: cells.filter((cell) => cell.outcome === "fail").length,
        unavailable: cells.filter((cell) =>
          cell.outcome === "unavailable"
        ).length,
      },
      outcome: runnerResult.bundle.outcome,
      advisories: [],
    });
    const runHandle = await context.writeResource(
      "render-matrix-run",
      `render-matrix-run-${stem}`,
      run,
    );
    context.logger.info(
      "Supers render matrix retained every objective cell outcome",
      {
        scope: parsedArgs.scope,
        cells: cells.length,
        outcome: runnerResult.bundle.outcome,
      },
    );
    return {
      dataHandles: [
        snapshotHandle,
        manifestHandle,
        bundleHandle,
        archiveHandle,
        logHandle,
        runHandle,
      ],
    };
  } finally {
    await Deno.remove(tempDirectory, { recursive: true }).catch(() =>
      undefined
    );
  }
}

export const model = {
  type: "@supers/render-matrix-verification",
  version: "2026.08.15.1",
  globalArguments: z.strictObject({}),
  resources: {
    "render-registry-snapshot": {
      description: "Immutable live render registry snapshot",
      schema: SupersRenderRegistrySnapshotSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "render-matrix-manifest": {
      description: "Exact affected or full render coordinates",
      schema: SupersRenderMatrixManifestSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "render-matrix-bundle": {
      description: "Typed objective outcomes for every matrix cell",
      schema: SupersRenderMatrixBundleSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "render-matrix-run": {
      description: "Freshness receipt and bounded matrix summary",
      schema: SupersRenderMatrixRunSchema,
      lifetime: "infinite",
      garbageCollection: 40,
    },
  },
  files: {
    "evidence-archive": {
      description:
        "Compressed canonical captures, masks, bindings, probes, and evidence index",
      contentType: "application/gzip",
      lifetime: "3mo",
      garbageCollection: 20,
    },
    log: {
      description: "Bounded render-matrix coordinator log",
      contentType: "text/plain",
      lifetime: "1mo",
      garbageCollection: 20,
    },
  },
  methods: {
    "verify-render-matrix": {
      description:
        "Verify affected cells or the full live registry matrix through one bounded internal fan-out",
      arguments: SupersRenderMatrixVerificationArgumentsSchema,
      execute: executeSupersRenderMatrixVerification,
    },
  },
  reports: ["@supers/render-matrix"],
};
