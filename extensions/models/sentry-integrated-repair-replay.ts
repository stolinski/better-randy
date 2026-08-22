import { z } from "npm:zod@4.4.3";

import { canonicalSentryJson, createSentrySha256 } from "./sentry-issue-intake-adapter.ts";
import { SentryIssueRepairEvidenceSchema } from "./sentry-issue-repair-evidence.ts";
import { SupersAgentIntegrationHandoffManifestSchema } from "./cli-agent-supers-worktree.ts";
import { SupersFactoryIntegrationReceiptSchema, verifySupersFactoryIntegrationReceipt } from "./supers-deterministic-factory-contract.ts";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const GitRevisionSchema = z.string().regex(/^[0-9a-f]{40}$/);
const SafeNameSchema = z.string().min(1).max(220);

export const SentryIntegratedReplayArgsSchema = z.strictObject({
  workItem: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  evidenceModelId: z.string().min(1),
  evidenceName: SafeNameSchema,
  expectedEvidenceFingerprint: Sha256Schema,
  integrationModelId: z.string().min(1),
  handoffName: SafeNameSchema,
  expectedHandoffFingerprint: Sha256Schema,
  integrationReceiptName: SafeNameSchema,
  expectedIntegrationReceiptId: Sha256Schema,
});

export const SentryIntegratedReplayReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  authority: z.literal("supers-sentry-integrated-replay-v1"),
  status: z.literal("passed"),
  workItem: z.string().min(1),
  issueId: z.string().min(1),
  shortId: z.string().min(1),
  repairIdentityFingerprint: Sha256Schema,
  evidenceName: SafeNameSchema,
  evidenceFingerprint: Sha256Schema,
  handoffName: SafeNameSchema,
  handoffFingerprint: Sha256Schema,
  integrationReceiptName: SafeNameSchema,
  integrationReceiptId: Sha256Schema,
  baseRevision: GitRevisionSchema,
  integratedRevision: GitRevisionSchema,
  integratedTreeFingerprint: Sha256Schema,
  runner: z.literal("deno-exact-v1"),
  testPath: z.string().min(1).max(500),
  exactTestName: z.string().min(10).max(300),
  testBlobDigest: Sha256Schema,
  baselineExitCodes: z.tuple([z.number().int(), z.number().int()]),
  integratedExitCodes: z.tuple([z.literal(0), z.literal(0)]),
  baselineResultDigests: z.tuple([Sha256Schema, Sha256Schema]),
  integratedResultDigests: z.tuple([Sha256Schema, Sha256Schema]),
  recordedAt: z.string().datetime(),
  fingerprint: Sha256Schema,
});

const AttemptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  workItem: z.string().min(1),
  evidenceFingerprint: Sha256Schema,
  handoffFingerprint: Sha256Schema,
  integrationReceiptId: Sha256Schema,
  baseRevision: GitRevisionSchema,
  integratedRevision: GitRevisionSchema,
  runner: z.literal("deno-exact-v1"),
  testPath: z.string().min(1),
  exactTestName: z.string().min(1),
  preparedAt: z.string().datetime(),
  fingerprint: Sha256Schema,
});

type CommandResult = { code: number; stdout: Uint8Array; stderr: Uint8Array };
export interface SentryReplayRunner {
  run(command: string, args: readonly string[], cwd: string, timeoutMs: number): Promise<CommandResult>;
}

export type SentryReplayContext = {
  modelId: string;
  repoDir: string;
  dataRepository: { getContent(type: unknown, modelId: string, name: string, version?: number): Promise<Uint8Array | null> };
  writeResource(specName: string, name: string, data: Record<string, unknown>): Promise<{ name: string }>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
function withoutFingerprint(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "fingerprint"));
}
async function rawSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function readResource<T>(context: SentryReplayContext, type: string, modelId: string, name: string, schema: z.ZodType<T>): Promise<T> {
  const content = await context.dataRepository.getContent(type, modelId, name);
  if (content === null) throw new Error(`Missing replay resource ${name}`);
  return schema.parse(JSON.parse(decoder.decode(content)));
}
function requireSafeTestPath(path: string): void {
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Replay test path is unsafe");
  }
  if (!/^(extensions\/models|scripts|src)\/.+\.(test|spec)\.(ts|mjs)$/.test(path)) {
    throw new Error("Replay test path is outside the exact test allowlist");
  }
}
function requireTapResult(result: CommandResult, exactName: string, expectedPass: boolean): void {
  const output = decoder.decode(result.stdout);
  const escaped = exactName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const selected = new RegExp(`^(?:ok|not ok) \\d+ - ${escaped}(?: \\(.+\\))?$`, "m").test(output);
  if (!selected || !/^1\.\.1$/m.test(output)) throw new Error("Replay did not select exactly one named test");
  if (expectedPass ? result.code !== 0 || !/^ok 1 - /m.test(output) : result.code === 0 || !/^not ok 1 - /m.test(output)) {
    throw new Error(expectedPass ? "Integrated replay did not pass" : "Baseline replay did not fail as an assertion");
  }
}

