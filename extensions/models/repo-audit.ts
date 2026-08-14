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
  runVerificationFanout,
  type VerificationFanoutArguments,
  VerificationFanoutArgumentsSchema,
  VerificationFanoutReportSchema,
} from "./repo-verification-fanout.ts";

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

const ChangeImpactReportSchema = z.object({
  audit: z.literal("change-impact"),
  generatedAt: z.string(),
  source: z.literal("git-baseline-and-working-tree"),
  workItem: z.string().min(1),
  baselineHead: GitHeadSchema,
  treeFingerprint: TreeFingerprintSchema,
  paths: z.array(z.string()),
  lanes: z
    .array(
      z.object({
        id: z.enum([
          "policy-sweep",
          "check",
          "unit",
          "structural",
          "corpus",
          "browser",
          "visual",
          "pack-matrix",
          "export-decode",
        ]),
        reasons: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  visualReviewCandidate: z.boolean(),
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
  const untracked = [] as Array<{ path: string; contentHash: string }>;
  for (const path of parseNulPaths(untrackedOutput).sort()) {
    const content = await Deno.readFile(`${context.repoDir}/${path}`);
    untracked.push({ path, contentHash: await sha256Hex(content) });
  }
  const fingerprintSource = JSON.stringify({
    head,
    unstagedDiff: await sha256Hex(unstagedDiff),
    stagedDiff: await sha256Hex(stagedDiff),
    status: await sha256Hex(status),
    untracked,
  });
  return { head, status, treeFingerprint: await sha256Hex(fingerprintSource) };
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
  version: "2026.08.09.1",
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
    "verification-fanout": {
      description:
        "Parallel deterministic verification lane outcomes with bounded command evidence",
      schema: VerificationFanoutReportSchema,
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
        return { dataHandles: [handle] };
      },
    },
    "classify-change": {
      description:
        "Map baseline-to-HEAD commits plus the current Git working tree to verification lanes",
      arguments: z.object({ workItem: z.string().min(1) }),
      execute: async (args: { workItem: string }, context: MethodContext) => {
        const baseline = await readChangeBaseline(context, args.workItem);
        const currentTree = await readCurrentTreeState(context);
        const committedPaths = parseNulPaths(
          await runGit(context, [
            "diff",
            "--name-only",
            "-z",
            "--no-renames",
            `${baseline.baselineHead}..HEAD`,
          ]),
        );
        const { report } = await runAuditScript(
          context,
          "scripts/audit-change-impact.ts",
          ["--committed-paths-json", JSON.stringify(committedPaths)],
          currentTree.status,
        );
        const canonicalReport = ChangeImpactReportSchema.parse({
          ...report,
          workItem: args.workItem,
          baselineHead: baseline.baselineHead,
          treeFingerprint: currentTree.treeFingerprint,
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
    "run-verification-fanout": {
      description:
        "Run selected deterministic verification lanes concurrently and store every outcome",
      arguments: VerificationFanoutArgumentsSchema,
      execute: async (
        args: VerificationFanoutArguments,
        context: MethodContext,
      ) => {
        const report = await runVerificationFanout(context.repoDir, args);
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
        "Fail when the current content-sensitive Git tree fingerprint has drifted",
      arguments: z.object({ expectedFingerprint: TreeFingerprintSchema }),
      execute: async (
        args: { expectedFingerprint: string },
        context: MethodContext,
      ) => {
        const currentTree = await readCurrentTreeState(context);
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
