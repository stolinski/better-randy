import { z } from "npm:zod@4.4.3";

import {
  canonicalSentryJson,
  createSentrySha256,
  SentryIssueQueueIntentSchema,
  SentryIssueReconciliationSchema,
} from "./sentry-issue-intake-adapter.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IdSchema = z.string().min(1).max(100);

export const SentryDexTriageArgsSchema = z.object({
  sourceReconciliation: z.string().min(1).max(180),
  expectedFingerprint: FingerprintSchema,
});
export type SentryDexTriageArgs = z.infer<typeof SentryDexTriageArgsSchema>;

export const SentryDexTaskSchema = z.object({
  id: IdSchema,
  parent_id: IdSchema.nullable(),
  name: z.string().max(500),
  description: z.string().max(50_000),
  priority: z.number().int(),
  completed: z.boolean(),
  result: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  blockedBy: z.array(
    z.union([IdSchema, z.object({ id: IdSchema }).passthrough()]),
  ),
  blocks: z.array(
    z.union([IdSchema, z.object({ id: IdSchema }).passthrough()]),
  ),
  children: z.array(
    z.union([IdSchema, z.object({ id: IdSchema }).passthrough()]),
  ),
}).passthrough();

export type SentryDexTask = z.infer<typeof SentryDexTaskSchema>;

const SentryDexTriageItemSchema = z.object({
  issueId: IdSchema,
  shortId: IdSchema,
  queueIntent: SentryIssueQueueIntentSchema.nullable(),
  quarantineReason: z.enum([
    "multiple-exact-matches",
    "completed-exact-match",
    "lexical-review",
    "ambiguous-source",
  ]).nullable(),
  recommendation: z.enum([
    "attach-existing",
    "create-task",
    "reproduce-first",
    "human-review",
    "ignore",
  ]),
  exactMatchTaskIds: z.array(IdSchema),
  lexicalMatchTaskIds: z.array(IdSchema).max(5),
  ancestorTaskIds: z.array(IdSchema),
  descendantTaskIds: z.array(IdSchema),
  reasons: z.array(z.string().min(1).max(160)),
});

export const SentryDexTriageSchema = z.object({
  sourceReconciliation: z.string().min(1),
  sourceFingerprint: FingerprintSchema,
  sourceReconciliationFingerprint: FingerprintSchema,
  generatedAt: z.string().datetime(),
  dexTaskCount: z.number().int().nonnegative(),
  activeTaskIds: z.array(IdSchema),
  queueEligible: z.boolean(),
  executionCapacity: z.enum(["available", "deferred-active-wip"]),
  blockingReasons: z.array(z.enum([
    "source-ineligible",
    "multiple-exact-matches",
    "completed-exact-match",
    "lexical-review",
    "ambiguous-source",
  ])),
  items: z.array(SentryDexTriageItemSchema).max(100).superRefine(
    (items, context) => {
      for (const key of ["issueId", "shortId"] as const) {
        const values = items.map((item) => item[key].toLowerCase());
        if (new Set(values).size !== values.length) {
          context.addIssue({
            code: "custom",
            message: `Triage ${key} values must be unique`,
          });
        }
      }
    },
  ),
  fingerprint: FingerprintSchema,
});

export type SentryDexCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};
export interface SentryDexCommandRunner {
  run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryDexCommandResult>;
}
export type SentryDexTriageContext = {
  repoDir: string;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
    warning: (message: string, properties?: Record<string, unknown>) => void;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
};
export type SentryDexTriageDependencies = {
  commandRunner: SentryDexCommandRunner;
  now: () => string;
};

