/**
 * Corpus verification sweep — runs the repo's static preset verifier
 * (`npm run verify-presets`: schema → semantic → static lint over every
 * `src/lib/presets/*.json`) and stores the per-preset outcome as a versioned
 * resource, so "what regressed since the last sweep" is a data diff instead
 * of a re-run-and-eyeball.
 *
 * The sweep method SUCCEEDS whenever the verifier ran to completion — a red
 * corpus is a stored finding, not an execution failure. It throws only when
 * the verifier itself crashed (exit codes other than 0/1) or produced no
 * parseable per-preset lines.
 *
 * @module
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({});

const SweepSchema = z.object({
	ranAt: z.string(),
	total: z.number(),
	passed: z.number(),
	failed: z.number(),
	failures: z.array(z.object({ file: z.string(), stage: z.string() })),
	clean: z.boolean(),
});

type MethodContext = {
	repoDir: string;
	logger: { info: (msg: string, props?: Record<string, unknown>) => void };
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>,
	) => Promise<{ name: string }>;
	createFileWriter: (
		specName: string,
		name: string,
	) => { writeText: (text: string) => Promise<{ name: string }> };
};

/** Model definition for the Supers corpus verification sweep. */
export const model = {
	type: "@supers/corpus-verify",
	version: "2026.08.03.1",
	globalArguments: GlobalArgsSchema,
	resources: {
		sweep: {
			description:
				"Static corpus verification outcome (schema/semantic/lint) per preset file",
			schema: SweepSchema,
			lifetime: "infinite",
			garbageCollection: 20,
		},
	},
	files: {
		log: {
			description: "Raw verify-presets output for the sweep",
			contentType: "text/plain",
			lifetime: "1mo",
			garbageCollection: 10,
		},
	},
	methods: {
		sweep: {
			description:
				"Run `npm run verify-presets` across the corpus and store per-preset results",
			arguments: z.object({}),
			execute: async (_args: Record<string, never>, context: MethodContext) => {
				const command = new Deno.Command("npm", {
					args: ["run", "verify-presets"],
					cwd: context.repoDir,
					stdout: "piped",
					stderr: "piped",
				});
				const { code, stdout, stderr } = await command.output();
				const stdoutText = new TextDecoder().decode(stdout);
				const stderrText = new TextDecoder().decode(stderr);
				if (code !== 0 && code !== 1) {
					throw new Error(
						`verify-presets exited ${code}: ${stderrText.slice(0, 800)}`,
					);
				}

				// Per-preset lines: `✓ <file>` or `✗ <file> (<stage>)`, ANSI-stripped.
				// deno-lint-ignore no-control-regex
				// eslint-disable-next-line no-control-regex -- the escape byte IS the ANSI marker being stripped
				const plain = stdoutText.replace(/\[[0-9;]*m/g, "");
				const passes = [...plain.matchAll(/^\s*✓\s+(\S+)/gm)].map((match) => match[1]);
				const failures = [...plain.matchAll(/^\s*✗\s+(\S+)(?:\s+\(([^)]+)\))?/gm)].map(
					(match) => ({ file: match[1], stage: match[2] ?? "unknown" }),
				);
				if (passes.length + failures.length === 0) {
					throw new Error(
						`verify-presets produced no per-preset lines (exit ${code}); output head: ${plain.slice(0, 400)}`,
					);
				}

				const sweep = {
					ranAt: new Date().toISOString(),
					total: passes.length + failures.length,
					passed: passes.length,
					failed: failures.length,
					failures,
					clean: failures.length === 0,
				};
				context.logger.info("corpus sweep: {passed}/{total} passed", {
					passed: sweep.passed,
					total: sweep.total,
				});

				const logWriter = context.createFileWriter("log", "log-latest");
				const logHandle = await logWriter.writeText(
					`${plain}\n--- stderr ---\n${stderrText}`,
				);
				const sweepHandle = await context.writeResource("sweep", "sweep-latest", sweep);
				return { dataHandles: [sweepHandle, logHandle] };
			},
		},
	},
};
