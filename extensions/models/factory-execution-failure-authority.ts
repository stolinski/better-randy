/** Trusted owner for operational failures used by the Supers Delivery Factory. */
import { parse as parseYaml } from "jsr:@std/yaml@1.0.10";
import { z } from "npm:zod@4.4.3";

const StageSchema = z.enum([
  "preflight",
  "implementation",
  "classify",
  "verification",
  "review",
  "aesthetic-decision-binding",
  "reconciliation",
  "postflight",
  "terminal-cleanup",
  "done-observability",
  "aborted-observability",
  "escalated-observability",
]);
const OperationalCategorySchema = z.enum([
  "prerequisite",
  "tool-unavailable",
  "workflow-failed",
  "method-failed",
]);
const FixedOperationSchema = z.enum([
  "git-clean",
  "dex-readable",
  "node-zod-resolution",
  "swamp-available",
  "pi-available",
]);

export const ExecuteFactoryFailureBoundaryArgsSchema = z.object({
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  dispatchRunId: z.string().regex(/^[0-9a-f]{64}$/),
  category: z.enum(["prerequisite", "tool-unavailable"]),
  operation: FixedOperationSchema,
  retryable: z.boolean(),
});

export const ExecuteFactoryWorkBoundaryArgsSchema = z.object({
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  dispatchRunId: z.string().regex(/^[0-9a-f]{64}$/),
  retryable: z.boolean(),
});

export const AuthorizeFactoryFailureArgsSchema = z.object({
  receiptName: z.string().regex(/^factory-execution-failure-[0-9a-f]{64}$/),
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  dispatchRunId: z.string().regex(/^[0-9a-f]{64}$/),
});