async function runGit(runner: SentryReplayRunner, repoDir: string, args: readonly string[]): Promise<CommandResult> {
  const result = await runner.run("git", args, repoDir, 30_000);
  if (result.code !== 0) throw new Error(`git ${args[0]} failed`);
  return result;
}

export function createSentryIntegratedReplayOperations(dependencies: { runner: SentryReplayRunner; now: () => Date; makeTempDir: () => Promise<string>; removeDir: (path: string) => Promise<void>; writeFile: (path: string, data: Uint8Array) => Promise<void>; mkdir: (path: string) => Promise<void> }) {
  return async function execute(argsInput: unknown, context: SentryReplayContext): Promise<{ dataHandles: Array<{ name: string }> }> {
    const args = SentryIntegratedReplayArgsSchema.parse(argsInput);
    const evidence = await readResource(context, "@supers/sentry-issue-intake", args.evidenceModelId, args.evidenceName, SentryIssueRepairEvidenceSchema);
    if (evidence.fingerprint !== args.expectedEvidenceFingerprint || evidence.fingerprint !== await createSentrySha256(canonicalSentryJson(withoutFingerprint(evidence as unknown as Record<string, unknown>)))) throw new Error("Replay evidence fingerprint mismatch");
    const handoff = await readResource(context, "@mgreten/cli-agent", args.integrationModelId, args.handoffName, SupersAgentIntegrationHandoffManifestSchema);
    if (handoff.fingerprint !== args.expectedHandoffFingerprint || handoff.fingerprint !== await createSentrySha256(canonicalSentryJson(withoutFingerprint(handoff as unknown as Record<string, unknown>)))) throw new Error("Replay handoff fingerprint mismatch");
    const integration = await readResource(context, "@mgreten/cli-agent", args.integrationModelId, args.integrationReceiptName, SupersFactoryIntegrationReceiptSchema);
    await verifySupersFactoryIntegrationReceipt(integration);
    if (integration.receiptId !== args.expectedIntegrationReceiptId || integration.activeTaskId !== args.workItem || integration.rootEpicId !== args.workItem || handoff.workItem !== args.workItem || handoff.integratedRevision !== integration.integratedRevision || handoff.integratedTreeFingerprint !== integration.integratedTreeFingerprint || evidence.repairIdentityFingerprint === "") throw new Error("Replay resources target different repairs");
    if (handoff.objectiveProofNomination.runner !== "deno-exact-v1") throw new Error("Only restricted Deno replay is autonomous");
    const { testPath, exactTestName } = handoff.objectiveProofNomination;
    requireSafeTestPath(testPath);
    const expectedName = `Sentry ${evidence.shortId} ${evidence.repairIdentityFingerprint}`;
    if (exactTestName !== expectedName) throw new Error("Replay test name is not evidence-bound");
    if (!integration.changedPaths.includes(testPath)) throw new Error("Replay test is not in the integrated patch");

    const identity = { schemaVersion: 1 as const, workItem: args.workItem, evidenceFingerprint: evidence.fingerprint, handoffFingerprint: handoff.fingerprint, integrationReceiptId: integration.receiptId, baseRevision: handoff.baseRevision, integratedRevision: handoff.integratedRevision, runner: "deno-exact-v1" as const, testPath, exactTestName };
    const attemptFingerprint = await createSentrySha256(canonicalSentryJson(identity));
    const receiptName = `sentry-integrated-replay-${args.workItem}-${handoff.integratedRevision}`;
    const existing = await context.dataRepository.getContent("integrated-replay", context.modelId, receiptName);
    if (existing !== null) {
      const receipt = SentryIntegratedReplayReceiptSchema.parse(JSON.parse(decoder.decode(existing)));
      if (receipt.fingerprint !== await createSentrySha256(canonicalSentryJson(withoutFingerprint(receipt as unknown as Record<string, unknown>)))) throw new Error("Existing replay receipt fingerprint mismatch");
      return { dataHandles: [] };
    }
    const attemptName = `sentry-integrated-replay-attempt-${attemptFingerprint}`;
    const existingAttempt = await context.dataRepository.getContent("integrated-replay-attempt", context.modelId, attemptName);
    if (existingAttempt === null) {
      const attemptBase = { ...identity, preparedAt: dependencies.now().toISOString(), fingerprint: attemptFingerprint };
      await context.writeResource("integrated-replay-attempt", attemptName, AttemptSchema.parse(attemptBase));
    } else {
      const attempt = AttemptSchema.parse(JSON.parse(decoder.decode(existingAttempt)));
      if (attempt.fingerprint !== attemptFingerprint) throw new Error("Conflicting replay attempt");
    }

    const testBlob = (await runGit(dependencies.runner, context.repoDir, ["show", `${handoff.integratedRevision}:${testPath}`])).stdout;
    if (testBlob.length === 0 || testBlob.length > 1_000_000) throw new Error("Replay test blob size is unsupported");
    const testBlobDigest = await rawSha256(testBlob);
    const roots: string[] = [];
    try {
      const baseRoot = await dependencies.makeTempDir(); roots.push(baseRoot);
      const integratedRoot = await dependencies.makeTempDir(); roots.push(integratedRoot);
      for (const [root, revision] of [[baseRoot, handoff.baseRevision], [integratedRoot, handoff.integratedRevision]] as const) {
        await runGit(dependencies.runner, context.repoDir, ["clone", "--quiet", "--no-hardlinks", "--no-checkout", "--", context.repoDir, root]);
        await runGit(dependencies.runner, root, ["checkout", "--quiet", "--detach", revision]);
      }
      const slash = testPath.lastIndexOf("/");
      if (slash >= 0) await dependencies.mkdir(`${baseRoot}/${testPath.slice(0, slash)}`);
      await dependencies.writeFile(`${baseRoot}/${testPath}`, testBlob);
      const runs: CommandResult[] = [];
      for (const root of [baseRoot, baseRoot, integratedRoot, integratedRoot]) {
        runs.push(await dependencies.runner.run(Deno.execPath(), ["test", "--no-config", "--no-prompt", "--cached-only", "--reporter=tap", `--filter=${exactTestName}`, testPath], root, 120_000));
      }
      requireTapResult(runs[0], exactTestName, false); requireTapResult(runs[1], exactTestName, false);
      requireTapResult(runs[2], exactTestName, true); requireTapResult(runs[3], exactTestName, true);
      const digestResult = async (result: CommandResult): Promise<string> => rawSha256(new Uint8Array([...encoder.encode(String(result.code)), ...result.stdout, ...result.stderr]));
      const receiptBase = {
        schemaVersion: 1 as const, authority: "supers-sentry-integrated-replay-v1" as const, status: "passed" as const,
        workItem: args.workItem, issueId: evidence.issueId, shortId: evidence.shortId, repairIdentityFingerprint: evidence.repairIdentityFingerprint,
        evidenceName: args.evidenceName, evidenceFingerprint: evidence.fingerprint, handoffName: args.handoffName, handoffFingerprint: handoff.fingerprint,
        integrationReceiptName: args.integrationReceiptName, integrationReceiptId: integration.receiptId, baseRevision: handoff.baseRevision,
        integratedRevision: handoff.integratedRevision, integratedTreeFingerprint: handoff.integratedTreeFingerprint, runner: "deno-exact-v1" as const,
        testPath, exactTestName, testBlobDigest, baselineExitCodes: [runs[0].code, runs[1].code] as [number, number], integratedExitCodes: [0, 0] as [0, 0],
        baselineResultDigests: [await digestResult(runs[0]), await digestResult(runs[1])] as [string, string], integratedResultDigests: [await digestResult(runs[2]), await digestResult(runs[3])] as [string, string], recordedAt: dependencies.now().toISOString(),
      };
      const fingerprint = await createSentrySha256(canonicalSentryJson(receiptBase));
      const receipt = SentryIntegratedReplayReceiptSchema.parse({ ...receiptBase, fingerprint });
      const handle = await context.writeResource("integrated-replay", receiptName, receipt);
      return { dataHandles: [handle] };
    } finally {
      for (const root of roots.reverse()) await dependencies.removeDir(root);
    }
  };
}

