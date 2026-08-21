import { z } from "npm:zod@4.4.3";

import {
  canonicalSentryJson,
  createSentrySha256,
  type SentryCommandResult,
  type SentryCommandRunner,
} from "./sentry-issue-intake-adapter.ts";
import { resolveSentryCliExecutable } from "./sentry-cli-executable.ts";
import {
  SentryRepairIntentEnvelopeSchema,
} from "./sentry-repair-planning-handoff-adapter.ts";
import {
  SentryRepairPlanningQueueSelectionSchema,
} from "./sentry-repair-planning-queue.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const GitReleaseSchema = z.string().regex(/^supers@[0-9a-f]{40}$/);
const IssueIdentitySchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const BoundedTextSchema = z.string().min(1).max(300);
const RouteSchema = z.string().regex(
  /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{0,300}$/,
);

export const SentryReproductionPrepareArgsSchema = z.object({
  repairIntentName: z.string().min(1).max(220),
  expectedRepairIntentFingerprint: FingerprintSchema,
  queueSelectionName: z.string().min(1).max(220),
  expectedQueueSelectionFingerprint: FingerprintSchema,
});

const SentryStackFrameSchema = z.strictObject({
  filename: z.string().min(1).max(240),
  function: z.string().min(1).max(160).nullable(),
});

export const SentryReproductionEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(2),
  repairIntentName: z.string().min(1),
  repairIntentFingerprint: FingerprintSchema,
  issueId: IssueIdentitySchema,
  shortId: IssueIdentitySchema,
  eventId: IssueIdentitySchema,
  release: z.string().min(1).max(160).nullable(),
  eventOccurredAt: z.string().datetime(),
  lastSeen: z.string().datetime(),
  culprit: BoundedTextSchema.nullable(),
  route: RouteSchema.nullable(),
  inAppStackFrames: z.array(SentryStackFrameSchema).max(20),
  breadcrumbCategories: z.array(z.string().min(1).max(80)).max(20),
  fingerprint: FingerprintSchema,
});

const SentryReproductionRecipeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("http-route"),
    method: z.literal("GET"),
    route: RouteSchema,
  }),
  z.strictObject({
    kind: z.literal("browser-route"),
    route: RouteSchema,
  }),
  z.strictObject({
    kind: z.literal("export-flow"),
    flow: z.literal("local-export-session"),
    route: RouteSchema,
  }),
  z.strictObject({
    kind: z.literal("allowlisted-test-command"),
    testId: z.enum([
      "composition-frame-renderer",
      "runtime-audit",
      "user-composition-store",
    ]),
  }),
]);

export const SentryReproductionRequestSchema = z.strictObject({
  schemaVersion: z.literal(3),
  state: z.literal("pending-transport"),
  workItem: z.string().regex(/^sentry-reproduction-[A-Za-z0-9_-]{1,100}$/),
  repairIntentName: z.string().min(1),
  repairIntentFingerprint: FingerprintSchema,
  queueSelectionName: z.string().min(1),
  queueSelectionFingerprint: FingerprintSchema,
  issueId: IssueIdentitySchema,
  shortId: IssueIdentitySchema,
  checkoutRelease: GitReleaseSchema,
  checkoutRevision: GitRevisionSchema,
  evidenceName: z.string().min(1),
  evidenceFingerprint: FingerprintSchema,
  sourceEventId: IssueIdentitySchema,
  sourceEventOccurredAt: z.string().datetime(),
  sourceLastSeen: z.string().datetime(),
  recipe: SentryReproductionRecipeSchema,
  requiredWorkerContract: z.literal("sentry-reproduction-transport-v1"),
  frozenSemanticTask: z.string().min(1).max(4_000),
  frozenTaskDigest: FingerprintSchema,
  fingerprint: FingerprintSchema,
}).superRefine((request, context) => {
  if (request.checkoutRelease !== `supers@${request.checkoutRevision}`) {
    context.addIssue({
      code: "custom",
      message: "Checkout release and revision must identify the same commit",
    });
  }
});

