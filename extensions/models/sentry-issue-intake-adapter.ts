import { z } from "npm:zod@4.4.3";

import { resolveSentryCliExecutable } from "./sentry-cli-executable.ts";

const BoundedTextSchema = z.string().min(1).max(300);
const IssueIdentitySchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);

export const SentryIssueIntakeArgsSchema = z.object({
  lookbackDays: z.number().int().min(1).max(30).default(7),
  historyDays: z.number().int().min(7).max(365).default(90),
  limit: z.number().int().min(1).max(100).default(100),
  currentRelease: z.string().min(1).max(160).regex(/^[A-Za-z0-9@._:+-]+$/)
    .nullish(),
}).refine((value) => value.historyDays >= value.lookbackDays, {
  message: "historyDays must be greater than or equal to lookbackDays",
});

export type SentryIssueIntakeArgs = z.infer<typeof SentryIssueIntakeArgsSchema>;

export const SentryIssueSchema = z.object({
  id: IssueIdentitySchema,
  shortId: IssueIdentitySchema,
  title: BoundedTextSchema,
  priority: z.enum(["low", "medium", "high"]).nullable(),
  level: z.enum(["debug", "info", "warning", "error", "fatal"]).nullable(),
  firstSeen: z.string().datetime(),
  status: z.literal("unresolved"),
});

export const SentryIssueSnapshotSchema = z.object({
  source: z.literal("sentry-cli"),
  target: z.string().min(1).max(160),
  capturedAt: z.string().datetime(),
  lookbackDays: z.number().int(),
  historyDays: z.number().int(),
  limit: z.number().int(),
  currentRelease: z.string().nullable(),
  complete: z.boolean(),
  coverage: z.object({
    historyHasMore: z.boolean(),
    recentHasMore: z.boolean(),
    releaseHasMore: z.boolean(),
  }),
  issues: z.array(SentryIssueSchema).max(100),
  recentIssueIds: z.array(IssueIdentitySchema).max(100),
  currentReleaseIssueIds: z.array(IssueIdentitySchema).max(100),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

export const SentryIssueQueueIntentSchema = z.enum([
  "confirmed-repair",
  "reproduction-required",
]);

export const SentryIssueReconciliationSchema = z.object({
  sourceSnapshot: z.string().min(1),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  generatedAt: z.string().datetime(),
  automationEligible: z.boolean(),
  items: z.array(z.object({
    id: IssueIdentitySchema,
    shortId: IssueIdentitySchema,
    title: BoundedTextSchema,
    priority: z.enum(["low", "medium", "high"]).nullable(),
    level: z.enum(["debug", "info", "warning", "error", "fatal"]).nullable(),
    firstSeen: z.string().datetime(),
    status: z.literal("unresolved"),
    disposition: z.enum([
      "current-release",
      "recent",
      "historical-unresolved",
      "ambiguous",
    ]),
    queueIntent: SentryIssueQueueIntentSchema.nullable(),
  })).max(100),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

export type SentryCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};
export interface SentryCommandRunner {
  run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryCommandResult>;
}

export type SentryIssueIntakeContext = {
  repoDir: string;
  globalArgs: { target?: string };
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

export type SentryIssueIntakeDependencies = {
  commandRunner: SentryCommandRunner;
  now: () => string;
  nowMilliseconds?: () => number;
  resolveCurrentRelease?: (repoDir: string) => Promise<string>;
};

const CliIssueSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  shortId: z.string(),
  title: z.string(),
  priority: z.string().nullish(),
  level: z.string().nullish(),
  firstSeen: z.string().datetime().nullish(),
  status: z.string(),
});
const CliListSchema = z.object({
  data: z.array(CliIssueSchema).max(100),
  hasMore: z.boolean().default(false),
  hasPrev: z.boolean().default(false),
});

type CliList = z.infer<typeof CliListSchema>;

const ANSI_CSI_PATTERN = new RegExp(
  String.raw`\u001b\[[0-?]*[ -/]*[@-~]`,
  "g",
);

export function sanitizeSentryEvidenceText(
  value: string,
  maximum: number,
): string {
  return value
    .replace(ANSI_CSI_PATTERN, "")
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/(?<![A-Za-z0-9._-])(?:\/[A-Za-z0-9._-]+){2,}/g, "<path>")
    .replace(/[A-Za-z]:\\(?:[^\s\\]+\\){1,}[^\s\\]+/g, "<path>")
    .replace(
      /\b(token|api[_-]?key|secret|password)\s*[:=]\s*[^\s,;]+/gi,
      "$1=<redacted>",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function sanitizeTitle(value: string): string {
  return sanitizeSentryEvidenceText(value, 300) || "<empty-title>";
}

function normalizeIssue(
  value: z.infer<typeof CliIssueSchema>,
  firstSeen: string,
): z.infer<typeof SentryIssueSchema> {
  return SentryIssueSchema.parse({
    id: value.id,
    shortId: value.shortId,
    title: sanitizeTitle(value.title),
    priority: ["low", "medium", "high"].includes(value.priority ?? "")
      ? value.priority
      : null,
    level:
      ["debug", "info", "warning", "error", "fatal"].includes(value.level ?? "")
        ? value.level
        : null,
    firstSeen,
    status: value.status,
  });
}

export function canonicalSentryJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSentryJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) =>
        `${JSON.stringify(key)}:${canonicalSentryJson(entry)}`
      ).join(",");
    return `{${entries}}`;
  }
  return JSON.stringify(value);
}

