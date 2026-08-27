/**
 * Supers repo policy audits as versioned swamp resources.
 *
 * Wraps the repo's Node audit scripts (`scripts/audit-*.ts`) — the scripts are
 * the implementation (they must import engine modules through the repo's own
 * loader preamble, which only Node can do); this model is the integration
 * point that gives every run a schema'd, versioned, CEL-queryable resource.
 *
 * A method SUCCEEDS whenever the audit executed and produced a report — even
 * a red one: findings are the valuable data and belong in history. It throws
 * only when the script itself crashed or emitted unparseable output.
 *
 * @module
 */
import { z } from "npm:zod@4.4.3";

import {
  auditSupersPlanningApplication,
  buildSupersPlanningSourceSnapshot,
  deriveSupersDocumentationEffects,
  deriveSupersPlanningInventory,
  deriveSupersTrackerInventory,
  normalizeSupersDeliveryHandoffOutcome,
  normalizeSupersPlanApplication,
  prepareSupersDeliveryHandoff,
  readSupersDexTaskSnapshot,
  readSupersPlanningMarkdownSources,
  SupersDeliveryHandoffApprovalSchema,
  type SupersDeliveryHandoffOutcomeArguments,
  SupersDeliveryHandoffOutcomeArgumentsSchema,
  SupersDeliveryHandoffOutcomeSchema,
  type SupersDeliveryHandoffPreparationArguments,
  SupersDeliveryHandoffPreparationArgumentsSchema,
  type SupersDocumentationEffectsArguments,
  SupersDocumentationEffectsArgumentsSchema,
  SupersDocumentationEffectsSchema,
  type SupersPlanApplicationNormalizationArguments,
  SupersPlanApplicationNormalizationArgumentsSchema,
  SupersPlanApplicationSchema,
  SupersPlanBoundaryArgumentsSchema,
  SupersPlanBoundarySchema,
  type SupersPlanningApplicationAuditArguments,
  SupersPlanningApplicationAuditArgumentsSchema,
  SupersPlanningApplicationAuditSchema,
  type SupersPlanningInventoryArguments,
  SupersPlanningInventoryArgumentsSchema,
  SupersPlanningInventorySchema,
  supersPlanningSnapshotResourceName,
  SupersPlanningSourceSnapshotSchema,
  type SupersTrackerInventoryArguments,
  SupersTrackerInventoryArgumentsSchema,
  SupersTrackerInventorySchema,
  validateSupersPlanBoundary,
} from "./supers-planning-adapters.ts";
import {
  LayoutContractLaneReceiptSchema,
  runStandaloneLayoutContractVerification,
  runVerificationFanout,
  type VerificationFanoutArguments,
  VerificationFanoutReportSchema,
  type VerificationFanoutRequestArguments,
  VerificationFanoutRequestArgumentsSchema,
} from "./repo-verification-fanout.ts";
import {
  createLaterIntegrationFreshnessRecovery,
  type LaterIntegrationFreshnessRecoveryArguments,
  LaterIntegrationFreshnessRecoveryArgumentsSchema,
  LaterIntegrationFreshnessRecoverySchema,
} from "./later-integration-freshness-recovery.ts";
import { DexTaskSnapshotSchema } from "./dex-task-tracker-adapter.ts";
import {
  SentryEvidenceDeliveryAdmissionSchema,
  SentryEvidenceTaskMappingSchema,
} from "./sentry-evidence-dex-mapping.ts";
import {
  canonicalSentryJson,
  createSentrySha256,
} from "./sentry-issue-intake-adapter.ts";
import { SentryIssueRepairEvidenceSchema } from "./sentry-issue-repair-evidence.ts";
import {
  createSupersDeterministicContractHash,
  SupersFactoryIntegrationReceiptSchema,
  verifySupersFactoryIntegrationReceipt,
} from "./supers-deterministic-factory-contract.ts";
import {
  classifySupersTaskIntent,
  type SupersWorkDomainIntent,
} from "../../scripts/change-impact-classifier.ts";
import { compareCanonicalText } from "../../src/lib/utils/canonical-text-order.ts";
import { createRepositoryTreeFingerprint } from "../../src/lib/utils/repository-tree-fingerprint.server.ts";