// Stage 2 can reserve transport but cannot accept worker authority. Stage 3
// must add an outbox/claim-bound authority receipt before this schema can grow
// a reproduced state.
export const SentryReproductionOutcomeSchema = z.strictObject({
  schemaVersion: z.literal(2),
  status: z.enum(["inconclusive", "quarantined"]),
  reason: z.enum([
    "transport-pending",
    "unsupported-recipe",
    "malformed-sentry-evidence",
    "event-watermark-drift",
  ]),
  repairIntentName: z.string().min(1),
  repairIntentFingerprint: FingerprintSchema,
  checkoutRelease: GitReleaseSchema,
  checkoutRevision: GitRevisionSchema,
  evidenceFingerprint: FingerprintSchema.nullable(),
  requestFingerprint: FingerprintSchema.nullable(),
  workerReceiptFingerprint: z.null(),
  fingerprint: FingerprintSchema,
}).superRefine((outcome, context) => {
  if (outcome.checkoutRelease !== `supers@${outcome.checkoutRevision}`) {
    context.addIssue({
      code: "custom",
      message: "Outcome release and revision must identify the same commit",
    });
  }
});

export type SentryReproductionContext = {
  repoDir: string;
  globalArgs: { sourceRepairModelId: string };
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
  };
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};

export type SentryReproductionDependencies = {
  commandRunner: SentryCommandRunner;
  resolveCheckoutRevision: (repoDir: string) => Promise<string>;
};

async function resolveGitCheckoutRevision(repoDir: string): Promise<string> {
  const result = await new Deno.Command("git", {
    args: ["rev-parse", "HEAD"],
    cwd: repoDir,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    throw new Error("Unable to resolve reproduction checkout revision");
  }
  return GitRevisionSchema.parse(
    new TextDecoder().decode(result.stdout).trim(),
  );
}

export class DenoSentryReproductionCommandRunner
  implements SentryCommandRunner {
  async run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryCommandResult> {
    const child = new Deno.Command(resolveSentryCliExecutable(), {
      args: [...args],
      cwd,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      env: { CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
    }).spawn();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // Process may finish between the timeout and signal.
      }
    }, timeoutMs);
    try {
      const result = await child.output();
      if (timedOut) {
        throw new Error(`sentry command timed out after ${timeoutMs}ms`);
      }
      return {
        code: result.code,
        stdout: new TextDecoder().decode(result.stdout),
        stderr: new TextDecoder().decode(result.stderr),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

const RawFrameSchema = z.object({
  filename: z.string().nullish(),
  function: z.string().nullish(),
  inApp: z.boolean().nullish(),
  in_app: z.boolean().nullish(),
}).passthrough();
const RawBreadcrumbSchema = z.object({
  category: z.string().nullish(),
  type: z.string().nullish(),
}).passthrough();
const RawEventSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).optional(),
  eventID: z.string().optional(),
  eventId: z.string().optional(),
  dateCreated: z.string().datetime().optional(),
  date_created: z.string().datetime().optional(),
  timestamp: z.string().datetime().optional(),
  release: z.union([
    z.string(),
    z.object({ version: z.string() }).passthrough(),
  ]).nullish(),
  transaction: z.string().nullish(),
  request: z.object({ url: z.string().nullish() }).passthrough().nullish(),
  culprit: z.string().nullish(),
  exception: z.object({
    values: z.array(
      z.object({
        stacktrace: z.object({ frames: z.array(RawFrameSchema).max(100) })
          .passthrough().nullish(),
      }).passthrough(),
    ).max(20),
  }).passthrough().nullish(),
  breadcrumbs: z.object({ values: z.array(RawBreadcrumbSchema).max(100) })
    .passthrough().nullish(),
}).passthrough();
const RawHydratedIssueSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  shortId: z.string(),
  lastSeen: z.string().datetime(),
  culprit: z.string().nullish(),
  latestEvent: RawEventSchema.nullish(),
  events: z.array(RawEventSchema).max(10).nullish(),
}).passthrough();

type RepairIntentEnvelope = z.infer<typeof SentryRepairIntentEnvelopeSchema>;
type ReproductionEvidence = z.infer<typeof SentryReproductionEvidenceSchema>;
type ReproductionRequest = z.infer<typeof SentryReproductionRequestSchema>;