export async function createSentrySha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

const SENTRY_READ_TIMEOUT_MS = 60_000;
export const SENTRY_INTAKE_TIMEOUT_MS = 2 * SENTRY_READ_TIMEOUT_MS;

export function remainingSentryIntakeTimeoutMs(
  deadlineMilliseconds: number,
  nowMilliseconds: number,
): number {
  const remaining = deadlineMilliseconds - nowMilliseconds;
  if (remaining <= 0) {
    throw new Error(
      `Sentry intake exceeded its ${SENTRY_INTAKE_TIMEOUT_MS}ms wall-time budget`,
    );
  }
  return Math.min(SENTRY_READ_TIMEOUT_MS, remaining);
}

async function runSentryReadCommand(
  runner: SentryCommandRunner,
  context: SentryIssueIntakeContext,
  args: readonly string[],
  deadlineMilliseconds: number,
  nowMilliseconds: () => number,
): Promise<SentryCommandResult> {
  try {
    return await runner.run(
      args,
      context.repoDir,
      remainingSentryIntakeTimeoutMs(
        deadlineMilliseconds,
        nowMilliseconds(),
      ),
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("timed out")) {
      throw error;
    }
    context.logger.warning("Retrying one timed-out read-only Sentry command", {
      operation: args.slice(0, 2).join(" "),
    });
    return await runner.run(
      args,
      context.repoDir,
      remainingSentryIntakeTimeoutMs(
        deadlineMilliseconds,
        nowMilliseconds(),
      ),
    );
  }
}

async function fetchIssues(
  runner: SentryCommandRunner,
  context: SentryIssueIntakeContext,
  deadlineMilliseconds: number,
  nowMilliseconds: () => number,
  target: string,
  query: string,
  periodDays: number,
  limit: number,
): Promise<CliList> {
  const args = [
    "issue",
    "list",
    target,
    "--query",
    query,
    "--period",
    `${periodDays}d`,
    "--limit",
    String(limit),
    "--sort",
    "date",
    "--fresh",
    "--json",
    "--fields",
    "id,shortId,title,priority,level,firstSeen,status",
  ];
  const result = await runSentryReadCommand(
    runner,
    context,
    args,
    deadlineMilliseconds,
    nowMilliseconds,
  );
  if (result.code !== 0) {
    throw new Error(
      `sentry issue list failed with exit ${result.code}: ${
        sanitizeTitle(result.stderr || result.stdout)
      }`,
    );
  }
  try {
    return CliListSchema.parse(JSON.parse(result.stdout));
  } catch {
    throw new Error(
      "sentry issue list returned malformed or out-of-contract JSON",
    );
  }
}

const CliIssueFirstSeenSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  shortId: z.string(),
  firstSeen: z.string().datetime(),
});