async function readBoundedReplayStream(stream: ReadableStream<Uint8Array>, kill: () => void): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_000_000) {
        kill();
        throw new Error("Replay output exceeds safety limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

class DenoReplayRunner implements SentryReplayRunner {
  async run(command: string, args: readonly string[], cwd: string, timeoutMs: number): Promise<CommandResult> {
    const child = new Deno.Command(command, { args: [...args], cwd, stdin: "null", stdout: "piped", stderr: "piped", env: { CI: "1", NO_COLOR: "1", TZ: "UTC", LANG: "C" }, clearEnv: true }).spawn();
    const kill = (): void => { try { child.kill("SIGKILL"); } catch { /* exited */ } };
    const timer = setTimeout(kill, timeoutMs);
    try {
      const [stdout, stderr, status] = await Promise.all([
        readBoundedReplayStream(child.stdout, kill),
        readBoundedReplayStream(child.stderr, kill),
        child.status,
      ]);
      return { code: status.code, stdout, stderr };
    } finally { clearTimeout(timer); }
  }
}

const execute = createSentryIntegratedReplayOperations({
  runner: new DenoReplayRunner(), now: () => new Date(), makeTempDir: () => Deno.makeTempDir({ prefix: "supers-sentry-replay-" }),
  removeDir: (path) => Deno.remove(path, { recursive: true }), writeFile: (path, data) => Deno.writeFile(path, data), mkdir: (path) => Deno.mkdir(path, { recursive: true }),
});

export const model = {
  type: "@supers/sentry-integrated-repair-replay",
  version: "2026.08.22.1",
  globalArguments: z.strictObject({}),
  resources: {
    "integrated-replay-attempt": { schema: AttemptSchema, lifetime: "infinite" as const, garbageCollection: 1 },
    "integrated-replay": { schema: SentryIntegratedReplayReceiptSchema, lifetime: "infinite" as const, garbageCollection: 1 },
  },
  methods: {
    replay: { description: "Prove an evidence-bound test fails on the integration base and passes twice on the exact integrated revision.", arguments: SentryIntegratedReplayArgsSchema, execute },
  },
};