export class DenoDexListCommandRunner implements SentryDexCommandRunner {
  async run(
    args: readonly string[],
    cwd: string,
    timeoutMs: number,
  ): Promise<SentryDexCommandResult> {
    const child = new Deno.Command("dex", {
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
      } catch { /* process already exited */ }
    }, timeoutMs);
    try {
      const result = await child.output();
      if (timedOut) {
        throw new Error(`dex command timed out after ${timeoutMs}ms`);
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

export const DEFAULT_SENTRY_DEX_TRIAGE_DEPENDENCIES:
  SentryDexTriageDependencies = {
    commandRunner: new DenoDexListCommandRunner(),
    now: () => new Date().toISOString(),
  };

function relationIds(values: Array<string | { id: string }>): string[] {
  return values.map((value) => typeof value === "string" ? value : value.id);
}

function containsExactSentryId(value: string, shortId: string): boolean {
  const escaped = shortId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9_-])${escaped}(?:$|[^A-Za-z0-9_-])`, "i")
    .test(value);
}

function significantTokens(value: string): Set<string> {
  const stop = new Set([
    "error",
    "typeerror",
    "referenceerror",
    "failed",
    "failure",
    "undefined",
    "cannot",
    "could",
    "with",
    "from",
    "into",
    "reading",
    "already",
    "been",
    "the",
    "and",
    "for",
    "has",
  ]);
  return new Set(
    (value.toLowerCase().match(/[a-z0-9_-]{3,}/g) ?? []).filter((token) =>
      !stop.has(token)
    ),
  );
}

function sentryDexTaskSearchText(task: SentryDexTask): string {
  return `${task.name}\n${task.description}\n${task.result ?? ""}`;
}

function lexicalScore(title: string, task: SentryDexTask): number {
  const issueTokens = significantTokens(title);
  if (issueTokens.size === 0) return 0;
  const taskTokens = significantTokens(sentryDexTaskSearchText(task));
  let overlap = 0;
  for (const token of issueTokens) if (taskTokens.has(token)) overlap += 1;
  return overlap / issueTokens.size;
}

export function findSentryDexTaskMatches(
  shortId: string,
  title: string,
  tasks: SentryDexTask[],
): {
  exact: SentryDexTask[];
  openExact: SentryDexTask[];
  completedExact: SentryDexTask[];
  lexical: SentryDexTask[];
} {
  const exact = tasks.filter((task) =>
    containsExactSentryId(sentryDexTaskSearchText(task), shortId)
  );
  return {
    exact,
    openExact: exact.filter((task) => !task.completed),
    completedExact: exact.filter((task) => task.completed),
    lexical: exact.length > 0 ? [] : tasks
      .filter((task) => !task.completed && lexicalScore(title, task) >= 0.6)
      .sort((left, right) =>
        lexicalScore(title, right) - lexicalScore(title, left) ||
        left.id.localeCompare(right.id)
      )
      .slice(0, 5),
  };
}

function graphContext(taskIds: string[], tasks: SentryDexTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ancestors = new Set<string>();
  const descendants = new Set<string>();
  for (const id of taskIds) {
    let current = byId.get(id)?.parent_id ?? null;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      ancestors.add(current);
      current = byId.get(current)?.parent_id ?? null;
    }
    const queue = [
      ...(byId.get(id) ? relationIds(byId.get(id)!.children) : []),
      ...tasks.filter((task) => task.parent_id === id).map((task) => task.id),
    ];
    while (queue.length > 0) {
      const child = queue.shift()!;
      if (descendants.has(child)) continue;
      descendants.add(child);
      const childTask = byId.get(child);
      if (childTask) {
        queue.push(...relationIds(childTask.children));
        queue.push(
          ...tasks.filter((task) => task.parent_id === child).map((task) =>
            task.id
          ),
        );
      }
    }
  }
  return {
    ancestorTaskIds: [...ancestors].sort(),
    descendantTaskIds: [...descendants].sort(),
  };
}

export function createSentryDexTriageFingerprint(
  value: Omit<
    z.infer<typeof SentryDexTriageSchema>,
    "generatedAt" | "fingerprint"
  >,
): Promise<string> {
  return createSentrySha256(canonicalSentryJson(value));
}

export async function executeSentryDexTriage(
  rawArgs: SentryDexTriageArgs,
  context: SentryDexTriageContext,
  dependencies: SentryDexTriageDependencies,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = SentryDexTriageArgsSchema.parse(rawArgs);
  const sourceRaw = await context.readResource(args.sourceReconciliation);
  if (!sourceRaw) {
    throw new Error(
      `Missing named Sentry reconciliation ${args.sourceReconciliation}`,
    );
  }
  const source = SentryIssueReconciliationSchema.parse(sourceRaw);
  if (source.sourceFingerprint !== args.expectedFingerprint) {
    throw new Error("Sentry reconciliation fingerprint mismatch");
  }

  const command = await dependencies.commandRunner.run(
    ["list", "--all", "--json"],
    context.repoDir,
    20_000,
  );
  if (command.code !== 0) {
    throw new Error(`dex list failed with exit ${command.code}`);
  }
  let tasks: SentryDexTask[];
  try {
    tasks = z.array(SentryDexTaskSchema).max(2_000).parse(
      JSON.parse(command.stdout),
    );
  } catch {
    throw new Error("dex list returned malformed or out-of-contract JSON");
  }

  const activeTaskIds = tasks.filter((task) =>
    !task.completed && task.started_at !== null
  ).map((task) => task.id).sort();
  const globalReasons = new Set<
    z.infer<typeof SentryDexTriageSchema>["blockingReasons"][number]
  >();
  if (!source.automationEligible) globalReasons.add("source-ineligible");

  const items = source.items.map((issue) => {
    const { exact, openExact, completedExact, lexical } =
      findSentryDexTaskMatches(issue.shortId, issue.title, tasks);
    let recommendation:
      | "attach-existing"
      | "create-task"
      | "reproduce-first"
      | "human-review"
      | "ignore" = "ignore";
    let quarantineReason:
      | "multiple-exact-matches"
      | "completed-exact-match"
      | "lexical-review"
      | "ambiguous-source"
      | null = null;
    const reasons: string[] = [];
    if (issue.disposition === "ambiguous") {
      recommendation = "human-review";
      reasons.push("Sentry source classification is ambiguous");
      quarantineReason = "ambiguous-source";
    } else if (issue.queueIntent !== null) {
      if (openExact.length === 1 && completedExact.length === 0) {
        recommendation = "attach-existing";
        reasons.push("One exact open Dex task references the Sentry short id");
      } else if (exact.length > 1) {
        recommendation = "human-review";
        reasons.push("Multiple Dex tasks reference the Sentry short id");
        quarantineReason = "multiple-exact-matches";
      } else if (completedExact.length === 1) {
        recommendation = "human-review";
        reasons.push(
          "A completed Dex task references the unresolved Sentry issue",
        );
        quarantineReason = "completed-exact-match";
      } else if (lexical.length > 0) {
        recommendation = "human-review";
        reasons.push("Possible lexical duplicate requires review");
        quarantineReason = "lexical-review";
      } else if (issue.queueIntent === "reproduction-required") {
        recommendation = "reproduce-first";
        reasons.push(
          "Recent issue needs bounded reproduction on the current checkout",
        );
      } else {
        recommendation = "create-task";
        reasons.push("No exact or lexical Dex match found");
      }
    } else {
      reasons.push(
        "Historical unresolved issue is not actionable without new evidence",
      );
    }
    const exactIds = exact.map((task) => task.id).sort();
    return {
      issueId: issue.id,
      shortId: issue.shortId,
      queueIntent: issue.queueIntent,
      quarantineReason,
      recommendation,
      exactMatchTaskIds: exactIds,
      lexicalMatchTaskIds: lexical.map((task) => task.id),
      ...graphContext(exactIds, tasks),
      reasons,
    };
  });
  // Triage is a deterministic derivation of one immutable reconciliation.
  // Replays retain the source observation time instead of minting a new body
  // under the same fingerprint-derived resource name.
  const generatedAt = source.generatedAt;
  const queueEligible = source.automationEligible && globalReasons.size === 0 &&
    items.some((item) =>
      item.recommendation === "create-task" ||
      item.recommendation === "attach-existing" ||
      item.recommendation === "reproduce-first"
    );
  const reportBase = {
    sourceReconciliation: args.sourceReconciliation,
    sourceFingerprint: source.sourceFingerprint,
    sourceReconciliationFingerprint: source.fingerprint,
    generatedAt,
    dexTaskCount: tasks.length,
    activeTaskIds,
    queueEligible,
    executionCapacity: activeTaskIds.length === 0
      ? "available" as const
      : "deferred-active-wip" as const,
    blockingReasons: [...globalReasons].sort(),
    items,
  };
  const fingerprint = await createSentryDexTriageFingerprint({
    sourceReconciliation: reportBase.sourceReconciliation,
    sourceFingerprint: reportBase.sourceFingerprint,
    sourceReconciliationFingerprint: reportBase.sourceReconciliationFingerprint,
    dexTaskCount: reportBase.dexTaskCount,
    activeTaskIds: reportBase.activeTaskIds,
    queueEligible: reportBase.queueEligible,
    executionCapacity: reportBase.executionCapacity,
    blockingReasons: reportBase.blockingReasons,
    items: reportBase.items,
  });
  const report = SentryDexTriageSchema.parse({ ...reportBase, fingerprint });
  const handle = await context.writeResource(
    "triage",
    `sentry-dex-triage-${fingerprint}`,
    report,
  );
  context.logger.info("Stored Sentry-to-Dex triage", {
    issueCount: items.length,
    queueEligible: report.queueEligible,
    executionCapacity: report.executionCapacity,
  });
  return { dataHandles: [handle] };
}