async function fetchIssueFirstSeen(
  runner: SentryCommandRunner,
  context: SentryIssueIntakeContext,
  deadlineMilliseconds: number,
  nowMilliseconds: () => number,
  lists: CliList[],
): Promise<Map<string, string>> {
  const rawById = new Map<string, z.infer<typeof CliIssueSchema>>();
  for (const list of lists) {
    for (const issue of list.data) rawById.set(issue.id, issue);
  }
  const firstSeenByIssueId = new Map<string, string>();
  const missing = [...rawById.values()].filter((issue) => {
    if (issue.firstSeen !== null && issue.firstSeen !== undefined) {
      firstSeenByIssueId.set(issue.id, issue.firstSeen);
      return false;
    }
    return true;
  });
  for (let offset = 0; offset < missing.length; offset += 5) {
    const batch = missing.slice(offset, offset + 5);
    const details = await Promise.all(batch.map(async (issue) => {
      const result = await runSentryReadCommand(
        runner,
        context,
        [
          "issue",
          "view",
          issue.shortId,
          "--fresh",
          "--json",
          "--fields",
          "id,shortId,firstSeen",
        ],
        deadlineMilliseconds,
        nowMilliseconds,
      );
      if (result.code !== 0) {
        throw new Error(
          `sentry issue view failed with exit ${result.code}: ${
            sanitizeTitle(result.stderr || result.stdout)
          }`,
        );
      }
      let detail: z.infer<typeof CliIssueFirstSeenSchema>;
      try {
        detail = CliIssueFirstSeenSchema.parse(JSON.parse(result.stdout));
      } catch {
        throw new Error(
          "sentry issue view returned malformed firstSeen JSON",
        );
      }
      if (detail.id !== issue.id || detail.shortId !== issue.shortId) {
        throw new Error(`Sentry firstSeen identity drift for ${issue.shortId}`);
      }
      return detail;
    }));
    for (const detail of details) {
      firstSeenByIssueId.set(detail.id, detail.firstSeen);
    }
  }
  return firstSeenByIssueId;
}

function uniqueIssues(
  lists: CliList[],
  firstSeenByIssueId: Map<string, string>,
): z.infer<typeof SentryIssueSchema>[] {
  const byId = new Map<string, z.infer<typeof SentryIssueSchema>>();
  const byShortId = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list.data) {
      const firstSeen = firstSeenByIssueId.get(raw.id);
      if (firstSeen === undefined) {
        throw new Error(`Missing firstSeen for Sentry issue ${raw.shortId}`);
      }
      const issue = normalizeIssue(raw, firstSeen);
      const existingShortIdOwner = byShortId.get(issue.shortId);
      if (existingShortIdOwner && existingShortIdOwner !== issue.id) {
        throw new Error(
          `Sentry returned conflicting identity for ${issue.shortId}`,
        );
      }
      const existing = byId.get(issue.id);
      if (existing && existing.shortId !== issue.shortId) {
        throw new Error(
          `Sentry returned conflicting short id for issue ${issue.id}`,
        );
      }
      byId.set(issue.id, issue);
      byShortId.set(issue.shortId, issue.id);
    }
  }
  return [...byId.values()].sort((a, b) => a.shortId.localeCompare(b.shortId));
}

export class DenoSentryCommandRunner implements SentryCommandRunner {
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
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            // The process may have completed after graceful termination.
          }
        }, 1_000);
      } catch {
        // The process may have completed between the timer and kill.
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
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
    }
  }
}

