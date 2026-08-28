/**
 * Deterministic verification runner for GFX Factory work.
 *
 * Runs the repo's own check suites inside an isolated worktree (or any
 * checkout path) and stores a structured per-suite outcome. This is the
 * zero-LLM verification seam the Factory's `verify` stage calls: the method
 * run SUCCEEDS only when every selected suite exits 0, so the Factory's
 * `evidence-recorded {status}` gates route ship-vs-rework deterministically.
 *
 * Suite selection is scoped to the change, not the whole app: pass the work
 * item's `filesChanged` and `deriveVerificationSuites` picks suites
 * deterministically — swamp/meta-only changes run no app suites, extension
 * changes run the deno extension tests, and app changes run check + test plus
 * `verify-presets --affected` (the script's own fixture-tested selector
 * decides which presets that means — never `--all` unless explicitly asked).
 *
 * Deliberately absent: repository-cleanliness preconditions. Verification
 * runs against whatever the worktree contains — a dirty primary checkout or
 * unrelated local state is never an admission failure here.
 *
 * @module
 */
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({});

const SuiteNameSchema = z.enum([
	"check",
	"test",
	"structural",
	"presets",
	"extensions",
]);
type VerificationSuiteName = z.infer<typeof SuiteNameSchema>;

const RunChecksArgumentsSchema = z.object({
	worktreePath: z.string().min(1),
	label: z.string().min(1).regex(/^[A-Za-z0-9._-]+$/),
	filesChanged: z.array(z.string()).optional(),
	suites: z.array(SuiteNameSchema).min(1).optional(),
});

const SuiteOutcomeSchema = z.object({
	name: SuiteNameSchema,
	exitCode: z.number(),
	passed: z.boolean(),
	durationMs: z.number(),
});

const VerificationSchema = z.object({
	ranAt: z.string(),
	worktreePath: z.string(),
	label: z.string(),
	selection: z.enum(["explicit", "derived", "fallback"]),
	suites: z.array(SuiteOutcomeSchema),
	failedSuites: z.array(SuiteNameSchema),
	passed: z.boolean(),
});

type SuitePlan = { name: VerificationSuiteName; command: string[] };

// Paths whose changes never affect app runtime behavior: swamp definitions,
// agent skills, and docs — except docs/packs, which feeds pack-catalog
// freshness inside verify-presets' own selector.
const APP_INERT_PREFIXES = [
	"models/",
	"workflows/",
	"vaults/",
	".claude/",
	".github/",
	"docs/",
];

