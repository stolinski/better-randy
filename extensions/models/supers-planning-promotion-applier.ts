/**
 * Transactional applier for the ADR-free Supers planning promotion lifecycle.
 *
 * Every mutation is journaled in the repository and runs under the lock shared
 * with the Dex plan applier. Transactions only roll forward: destinations are
 * written and verified before a source document is removed.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  DEFAULT_DEX_REPOSITORY_LOCK,
  type DexRepositoryLock,
} from "./dex-repository-lock.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const PLANNING_ITEM_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const CLIENT_REF_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const JOURNAL_DIRECTORY = ".swamp/supers-planning-promotions";

const RevisionSchema = z.string().regex(SHA256_PATTERN);
const RepositoryPathSchema = z.string().min(1).max(1_000);

export const SupersPlanningDocumentWriteSchema = z.strictObject({
  path: RepositoryPathSchema,
  expectedRevision: RevisionSchema.nullable(),
  content: z.string().max(2_000_000),
  revision: RevisionSchema,
});

export const SupersPlanningDocumentDeleteSchema = z.strictObject({
  path: RepositoryPathSchema,
  expectedRevision: RevisionSchema,
});

const SupersPlanningIndexWriteSchema = SupersPlanningDocumentWriteSchema.extend(
  {
    action: z.literal("write"),
  },
);
const SupersPlanningIndexDeleteSchema = SupersPlanningDocumentDeleteSchema
  .extend({
    action: z.literal("delete"),
  });
export const SupersPlanningIndexMutationSchema = z.discriminatedUnion(
  "action",
  [
    SupersPlanningIndexWriteSchema,
    SupersPlanningIndexDeleteSchema,
  ],
);

const DexGraphTaskSchema = z.strictObject({
  clientRef: z.string().regex(CLIENT_REF_PATTERN).max(64),
  name: z.string().min(1).max(51_200),
  description: z.string().min(1).max(51_200),
  priority: z.number().int().min(0).max(100),
  parentClientRef: z.string().regex(CLIENT_REF_PATTERN).max(64).nullable(),
  blockedBy: z.array(z.string().regex(CLIENT_REF_PATTERN).max(64)).max(250),
});
export const SupersPlanningDexGraphSchema = z.strictObject({
  schemaVersion: z.literal(1),
  tasks: z.array(DexGraphTaskSchema).min(1).max(250),
});

const ApprovalSchema = z.strictObject({
  digest: RevisionSchema,
});
const ApplyDecisionSchema = z.strictObject({ decision: z.literal("apply") });
const NoOpDecisionSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    decision: z.literal("reject"),
    reason: z.string().min(1).max(2_000),
  }),
  z.strictObject({
    decision: z.literal("park"),
    reason: z.string().min(1).max(2_000),
  }),
]);

const CommonApplyFields = {
  schemaVersion: z.literal(1),
  planningItemId: z.string().regex(PLANNING_ITEM_ID_PATTERN),
  destination: SupersPlanningDocumentWriteSchema,
  indexMutations: z.array(SupersPlanningIndexMutationSchema).max(20),
  ...ApplyDecisionSchema.shape,
};

const CaptureIdeaSchema = z.strictObject({
  ...CommonApplyFields,
  operation: z.literal("capture-idea"),
  source: z.null(),
  graph: z.null(),
  approval: z.null(),
});
const IdeaToRoadmapSchema = z.strictObject({
  ...CommonApplyFields,
  operation: z.literal("idea-to-roadmap"),
  source: SupersPlanningDocumentDeleteSchema,
  graph: z.null(),
  approval: ApprovalSchema,
});
const RoadmapToPlanningSchema = z.strictObject({
  ...CommonApplyFields,
  operation: z.literal("roadmap-to-planning"),
  source: SupersPlanningDocumentDeleteSchema,
  graph: z.null(),
  approval: ApprovalSchema,
});
const PlanningToDexSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planningItemId: z.string().regex(PLANNING_ITEM_ID_PATTERN),
  operation: z.literal("planning-to-dex"),
  decision: z.literal("apply"),
  source: SupersPlanningDocumentDeleteSchema,
  destination: z.null(),
  indexMutations: z.array(SupersPlanningIndexMutationSchema).max(20),
  graph: SupersPlanningDexGraphSchema,
  approval: ApprovalSchema,
});

export const SupersPlanningPromotionApplySchema = z.discriminatedUnion(
  "operation",
  [
    CaptureIdeaSchema,
    IdeaToRoadmapSchema,
    RoadmapToPlanningSchema,
    PlanningToDexSchema,
  ],
);

const NoOpPromotionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planningItemId: z.string().regex(PLANNING_ITEM_ID_PATTERN),
  operation: z.enum([
    "capture-idea",
    "idea-to-roadmap",
    "roadmap-to-planning",
    "planning-to-dex",
  ]),
  ...NoOpDecisionSchema.options[0].shape,
}).or(z.strictObject({
  schemaVersion: z.literal(1),
  planningItemId: z.string().regex(PLANNING_ITEM_ID_PATTERN),
  operation: z.enum([
    "capture-idea",
    "idea-to-roadmap",
    "roadmap-to-planning",
    "planning-to-dex",
  ]),
  ...NoOpDecisionSchema.options[1].shape,
}));

export const SupersPlanningPromotionArgumentsSchema = z.union([
  SupersPlanningPromotionApplySchema,
  NoOpPromotionSchema,
]);

const DexApplyResultSchema = z.strictObject({
  taskIdsByClientRef: z.record(z.string(), z.string().min(1).max(128)),
});
const JournalStateSchema = z.enum([
  "prepared",
  "destination-written",
  "destination-verified",
  "committed",
  "source-cleaned",
  "audited",
]);
export const SupersPlanningPromotionJournalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  transactionId: RevisionSchema,
  approvalDigest: RevisionSchema,
  planningItemId: z.string().regex(PLANNING_ITEM_ID_PATTERN),
  operation: z.enum([
    "capture-idea",
    "idea-to-roadmap",
    "roadmap-to-planning",
    "planning-to-dex",
  ]),
  state: JournalStateSchema,
  dexResult: DexApplyResultSchema.nullable(),
});
export const SupersPlanningPromotionResultSchema = z.strictObject({
  schemaVersion: z.literal(1),
  planningItemId: z.string().regex(PLANNING_ITEM_ID_PATTERN),
  operation: z.enum([
    "capture-idea",
    "idea-to-roadmap",
    "roadmap-to-planning",
    "planning-to-dex",
  ]),
  status: z.enum(["audited", "rejected", "parked"]),
  transactionId: RevisionSchema.nullable(),
  approvalDigest: RevisionSchema.nullable(),
  dexResult: DexApplyResultSchema.nullable(),
});

export type SupersPlanningPromotionArguments = z.infer<
  typeof SupersPlanningPromotionArgumentsSchema
>;
export type SupersPlanningPromotionApply = z.infer<
  typeof SupersPlanningPromotionApplySchema
>;
export type SupersPlanningDexGraph = z.infer<
  typeof SupersPlanningDexGraphSchema
>;
export type SupersPlanningDexApplyResult = z.infer<typeof DexApplyResultSchema>;
export type SupersPlanningPromotionJournal = z.infer<
  typeof SupersPlanningPromotionJournalSchema
>;
export type SupersPlanningPromotionResult = z.infer<
  typeof SupersPlanningPromotionResultSchema
>;

export interface SupersPlanningPromotionFileSystem {
  readTextFile(path: string): Promise<string | null>;
  writeTextFileAtomic(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

export interface SupersPlanningPromotionDexAdapter {
  applyGraph(
    repoDir: string,
    graph: SupersPlanningDexGraph,
    idempotencyKey: string,
  ): Promise<SupersPlanningDexApplyResult>;
  verifyGraph(
    repoDir: string,
    graph: SupersPlanningDexGraph,
    result: SupersPlanningDexApplyResult,
  ): Promise<void>;
}

export type SupersPlanningPromotionDependencies = {
  fileSystem?: SupersPlanningPromotionFileSystem;
  dexAdapter?: SupersPlanningPromotionDexAdapter;
  repositoryLock?: DexRepositoryLock;
};

export class SupersPlanningPromotionError extends Error {
  constructor(
    readonly errorCode:
      | "invalid-path"
      | "invalid-revision"
      | "stale-source"
      | "stale-destination"
      | "stale-index"
      | "stale-approval"
      | "dex-adapter-required"
      | "journal-conflict"
      | "conflicting-paths",
    message: string,
  ) {
    super(message);
    this.name = "SupersPlanningPromotionError";
  }
}

type CanonicalJson = null | boolean | number | string | CanonicalJson[] | {
  [key: string]: CanonicalJson;
};

function canonicalize(value: unknown): CanonicalJson {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot hash a non-finite number");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const result: { [key: string]: CanonicalJson } = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry !== undefined) result[key] = canonicalize(entry);
    }
    return result;
  }
  throw new Error("Cannot hash a non-JSON value");
}

/** SHA-256 over stable, recursively key-sorted JSON. */
export async function createSupersPlanningHash(
  value: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function approvalPayload(
  promotion: SupersPlanningPromotionApply,
): CanonicalJson {
  return canonicalize({
    schemaVersion: promotion.schemaVersion,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    source: promotion.source,
    destination: promotion.destination,
    indexMutations: promotion.indexMutations,
    graph: promotion.graph,
  });
}

/** Digest a complete approved boundary, including revisions, indexes, and Dex graph. */
export async function createSupersPlanningApprovalDigest(
  promotion: SupersPlanningPromotionApply,
): Promise<string> {
  return await createSupersPlanningHash(approvalPayload(promotion));
}

function safeRelativePath(path: string): string {
  if (
    path.startsWith("/") || path.includes("\\") || path.includes("\0") ||
    path.split("/").some((segment) =>
      segment === "" || segment === "." || segment === ".."
    )
  ) {
    throw new SupersPlanningPromotionError(
      "invalid-path",
      `Unsafe repository path: ${path}`,
    );
  }
  return path;
}

function repositoryPath(repoDir: string, relativePath: string): string {
  const safe = safeRelativePath(relativePath);
  const root = repoDir.replace(/\/+$/, "");
  return `${root}/${safe}`;
}

function assertDistinctPromotionPaths(
  promotion: SupersPlanningPromotionApply,
): void {
  const roles: Array<{ path: string; role: string }> = [];
  if (promotion.source !== null) {
    roles.push({
      path: safeRelativePath(promotion.source.path),
      role: "source",
    });
  }
  if (promotion.destination !== null) {
    roles.push({
      path: safeRelativePath(promotion.destination.path),
      role: "destination",
    });
  }
  for (const [index, mutation] of promotion.indexMutations.entries()) {
    roles.push({
      path: safeRelativePath(mutation.path),
      role: `index mutation ${index}`,
    });
  }
  const firstRoleByPath = new Map<string, string>();
  for (const entry of roles) {
    const firstRole = firstRoleByPath.get(entry.path);
    if (firstRole !== undefined) {
      throw new SupersPlanningPromotionError(
        "conflicting-paths",
        `Promotion path ${entry.path} is used by both ${firstRole} and ${entry.role}`,
      );
    }
    firstRoleByPath.set(entry.path, entry.role);
  }
}

async function textRevision(content: string): Promise<string> {
  return await createSupersPlanningHash(content);
}

async function assertDeclaredRevision(
  write: z.infer<typeof SupersPlanningDocumentWriteSchema>,
): Promise<void> {
  if (await textRevision(write.content) !== write.revision) {
    throw new SupersPlanningPromotionError(
      "invalid-revision",
      `Declared revision does not match content for ${write.path}`,
    );
  }
}

async function currentRevision(
  fileSystem: SupersPlanningPromotionFileSystem,
  path: string,
): Promise<string | null> {
  const content = await fileSystem.readTextFile(path);
  return content === null ? null : await textRevision(content);
}

function journalPath(repoDir: string, transactionId: string): string {
  return repositoryPath(repoDir, `${JOURNAL_DIRECTORY}/${transactionId}.json`);
}

async function writeJournal(
  fileSystem: SupersPlanningPromotionFileSystem,
  path: string,
  journal: SupersPlanningPromotionJournal,
): Promise<SupersPlanningPromotionJournal> {
  const parsed = SupersPlanningPromotionJournalSchema.parse(journal);
  await fileSystem.writeTextFileAtomic(path, `${JSON.stringify(parsed)}\n`);
  return parsed;
}

function stateAtLeast(
  state: SupersPlanningPromotionJournal["state"],
  expected: SupersPlanningPromotionJournal["state"],
): boolean {
  return JournalStateSchema.options.indexOf(state) >=
    JournalStateSchema.options.indexOf(expected);
}

async function validateInitialState(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
): Promise<void> {
  if (promotion.source !== null) {
    const path = repositoryPath(repoDir, promotion.source.path);
    if (
      await currentRevision(fileSystem, path) !==
        promotion.source.expectedRevision
    ) {
      throw new SupersPlanningPromotionError(
        "stale-source",
        `Source revision changed: ${promotion.source.path}`,
      );
    }
  }
  if (promotion.destination !== null) {
    await assertDeclaredRevision(promotion.destination);
    const path = repositoryPath(repoDir, promotion.destination.path);
    const revision = await currentRevision(fileSystem, path);
    if (
      revision !== promotion.destination.expectedRevision &&
      revision !== promotion.destination.revision
    ) {
      throw new SupersPlanningPromotionError(
        "stale-destination",
        `Destination revision changed: ${promotion.destination.path}`,
      );
    }
  }
  for (const mutation of promotion.indexMutations) {
    const path = repositoryPath(repoDir, mutation.path);
    const revision = await currentRevision(fileSystem, path);
    if (mutation.action === "write") {
      await assertDeclaredRevision(mutation);
      if (
        revision !== mutation.expectedRevision && revision !== mutation.revision
      ) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index revision changed: ${mutation.path}`,
        );
      }
    } else if (revision !== mutation.expectedRevision && revision !== null) {
      throw new SupersPlanningPromotionError(
        "stale-index",
        `Index revision changed: ${mutation.path}`,
      );
    }
  }
}

async function applyIndexMutations(
  promotion: SupersPlanningPromotionApply,
  fileSystem: SupersPlanningPromotionFileSystem,
  repoDir: string,
): Promise<void> {
  for (const mutation of promotion.indexMutations) {
    const path = repositoryPath(repoDir, mutation.path);
    const revision = await currentRevision(fileSystem, path);
    if (mutation.action === "write") {
      if (
        revision !== mutation.expectedRevision && revision !== mutation.revision
      ) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index changed before recovery: ${mutation.path}`,
        );
      }
      if (revision !== mutation.revision) {
        await fileSystem.writeTextFileAtomic(path, mutation.content);
      }
      if (await currentRevision(fileSystem, path) !== mutation.revision) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index verification failed: ${mutation.path}`,
        );
      }
    } else {
      if (revision !== mutation.expectedRevision && revision !== null) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index changed before recovery: ${mutation.path}`,
        );
      }
      if (revision !== null) await fileSystem.removeFile(path);
      if (await currentRevision(fileSystem, path) !== null) {
        throw new SupersPlanningPromotionError(
          "stale-index",
          `Index deletion verification failed: ${mutation.path}`,
        );
      }
    }
  }
}