async function resolveGitCurrentRelease(repoDir: string): Promise<string> {
  const result = await new Deno.Command("git", {
    args: ["rev-parse", "HEAD"],
    cwd: repoDir,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  const revision = new TextDecoder().decode(result.stdout).trim();
  if (result.code !== 0 || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(
      "Unable to resolve the current Git release for Sentry intake",
    );
  }
  return `supers@${revision}`;
}

export const DEFAULT_SENTRY_ISSUE_INTAKE_DEPENDENCIES:
  SentryIssueIntakeDependencies = {
    commandRunner: new DenoSentryCommandRunner(),
    now: () => new Date().toISOString(),
    resolveCurrentRelease: resolveGitCurrentRelease,
  };

export async function executeSentryIssueIntake(
  rawArgs: SentryIssueIntakeArgs,
  context: SentryIssueIntakeContext,
  dependencies: SentryIssueIntakeDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryIssueIntakeArgsSchema.parse(rawArgs);
  const nowMilliseconds = dependencies.nowMilliseconds ?? Date.now;
  const deadlineMilliseconds = nowMilliseconds() + SENTRY_INTAKE_TIMEOUT_MS;
  const currentRelease = args.currentRelease === "auto"
    ? await (dependencies.resolveCurrentRelease ?? resolveGitCurrentRelease)(
      context.repoDir,
    )
    : args.currentRelease;
  const resolvedArgs = { ...args, currentRelease };
  const target = context.globalArgs.target ?? "scott-tolinski-projects/supers";
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(target)) {
    throw new TypeError("Invalid Sentry target");
  }
  const history = await fetchIssues(
    dependencies.commandRunner,
    context,
    deadlineMilliseconds,
    nowMilliseconds,
    target,
    "is:unresolved",
    args.historyDays,
    args.limit,
  );
  const recent = await fetchIssues(
    dependencies.commandRunner,
    context,
    deadlineMilliseconds,
    nowMilliseconds,
    target,
    `is:unresolved lastSeen:-${args.lookbackDays}d`,
    args.lookbackDays,
    args.limit,
  );
  const release = currentRelease
    ? await fetchIssues(
      dependencies.commandRunner,
      context,
      deadlineMilliseconds,
      nowMilliseconds,
      target,
      `is:unresolved release:${currentRelease}`,
      args.historyDays,
      args.limit,
    )
    : { data: [], hasMore: false, hasPrev: false };
  const firstSeenByIssueId = await fetchIssueFirstSeen(
    dependencies.commandRunner,
    context,
    deadlineMilliseconds,
    nowMilliseconds,
    [history, recent, release],
  );
  const issues = uniqueIssues([history, recent, release], firstSeenByIssueId);
  const recentIds = new Set(recent.data.map((issue) => String(issue.id)));
  const releaseIds = new Set(release.data.map((issue) => String(issue.id)));
  const complete = !history.hasMore && !recent.hasMore && !release.hasMore;
  const capturedAt = dependencies.now();
  const fingerprint = await createSentrySha256(
    JSON.stringify({
      target,
      args: resolvedArgs,
      capturedAt,
      issues,
      recentIds: [...recentIds].sort(),
      releaseIds: [...releaseIds].sort(),
      complete,
    }),
  );
  const snapshotName = `sentry-issue-snapshot-${fingerprint}`;
  const snapshot = SentryIssueSnapshotSchema.parse({
    source: "sentry-cli",
    target,
    capturedAt,
    lookbackDays: args.lookbackDays,
    historyDays: args.historyDays,
    limit: args.limit,
    currentRelease: currentRelease ?? null,
    complete,
    coverage: {
      historyHasMore: history.hasMore,
      recentHasMore: recent.hasMore,
      releaseHasMore: release.hasMore,
    },
    issues,
    recentIssueIds: [...recentIds].sort(),
    currentReleaseIssueIds: [...releaseIds].sort(),
    fingerprint,
  });
  const snapshotHandle = await context.writeResource(
    "snapshot",
    snapshotName,
    snapshot,
  );
  const items = issues.map((issue) => {
    const disposition = !complete
      ? "ambiguous" as const
      : releaseIds.has(issue.id)
      ? "current-release" as const
      : recentIds.has(issue.id)
      ? "recent" as const
      : "historical-unresolved" as const;
    const queueIntent = !complete
      ? null
      : disposition === "current-release"
      ? "confirmed-repair" as const
      : disposition === "recent"
      ? "reproduction-required" as const
      : null;
    return {
      ...issue,
      disposition,
      queueIntent,
    };
  });
  const reconciliationBase = {
    sourceSnapshot: snapshotName,
    sourceFingerprint: fingerprint,
    generatedAt: capturedAt,
    automationEligible: complete,
    items,
  };
  const reconciliation = SentryIssueReconciliationSchema.parse({
    ...reconciliationBase,
    fingerprint: await createSentrySha256(canonicalSentryJson({
      sourceSnapshot: reconciliationBase.sourceSnapshot,
      sourceFingerprint: reconciliationBase.sourceFingerprint,
      automationEligible: reconciliationBase.automationEligible,
      items: reconciliationBase.items,
    })),
  });
  const reconciliationHandle = await context.writeResource(
    "reconciliation",
    `sentry-issue-reconciliation-${fingerprint}`,
    reconciliation,
  );
  context.logger.info("Stored bounded Sentry issue intake", {
    issueCount: issues.length,
    complete,
  });
  return { dataHandles: [snapshotHandle, reconciliationHandle] };
}