const FactoryDispatchBoundaryClaimFields = {
  claimDigest: z.string().regex(/^[0-9a-f]{64}$/),
  executionDigest: z.string().regex(/^[0-9a-f]{64}$/),
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  dispatchRunId: z.string().regex(/^[0-9a-f]{64}$/),
  startedAt: z.string().datetime(),
};
const LegacyFactoryDispatchBoundaryClaimBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  ...FactoryDispatchBoundaryClaimFields,
});
const CurrentFactoryDispatchBoundaryClaimBaseSchema = z.strictObject({
  schemaVersion: z.literal(2),
  factoryStartedAt: z.string().datetime(),
  ...FactoryDispatchBoundaryClaimFields,
});
const LegacyFactoryDispatchBoundaryClaimSchema = z.discriminatedUnion("state", [
  LegacyFactoryDispatchBoundaryClaimBaseSchema.extend({
    state: z.literal("started"),
  }),
  LegacyFactoryDispatchBoundaryClaimBaseSchema.extend({
    state: z.literal("succeeded"),
    completedAt: z.string().datetime(),
    resultDigest: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  LegacyFactoryDispatchBoundaryClaimBaseSchema.extend({
    state: z.literal("failed"),
    completedAt: z.string().datetime(),
    resultDigest: z.string().regex(/^[0-9a-f]{64}$/),
  }),
]);
const CurrentFactoryDispatchBoundaryClaimSchema = z.discriminatedUnion(
  "state",
  [
    CurrentFactoryDispatchBoundaryClaimBaseSchema.extend({
      state: z.literal("started"),
    }),
    CurrentFactoryDispatchBoundaryClaimBaseSchema.extend({
      state: z.literal("succeeded"),
      completedAt: z.string().datetime(),
      resultDigest: z.string().regex(/^[0-9a-f]{64}$/),
    }),
    CurrentFactoryDispatchBoundaryClaimBaseSchema.extend({
      state: z.literal("failed"),
      completedAt: z.string().datetime(),
      resultDigest: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ],
);
export const FactoryDispatchBoundaryClaimSchema = z.union([
  CurrentFactoryDispatchBoundaryClaimSchema,
  LegacyFactoryDispatchBoundaryClaimSchema,
]);

const FactoryAuthorityReceiptFields = {
  receiptDigest: z.string().regex(/^[0-9a-f]{64}$/),
  sourceFactoryId: z.string().uuid(),
  workItem: z.string().min(1),
  stage: StageSchema,
  stageCycle: z.number().int().positive(),
  dispatchAttempt: z.number().int().positive(),
  dispatchRunId: z.string().regex(/^[0-9a-f]{64}$/),
  failureKind: z.literal("operational"),
  category: OperationalCategorySchema,
  retryable: z.boolean(),
  error: z.string().min(1).max(2000),
  occurredAt: z.string().datetime(),
  authorityWorkflow: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  authorityReceiptName: z.string().regex(
    /^factory-execution-failure-[0-9a-f]{64}$/,
  ),
  authorityDigest: z.string().regex(/^[0-9a-f]{64}$/),
  executionReceipt: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("command"),
      receiptId: z.string().min(1),
      status: z.literal("failed"),
      operation: z.string().min(1),
      command: z.string().min(1),
      exitCode: z.number().int(),
      stdoutDigest: z.string().regex(/^[0-9a-f]{64}$/),
      stderrDigest: z.string().regex(/^[0-9a-f]{64}$/),
    }),
    z.strictObject({
      kind: z.literal("workflow"),
      receiptId: z.string().min(1),
      status: z.literal("failed"),
      workflowName: z.string().min(1),
      workflowRunId: z.string().min(1),
      inputsDigest: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ]),
};
const LegacyFactoryAuthorityReceiptSchema = z.strictObject({
  schemaVersion: z.literal(5),
  ...FactoryAuthorityReceiptFields,
});
const CurrentFactoryAuthorityReceiptSchema = z.strictObject({
  schemaVersion: z.literal(6),
  factoryStartedAt: z.string().datetime(),
  ...FactoryAuthorityReceiptFields,
});
export const FactoryAuthorityReceiptSchema = z.union([
  CurrentFactoryAuthorityReceiptSchema,
  LegacyFactoryAuthorityReceiptSchema,
]);

export type FactoryFailureCommandResult = {
  success: boolean;
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
};

export type FactoryFailureAuthorityContext = {
  dataRepository: {
    getContent: (
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ) => Promise<Uint8Array | null>;
    listVersions?: (
      type: unknown,
      modelId: string,
      dataName: string,
    ) => Promise<number[]>;
  };
  readResource: (name: string) => Promise<Record<string, unknown> | null>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
  logger: {
    info: (message: string, properties?: Record<string, unknown>) => void;
  };
  globalArgs: {
    sourceFactoryId: string;
    adapters?: { failureAuthorizer?: { workflow?: string } };
  };
  repoDir: string;
  now?: () => Date;
  readWorkflowRun?: (
    workflowId: string,
    workflowRunId: string,
  ) => Promise<unknown>;
  runCommand?: (
    command: string,
    args: readonly string[],
  ) => Promise<FactoryFailureCommandResult>;
};

type Identity = {
  sourceFactoryId: string;
  workItem: string;
  stage: z.infer<typeof StageSchema>;
  stageCycle: number;
  dispatchAttempt: number;
  dispatchRunId: string;
};

type CurrentWork =
  | {
    mode: "workflow";
    workflow: { name: string; inputs: Record<string, unknown> };
  }
  | {
    mode: "method";
    method: {
      modelIdOrName: string;
      methodName: string;
      inputs: Record<string, unknown>;
    };
  }
  | { mode: "dispatch" }
  | { mode: "interactive" };

function canonicalize(value: unknown): unknown {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  throw new TypeError(`Unsupported authority value: ${typeof value}`);
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function configuredFailureAuthorizerWorkflow(
  context: FactoryFailureAuthorityContext,
): string {
  return z
    .string()
    .regex(/^[a-z][a-z0-9_-]*$/)
    .parse(context.globalArgs.adapters?.failureAuthorizer?.workflow);
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const input = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  const bytes = await crypto.subtle.digest("SHA-256", input.buffer);
  return [...new Uint8Array(bytes)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function readJsonResource(
  identity: Identity,
  context: FactoryFailureAuthorityContext,
  name: string,
  version?: number,
): Promise<unknown> {
  const configuredSourceFactoryId = z.string().uuid().parse(
    context.globalArgs.sourceFactoryId,
  );
  if (identity.sourceFactoryId !== configuredSourceFactoryId) {
    throw new Error(
      "Failure authority does not target its configured Factory.",
    );
  }
  const content = await context.dataRepository.getContent(
    "@swamp/software-factory",
    configuredSourceFactoryId,
    name,
    version,
  );
  if (content === null) {
    throw new Error(`Factory ${name} is unavailable for failure authority.`);
  }
  return JSON.parse(new TextDecoder().decode(content)) as unknown;
}

function factoryWorkItemSlug(workItem: string): string {
  const sanitized = workItem
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/^[-.]+|[-.]+$/g, "")
    .slice(0, 48);
  if (sanitized === workItem) return workItem;
  let hash = 0x811c9dc5;
  for (let index = 0; index < workItem.length; index += 1) {
    hash ^= workItem.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const suffix = hash.toString(16).padStart(8, "0");
  return sanitized.length > 0 ? `${sanitized}-${suffix}` : suffix;
}

async function requireCurrentDispatch(
  identity: Identity,
  context: FactoryFailureAuthorityContext,
): Promise<string> {
  const state = z
    .object({
      workItem: z.string(),
      stageId: z.string(),
      cycles: z.record(z.string(), z.number().int()),
      dispatches: z.record(
        z.string(),
        z.object({ cycle: z.number().int(), count: z.number().int() }),
      ),
      startedAt: z.string().datetime(),
    })
    .parse(
      await readJsonResource(identity, context, `state-${identity.workItem}`),
    );
  const dispatch = state.dispatches[identity.stage];
  if (
    state.workItem !== identity.workItem ||
    state.stageId !== identity.stage ||
    state.cycles[identity.stage] !== identity.stageCycle ||
    dispatch?.cycle !== identity.stageCycle ||
    dispatch.count !== identity.dispatchAttempt
  ) {
    throw new Error(
      "Failure authority does not match the current Factory dispatch.",
    );
  }
  if (context.dataRepository.listVersions === undefined) {
    throw new Error(
      "Failure authority cannot inspect the exact current Factory dispatch run.",
    );
  }
  const journalName = `journal-${factoryWorkItemSlug(identity.workItem)}`;
  const factoryTypePath = {
    toDirectoryPath: (): string => "@swamp/software-factory",
    toString: (): string => "@swamp/software-factory",
  };
  const versions = await context.dataRepository.listVersions(
    factoryTypePath,
    identity.sourceFactoryId,
    journalName,
  );
  const latestVersion = versions.toSorted((left, right) => right - left).at(0);
  if (latestVersion === undefined) {
    throw new Error(
      "Failure authority cannot inspect the exact current Factory dispatch run.",
    );
  }
  const latestDispatch = z
    .object({
      event: z.literal("dispatched"),
      workItem: z.literal(identity.workItem),
      stageId: z.literal(identity.stage),
      payload: z.object({
        stageId: z.literal(identity.stage),
        cycle: z.literal(identity.stageCycle),
        attempt: z.literal(identity.dispatchAttempt),
        runId: z.literal(identity.dispatchRunId),
      }),
    })
    .safeParse(
      await readJsonResource(identity, context, journalName, latestVersion),
    );
  if (!latestDispatch.success) {
    throw new Error(
      "Failure authority does not match the exact current Factory dispatch run.",
    );
  }
  return state.startedAt;
}

async function requireCurrentWork(
  identity: Identity,
  context: FactoryFailureAuthorityContext,
): Promise<CurrentWork> {
  await requireCurrentDispatch(identity, context);
  const status = z
    .object({
      workItem: z.string(),
      stage: z.object({ id: z.string(), cycle: z.number().int() }),
      dispatch: z.object({ attempts: z.number().int() }),
      work: z.unknown(),
    })
    .parse(
      await readJsonResource(identity, context, `status-${identity.workItem}`),
    );
  if (
    status.workItem !== identity.workItem ||
    status.stage.id !== identity.stage ||
    status.stage.cycle !== identity.stageCycle ||
    status.dispatch.attempts !== identity.dispatchAttempt
  ) {
    throw new Error("Factory status does not match the current dispatch.");
  }
  return z
    .discriminatedUnion("mode", [
      z
        .strictObject({
          mode: z.literal("workflow"),
          workflow: z.strictObject({
            name: z.string().min(1),
            inputs: z.record(z.string(), z.unknown()),
          }),
        })
        .passthrough(),
      z
        .strictObject({
          mode: z.literal("method"),
          method: z.strictObject({
            modelIdOrName: z.string().min(1),
            methodName: z.string().min(1),
            inputs: z.record(z.string(), z.unknown()),
          }),
        })
        .passthrough(),
      z.strictObject({ mode: z.literal("dispatch") }).passthrough(),
      z.strictObject({ mode: z.literal("interactive") }).passthrough(),
    ])
    .parse(status.work) as CurrentWork;
}

const FIXED_OPERATIONS: Record<
  z.infer<typeof FixedOperationSchema>,
  {
    category: "prerequisite" | "tool-unavailable";
    command: string;
    args: readonly string[];
  }
> = {
  "git-clean": {
    category: "prerequisite",
    command: "git",
    args: ["status", "--porcelain=v1", "-z"],
  },
  "dex-readable": {
    category: "prerequisite",
    command: "dex",
    args: ["list", "--all", "--json"],
  },
  "node-zod-resolution": {
    category: "prerequisite",
    command: "node",
    args: ["--input-type=module", "--eval", "await import('zod')"],
  },
  "swamp-available": {
    category: "tool-unavailable",
    command: "swamp",
    args: ["--version"],
  },
  "pi-available": {
    category: "tool-unavailable",
    command: "pi",
    args: ["--version"],
  },
};

function runOwnedCommand(
  context: FactoryFailureAuthorityContext,
  command: string,
  args: readonly string[],
): Promise<FactoryFailureCommandResult> {
  if (context.runCommand !== undefined) {
    return context.runCommand(command, args);
  }
  return new Deno.Command(command, {
    args: [...args],
    cwd: context.repoDir,
    stdout: "piped",
    stderr: "piped",
  }).output();
}

async function writeOwnedFailure(
  content: Omit<
    z.infer<typeof CurrentFactoryAuthorityReceiptSchema>,
    | "receiptDigest"
    | "authorityReceiptName"
    | "authorityDigest"
    | "factoryStartedAt"
  >,
  context: FactoryFailureAuthorityContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const factoryStartedAt = await requireCurrentDispatch(content, context);
  const currentContent = { ...content, factoryStartedAt };
  const receiptDigest = await sha256(canonicalJson(currentContent));
  const authorityReceiptName = `factory-execution-failure-${receiptDigest}`;
  const receipt = FactoryAuthorityReceiptSchema.parse({
    ...currentContent,
    receiptDigest,
    authorityReceiptName,
    authorityDigest: receiptDigest,
  });
  const handle = await context.writeResource(
    "execution-failure",
    authorityReceiptName,
    receipt,
  );
  return { dataHandles: [handle] };
}

function outputText(
  output: FactoryFailureCommandResult,
): { stdout: string; stderr: string } {
  return {
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

/** Execute one code-owned prerequisite/tool probe; callers cannot supply executable text or arguments. */
export async function executeFactoryFailureBoundary(
  rawArgs: unknown,
  context: FactoryFailureAuthorityContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = ExecuteFactoryFailureBoundaryArgsSchema.parse(rawArgs);
  await requireCurrentDispatch(args, context);
  const operation = FIXED_OPERATIONS[args.operation];
  if (operation.category !== args.category) {
    throw new Error(
      "Operational category does not own the requested fixed operation.",
    );
  }
  const output = await runOwnedCommand(
    context,
    operation.command,
    operation.args,
  );
  const { stdout, stderr } = outputText(output);
  const semanticFailure = args.operation === "git-clean"
    ? !output.success || stdout.length > 0
    : args.operation === "dex-readable"
    ? !output.success ||
      (() => {
        try {
          const parsed: unknown = JSON.parse(stdout);
          return !(
            Array.isArray(parsed) ||
            (parsed !== null &&
              typeof parsed === "object" &&
              Array.isArray((parsed as { results?: unknown }).results))
          );
        } catch {
          return true;
        }
      })()
    : !output.success;
  if (!semanticFailure) {
    throw new Error("Execution succeeded; no failure receipt may be issued.");
  }
  return writeOwnedFailure(
    {
      schemaVersion: 6,
      sourceFactoryId: args.sourceFactoryId,
      workItem: args.workItem,
      stage: args.stage,
      stageCycle: args.stageCycle,
      dispatchAttempt: args.dispatchAttempt,
      dispatchRunId: args.dispatchRunId,
      failureKind: "operational",
      category: args.category,
      executionReceipt: {
        kind: "command",
        receiptId: `command:${args.operation}:${args.dispatchAttempt}`,
        status: "failed",
        operation: args.operation,
        command: [operation.command, ...operation.args].join(" "),
        exitCode: output.code,
        stdoutDigest: await sha256(stdout),
        stderrDigest: await sha256(stderr),
      },
      retryable: args.retryable,
      error: (
        stderr ||
        (args.operation === "git-clean" && stdout.length > 0
          ? "Central checkout is not clean."
          : `Command exited ${output.code}.`)
      ).slice(0, 2000),
      occurredAt: new Date().toISOString(),
      authorityWorkflow: configuredFailureAuthorizerWorkflow(context),
    },
    context,
  );
}

function inputArgs(inputs: Record<string, unknown>): string[] {
  const args: string[] = [];
  for (
    const [key, value] of Object.entries(inputs).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ) {
    args.push(
      "--input",
      `${key}=${typeof value === "string" ? value : canonicalJson(value)}`,
    );
  }
  return args;
}

const WorkflowInvocationOutputSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowName: z.string().min(1),
  status: z.literal("failed"),
});

const PersistedWorkflowRunSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowName: z.string().min(1),
  status: z.literal("failed"),
  inputs: z.record(z.string(), z.unknown()),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().optional(),
});

function now(context: FactoryFailureAuthorityContext): Date {
  return context.now?.() ?? new Date();
}

const boundaryContextLocks = new WeakMap<
  FactoryFailureAuthorityContext,
  Promise<void>
>();

async function withBoundaryContextLock<T>(
  context: FactoryFailureAuthorityContext,
  execute: () => Promise<T>,
): Promise<T> {
  const previous = boundaryContextLocks.get(context) ?? Promise.resolve();
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const current = previous.then(() => gate);
  boundaryContextLocks.set(context, current);
  await previous;
  try {
    return await execute();
  } finally {
    release();
    if (boundaryContextLocks.get(context) === current) {
      boundaryContextLocks.delete(context);
    }
  }
}

function dispatchBoundaryIdentity(identity: Identity): Record<string, unknown> {
  return {
    sourceFactoryId: identity.sourceFactoryId,
    workItem: identity.workItem,
    stage: identity.stage,
    stageCycle: identity.stageCycle,
    dispatchAttempt: identity.dispatchAttempt,
    dispatchRunId: identity.dispatchRunId,
  };
}

async function claimFactoryDispatchBoundary(
  identity: Identity,
  work: CurrentWork,
  context: FactoryFailureAuthorityContext,
): Promise<{
  name: string;
  started: z.infer<typeof FactoryDispatchBoundaryClaimSchema>;
}> {
  const exactIdentity = dispatchBoundaryIdentity(identity);
  const factoryStartedAt = await requireCurrentDispatch(identity, context);
  const claimDigest = await sha256(canonicalJson(exactIdentity));
  const name = `dispatch-boundary-${claimDigest}`;
  const rawExisting = await context.readResource(name);
  if (rawExisting !== null) {
    const existing = FactoryDispatchBoundaryClaimSchema.safeParse(rawExisting);
    if (!existing.success) {
      throw new Error(
        "Factory dispatch boundary has an invalid durable claim; use explicit human operational escalation.",
      );
    }
    const existingEpoch = existing.data.schemaVersion === 2
      ? existing.data.factoryStartedAt
      : existing.data.state === "started"
      ? existing.data.startedAt
      : existing.data.completedAt;
    if (
      existing.data.state === "started" ||
      Date.parse(existingEpoch) >= Date.parse(factoryStartedAt)
    ) {
      const disposition = existing.data.state === "started"
        ? "is already started and stale; use explicit human operational escalation"
        : `already ${existing.data.state}`;
      throw new Error(`Factory dispatch boundary ${disposition}.`);
    }
  }
  const started = FactoryDispatchBoundaryClaimSchema.parse({
    schemaVersion: 2,
    factoryStartedAt,
    claimDigest,
    executionDigest: await sha256(
      canonicalJson({ identity: exactIdentity, work }),
    ),
    ...exactIdentity,
    state: "started",
    startedAt: now(context).toISOString(),
  });
  await context.writeResource("dispatch-boundary", name, started);
  return { name, started };
}

async function finalizeFactoryDispatchBoundary(
  claim: {
    name: string;
    started: z.infer<typeof FactoryDispatchBoundaryClaimSchema>;
  },
  state: "succeeded" | "failed",
  result: unknown,
  context: FactoryFailureAuthorityContext,
): Promise<{ name: string }> {
  const handle = await context.writeResource(
    "dispatch-boundary",
    claim.name,
    FactoryDispatchBoundaryClaimSchema.parse({
      ...claim.started,
      state,
      completedAt: now(context).toISOString(),
      resultDigest: await sha256(canonicalJson(result)),
    }),
  );
  return handle;
}

async function commandResultDigestInput(
  output: FactoryFailureCommandResult,
): Promise<Record<string, unknown>> {
  return {
    code: output.code,
    success: output.success,
    stdoutDigest: await sha256(output.stdout),
    stderrDigest: await sha256(output.stderr),
  };
}

async function readExactWorkflowRun(
  context: FactoryFailureAuthorityContext,
  workflowId: string,
  workflowRunId: string,
): Promise<unknown> {
  if (context.readWorkflowRun !== undefined) {
    return context.readWorkflowRun(workflowId, workflowRunId);
  }
  const path =
    `${context.repoDir}/.swamp/workflow-runs/${workflowId}/workflow-run-${workflowRunId}.yaml`;
  return parseYaml(await Deno.readTextFile(path)) as unknown;
}

async function verifiedInvocationWorkflowRun(
  output: FactoryFailureCommandResult,
  expectedName: string,
  expectedInputs: Record<string, unknown>,
  invocationStartedAt: Date,
  invocationCompletedAt: Date,
  context: FactoryFailureAuthorityContext,
): Promise<{ runId: string }> {
  let invocationJson: unknown;
  try {
    invocationJson = JSON.parse(outputText(output).stdout) as unknown;
  } catch {
    throw new Error(
      "Failed workflow invocation returned no exact Swamp run id; use explicit human operational escalation.",
    );
  }
  const invocation = WorkflowInvocationOutputSchema.safeParse(invocationJson);
  if (!invocation.success || invocation.data.workflowName !== expectedName) {
    throw new Error(
      "Failed workflow invocation returned no exact Swamp run id; use explicit human operational escalation.",
    );
  }
  const persisted = PersistedWorkflowRunSchema.parse(
    await readExactWorkflowRun(
      context,
      invocation.data.workflowId,
      invocation.data.id,
    ),
  );
  const completedAt = persisted.completedAt ?? persisted.startedAt;
  if (
    persisted.id !== invocation.data.id ||
    persisted.workflowId !== invocation.data.workflowId ||
    persisted.workflowName !== expectedName ||
    canonicalJson(persisted.inputs) !== canonicalJson(expectedInputs) ||
    persisted.startedAt < invocationStartedAt ||
    persisted.startedAt > invocationCompletedAt ||
    completedAt < persisted.startedAt ||
    completedAt > invocationCompletedAt
  ) {
    throw new Error(
      "Exact Swamp workflow run does not match this invocation; use explicit human operational escalation.",
    );
  }
  return { runId: persisted.id };
}

/** Sole execution boundary for current workflow/method work; every dispatch is durably claimed before execution. */
export function executeFactoryWorkBoundary(
  rawArgs: unknown,
  context: FactoryFailureAuthorityContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = ExecuteFactoryWorkBoundaryArgsSchema.parse(rawArgs);
  return withBoundaryContextLock(context, async () => {
    const work = await requireCurrentWork(args, context);
    if (work.mode === "dispatch" || work.mode === "interactive") {
      throw new Error(
        "Pi/interactive failure has no trusted machine receipt; use explicit human operational escalation.",
      );
    }
    const claim = await claimFactoryDispatchBoundary(args, work, context);
    try {
      if (work.mode === "method") {
        const commandArgs = [
          "model",
          "method",
          "run",
          work.method.modelIdOrName,
          work.method.methodName,
          ...inputArgs(work.method.inputs),
        ];
        const output = await runOwnedCommand(context, "swamp", commandArgs);
        const resultDigestInput = await commandResultDigestInput(output);
        if (output.success) {
          const handle = await finalizeFactoryDispatchBoundary(
            claim,
            "succeeded",
            resultDigestInput,
            context,
          );
          return { dataHandles: [handle] };
        }
        await finalizeFactoryDispatchBoundary(
          claim,
          "failed",
          resultDigestInput,
          context,
        );
        const { stdout, stderr } = outputText(output);
        return writeOwnedFailure(
          {
            schemaVersion: 6,
            sourceFactoryId: args.sourceFactoryId,
            workItem: args.workItem,
            stage: args.stage,
            stageCycle: args.stageCycle,
            dispatchAttempt: args.dispatchAttempt,
            dispatchRunId: args.dispatchRunId,
            failureKind: "operational",
            category: "method-failed",
            executionReceipt: {
              kind: "command",
              receiptId: `method:${args.dispatchRunId}`,
              status: "failed",
              operation: "current-compiled-method",
              command: ["swamp", ...commandArgs].join(" "),
              exitCode: output.code,
              stdoutDigest: await sha256(stdout),
              stderrDigest: await sha256(stderr),
            },
            retryable: args.retryable,
            error: (stderr || `Method command exited ${output.code}.`).slice(
              0,
              2000,
            ),
            occurredAt: now(context).toISOString(),
            authorityWorkflow: configuredFailureAuthorizerWorkflow(context),
          },
          context,
        );
      }
      const workflowArgs = [
        "workflow",
        "run",
        work.workflow.name,
        ...inputArgs(work.workflow.inputs),
        "--json",
      ];
      const invocationStartedAt = now(context);
      const output = await runOwnedCommand(context, "swamp", workflowArgs);
      const invocationCompletedAt = now(context);
      const resultDigestInput = await commandResultDigestInput(output);
      if (output.success) {
        const handle = await finalizeFactoryDispatchBoundary(
          claim,
          "succeeded",
          resultDigestInput,
          context,
        );
        return { dataHandles: [handle] };
      }
      const verified = await verifiedInvocationWorkflowRun(
        output,
        work.workflow.name,
        work.workflow.inputs,
        invocationStartedAt,
        invocationCompletedAt,
        context,
      );
      await finalizeFactoryDispatchBoundary(
        claim,
        "failed",
        { ...resultDigestInput, workflowRunId: verified.runId },
        context,
      );
      const { stderr } = outputText(output);
      return writeOwnedFailure(
        {
          schemaVersion: 6,
          sourceFactoryId: args.sourceFactoryId,
          workItem: args.workItem,
          stage: args.stage,
          stageCycle: args.stageCycle,
          dispatchAttempt: args.dispatchAttempt,
          dispatchRunId: args.dispatchRunId,
          failureKind: "operational",
          category: "workflow-failed",
          executionReceipt: {
            kind: "workflow",
            receiptId: `workflow:${verified.runId}`,
            status: "failed",
            workflowName: work.workflow.name,
            workflowRunId: verified.runId,
            inputsDigest: await sha256(canonicalJson(work.workflow.inputs)),
          },
          retryable: args.retryable,
          error: (stderr || "Workflow execution failed.").slice(0, 2000),
          occurredAt: now(context).toISOString(),
          authorityWorkflow: configuredFailureAuthorizerWorkflow(context),
        },
        context,
      );
    } catch (error) {
      const current = FactoryDispatchBoundaryClaimSchema.safeParse(
        await context.readResource(claim.name),
      );
      if (current.success && current.data.state === "started") {
        await finalizeFactoryDispatchBoundary(
          claim,
          "failed",
          { error: error instanceof Error ? error.message : String(error) },
          context,
        );
      }
      throw error;
    }
  });
}

export async function authorizeFactoryFailure(
  rawArgs: unknown,
  context: FactoryFailureAuthorityContext,
): Promise<{ dataHandles: Array<{ name: string }> }> {
  const args = AuthorizeFactoryFailureArgsSchema.parse(rawArgs);
  const factoryStartedAt = await requireCurrentDispatch(args, context);
  const receipt = FactoryAuthorityReceiptSchema.parse(
    await context.readResource(args.receiptName),
  );
  const { receiptDigest, authorityReceiptName, authorityDigest, ...content } =
    receipt;
  const computed = await sha256(canonicalJson(content));
  if (
    computed !== receiptDigest ||
    authorityDigest !== receiptDigest ||
    authorityReceiptName !== args.receiptName ||
    receipt.sourceFactoryId !==
      z.string().uuid().parse(context.globalArgs.sourceFactoryId) ||
    receipt.sourceFactoryId !== args.sourceFactoryId ||
    receipt.workItem !== args.workItem ||
    receipt.stage !== args.stage ||
    receipt.stageCycle !== args.stageCycle ||
    receipt.dispatchAttempt !== args.dispatchAttempt ||
    receipt.dispatchRunId !== args.dispatchRunId ||
    receipt.schemaVersion !== 6 ||
    receipt.factoryStartedAt !== factoryStartedAt
  ) {
    throw new Error(
      "Stored execution failure receipt is stale or substituted.",
    );
  }
  const handle = await context.writeResource(
    "authorized-failure",
    `authorized-${receiptDigest}`,
    receipt,
  );
  return { dataHandles: [handle] };
}