const GlobalArgsSchema = z.object({
  deliveryHandoffAuthorizationKey: z.string().min(32).max(256)
    .meta({ sensitive: true }).optional(),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const TimingReportSchema = z.object({
  audit: z.string(),
  generatedAt: z.string(),
  totalSites: z.number(),
  coveredSites: z.number(),
  uncovered: z.array(
    z.object({ path: z.string(), kind: z.string(), covered: z.boolean() }),
  ),
  sites: z.array(
    z.object({ path: z.string(), kind: z.string(), covered: z.boolean() }),
  ),
  crash: z.string().nullable(),
  unknownPayloadBlindSpots: z.array(z.string()),
  clean: z.boolean(),
});

const TrackingReportSchema = z.object({
  audit: z.string(),
  generatedAt: z.string(),
  basePreset: z.string(),
  schemaContentProps: z.array(z.string()),
  trackedContentReads: z.array(z.string()),
  untracked: z.array(z.string()),
  documentSlotGaps: z.array(z.string()),
  crash: z.string().nullable(),
  clean: z.boolean(),
});

const ParityReportSchema = z.object({
  audit: z.string(),
  generatedAt: z.string(),
  method: z.string(),
  content: z.object({
    schemaProps: z.array(z.string()),
    documentSlots: z.array(z.string()),
    findings: z.array(
      z.object({
        prop: z.string(),
        editableViaDocumentSlot: z.boolean(),
        editableViaBinding: z.boolean(),
        bindingSites: z.array(z.string()),
        gap: z.boolean(),
      }),
    ),
    gaps: z.array(z.string()),
  }),
  effects: z.object({
    findings: z.array(
      z.object({
        slug: z.string(),
        declaresParamsSchema: z.boolean(),
        referencesEditor: z.boolean(),
        editorFileExists: z.boolean(),
        gap: z.boolean(),
      }),
    ),
    gaps: z.array(z.string()),
  }),
  clean: z.boolean(),
});

// Check ids mirror scripts/planning-state-checks.ts (Node-side source of
// truth; the Deno bundler cannot import it across the runtime seam).
const PlanningFindingSchema = z.object({
  check: z.enum([
    "adr-index-coverage",
    "adr-status-drift",
    "roadmap-adr-reference",
    "roadmap-ship-claim",
    "stale-brief",
    "ideas-inventory",
    "ideas-historical",
    "dex-shipped-claim",
    "dex-blocker-contradiction",
    "dex-graph-invalid",
    "dex-active-work",
    "dex-ready-runway",
  ]),
  message: z.string(),
  paths: z.array(z.string()),
});

const PlanningReportSchema = z.object({
  audit: z.string(),
  generatedAt: z.string(),
  adrDocs: z.number(),
  briefDocs: z.number(),
  ideaDocs: z.number(),
  presets: z.number(),
  dexOpenTasks: z.number(),
  runway: z.object({
    activeLanes: z.array(z.object({
      rootEpicId: z.string(),
      activeTaskId: z.string(),
      activeTaskName: z.string(),
    })),
    readyLanes: z.array(z.object({
      rootEpicId: z.string(),
      nextTaskId: z.string(),
      nextTaskName: z.string(),
      topPriority: z.number(),
      readyLeafCount: z.number(),
    })),
    activeTaskId: z.string().nullable(),
    activeTaskName: z.string().nullable(),
    activeEpicId: z.string().nullable(),
    nextTaskId: z.string().nullable(),
    nextTaskName: z.string().nullable(),
    topPriority: z.number().nullable(),
    readyLeafCount: z.number(),
  }),
  findings: z.array(PlanningFindingSchema),
  advisories: z.array(PlanningFindingSchema),
  crash: z.string().nullable(),
  clean: z.boolean(),
});

const GitHeadSchema = z.string().regex(/^[0-9a-f]{40,64}$/);
const TreeFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

const ChangeBaselineSchema = z.object({
  workItem: z.string().min(1),
  baselineHead: GitHeadSchema,
  capturedAt: z.string(),
  source: z.literal("git-head"),
  ref: z.literal("HEAD"),
  resourceName: z.string().min(1),
});

const WorkDomainIdSchema = z.enum([
  "preset",
  "pack",
  "authoring-app",
  "rendering",
  "export",
  "performance",
  "repository-infrastructure",
  "swamp-control-plane",
  "documentation-planning",
  "unknown",
]);
const DeclaredWorkDomainIdSchema = WorkDomainIdSchema.exclude(["unknown"]);
const WorkDomainStatusSchema = z.enum(["known", "mixed", "unknown"]);
const SupersWorkDomainIntentSchema = z.strictObject({
  status: WorkDomainStatusSchema,
  declaredDomains: z.array(DeclaredWorkDomainIdSchema).max(9),
  benchmarkScripts: z.array(z.string().regex(/^benchmark:/)).max(20),
  exportDecodeScripts: z.array(z.string().regex(/^verify:export-decode:/))
    .max(20),
  selectedSkills: z.array(z.string().min(1)).min(1).max(20),
  constraintPaths: z.array(z.string().min(1)).min(1).max(20),
  reasons: z.array(z.string().min(1)).min(1),
});
const SupersWorkDomainRouteContentSchema = z.strictObject({
  schemaVersion: z.literal(2),
  workItem: z.string().min(1).max(128),
  sourceModelName: z.literal("supers-dex-task-tracker"),
  sourceResourceName: z.string().min(1),
  sourceWorkflowRunId: z.string().min(1),
  taskSnapshotDigest: TreeFingerprintSchema,
  taskUpdatedAt: z.string().datetime(),
  routingAuthority: z.literal("human-task-intent-additive"),
  intent: SupersWorkDomainIntentSchema,
});
const LegacySentryWorkDomainRouteMigrationSchema = z.strictObject({
  evidenceName: z.string().min(1).max(220),
  evidenceFingerprint: TreeFingerprintSchema,
  mappingName: z.string().min(1).max(220),
  mappingFingerprint: TreeFingerprintSchema,
  admissionName: z.string().min(1).max(220),
  admissionFingerprint: TreeFingerprintSchema,
  integrationReceiptId: TreeFingerprintSchema,
  legacyVerificationWorkflowRunId: z.string().min(1),
  legacyVerificationDisposition: z.literal("automatic-rework"),
  factoryDefinitionVersion: z.number().int().positive(),
  factoryStage: z.literal("verification"),
  factoryStageCycle: z.number().int().positive(),
  migratedAt: z.string().datetime(),
});
const LegacySentryWorkDomainRouteContentSchema = z.strictObject({
  schemaVersion: z.literal(3),
  workItem: z.string().min(1).max(128),
  sourceModelName: z.literal("supers-dex-task-tracker"),
  sourceResourceName: z.string().min(1),
  sourceWorkflowRunId: z.string().min(1),
  taskSnapshotDigest: TreeFingerprintSchema,
  taskUpdatedAt: z.string().datetime(),
  routingAuthority: z.literal("legacy-sentry-admission-migration"),
  intent: SupersWorkDomainIntentSchema,
  migration: LegacySentryWorkDomainRouteMigrationSchema,
});
const SupersWorkDomainRouteSchema = z.union([
  SupersWorkDomainRouteContentSchema.extend({
    routeDigest: TreeFingerprintSchema,
  }),
  LegacySentryWorkDomainRouteContentSchema.extend({
    routeDigest: TreeFingerprintSchema,
  }),
]);
const ClassifyWorkDomainIntentArgumentsSchema = z.strictObject({
  workItem: z.string().min(1).max(128),
  sourceModelName: z.literal("supers-dex-task-tracker"),
  sourceResourceName: z.string().min(1),
  sourceWorkflowRunId: z.string().min(1),
  task: DexTaskSnapshotSchema,
});
const LegacySentryFactoryVerificationStateSchema = z.strictObject({
  started: z.literal(true),
  workItem: z.string().min(1).max(128),
  definitionVersion: z.number().int().positive(),
  status: z.literal("active"),
  stage: z.strictObject({
    id: z.literal("verification"),
    cycle: z.number().int().positive(),
    terminal: z.literal(false),
  }),
  dispatch: z.strictObject({
    cycle: z.number().int().positive(),
    attempts: z.number().int().positive(),
    limit: z.number().int().positive(),
    required: z.literal(true),
    executed: z.literal(true),
  }),
});
const LegacySentryVerificationRouteSchema = z.strictObject({
  schemaVersion: z.literal(2),
  workItem: z.string().min(1).max(128),
  integratedRevision: GitHeadSchema,
  workflowRunId: z.string().min(1),
  disposition: z.literal("automatic-rework"),
  objectiveFailureCodes: z.array(z.string().min(1)).min(1),
  stageCycle: z.number().int().positive(),
});
const MigrateLegacySentryWorkDomainIntentArgumentsSchema = z.strictObject({
  workItem: z.string().min(1).max(128),
  sourceModelName: z.literal("supers-dex-task-tracker"),
  sourceResourceName: z.string().min(1),
  sourceWorkflowRunId: z.string().min(1),
  task: DexTaskSnapshotSchema,
  evidenceName: z.string().min(1).max(220),
  evidence: SentryIssueRepairEvidenceSchema,
  mappingName: z.string().min(1).max(220),
  mapping: SentryEvidenceTaskMappingSchema,
  admissionName: z.string().min(1).max(220),
  admission: SentryEvidenceDeliveryAdmissionSchema,
  factoryState: LegacySentryFactoryVerificationStateSchema,
  legacyVerification: LegacySentryVerificationRouteSchema,
  integrationReceipt: SupersFactoryIntegrationReceiptSchema,
});

const ChangeImpactReportSchema = z.strictObject({
  audit: z.literal("change-impact"),
  generatedAt: z.string(),
  source: z.literal("git-baseline-and-working-tree"),
  workItem: z.string().min(1),
  baselineHead: GitHeadSchema,
  treeFingerprint: TreeFingerprintSchema,
  paths: z.array(z.string()).min(1).max(200),
  classification: WorkDomainStatusSchema,
  domains: z.array(z.strictObject({
    id: WorkDomainIdSchema,
    reasons: z.array(z.string()).min(1),
  })).min(1).max(10),
  unknownPaths: z.array(z.string()).max(200),
  intent: SupersWorkDomainIntentSchema,
  intentRouteDigest: TreeFingerprintSchema,
  surfaces: z
    .array(
      z.strictObject({
        id: z.enum([
          "authoring-app",
          "rendered-composition",
          "export-pipeline",
          "control-plane",
        ]),
        reasons: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  requiredHumanReviews: z.array(
    z.strictObject({
      kind: z.enum([
        "authoring-app-visual",
        "rendered-composition-aesthetic",
      ]),
      reasons: z.array(z.string()).min(1),
    }),
  ),
  lanes: z
    .array(
      z.strictObject({
        id: z.enum([
          "policy-sweep",
          "check",
          "unit",
          "browser",
          "preset-static",
          "layout-contract",
          "render-matrix",
          "pack-matrix",
          "export-decode",
          "performance",
          "repository-infrastructure",
          "swamp-control-plane",
          "timing-coverage",
          "authoring-dependency-tracking",
          "inspector-editor-parity",
          "planning-discoverability",
          "unknown",
        ]),
        reasons: z.array(z.string()).min(1),
      }),
    )
    .min(1),
});

// Deep semantic audits are agent-run (claims vs code), unlike the four
// mechanical script audits — the report arrives as authored JSON, not
// script stdout. Findings record what drifted AND what correction landed.
const DeepAuditFindingSchema = z.object({
  domain: z.enum(["adr", "roadmap", "dex", "ideas", "control-plane"]),
  subject: z.string(),
  status: z.enum(["drift-corrected", "advisory", "verified-exception"]),
  detail: z.string(),
  correction: z.string().nullable(),
  paths: z.array(z.string()),
});

const DeepAuditReportSchema = z.object({
  audit: z.literal("deep-semantic-audit"),
  date: z.string(),
  generatedAt: z.string(),
  scope: z.object({
    adrDocs: z.number(),
    roadmapClaims: z.number(),
    dexOpenTasks: z.number(),
    ideaDocs: z.number(),
  }),
  verifiedClean: z.object({
    adrs: z.number(),
    roadmapClaims: z.number(),
    dexTasks: z.number(),
    ideas: z.number(),
  }),
  findings: z.array(DeepAuditFindingSchema),
  policySweep: z.string().nullable(),
  clean: z.boolean(),
});

type MethodContext = {
  repoDir: string;
  globalArgs: GlobalArgs;
  logger: { info: (msg: string, props?: Record<string, unknown>) => void };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

type CurrentTreeState = {
  head: string;
  status: Uint8Array;
  treeFingerprint: string;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? textEncoder.encode(value) : value;
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", digestInput),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function changeResourceName(
  prefix: string,
  workItem: string,
): Promise<string> {
  return `${prefix}-${(await sha256Hex(workItem)).slice(0, 32)}`;
}

function currentChangeBaselineName(workItem: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workItem)) {
    throw new TypeError(
      "Change baseline work item cannot form a safe resource name",
    );
  }
  return `change-baseline-current-${workItem}`;
}

async function runGit(
  context: MethodContext,
  args: string[],
): Promise<Uint8Array> {
  const command = new Deno.Command("git", {
    args,
    cwd: context.repoDir,
    stdout: "piped",
    stderr: "piped",
  });
  const result = await command.output();
  if (result.code !== 0) {
    const stderr = textDecoder.decode(result.stderr);
    throw new Error(
      `git ${args[0]} exited ${result.code}: ${stderr.slice(0, 800)}`,
    );
  }
  return result.stdout;
}

async function readGitHead(context: MethodContext): Promise<string> {
  return GitHeadSchema.parse(
    textDecoder.decode(await runGit(context, ["rev-parse", "--verify", "HEAD"]))
      .trim(),
  );
}

async function isGitAncestor(
  context: MethodContext,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const result = await new Deno.Command("git", {
    args: ["merge-base", "--is-ancestor", ancestor, descendant],
    cwd: context.repoDir,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  throw new Error(
    `git merge-base --is-ancestor exited ${result.code}: ${textDecoder.decode(result.stderr).slice(0, 800)}`,
  );
}

function parseNulPaths(output: Uint8Array): string[] {
  const decoded = textDecoder.decode(output);
  if (decoded.length === 0) return [];
  const records = decoded.split("\0");
  if (records.pop() !== "") {
    throw new TypeError("Git path output must be NUL-terminated");
  }
  const unsafePath = records.find(
    (path) => !path || path.startsWith("/") || path.split("/").includes(".."),
  );
  if (unsafePath !== undefined) {
    throw new TypeError(`Git returned an unsafe project path: ${unsafePath}`);
  }
  return records;
}

async function readCurrentTreeState(
  context: MethodContext,
): Promise<CurrentTreeState> {
  const head = await readGitHead(context);
  const [unstagedDiff, stagedDiff, status, untrackedOutput] = await Promise.all(
    [
      runGit(context, ["diff", "--binary", "--no-ext-diff", "--no-textconv"]),
      runGit(context, [
        "diff",
        "--cached",
        "--binary",
        "--no-ext-diff",
        "--no-textconv",
      ]),
      runGit(context, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ]),
      runGit(context, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ],
  );
  const untracked = [] as Array<{ path: string; content: Uint8Array }>;
  for (const path of parseNulPaths(untrackedOutput).sort(compareCanonicalText)) {
    untracked.push({
      path,
      content: await Deno.readFile(`${context.repoDir}/${path}`),
    });
  }
  return {
    head,
    status,
    treeFingerprint: await createRepositoryTreeFingerprint({
      head,
      unstagedDiff,
      stagedDiff,
      status,
      untracked,
    }),
  };
}

async function readScopedTreeState(
  context: MethodContext,
  expectedPaths: string[],
): Promise<CurrentTreeState> {
  const paths = [...new Set(expectedPaths)].sort(compareCanonicalText);
  if (
    paths.length === 0 ||
    paths.some((path) =>
      !path || path.startsWith("/") || path.split("/").includes("..")
    )
  ) {
    throw new TypeError(
      "Scoped change-state paths must be safe project-relative paths",
    );
  }
  const pathspec = ["--", ...paths];
  const [committedTree, unstagedDiff, stagedDiff, status, untrackedOutput] =
    await Promise.all([
      runGit(context, ["ls-tree", "-r", "-z", "HEAD", ...pathspec]),
      runGit(context, [
        "diff",
        "--binary",
        "--no-ext-diff",
        "--no-textconv",
        ...pathspec,
      ]),
      runGit(context, [
        "diff",
        "--cached",
        "--binary",
        "--no-ext-diff",
        "--no-textconv",
        ...pathspec,
      ]),
      runGit(context, [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
        ...pathspec,
      ]),
      runGit(context, [
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        ...pathspec,
      ]),
    ]);
  const untracked = [] as Array<{ path: string; content: Uint8Array }>;
  for (const path of parseNulPaths(untrackedOutput).sort(compareCanonicalText)) {
    untracked.push({
      path,
      content: await Deno.readFile(`${context.repoDir}/${path}`),
    });
  }
  const scopedHead = `scoped-paths-v1\0${textDecoder.decode(committedTree)}`;
  return {
    head: scopedHead,
    status,
    treeFingerprint: await createRepositoryTreeFingerprint({
      head: scopedHead,
      unstagedDiff,
      stagedDiff,
      status,
      untracked,
    }),
  };
}

async function readChangeBaseline(
  context: MethodContext,
  workItem: string,
): Promise<z.infer<typeof ChangeBaselineSchema>> {
  const resourceName = await changeResourceName("change-baseline", workItem);
  const resource = await context.readResource(resourceName);
  if (!resource) {
    throw new Error(`No change baseline recorded for work item ${workItem}`);
  }
  const baseline = ChangeBaselineSchema.parse(resource);
  if (baseline.workItem !== workItem) {
    throw new Error(`Change baseline key collision for work item ${workItem}`);
  }
  return baseline;
}

async function verifySentryContentAddress(
  value: { fingerprint: string },
  label: string,
): Promise<void> {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "fingerprint"),
  );
  const expected = await createSentrySha256(canonicalSentryJson(content));
  if (value.fingerprint !== expected) {
    throw new Error(`${label} fingerprint verification failed`);
  }
}

async function readWorkDomainRoute(
  context: MethodContext,
  workItem: string,
): Promise<z.infer<typeof SupersWorkDomainRouteSchema>> {
  const resourceName = await changeResourceName("work-domain-route", workItem);
  const resource = await context.readResource(resourceName);
  if (!resource) {
    throw new Error(
      `No pre-implementation work-domain route recorded for ${workItem}`,
    );
  }
  const route = SupersWorkDomainRouteSchema.parse(resource);
  if (route.workItem !== workItem) {
    throw new Error(
      `Work-domain route key collision for work item ${workItem}`,
    );
  }
  const { routeDigest, ...content } = route;
  if ((await createSupersDeterministicContractHash(content)) !== routeDigest) {
    throw new Error(
      `Work-domain route digest mismatch for work item ${workItem}`,
    );
  }
  return route;
}

async function readChangeImpact(
  context: MethodContext,
  workItem: string,
  expectedFingerprint: string,
): Promise<{ name: string; report: z.infer<typeof ChangeImpactReportSchema> }> {
  const name = await changeResourceName("change-impact", workItem);
  const resource = await context.readResource(name);
  if (!resource) {
    throw new Error(`No change impact recorded for work item ${workItem}`);
  }
  const report = ChangeImpactReportSchema.parse(resource);
  if (
    report.workItem !== workItem ||
    report.treeFingerprint !== expectedFingerprint
  ) {
    throw new Error(
      "Verification fan-out change impact is stale or belongs to another work item",
    );
  }
  return { name, report };
}

async function executeAuditCommand(
  command: Deno.Command,
  stdin: Uint8Array | undefined,
): Promise<Deno.CommandOutput> {
  if (!stdin) return command.output();
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(stdin);
  await writer.close();
  return child.output();
}

const EXPECTED_AUDIT_EXIT_CODES = new Set([0, 1]);

async function runAuditScript(
  context: MethodContext,
  scriptPath: string,
  scriptArgs: string[] = [],
  stdin?: Uint8Array,
): Promise<{ report: Record<string, unknown>; clean: boolean }> {
  const command = new Deno.Command("node", {
    args: ["--experimental-strip-types", scriptPath, ...scriptArgs],
    cwd: context.repoDir,
    stdin: stdin ? "piped" : "null",
    stdout: "piped",
    stderr: "piped",
  });
  const result = await executeAuditCommand(command, stdin);
  const { code, stdout, stderr } = result;
  const stdoutText = new TextDecoder().decode(stdout);
  const stderrText = new TextDecoder().decode(stderr);
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(stdoutText) as Record<string, unknown>;
  } catch {
    throw new Error(
      `${scriptPath} produced no JSON report (exit ${code}): ${
        stderrText.slice(0, 800)
      }`,
    );
  }
  if (!EXPECTED_AUDIT_EXIT_CODES.has(code)) {
    throw new Error(
      `${scriptPath} exited ${code}: ${stderrText.slice(0, 800)}`,
    );
  }
  context.logger.info("{script} finished: {summary}", {
    script: scriptPath,
    summary: stderrText.trim(),
  });
  return { report, clean: code === 0 };
}

/** Model definition for the Supers repo policy audits. */
export const model = {
  type: "@supers/repo-audit",
  version: "2026.08.27.4",
  globalArguments: GlobalArgsSchema,
  resources: {
    timing: {
      description:
        "Fraction-window rescale coverage — every fraction-timed schema field must be rescaled by rescaleCompositionTimings",
      schema: TimingReportSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    tracking: {
      description:
        "Authoring-dependency tracker coverage — every surface.content schema field must be read by trackCompositionAuthoringDependencies",
      schema: TrackingReportSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    parity: {
      description:
        "GUI↔agent parity — every schema content field editable in the GUI, every param-bearing effect ships an Editor",
      schema: ParityReportSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    planning: {
      description:
        "Planning-state drift — roadmap/ADR status claims, stale shipped Briefs, ideas-tier hygiene, and dex graph contradictions with actionable paths",
      schema: PlanningReportSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "planning-source-snapshot": {
      description:
        "Content-addressed Supers planning tiers and official Dex graph read once for downstream adapters",
      schema: SupersPlanningSourceSnapshotSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "planning-inventory": {
      description:
        "Bounded Planning Factory context references and unresolved judgment questions",
      schema: SupersPlanningInventorySchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "tracker-inventory": {
      description:
        "Related and possible duplicate Dex tasks derived from the stored planning source snapshot",
      schema: SupersTrackerInventorySchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "documentation-effects": {
      description:
        "Validated create, update, retire, and no-change proposal for Supers planning documents",
      schema: SupersDocumentationEffectsSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "plan-boundary": {
      description:
        "Validated compiler-emitted mapping from reviewed plan to Plan Applier input",
      schema: SupersPlanBoundarySchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "plan-application-normalized": {
      description:
        "Normalized successful or recoverable failed Dex Plan Applier outcome for the Planning Factory",
      schema: SupersPlanApplicationSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "planning-application-audit": {
      description:
        "Fresh official-Dex verification of approved-plan mappings and documentation proposal integrity",
      schema: SupersPlanningApplicationAuditSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "delivery-handoff-approval": {
      description:
        "Compact audited Planning provenance and explicit epic boundary for atomic Delivery intake",
      schema: SupersDeliveryHandoffApprovalSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "delivery-handoff-outcome": {
      description:
        "Converged Dex ownership and Delivery Factory state with clean terminal alternatives",
      schema: SupersDeliveryHandoffOutcomeSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "deep-audit": {
      description:
        "Deep semantic control-plane audit — agent-verified ADR/roadmap/dex/ideas claims against source code, with corrections applied at the drift source",
      schema: DeepAuditReportSchema,
      lifetime: "infinite",
      garbageCollection: 20,
    },
    "work-domain-route": {
      description:
        "Typed additive guidance from the canonical Dex task, including explicit fail-closed provenance for admitted legacy Sentry verification migrations",
      schema: SupersWorkDomainRouteSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "change-baseline": {
      description:
        "Per-work-item trusted Git HEAD captured before Factory implementation begins",
      schema: ChangeBaselineSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "change-impact": {
      description:
        "Deterministic changed-path routing to the minimum conservative Supers verification lanes",
      schema: ChangeImpactReportSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "change-freshness-recovery": {
      description:
        "Content-addressed proof that one later terminal Factory integration, not uncommitted or subsequent tampering, explains scoped path drift",
      schema: LaterIntegrationFreshnessRecoverySchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "verification-fanout": {
      description:
        "Parallel deterministic verification lane outcomes with bounded command evidence",
      schema: VerificationFanoutReportSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
    "layout-contract-receipt": {
      description:
        "Typed authoritative full-corpus Layout Contract verification receipt",
      schema: LayoutContractLaneReceiptSchema,
      lifetime: "infinite",
      garbageCollection: 50,
    },
  },
  methods: {
    "audit-timing": {
      description:
        "Run scripts/audit-timing-coverage.ts and store the coverage report",
      arguments: z.object({}),
      execute: async (_args: GlobalArgs, context: MethodContext) => {
        const { report, clean } = await runAuditScript(
          context,
          "scripts/audit-timing-coverage.ts",
        );
        const handle = await context.writeResource("timing", "timing-latest", {
          ...report,
          clean,
        });
        return { dataHandles: [handle] };
      },
    },
    "audit-tracking": {
      description:
        "Run scripts/audit-tracking-coverage.ts and store the coverage report",
      arguments: z.object({}),
      execute: async (_args: GlobalArgs, context: MethodContext) => {
        const { report, clean } = await runAuditScript(
          context,
          "scripts/audit-tracking-coverage.ts",
        );
        const handle = await context.writeResource(
          "tracking",
          "tracking-latest",
          {
            ...report,
            clean,
          },
        );
        return { dataHandles: [handle] };
      },
    },
    "audit-parity": {
      description:
        "Run scripts/audit-inspector-parity.ts and store the parity report",
      arguments: z.object({}),
      execute: async (_args: GlobalArgs, context: MethodContext) => {
        const { report, clean } = await runAuditScript(
          context,
          "scripts/audit-inspector-parity.ts",
        );
        const handle = await context.writeResource("parity", "parity-latest", {
          ...report,
          clean,
        });
        return { dataHandles: [handle] };
      },
    },
    "audit-planning": {
      description:
        "Run scripts/audit-planning-state.ts and store the planning-state drift report",
      arguments: z.object({}),
      execute: async (_args: GlobalArgs, context: MethodContext) => {
        const { report, clean } = await runAuditScript(
          context,
          "scripts/audit-planning-state.ts",
        );
        const handle = await context.writeResource(
          "planning",
          "planning-latest",
          {
            ...report,
            clean,
          },
        );
        return { dataHandles: [handle] };
      },
    },
    "collect-planning-inventory": {
      description:
        "Read Supers planning tiers and the official Dex graph once, then store bounded Factory inventory",
      arguments: SupersPlanningInventoryArgumentsSchema,
      execute: async (
        args: SupersPlanningInventoryArguments,
        context: MethodContext,
      ) => {
        const markdown = await readSupersPlanningMarkdownSources(
          context.repoDir,
        );
        const dexTasks = await readSupersDexTaskSnapshot(context.repoDir);
        const sourceSnapshot = await buildSupersPlanningSourceSnapshot(
          args,
          markdown,
          dexTasks,
        );
        const inventory = await deriveSupersPlanningInventory(
          args,
          sourceSnapshot,
        );
        const snapshotHandle = await context.writeResource(
          "planning-source-snapshot",
          supersPlanningSnapshotResourceName(
            args.workItem,
            sourceSnapshot.fingerprint,
          ),
          { ...sourceSnapshot },
        );
        const inventoryHandle = await context.writeResource(
          "planning-inventory",
          `supers-planning-inventory-${args.workItem}-${inventory.fingerprint}`,
          { ...inventory },
        );
        return { dataHandles: [snapshotHandle, inventoryHandle] };
      },
    },
    "derive-tracker-inventory": {
      description:
        "Derive related and possible duplicate Dex tasks from the stored source snapshot without re-fetching Dex",
      arguments: SupersTrackerInventoryArgumentsSchema,
      execute: async (
        args: SupersTrackerInventoryArguments,
        context: MethodContext,
      ) => {
        const inventory = await deriveSupersTrackerInventory(args);
        const handle = await context.writeResource(
          "tracker-inventory",
          `supers-tracker-inventory-${args.workItem}-${inventory.fingerprint}`,
          { ...inventory },
        );
        return { dataHandles: [handle] };
      },
    },
    "propose-documentation-effects": {
      description:
        "Validate Supers planning-document directives and store a proposal without mutating documents",
      arguments: SupersDocumentationEffectsArgumentsSchema,
      execute: async (
        args: SupersDocumentationEffectsArguments,
        context: MethodContext,
      ) => {
        const proposal = await deriveSupersDocumentationEffects(args);
        const handle = await context.writeResource(
          "documentation-effects",
          `supers-documentation-effects-${args.workItem}-${proposal.fingerprint}`,
          { ...proposal },
        );
        return { dataHandles: [handle] };
      },
    },
    "validate-plan-boundary": {
      description:
        "Validate the compiler-emitted flattened-to-Plan-Applier mapping before mutation",
      arguments: SupersPlanBoundaryArgumentsSchema,
      execute: async (
        args: z.infer<typeof SupersPlanBoundaryArgumentsSchema>,
        context: MethodContext,
      ) => {
        const boundary = await validateSupersPlanBoundary(args);
        const handle = await context.writeResource(
          "plan-boundary",
          `supers-plan-boundary-${boundary.reviewedPlanHash}`,
          { ...boundary },
        );
        return { dataHandles: [handle] };
      },
    },
    "normalize-plan-application": {
      description:
        "Normalize Plan Applier checkpoint, receipt, and result resources into the Planning Factory artifact contract",
      arguments: SupersPlanApplicationNormalizationArgumentsSchema,
      execute: async (
        args: SupersPlanApplicationNormalizationArguments,
        context: MethodContext,
      ) => {
        const application = normalizeSupersPlanApplication(args);
        const handle = await context.writeResource(
          "plan-application-normalized",
          `supers-plan-application-${args.workItem}-${application.idempotencyKey}-${application.attempt}`,
          { ...application },
        );
        return { dataHandles: [handle] };
      },
    },
    "audit-planning-application": {
      description:
        "Verify normalized approved-plan mappings against one fresh official Dex snapshot",
      arguments: SupersPlanningApplicationAuditArgumentsSchema,
      execute: async (
        args: SupersPlanningApplicationAuditArguments,
        context: MethodContext,
      ) => {
        const dexTasks = await readSupersDexTaskSnapshot(context.repoDir);
        const audit = await auditSupersPlanningApplication(args, dexTasks);
        const handle = await context.writeResource(
          "planning-application-audit",
          `supers-planning-application-audit-${args.workItem}-${await sha256Hex(
            JSON.stringify(audit),
          )}`,
          { ...audit },
        );
        return { dataHandles: [handle] };
      },
    },
    "prepare-delivery-handoff": {
      description:
        "Validate the exact audited Planning chain and emit an approval-bound Delivery intake contract",
      arguments: SupersDeliveryHandoffPreparationArgumentsSchema,
      execute: async (
        args: SupersDeliveryHandoffPreparationArguments,
        context: MethodContext,
      ) => {
        const authorizationKey =
          context.globalArgs.deliveryHandoffAuthorizationKey;
        if (authorizationKey === undefined) {
          throw new Error("Delivery handoff authorization is not configured");
        }
        const approval = await prepareSupersDeliveryHandoff(
          args,
          authorizationKey,
        );
        const handle = await context.writeResource(
          "delivery-handoff-approval",
          `supers-delivery-handoff-${args.planningWorkItem}-${approval.approvalFingerprint}`,
          { ...approval },
        );
        return { dataHandles: [handle] };
      },
    },
    "normalize-delivery-handoff": {
      description:
        "Converge one atomic Dex claim with the selected repository Delivery Factory state",
      arguments: SupersDeliveryHandoffOutcomeArgumentsSchema,
      execute: async (
        args: SupersDeliveryHandoffOutcomeArguments,
        context: MethodContext,
      ) => {
        const outcome = await normalizeSupersDeliveryHandoffOutcome(args);
        const handle = await context.writeResource(
          "delivery-handoff-outcome",
          `supers-delivery-handoff-outcome-${args.approval.planningWorkItem}-${outcome.fingerprint}`,
          { ...outcome },
        );
        return { dataHandles: [handle] };
      },
    },
    "record-deep-audit": {
      description:
        "Validate and store an agent-authored deep semantic audit report (JSON file matching the deep-audit schema)",
      arguments: z.object({
        reportPath: z.string().describe(
          "Path to the audit report JSON, relative to the repo root",
        ),
      }),
      execute: async (args: { reportPath: string }, context: MethodContext) => {
        const absolutePath = `${context.repoDir}/${args.reportPath}`;
        let parsed: unknown;
        try {
          parsed = JSON.parse(await Deno.readTextFile(absolutePath));
        } catch (error) {
          throw new Error(`Could not read audit report at ${absolutePath}`, {
            cause: error,
          });
        }
        const report = DeepAuditReportSchema.parse(parsed);
        const handle = await context.writeResource(
          "deep-audit",
          "deep-audit-latest",
          report,
        );
        context.logger.info(
          "Stored deep audit {date}: {findings} finding(s), clean={clean}",
          {
            date: report.date,
            findings: report.findings.length,
            clean: report.clean,
          },
        );
        return { dataHandles: [handle] };
      },
    },
    "classify-work-domain-intent": {
      description:
        "Derive typed additive implementation guidance from the canonical human-authored Dex task snapshot",
      arguments: ClassifyWorkDomainIntentArgumentsSchema,
      execute: async (
        args: z.infer<typeof ClassifyWorkDomainIntentArgumentsSchema>,
        context: MethodContext,
      ) => {
        if (
          args.task.id !== args.workItem ||
          args.task.ownerToken !== "supers-delivery"
        ) {
          throw new TypeError(
            "Work-domain routing requires the exact Supers Delivery task snapshot",
          );
        }
        const intent: SupersWorkDomainIntent = SupersWorkDomainIntentSchema
          .parse(
            classifySupersTaskIntent({
              name: args.task.name,
              description: args.task.description,
              metadata: args.task.metadata,
            }),
          );
        const content = SupersWorkDomainRouteContentSchema.parse({
          schemaVersion: 2,
          workItem: args.workItem,
          sourceModelName: args.sourceModelName,
          sourceResourceName: args.sourceResourceName,
          sourceWorkflowRunId: args.sourceWorkflowRunId,
          taskSnapshotDigest: await createSupersDeterministicContractHash(
            args.task,
          ),
          taskUpdatedAt: args.task.updatedAt,
          routingAuthority: "human-task-intent-additive",
          intent,
        });
        const route = SupersWorkDomainRouteSchema.parse({
          ...content,
          routeDigest: await createSupersDeterministicContractHash(content),
        });
        const resourceName = await changeResourceName(
          "work-domain-route",
          args.workItem,
        );
        const handle = await context.writeResource(
          "work-domain-route",
          resourceName,
          route,
        );
        return { dataHandles: [handle] };
      },
    },
    "migrate-legacy-sentry-work-domain-intent": {
      description:
        "Recover missing route data only for an exact evidence-admitted legacy Sentry run already at verification",
      arguments: MigrateLegacySentryWorkDomainIntentArgumentsSchema,
      execute: async (
        args: z.infer<
          typeof MigrateLegacySentryWorkDomainIntentArgumentsSchema
        >,
        context: MethodContext,
      ) => {
        const resourceName = await changeResourceName(
          "work-domain-route",
          args.workItem,
        );
        if (await context.readResource(resourceName)) {
          throw new Error(
            `Legacy Sentry route migration refuses to overwrite ${args.workItem}`,
          );
        }
        if (
          args.task.id !== args.workItem ||
          args.task.ownerToken !== "supers-delivery" ||
          args.task.completed ||
          args.task.startedAt === null ||
          !args.task.description.includes(args.mapping.exactMarker)
        ) {
          throw new TypeError(
            "Legacy Sentry route migration requires the exact open started Supers Delivery task",
          );
        }
        await Promise.all([
          verifySentryContentAddress(args.evidence, "Sentry repair evidence"),
          verifySentryContentAddress(args.mapping, "Sentry task mapping"),
          verifySentryContentAddress(args.admission, "Sentry admission"),
        ]);
        if (
          args.evidenceName !==
            `sentry-issue-repair-evidence-${args.evidence.repairIdentityFingerprint}` ||
          args.mappingName !==
            `sentry-repair-task-mapping-${args.mapping.fingerprint}` ||
          args.admissionName !==
            `sentry-repair-delivery-admission-${args.admission.fingerprint}`
        ) {
          throw new Error(
            "Legacy Sentry route migration resource names do not match their immutable identities",
          );
        }
        if (
          args.mapping.taskId !== args.workItem ||
          args.admission.dexTaskId !== args.workItem ||
          args.factoryState.workItem !== args.workItem ||
          args.legacyVerification.workItem !== args.workItem ||
          args.evidence.issueId !== args.mapping.issueId ||
          args.evidence.issueId !== args.admission.issueId ||
          args.evidence.shortId !== args.mapping.shortId ||
          args.evidence.shortId !== args.admission.shortId ||
          args.evidence.repairIdentityFingerprint !==
            args.mapping.repairIdentityFingerprint ||
          args.mapping.repairIdentityFingerprint !==
            args.admission.repairIdentityFingerprint ||
          args.evidence.repairIntentFingerprint !==
            args.admission.repairIntentFingerprint ||
          args.mapping.fingerprint !== args.admission.taskMappingFingerprint ||
          args.evidence.checkoutRevision !== args.admission.checkoutRevision
        ) {
          throw new Error(
            "Legacy Sentry route migration provenance does not bind one exact admitted repair",
          );
        }
        const integrationReceipt =
          await verifySupersFactoryIntegrationReceipt(args.integrationReceipt);
        if (
          integrationReceipt.disposition !== "integrated" ||
          integrationReceipt.factoryName !== "supers-delivery" ||
          integrationReceipt.rootEpicId !== args.workItem ||
          integrationReceipt.activeTaskId !== args.workItem ||
          integrationReceipt.targetBaselineRevision !==
            args.admission.checkoutRevision ||
          integrationReceipt.integratedRevision !==
            args.legacyVerification.integratedRevision ||
          args.factoryState.stage.cycle !== args.factoryState.dispatch.cycle ||
          args.factoryState.stage.cycle !==
            args.legacyVerification.stageCycle
        ) {
          throw new Error(
            "Legacy Sentry route migration verification and integration evidence do not agree",
          );
        }
        const intent: SupersWorkDomainIntent = SupersWorkDomainIntentSchema
          .parse(
            classifySupersTaskIntent({
              name: args.task.name,
              description: args.task.description,
              metadata: args.task.metadata,
            }),
          );
        const content = LegacySentryWorkDomainRouteContentSchema.parse({
          schemaVersion: 3,
          workItem: args.workItem,
          sourceModelName: args.sourceModelName,
          sourceResourceName: args.sourceResourceName,
          sourceWorkflowRunId: args.sourceWorkflowRunId,
          taskSnapshotDigest: await createSupersDeterministicContractHash(
            args.task,
          ),
          taskUpdatedAt: args.task.updatedAt,
          routingAuthority: "legacy-sentry-admission-migration",
          intent,
          migration: {
            evidenceName: args.evidenceName,
            evidenceFingerprint: args.evidence.fingerprint,
            mappingName: args.mappingName,
            mappingFingerprint: args.mapping.fingerprint,
            admissionName: args.admissionName,
            admissionFingerprint: args.admission.fingerprint,
            integrationReceiptId: integrationReceipt.receiptId,
            legacyVerificationWorkflowRunId:
              args.legacyVerification.workflowRunId,
            legacyVerificationDisposition:
              args.legacyVerification.disposition,
            factoryDefinitionVersion: args.factoryState.definitionVersion,
            factoryStage: args.factoryState.stage.id,
            factoryStageCycle: args.factoryState.stage.cycle,
            migratedAt: new Date().toISOString(),
          },
        });
        const route = SupersWorkDomainRouteSchema.parse({
          ...content,
          routeDigest: await createSupersDeterministicContractHash(content),
        });
        const handle = await context.writeResource(
          "work-domain-route",
          resourceName,
          route,
        );
        return { dataHandles: [handle] };
      },
    },
    "capture-change-baseline": {
      description:
        "Capture the current Git HEAD as the trusted baseline for a work item",
      arguments: z.object({ workItem: z.string().min(1) }),
      execute: async (args: { workItem: string }, context: MethodContext) => {
        const resourceName = await changeResourceName(
          "change-baseline",
          args.workItem,
        );
        const baseline = ChangeBaselineSchema.parse({
          workItem: args.workItem,
          baselineHead: await readGitHead(context),
          capturedAt: new Date().toISOString(),
          source: "git-head",
          ref: "HEAD",
          resourceName,
        });
        const handle = await context.writeResource(
          "change-baseline",
          resourceName,
          baseline,
        );
        const currentName = currentChangeBaselineName(args.workItem);
        const currentHandle = await context.writeResource(
          "change-baseline",
          currentName,
          { ...baseline, resourceName: currentName },
        );
        return { dataHandles: [handle, currentHandle] };
      },
    },
    "bind-change-baseline": {
      description:
        "Bind the latest canonical baseline to a stable task-owned lookup name",
      arguments: z.strictObject({
        workItem: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
        expectedBaselineRevision: GitHeadSchema,
      }),
      execute: async (
        args: { workItem: string; expectedBaselineRevision: string },
        context: MethodContext,
      ) => {
        const baseline = await readChangeBaseline(context, args.workItem);
        if (baseline.baselineHead !== args.expectedBaselineRevision) {
          throw new Error(
            "Latest canonical baseline does not match the requested revision",
          );
        }
        const currentName = currentChangeBaselineName(args.workItem);
        const handle = await context.writeResource(
          "change-baseline",
          currentName,
          { ...baseline, resourceName: currentName },
        );
        return { dataHandles: [handle] };
      },
    },
    "classify-change": {
      description:
        "Classify only the exact verified integration receipt paths while preserving current-tree freshness",
      arguments: z.strictObject({
        workItem: z.string().min(1),
        expectedBaselineRevision: GitHeadSchema,
        expectedIntegratedRevision: GitHeadSchema,
        expectedChangedPaths: z.array(z.string().min(1)).min(1).max(200),
      }),
      execute: async (args: {
        workItem: string;
        expectedBaselineRevision: string;
        expectedIntegratedRevision: string;
        expectedChangedPaths: string[];
      }, context: MethodContext) => {
        await readChangeBaseline(context, args.workItem);
        const workDomainRoute = await readWorkDomainRoute(
          context,
          args.workItem,
        );
        await runGit(context, [
          "merge-base",
          "--is-ancestor",
          args.expectedIntegratedRevision,
          "HEAD",
        ]);
        const committedPaths = parseNulPaths(
          await runGit(context, [
            "diff",
            "--name-only",
            "-z",
            "--no-renames",
            `${args.expectedBaselineRevision}..${args.expectedIntegratedRevision}`,
          ]),
        ).sort(compareCanonicalText);
        const expectedChangedPaths = [...new Set(args.expectedChangedPaths)]
          .sort(compareCanonicalText);
        if (
          JSON.stringify(committedPaths) !==
            JSON.stringify(expectedChangedPaths)
        ) {
          throw new Error(
            "Change classification paths differ from the integration receipt",
          );
        }
        const currentTree = await readScopedTreeState(context, committedPaths);
        const { report } = await runAuditScript(
          context,
          "scripts/audit-change-impact.ts",
          [
            "--committed-paths-json",
            JSON.stringify(committedPaths),
            "--work-domain-intent-json",
            JSON.stringify(workDomainRoute.intent),
          ],
          currentTree.status,
        );
        const canonicalReport = ChangeImpactReportSchema.parse({
          ...report,
          workItem: args.workItem,
          baselineHead: args.expectedBaselineRevision,
          treeFingerprint: currentTree.treeFingerprint,
          intentRouteDigest: workDomainRoute.routeDigest,
        });
        const resourceName = await changeResourceName(
          "change-impact",
          args.workItem,
        );
        const handle = await context.writeResource(
          "change-impact",
          resourceName,
          canonicalReport,
        );
        return { dataHandles: [handle] };
      },
    },
    "recover-later-integrated-change-state": {
      description:
        "Reseal scoped freshness only when one later terminal Factory integration explains every changed task path",
      arguments: LaterIntegrationFreshnessRecoveryArgumentsSchema,
      execute: async (
        args: LaterIntegrationFreshnessRecoveryArguments,
        context: MethodContext,
      ) => {
        const recovery = await createLaterIntegrationFreshnessRecovery(
          args,
          async (originalIntegratedRevision, originalPaths, candidate) => {
            const laterReceipt = candidate.integrationReceipt;
            if (laterReceipt.integratedRevision === null) {
              throw new TypeError(
                "Later integration freshness recovery requires an integrated revision",
              );
            }
            const laterIntegratedRevision = laterReceipt.integratedRevision;
            const pathspec = ["--", ...originalPaths];
            const [
              currentTree,
              originalIntegratedIsAncestorOfLaterBaseline,
              laterBaselineIsAncestorOfLaterIntegrated,
              laterIntegratedIsAncestorOfHead,
              originalToLaterBaselineScopedPaths,
              laterReceiptChangedPaths,
              laterScopedPaths,
              originalToHeadScopedPaths,
              laterIntegratedToHeadScopedPaths,
            ] = await Promise.all([
              readScopedTreeState(context, [...originalPaths]),
              isGitAncestor(
                context,
                originalIntegratedRevision,
                laterReceipt.targetBaselineRevision,
              ),
              isGitAncestor(
                context,
                laterReceipt.targetBaselineRevision,
                laterIntegratedRevision,
              ),
              isGitAncestor(context, laterIntegratedRevision, "HEAD"),
              runGit(context, [
                "diff",
                "--name-only",
                "-z",
                "--no-renames",
                `${originalIntegratedRevision}..${laterReceipt.targetBaselineRevision}`,
                ...pathspec,
              ]).then((output) =>
                parseNulPaths(output).sort(compareCanonicalText)
              ),
              runGit(context, [
                "diff",
                "--name-only",
                "-z",
                "--no-renames",
                `${laterReceipt.targetBaselineRevision}..${laterIntegratedRevision}`,
              ]).then((output) =>
                parseNulPaths(output).sort(compareCanonicalText)
              ),
              runGit(context, [
                "diff",
                "--name-only",
                "-z",
                "--no-renames",
                `${laterReceipt.targetBaselineRevision}..${laterIntegratedRevision}`,
                ...pathspec,
              ]).then((output) =>
                parseNulPaths(output).sort(compareCanonicalText)
              ),
              runGit(context, [
                "diff",
                "--name-only",
                "-z",
                "--no-renames",
                `${originalIntegratedRevision}..HEAD`,
                ...pathspec,
              ]).then((output) =>
                parseNulPaths(output).sort(compareCanonicalText)
              ),
              runGit(context, [
                "diff",
                "--name-only",
                "-z",
                "--no-renames",
                `${laterIntegratedRevision}..HEAD`,
                ...pathspec,
              ]).then((output) =>
                parseNulPaths(output).sort(compareCanonicalText)
              ),
            ]);
            return {
              currentTreeFingerprint: currentTree.treeFingerprint,
              currentPathsClean: currentTree.status.byteLength === 0,
              originalIntegratedIsAncestorOfLaterBaseline,
              laterBaselineIsAncestorOfLaterIntegrated,
              laterIntegratedIsAncestorOfHead,
              originalToLaterBaselineScopedPaths,
              laterReceiptChangedPaths,
              laterScopedPaths,
              originalToHeadScopedPaths,
              laterIntegratedToHeadScopedPaths,
            };
          },
        );
        const resourceName = await changeResourceName(
          "change-freshness-recovery",
          args.workItem,
        );
        const handle = await context.writeResource(
          "change-freshness-recovery",
          resourceName,
          recovery,
        );
        return { dataHandles: [handle] };
      },
    },
    "run-layout-contract-verification": {
      description:
        "Run and persist one authoritative full-checkout Layout Contract receipt",
      arguments: z.strictObject({
        workItem: z.string().min(1).max(128),
      }),
      execute: async (
        args: { workItem: string },
        context: MethodContext,
      ) => {
        const receipt = await runStandaloneLayoutContractVerification(
          context.repoDir,
        );
        const [currentHead, currentTree] = await Promise.all([
          readGitHead(context),
          readCurrentTreeState(context),
        ]);
        if (
          receipt.sourceRevision !== currentHead ||
          receipt.treeFingerprint !== currentTree.treeFingerprint
        ) {
          throw new Error(
            "Layout Contract receipt does not match the current full checkout",
          );
        }
        const resourceName = await changeResourceName(
          "layout-contract-receipt",
          `${args.workItem}:${receipt.contentDigest}`,
        );
        const handle = await context.writeResource(
          "layout-contract-receipt",
          resourceName,
          receipt,
        );
        return { dataHandles: [handle] };
      },
    },
    "run-verification-fanout": {
      description:
        "Run the automated lanes from the trusted change-impact resource and store every outcome",
      arguments: VerificationFanoutRequestArgumentsSchema,
      execute: async (
        args: VerificationFanoutRequestArguments,
        context: MethodContext,
      ) => {
        const { name: changeImpactResourceName, report: changeImpact } =
          await readChangeImpact(
            context,
            args.workItem,
            args.expectedFingerprint,
          );
        const automatedLaneIds = new Set([
          "browser",
          "check",
          "unit",
          "preset-static",
          "layout-contract",
          "export-decode",
          "performance",
          "repository-infrastructure",
          "swamp-control-plane",
          "timing-coverage",
          "authoring-dependency-tracking",
          "inspector-editor-parity",
          "planning-discoverability",
        ]);
        const fanoutArguments: VerificationFanoutArguments = {
          workItem: args.workItem,
          expectedFingerprint: args.expectedFingerprint,
          changeImpactResourceName,
          changedPaths: changeImpact.paths,
          intentRouteDigest: changeImpact.intentRouteDigest,
          lanes: changeImpact.lanes
            .map((lane) => lane.id)
            .filter((lane) =>
              automatedLaneIds.has(lane)
            ) as VerificationFanoutArguments["lanes"],
          benchmarkScripts: changeImpact.intent.benchmarkScripts,
          exportDecodeScripts: changeImpact.intent.exportDecodeScripts,
        };
        const report = await runVerificationFanout(
          context.repoDir,
          fanoutArguments,
        );
        const resourceName = await changeResourceName(
          "verification-fanout",
          `${args.workItem}:${args.expectedFingerprint}`,
        );
        const handle = await context.writeResource(
          "verification-fanout",
          resourceName,
          report,
        );
        return { dataHandles: [handle] };
      },
    },
    "assert-change-state": {
      description:
        "Fail when the task-owned content-sensitive Git fingerprint has drifted",
      arguments: z.strictObject({
        expectedFingerprint: TreeFingerprintSchema,
        expectedPaths: z.array(z.string().min(1)).min(1).max(200).optional(),
      }),
      execute: async (
        args: { expectedFingerprint: string; expectedPaths?: string[] },
        context: MethodContext,
      ) => {
        const currentTree = args.expectedPaths
          ? await readScopedTreeState(context, args.expectedPaths)
          : await readCurrentTreeState(context);
        if (currentTree.treeFingerprint !== args.expectedFingerprint) {
          throw new Error(
            `Change state drifted: expected ${args.expectedFingerprint}, received ${currentTree.treeFingerprint}`,
          );
        }
        return { dataHandles: [] };
      },
    },
  },
  // Rendered by extensions/reports/planning-state.ts after each method run.
  reports: ["@supers/planning-state"],
};
