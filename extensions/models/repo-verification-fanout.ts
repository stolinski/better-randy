import { z } from "npm:zod@4.4.3";

export const AutomatedVerificationLaneIdSchema = z.enum([
  "check",
  "unit",
  "structural",
]);

export type AutomatedVerificationLaneId = z.infer<
  typeof AutomatedVerificationLaneIdSchema
>;

export const VerificationFanoutArgumentsSchema = z.object({
  workItem: z.string().min(1).max(128),
  expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  lanes: z.array(AutomatedVerificationLaneIdSchema).max(3),
});

export type VerificationFanoutArguments = z.infer<
  typeof VerificationFanoutArgumentsSchema
>;

export const VerificationLaneResultSchema = z.object({
  id: AutomatedVerificationLaneIdSchema,
  status: z.enum(["passed", "failed"]),
  command: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int(),
  outputTail: z.string().max(4_000),
});

export const VerificationFanoutReportSchema = z.object({
  schemaVersion: z.literal(1),
  workItem: z.string().min(1).max(128),
  expectedFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  startedAt: z.string(),
  completedAt: z.string(),
  executionMode: z.literal("parallel"),
  results: z.array(VerificationLaneResultSchema).max(3),
  passed: z.boolean(),
});

export type VerificationFanoutReport = z.infer<
  typeof VerificationFanoutReportSchema
>;

export type VerificationCommandOutput = {
  code: number;
  stdout: Uint8Array;
  stderr: Uint8Array;
};

export type VerificationCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<VerificationCommandOutput>;

const LANE_COMMANDS: Record<AutomatedVerificationLaneId, readonly string[]> = {
  check: ["run", "check"],
  unit: ["run", "test"],
  structural: ["run", "test:structural"],
};

const textDecoder = new TextDecoder();

function boundedOutputTail(output: VerificationCommandOutput): string {
  const combined = [
    textDecoder.decode(output.stdout).trim(),
    textDecoder.decode(output.stderr).trim(),
  ].filter(Boolean).join("\n");
  return combined.slice(-4_000);
}

async function runDenoCommand(
  command: string,
  args: string[],
  cwd: string,
): Promise<VerificationCommandOutput> {
  return await new Deno.Command(command, {
    args,
    cwd,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
}

async function runVerificationLane(
  lane: AutomatedVerificationLaneId,
  repoDir: string,
  runCommand: VerificationCommandRunner,
): Promise<z.infer<typeof VerificationLaneResultSchema>> {
  const args = [...LANE_COMMANDS[lane]];
  const startedAt = performance.now();
  const output = await runCommand("pnpm", args, repoDir);
  return {
    id: lane,
    status: output.code === 0 ? "passed" : "failed",
    command: `pnpm ${args.join(" ")}`,
    durationMs: Math.round(performance.now() - startedAt),
    exitCode: output.code,
    outputTail: boundedOutputTail(output),
  };
}

/** Run independent deterministic verification lanes concurrently in one model execution. */
export async function runVerificationFanout(
  repoDir: string,
  rawArguments: VerificationFanoutArguments,
  runCommand: VerificationCommandRunner = runDenoCommand,
): Promise<VerificationFanoutReport> {
  const arguments_ = VerificationFanoutArgumentsSchema.parse(rawArguments);
  const lanes = [...new Set(arguments_.lanes)];
  if (lanes.length !== arguments_.lanes.length) {
    throw new TypeError("Verification fan-out lanes must be unique");
  }

  const startedAt = new Date().toISOString();
  const results = await Promise.all(
    lanes.map((lane) => runVerificationLane(lane, repoDir, runCommand)),
  );
  return VerificationFanoutReportSchema.parse({
    schemaVersion: 1,
    workItem: arguments_.workItem,
    expectedFingerprint: arguments_.expectedFingerprint,
    startedAt,
    completedAt: new Date().toISOString(),
    executionMode: "parallel",
    results,
    passed: results.every((result) => result.status === "passed"),
  });
}