function isAppRelevantPath(path: string): boolean {
	if (path.startsWith("docs/packs/")) return true;
	if (path.startsWith("extensions/")) return false;
	return !APP_INERT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function swampDenoPath(): string {
	const home = Deno.env.get("HOME");
	if (!home) throw new Error("HOME is not set; cannot locate ~/.swamp/deno/deno");
	return `${home}/.swamp/deno/deno`;
}

function buildSuiteCommand(
	name: VerificationSuiteName,
	appPaths: string[] | null,
): string[] {
	switch (name) {
		case "check":
			return ["pnpm", "run", "check"];
		case "test":
			return ["pnpm", "run", "test"];
		case "structural":
			return ["pnpm", "run", "test:structural"];
		case "presets":
			return appPaths === null
				? [
					"node",
					"--experimental-strip-types",
					"scripts/verify-presets.ts",
					"--all",
				]
				: [
					"node",
					"--experimental-strip-types",
					"scripts/verify-presets.ts",
					"--affected",
					"--changed-paths-json",
					JSON.stringify(appPaths),
				];
		case "extensions":
			// --allow-env=HOME: the suite under test resolves ~/.swamp/deno/deno.
			return [
				swampDenoPath(),
				"test",
				"--allow-read",
				"--allow-env=HOME",
				"extensions/models/",
			];
	}
}

/**
 * Deterministic suite selection for a change. Exported for its colocated
 * test; the mapping is the whole policy — no LLM judgment involved.
 */
export function deriveVerificationSuites(
	filesChanged: string[],
): SuitePlan[] {
	const plans: SuitePlan[] = [];
	if (filesChanged.some((path) => path.startsWith("extensions/"))) {
		plans.push({
			name: "extensions",
			command: buildSuiteCommand("extensions", null),
		});
	}
	const appPaths = filesChanged.filter(isAppRelevantPath);
	if (appPaths.length > 0) {
		plans.push({ name: "check", command: buildSuiteCommand("check", null) });
		plans.push({ name: "test", command: buildSuiteCommand("test", null) });
		plans.push({
			name: "presets",
			command: buildSuiteCommand("presets", appPaths),
		});
	}
	return plans;
}

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

/** Model definition for the GFX deterministic verification runner. */
export const model = {
	type: "@gfx/verify",
	version: "2026.08.28.2",
	globalArguments: GlobalArgsSchema,
	resources: {
		verification: {
			description:
				"Per-suite check outcome for one labelled verification run (instances: verification-<label>)",
			schema: VerificationSchema,
			lifetime: "infinite",
			garbageCollection: 25,
		},
	},
	files: {
		log: {
			description: "Tail of each failing suite's output for the labelled run",
			contentType: "text/plain",
			lifetime: "1mo",
			garbageCollection: 10,
		},
	},
	methods: {
		run_checks: {
			description:
				"Run change-scoped repo suites in a worktree (explicit `suites` overrides; else derived from `filesChanged`); succeeds only when all pass",
			arguments: RunChecksArgumentsSchema,
			execute: async (
				args: z.infer<typeof RunChecksArgumentsSchema>,
				context: MethodContext,
			) => {
				const packageJsonPath = `${args.worktreePath}/package.json`;
				try {
					await Deno.stat(packageJsonPath);
				} catch {
					throw new TypeError(
						`worktreePath is not a checkout root (no package.json): ${args.worktreePath}`,
					);
				}

				let selection: "explicit" | "derived" | "fallback";
				let plans: SuitePlan[];
				if (args.suites) {
					selection = "explicit";
					plans = args.suites.map((name) => ({
						name,
						command: buildSuiteCommand(name, null),
					}));
				} else if (args.filesChanged) {
					selection = "derived";
					plans = deriveVerificationSuites(args.filesChanged);
				} else {
					selection = "fallback";
					plans = [
						{ name: "check", command: buildSuiteCommand("check", null) },
						{ name: "test", command: buildSuiteCommand("test", null) },
					];
				}
				context.logger.info(
					"verify {label}: {selection} selection → {suites}",
					{
						label: args.label,
						selection,
						suites: plans.map((plan) => plan.name).join(",") || "(none)",
					},
				);

				const suiteOutcomes: z.infer<typeof SuiteOutcomeSchema>[] = [];
				const failureTails: string[] = [];
				for (const plan of plans) {
					const startedAt = Date.now();
					const command = new Deno.Command(plan.command[0], {
						args: plan.command.slice(1),
						cwd: args.worktreePath,
						stdout: "piped",
						stderr: "piped",
					});
					const { code, stdout, stderr } = await command.output();
					const durationMs = Date.now() - startedAt;
					suiteOutcomes.push({
						name: plan.name,
						exitCode: code,
						passed: code === 0,
						durationMs,
					});
					context.logger.info("verify suite {suite}: exit {code} in {ms}ms", {
						suite: plan.name,
						code,
						ms: durationMs,
					});
					if (code !== 0) {
						const combined = `${new TextDecoder().decode(stdout)}\n${new TextDecoder().decode(stderr)}`;
						failureTails.push(
							`=== ${plan.name} (exit ${code}) ===\n${combined.slice(-4000)}`,
						);
					}
				}

				const failedSuites = suiteOutcomes
					.filter((outcome) => !outcome.passed)
					.map((outcome) => outcome.name);
				const verification = {
					ranAt: new Date().toISOString(),
					worktreePath: args.worktreePath,
					label: args.label,
					selection,
					suites: suiteOutcomes,
					failedSuites,
					passed: failedSuites.length === 0,
				};

				const dataHandles = [
					await context.writeResource(
						"verification",
						`verification-${args.label}`,
						verification,
					),
				];
				if (failureTails.length > 0) {
					const logWriter = context.createFileWriter("log", `log-${args.label}`);
					dataHandles.push(await logWriter.writeText(failureTails.join("\n\n")));
				}

				if (failedSuites.length > 0) {
					throw new Error(
						`verification failed for ${args.label}: ${failedSuites.join(", ")} (details in verification-${args.label})`,
					);
				}
				return { dataHandles };
			},
		},
	},
};