async function createDenoFileSystem(
  repoDir: string,
): Promise<SupersPlanningPromotionFileSystem> {
  const requestedRoot = repoDir.replace(/\/+$/, "");
  const canonicalRoot = await Deno.realPath(repoDir);

  function canonicalRepositoryPath(path: string): string {
    const relative = path === requestedRoot
      ? ""
      : path.startsWith(`${requestedRoot}/`)
      ? path.slice(requestedRoot.length + 1)
      : null;
    if (
      relative === null ||
      relative.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      throw new SupersPlanningPromotionError(
        "invalid-path",
        "Path escapes repository root",
      );
    }
    const target = relative.length === 0
      ? canonicalRoot
      : `${canonicalRoot}/${relative}`;
    if (!(target === canonicalRoot || target.startsWith(`${canonicalRoot}/`))) {
      throw new SupersPlanningPromotionError(
        "invalid-path",
        "Path escapes repository root",
      );
    }
    return target;
  }

  async function verifyPath(
    path: string,
    allowMissingLeaf: boolean,
  ): Promise<string> {
    const target = canonicalRepositoryPath(path);
    const relative = target === canonicalRoot
      ? ""
      : target.slice(canonicalRoot.length + 1);
    const segments = relative.length === 0 ? [] : relative.split("/");
    const verifiedSegments = allowMissingLeaf
      ? segments.slice(0, -1)
      : segments;
    let cursor = canonicalRoot;
    for (const segment of verifiedSegments) {
      cursor = `${cursor}/${segment}`;
      try {
        const info = await Deno.lstat(cursor);
        if (info.isSymlink) {
          throw new SupersPlanningPromotionError(
            "invalid-path",
            "Symlinked promotion paths are forbidden",
          );
        }
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) break;
        throw error;
      }
    }
    return target;
  }
  return {
    readTextFile: async (path): Promise<string | null> => {
      const target = await verifyPath(path, true);
      try {
        const info = await Deno.lstat(target);
        if (!info.isFile || info.isSymlink) {
          throw new SupersPlanningPromotionError(
            "invalid-path",
            "Promotion source must be a regular file",
          );
        }
        return await Deno.readTextFile(target);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) return null;
        throw error;
      }
    },
    writeTextFileAtomic: async (path, content): Promise<void> => {
      const target = await verifyPath(path, true);
      const slash = target.lastIndexOf("/");
      const parent = target.slice(0, slash);
      await Deno.mkdir(parent, { recursive: true });
      await verifyPath(path, true);
      const temporary = `${target}.tmp-${crypto.randomUUID()}`;
      await Deno.writeTextFile(temporary, content, {
        createNew: true,
        mode: 0o600,
      });
      try {
        await Deno.rename(temporary, target);
      } catch (error) {
        await Deno.remove(temporary).catch(() => undefined);
        throw error;
      }
    },
    removeFile: async (path): Promise<void> => {
      const target = await verifyPath(path, false);
      try {
        await Deno.remove(target);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    },
  };
}