function sanitizeUntrustedText(value: string, maximum: number): string {
  const withoutAnsi = value.replace(
    new RegExp(String.raw`\u001b\[[0-?]*[ -/]*[@-~]`, "g"),
    "",
  );
  const withoutControls = [...withoutAnsi].map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  return withoutControls
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/(?:\/[A-Za-z0-9._-]+){3,}/g, "<path>")
    .replace(/[A-Za-z]:\\(?:[^\s\\]+\\){1,}[^\s\\]+/g, "<path>")
    .replace(
      /\b(token|api[_-]?key|secret|password)\s*[:=]\s*[^\s,;]+/gi,
      "$1=<redacted>",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum) || "<empty>";
}

function sanitizeFilename(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const sourceIndex = normalized.lastIndexOf("src/");
  if (sourceIndex >= 0) {
    const sourcePath = normalized.slice(sourceIndex);
    if (
      /^src\/[A-Za-z0-9._/-]+$/.test(sourcePath) &&
      !sourcePath.split("/").includes("..")
    ) {
      return sourcePath.slice(0, 240);
    }
  }
  return "<path>";
}

function normalizeLocalRoute(value: string | null | undefined): string | null {
  if (!value) return null;
  let route: string;
  try {
    if (value.startsWith("/")) {
      route = value.split(/[?#]/, 1)[0];
    } else {
      const url = new URL(value);
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
        return null;
      }
      route = url.pathname;
    }
  } catch {
    return null;
  }
  return RouteSchema.safeParse(route).success ? route : null;
}

function releaseValue(
  value: z.infer<typeof RawEventSchema>["release"],
): string | null {
  if (typeof value === "string") return sanitizeUntrustedText(value, 160);
  if (value && typeof value.version === "string") {
    return sanitizeUntrustedText(value.version, 160);
  }
  return null;
}

function eventFromIssue(issue: z.infer<typeof RawHydratedIssueSchema>) {
  return issue.latestEvent ?? issue.events?.[0] ?? null;
}

function eventOccurredAt(event: z.infer<typeof RawEventSchema>): string | null {
  return event.dateCreated ?? event.date_created ?? event.timestamp ?? null;
}

function sameInstant(left: string, right: string): boolean {
  return new Date(left).getTime() === new Date(right).getTime();
}

async function createEvidence(
  intentName: string,
  envelope: RepairIntentEnvelope,
  raw: unknown,
): Promise<ReproductionEvidence> {
  const issue = RawHydratedIssueSchema.parse(raw);
  if (
    issue.id !== envelope.intent.issueId ||
    issue.shortId !== envelope.intent.shortId
  ) {
    throw new Error("Sentry reproduction evidence identity drift");
  }
  const event = eventFromIssue(issue);
  if (!event) {
    throw new Error("Sentry reproduction evidence has no bounded event");
  }
  const eventId = event.eventID ?? event.eventId ?? event.id;
  if (!eventId || !IssueIdentitySchema.safeParse(eventId).success) {
    throw new Error("Sentry reproduction evidence has no valid event id");
  }
  const occurredAt = eventOccurredAt(event);
  if (occurredAt === null || !sameInstant(occurredAt, issue.lastSeen)) {
    throw new Error(
      "Sentry reproduction latest event does not match the issue last-seen watermark",
    );
  }
  const frames = (event.exception?.values ?? []).flatMap((value) =>
    value.stacktrace?.frames ?? []
  ).filter((frame) => frame.inApp === true || frame.in_app === true).slice(-20)
    .map((frame) =>
      SentryStackFrameSchema.parse({
        filename: sanitizeFilename(frame.filename ?? "<path>"),
        function: frame.function
          ? sanitizeUntrustedText(frame.function, 160)
          : null,
      })
    );
  const breadcrumbCategories = [
    ...new Set(
      (event.breadcrumbs?.values ?? []).map((breadcrumb) =>
        sanitizeUntrustedText(
          breadcrumb.category ?? breadcrumb.type ?? "unknown",
          80,
        )
      ),
    ),
  ].slice(0, 20);
  const route = normalizeLocalRoute(event.request?.url ?? event.transaction);
  const base = {
    schemaVersion: 2 as const,
    repairIntentName: intentName,
    repairIntentFingerprint: envelope.fingerprint,
    issueId: envelope.intent.issueId,
    shortId: envelope.intent.shortId,
    eventId,
    release: releaseValue(event.release),
    eventOccurredAt: occurredAt,
    lastSeen: issue.lastSeen,
    culprit: issue.culprit || event.culprit
      ? sanitizeUntrustedText(issue.culprit ?? event.culprit ?? "", 300)
      : null,
    route,
    inAppStackFrames: frames,
    breadcrumbCategories,
  };
  return SentryReproductionEvidenceSchema.parse({
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  });
}

const ALLOWLISTED_TESTS = new Map<
  string,
  z.infer<typeof SentryReproductionRecipeSchema>
>([
  [
    "src/lib/platform/composition-frame-renderer.ts",
    { kind: "allowlisted-test-command", testId: "composition-frame-renderer" },
  ],
  [
    "src/lib/platform/runtime-audit.ts",
    { kind: "allowlisted-test-command", testId: "runtime-audit" },
  ],
  [
    "src/lib/platform/user-composition-store.ts",
    { kind: "allowlisted-test-command", testId: "user-composition-store" },
  ],
]);

export function deriveClosedSentryReproductionRecipe(
  evidence: ReproductionEvidence,
): z.infer<typeof SentryReproductionRecipeSchema> | null {
  if (evidence.route?.startsWith("/api/export/")) {
    return {
      kind: "export-flow",
      flow: "local-export-session",
      route: evidence.route,
    };
  }
  if (evidence.route?.startsWith("/api/")) {
    return { kind: "http-route", method: "GET", route: evidence.route };
  }
  if (evidence.route === "/" || evidence.route?.startsWith("/p/")) {
    return { kind: "browser-route", route: evidence.route };
  }
  for (const frame of [...evidence.inAppStackFrames].reverse()) {
    const recipe = ALLOWLISTED_TESTS.get(frame.filename);
    if (recipe) return recipe;
  }
  return null;
}

async function createOutcome(
  value: Omit<
    z.infer<typeof SentryReproductionOutcomeSchema>,
    "schemaVersion" | "fingerprint"
  >,
) {
  const base = { schemaVersion: 2 as const, ...value };
  return SentryReproductionOutcomeSchema.parse({
    ...base,
    fingerprint: await createSentrySha256(canonicalSentryJson(base)),
  });
}

export function sentryReproductionWatermarkMatches(
  request: ReproductionRequest,
  rawFreshIssue: unknown,
): boolean {
  const parsed = RawHydratedIssueSchema.safeParse(rawFreshIssue);
  if (!parsed.success) return false;
  const issue = parsed.data;
  if (issue.id !== request.issueId || issue.shortId !== request.shortId) {
    return false;
  }
  const event = eventFromIssue(issue);
  if (!event) return false;
  const eventId = event.eventID ?? event.eventId ?? event.id;
  const occurredAt = eventOccurredAt(event);
  return eventId === request.sourceEventId &&
    occurredAt !== null &&
    sameInstant(occurredAt, request.sourceEventOccurredAt) &&
    sameInstant(issue.lastSeen, request.sourceLastSeen) &&
    sameInstant(occurredAt, issue.lastSeen);
}

// Stage 3 must call this check after a fresh bounded Sentry read and validate
// the Pi outbox, launch receipt, execution claim, and handoff acceptance before
// it may introduce any terminal reproduction result. Stage 2 deliberately
// exposes no finalization method or worker-receipt authority.

async function readRepairIntent(
  args: z.infer<typeof SentryReproductionPrepareArgsSchema>,
  context: SentryReproductionContext,
): Promise<RepairIntentEnvelope> {
  const sourceModelId = z.string().uuid().parse(
    context.globalArgs.sourceRepairModelId,
  );
  const [content, selectionContent] = await Promise.all([
    context.dataRepository.getContent(
      "@supers/sentry-repair-planning-handoff",
      sourceModelId,
      args.repairIntentName,
    ),
    context.dataRepository.getContent(
      "@supers/sentry-repair-planning-handoff",
      sourceModelId,
      args.queueSelectionName,
    ),
  ]);
  if (content === null) {
    throw new Error(`Missing repair intent ${args.repairIntentName}`);
  }
  if (selectionContent === null) {
    throw new Error(
      `Missing reproduction queue selection ${args.queueSelectionName}`,
    );
  }
  const envelope = SentryRepairIntentEnvelopeSchema.parse(
    JSON.parse(new TextDecoder().decode(content)),
  );
  const selection = SentryRepairPlanningQueueSelectionSchema.parse(
    JSON.parse(new TextDecoder().decode(selectionContent)),
  );
  const computedEnvelopeFingerprint = await createSentrySha256(
    canonicalSentryJson({
      schemaVersion: envelope.schemaVersion,
      sourceHandoff: envelope.sourceHandoff,
      sourceHandoffFingerprint: envelope.sourceHandoffFingerprint,
      planningWorkItem: envelope.planningWorkItem,
      intent: envelope.intent,
    }),
  );
  const { fingerprint: _selectionFingerprint, ...selectionBase } = selection;
  const computedSelectionFingerprint = await createSentrySha256(
    canonicalSentryJson(selectionBase),
  );
  if (
    envelope.fingerprint !== computedEnvelopeFingerprint ||
    selection.fingerprint !== computedSelectionFingerprint
  ) {
    throw new Error(
      "Sentry reproduction source fingerprint verification failed",
    );
  }
  if (envelope.fingerprint !== args.expectedRepairIntentFingerprint) {
    throw new Error("Sentry reproduction repair intent fingerprint mismatch");
  }
  if (selection.fingerprint !== args.expectedQueueSelectionFingerprint) {
    throw new Error("Sentry reproduction queue selection fingerprint mismatch");
  }
  if (
    selection.action !== "await-reproduction" ||
    selection.selectedIntentFingerprint !== envelope.fingerprint
  ) {
    throw new Error(
      "Sentry reproduction controller requires the exact selected intent",
    );
  }
  if (
    envelope.intent.queueIntent !== "reproduction-required" ||
    !envelope.intent.requiresReproduction
  ) {
    throw new Error(
      "Sentry reproduction controller requires a reproduction intent",
    );
  }
  return envelope;
}

export async function executePrepareSentryReproduction(
  rawArgs: z.infer<typeof SentryReproductionPrepareArgsSchema>,
  context: SentryReproductionContext,
  dependencies: SentryReproductionDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryReproductionPrepareArgsSchema.parse(rawArgs);
  const envelope = await readRepairIntent(args, context);
  const checkoutRelease = GitReleaseSchema.parse(
    envelope.intent.currentRelease,
  );
  const checkoutRevision = GitRevisionSchema.parse(
    checkoutRelease.slice("supers@".length),
  );
  const actualCheckoutRevision = GitRevisionSchema.parse(
    await dependencies.resolveCheckoutRevision(context.repoDir),
  );
  if (actualCheckoutRevision !== checkoutRevision) {
    throw new Error("Sentry reproduction checkout revision drift");
  }
  const command = await dependencies.commandRunner.run(
    ["issue", "view", envelope.intent.shortId, "--fresh", "--json"],
    context.repoDir,
    20_000,
  );
  if (command.code !== 0) {
    throw new Error(`sentry issue view failed with exit ${command.code}`);
  }

  let evidence: ReproductionEvidence;
  try {
    evidence = await createEvidence(
      args.repairIntentName,
      envelope,
      JSON.parse(command.stdout) as unknown,
    );
  } catch {
    const outcome = await createOutcome({
      status: "quarantined",
      reason: "malformed-sentry-evidence",
      repairIntentName: args.repairIntentName,
      repairIntentFingerprint: envelope.fingerprint,
      checkoutRelease,
      checkoutRevision,
      evidenceFingerprint: null,
      requestFingerprint: null,
      workerReceiptFingerprint: null,
    });
    const handle = await context.writeResource(
      "outcome",
      `sentry-reproduction-outcome-${outcome.fingerprint}`,
      outcome,
    );
    context.logger.warning(
      "Quarantined malformed Sentry reproduction evidence",
      {
        issueId: envelope.intent.issueId,
      },
    );
    return { dataHandles: [handle] };
  }

  const evidenceHandle = await context.writeResource(
    "evidence",
    `sentry-reproduction-evidence-${evidence.fingerprint}`,
    evidence,
  );
  const recipe = deriveClosedSentryReproductionRecipe(evidence);
  if (recipe === null) {
    const outcome = await createOutcome({
      status: "quarantined",
      reason: "unsupported-recipe",
      repairIntentName: args.repairIntentName,
      repairIntentFingerprint: envelope.fingerprint,
      checkoutRelease,
      checkoutRevision,
      evidenceFingerprint: evidence.fingerprint,
      requestFingerprint: null,
      workerReceiptFingerprint: null,
    });
    const outcomeHandle = await context.writeResource(
      "outcome",
      `sentry-reproduction-outcome-${outcome.fingerprint}`,
      outcome,
    );
    return { dataHandles: [evidenceHandle, outcomeHandle] };
  }

  // This frozen semantic payload is the only task content Stage 3 may place in
  // the existing Factory Pi outbox. No Sentry prose becomes executable text.
  const frozenTask = canonicalSentryJson({
    contract: "sentry-reproduction-v3",
    checkoutRelease,
    checkoutRevision,
    evidenceFingerprint: evidence.fingerprint,
    issueId: evidence.issueId,
    queueSelectionFingerprint: args.expectedQueueSelectionFingerprint,
    recipe,
    sourceEventId: evidence.eventId,
    sourceEventOccurredAt: evidence.eventOccurredAt,
    sourceLastSeen: evidence.lastSeen,
  });
  const requestBase = {
    schemaVersion: 3 as const,
    state: "pending-transport" as const,
    workItem: `sentry-reproduction-${evidence.issueId}`,
    repairIntentName: args.repairIntentName,
    repairIntentFingerprint: envelope.fingerprint,
    queueSelectionName: args.queueSelectionName,
    queueSelectionFingerprint: args.expectedQueueSelectionFingerprint,
    issueId: evidence.issueId,
    shortId: evidence.shortId,
    checkoutRelease,
    checkoutRevision,
    evidenceName: evidenceHandle.name,
    evidenceFingerprint: evidence.fingerprint,
    sourceEventId: evidence.eventId,
    sourceEventOccurredAt: evidence.eventOccurredAt,
    sourceLastSeen: evidence.lastSeen,
    recipe,
    requiredWorkerContract: "sentry-reproduction-transport-v1" as const,
    frozenSemanticTask: frozenTask,
    frozenTaskDigest: await createSentrySha256(frozenTask),
  };
  const request = SentryReproductionRequestSchema.parse({
    ...requestBase,
    fingerprint: await createSentrySha256(canonicalSentryJson(requestBase)),
  });
  const requestHandle = await context.writeResource(
    "request",
    `sentry-reproduction-request-${request.fingerprint}`,
    request,
  );
  const pending = await createOutcome({
    status: "inconclusive",
    reason: "transport-pending",
    repairIntentName: args.repairIntentName,
    repairIntentFingerprint: envelope.fingerprint,
    checkoutRelease,
    checkoutRevision,
    evidenceFingerprint: evidence.fingerprint,
    requestFingerprint: request.fingerprint,
    workerReceiptFingerprint: null,
  });
  const outcomeHandle = await context.writeResource(
    "outcome",
    `sentry-reproduction-outcome-${pending.fingerprint}`,
    pending,
  );
  context.logger.info(
    "Reserved bounded Sentry reproduction for trusted Pi transport",
    {
      issueId: evidence.issueId,
      recipeKind: recipe.kind,
    },
  );
  return { dataHandles: [evidenceHandle, requestHandle, outcomeHandle] };
}

export const model = {
  type: "@supers/sentry-reproduction-controller",
  version: "2026.08.21.3",
  globalArguments: z.strictObject({
    sourceRepairModelId: z.string().uuid(),
  }),
  resources: {
    evidence: {
      description:
        "Bounded sanitized Sentry event evidence for one reproduction attempt",
      schema: SentryReproductionEvidenceSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    request: {
      description:
        "Frozen closed-recipe reproduction request awaiting trusted Factory Pi transport",
      schema: SentryReproductionRequestSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
    outcome: {
      description:
        "Exact Stage 2 pending-transport or quarantined reservation result",
      schema: SentryReproductionOutcomeSchema,
      lifetime: "infinite",
      garbageCollection: 500,
    },
  },
  methods: {
    prepare: {
      description:
        "Hydrate one reproduction intent and reserve only a closed allowlisted recipe",
      arguments: SentryReproductionPrepareArgsSchema,
      execute: (
        args: z.infer<typeof SentryReproductionPrepareArgsSchema>,
        context: SentryReproductionContext,
      ) =>
        executePrepareSentryReproduction(args, context, {
          commandRunner: new DenoSentryReproductionCommandRunner(),
          resolveCheckoutRevision: resolveGitCheckoutRevision,
        }),
    },
  },
};
