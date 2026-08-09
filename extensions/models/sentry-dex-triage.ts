import { z } from "npm:zod@4.4.3";

import { SentryIssueReconciliationSchema } from "./sentry-issue-intake-adapter.ts";

const FingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const IdSchema = z.string().min(1).max(100);

export const SentryDexTriageArgsSchema = z.object({
  sourceReconciliation: z.string().min(1).max(180),
  expectedFingerprint: FingerprintSchema,
});
export type SentryDexTriageArgs = z.infer<typeof SentryDexTriageArgsSchema>;

const DexTaskSchema = z.object({
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

export const SentryDexTriageSchema = z.object({
  sourceReconciliation: z.string().min(1),
  sourceFingerprint: FingerprintSchema,
  generatedAt: z.string().datetime(),
  dexTaskCount: z.number().int().nonnegative(),
  activeTaskIds: z.array(IdSchema),
  automationEligible: z.boolean(),
  blockingReasons: z.array(z.enum([
    "source-ineligible",
    "active-wip",
    "multiple-exact-matches",
    "completed-exact-match",
    "lexical-review",
    "reproduction-required",
    "ambiguous-source",
  ])),
  items: z.array(z.object({
    issueId: IdSchema,
    shortId: IdSchema,
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
  })).max(100),
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

function lexicalScore(
  title: string,
  task: z.infer<typeof DexTaskSchema>,
): number {
  const issueTokens = significantTokens(title);
  if (issueTokens.size === 0) return 0;
  const taskTokens = significantTokens(`${task.name} ${task.description}`);
  let overlap = 0;
  for (const token of issueTokens) if (taskTokens.has(token)) overlap += 1;
  return overlap / issueTokens.size;
}

function graphContext(
  taskIds: string[],
  tasks: z.infer<typeof DexTaskSchema>[],
) {
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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
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
  let tasks: z.infer<typeof DexTaskSchema>[];
  try {
    tasks = z.array(DexTaskSchema).max(2_000).parse(JSON.parse(command.stdout));
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
  if (activeTaskIds.length > 0) globalReasons.add("active-wip");

  const items = source.items.map((issue) => {
    const exact = tasks.filter((task) =>
      containsExactSentryId(`${task.name}\n${task.description}`, issue.shortId)
    );
    const openExact = exact.filter((task) => !task.completed);
    const completedExact = exact.filter((task) => task.completed);
    const lexical = exact.length > 0 ? [] : tasks
      .filter((task) =>
        !task.completed && lexicalScore(issue.title, task) >= 0.6
      )
      .sort((a, b) =>
        lexicalScore(issue.title, b) - lexicalScore(issue.title, a) ||
        a.id.localeCompare(b.id)
      )
      .slice(0, 5);
    let recommendation:
      | "attach-existing"
      | "create-task"
      | "reproduce-first"
      | "human-review"
      | "ignore" = "ignore";
    const reasons: string[] = [];
    if (issue.disposition === "ambiguous") {
      recommendation = "human-review";
      reasons.push("Sentry source classification is ambiguous");
      globalReasons.add("ambiguous-source");
    } else if (issue.requiresReproduction) {
      recommendation = "reproduce-first";
      reasons.push("Recent issue is not attributed to the current release");
      globalReasons.add("reproduction-required");
    } else if (issue.repairCandidate) {
      if (openExact.length === 1 && completedExact.length === 0) {
        recommendation = "attach-existing";
        reasons.push("One exact open Dex task references the Sentry short id");
      } else if (exact.length > 1) {
        recommendation = "human-review";
        reasons.push("Multiple Dex tasks reference the Sentry short id");
        globalReasons.add("multiple-exact-matches");
      } else if (completedExact.length === 1) {
        recommendation = "human-review";
        reasons.push(
          "A completed Dex task references the current-release issue",
        );
        globalReasons.add("completed-exact-match");
      } else if (lexical.length > 0) {
        recommendation = "human-review";
        reasons.push("Possible lexical duplicate requires review");
        globalReasons.add("lexical-review");
      } else {
        recommendation = "create-task";
        reasons.push("No exact or lexical Dex match found");
      }
    } else {reasons.push(
        "Historical unresolved issue is not actionable without new evidence",
      );}
    const exactIds = exact.map((task) => task.id).sort();
    return {
      issueId: issue.id,
      shortId: issue.shortId,
      recommendation,
      exactMatchTaskIds: exactIds,
      lexicalMatchTaskIds: lexical.map((task) => task.id),
      ...graphContext(exactIds, tasks),
      reasons,
    };
  });
  const generatedAt = dependencies.now();
  const reportBase = {
    sourceReconciliation: args.sourceReconciliation,
    sourceFingerprint: source.sourceFingerprint,
    generatedAt,
    dexTaskCount: tasks.length,
    activeTaskIds,
    automationEligible: globalReasons.size === 0,
    blockingReasons: [...globalReasons].sort(),
    items,
  };
  const fingerprint = await sha256(JSON.stringify({
    sourceReconciliation: reportBase.sourceReconciliation,
    sourceFingerprint: reportBase.sourceFingerprint,
    dexTaskCount: reportBase.dexTaskCount,
    activeTaskIds: reportBase.activeTaskIds,
    automationEligible: reportBase.automationEligible,
    blockingReasons: reportBase.blockingReasons,
    items: reportBase.items,
  }));
  const report = SentryDexTriageSchema.parse({ ...reportBase, fingerprint });
  const handle = await context.writeResource(
    "triage",
    `sentry-dex-triage-${fingerprint}`,
    report,
  );
  context.logger.info("Stored Sentry-to-Dex triage", {
    issueCount: items.length,
    automationEligible: report.automationEligible,
  });
  return { dataHandles: [handle] };
}