async function executeLockedPromotion(
  promotion: SupersPlanningPromotionApply,
  repoDir: string,
  fileSystem: SupersPlanningPromotionFileSystem,
  dexAdapter: SupersPlanningPromotionDexAdapter | undefined,
): Promise<SupersPlanningPromotionResult> {
  assertDistinctPromotionPaths(promotion);
  const approvalDigest = await createSupersPlanningApprovalDigest(promotion);
  if (
    promotion.operation !== "capture-idea" &&
    promotion.approval.digest !== approvalDigest
  ) {
    throw new SupersPlanningPromotionError(
      "stale-approval",
      "Approval does not bind the current promotion payload",
    );
  }
  if (promotion.operation === "planning-to-dex" && dexAdapter === undefined) {
    throw new SupersPlanningPromotionError(
      "dex-adapter-required",
      "planning-to-dex requires a Dex adapter",
    );
  }
  const transactionId = await createSupersPlanningHash({
    planningItemId: promotion.planningItemId,
    approvalDigest,
  });
  const path = journalPath(repoDir, transactionId);
  const journalContent = await fileSystem.readTextFile(path);
  let journal: SupersPlanningPromotionJournal;
  if (journalContent === null) {
    await validateInitialState(promotion, fileSystem, repoDir);
    journal = await writeJournal(fileSystem, path, {
      schemaVersion: 1,
      transactionId,
      approvalDigest,
      planningItemId: promotion.planningItemId,
      operation: promotion.operation,
      state: "prepared",
      dexResult: null,
    });
  } else {
    journal = SupersPlanningPromotionJournalSchema.parse(
      JSON.parse(journalContent),
    );
    if (
      journal.transactionId !== transactionId ||
      journal.approvalDigest !== approvalDigest ||
      journal.operation !== promotion.operation ||
      journal.planningItemId !== promotion.planningItemId
    ) {
      throw new SupersPlanningPromotionError(
        "journal-conflict",
        "Journal does not match promotion transaction",
      );
    }
  }

  if (!stateAtLeast(journal.state, "destination-written")) {
    if (promotion.destination !== null) {
      const destination = repositoryPath(repoDir, promotion.destination.path);
      const revision = await currentRevision(fileSystem, destination);
      if (
        revision !== promotion.destination.expectedRevision &&
        revision !== promotion.destination.revision
      ) {
        throw new SupersPlanningPromotionError(
          "stale-destination",
          `Destination changed before recovery: ${promotion.destination.path}`,
        );
      }
      if (revision !== promotion.destination.revision) {
        await fileSystem.writeTextFileAtomic(
          destination,
          promotion.destination.content,
        );
      }
    } else {
      const adapter = dexAdapter;
      if (adapter === undefined) {
        throw new SupersPlanningPromotionError(
          "dex-adapter-required",
          "planning-to-dex requires a Dex adapter",
        );
      }
      journal = {
        ...journal,
        dexResult: await adapter.applyGraph(
          repoDir,
          promotion.graph,
          transactionId,
        ),
      };
    }
    journal = await writeJournal(fileSystem, path, {
      ...journal,
      state: "destination-written",
    });
  }

  if (!stateAtLeast(journal.state, "destination-verified")) {
    if (promotion.destination !== null) {
      const destination = repositoryPath(repoDir, promotion.destination.path);
      if (
        await currentRevision(fileSystem, destination) !==
          promotion.destination.revision
      ) {
        throw new SupersPlanningPromotionError(
          "stale-destination",
          "Destination verification failed",
        );
      }
    } else {
      const adapter = dexAdapter;
      if (adapter === undefined || journal.dexResult === null) {
        throw new SupersPlanningPromotionError(
          "dex-adapter-required",
          "Dex destination cannot be verified",
        );
      }
      await adapter.verifyGraph(repoDir, promotion.graph, journal.dexResult);
    }
    journal = await writeJournal(fileSystem, path, {
      ...journal,
      state: "destination-verified",
    });
  }

  if (!stateAtLeast(journal.state, "committed")) {
    await applyIndexMutations(promotion, fileSystem, repoDir);
    journal = await writeJournal(fileSystem, path, {
      ...journal,
      state: "committed",
    });
  }
  if (!stateAtLeast(journal.state, "source-cleaned")) {
    if (promotion.source !== null) {
      const source = repositoryPath(repoDir, promotion.source.path);
      const revision = await currentRevision(fileSystem, source);
      if (revision !== null && revision !== promotion.source.expectedRevision) {
        throw new SupersPlanningPromotionError(
          "stale-source",
          "Source changed before cleanup",
        );
      }
      if (revision !== null) await fileSystem.removeFile(source);
    }
    journal = await writeJournal(fileSystem, path, {
      ...journal,
      state: "source-cleaned",
    });
  }
  if (!stateAtLeast(journal.state, "audited")) {
    journal = await writeJournal(fileSystem, path, {
      ...journal,
      state: "audited",
    });
  }
  return SupersPlanningPromotionResultSchema.parse({
    schemaVersion: 1,
    planningItemId: promotion.planningItemId,
    operation: promotion.operation,
    status: "audited",
    transactionId,
    approvalDigest,
    dexResult: journal.dexResult,
  });
}

/** Apply or recover one planning promotion while holding the shared Dex lock. */
export async function executeSupersPlanningPromotion(
  rawArguments: SupersPlanningPromotionArguments,
  repoDir: string,
  dependencies: SupersPlanningPromotionDependencies = {},
): Promise<SupersPlanningPromotionResult> {
  const arguments_ = SupersPlanningPromotionArgumentsSchema.parse(rawArguments);
  if (arguments_.decision !== "apply") {
    return SupersPlanningPromotionResultSchema.parse({
      schemaVersion: 1,
      planningItemId: arguments_.planningItemId,
      operation: arguments_.operation,
      status: arguments_.decision === "reject" ? "rejected" : "parked",
      transactionId: null,
      approvalDigest: null,
      dexResult: null,
    });
  }
  const promotion = SupersPlanningPromotionApplySchema.parse(arguments_);
  // macOS may expose the same directory through `/var` and `/private/var`.
  // Canonicalize once so containment checks, journal paths, and lock ownership
  // all use one repository identity.
  const executionRepoDir = dependencies.fileSystem === undefined
    ? await Deno.realPath(repoDir)
    : repoDir;
  const fileSystem = dependencies.fileSystem ??
    await createDenoFileSystem(executionRepoDir);
  const lock = dependencies.repositoryLock ?? DEFAULT_DEX_REPOSITORY_LOCK;
  return await lock.runExclusive(
    executionRepoDir,
    () =>
      executeLockedPromotion(
        promotion,
        executionRepoDir,
        fileSystem,
        dependencies.dexAdapter,
      ),
  );
}
