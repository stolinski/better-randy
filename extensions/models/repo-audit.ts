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
import { z } from "npm:zod@4";

const GlobalArgsSchema = z.object({});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const TimingReportSchema = z.object({
	audit: z.string(),
	generatedAt: z.string(),
	totalSites: z.number(),
	coveredSites: z.number(),
	uncovered: z.array(z.object({ path: z.string(), kind: z.string(), covered: z.boolean() })),
	sites: z.array(z.object({ path: z.string(), kind: z.string(), covered: z.boolean() })),
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

type MethodContext = {
	repoDir: string;
	logger: { info: (msg: string, props?: Record<string, unknown>) => void };
	writeResource: (
		specName: string,
		name: string,
		data: Record<string, unknown>,
	) => Promise<{ name: string }>;
};

async function runAuditScript(
	context: MethodContext,
	scriptPath: string,
): Promise<{ report: Record<string, unknown>; clean: boolean }> {
	const command = new Deno.Command("node", {
		args: ["--experimental-strip-types", scriptPath],
		cwd: context.repoDir,
		stdout: "piped",
		stderr: "piped",
	});
	const { code, stdout, stderr } = await command.output();
	const stdoutText = new TextDecoder().decode(stdout);
	const stderrText = new TextDecoder().decode(stderr);
	let report: Record<string, unknown>;
	try {
		report = JSON.parse(stdoutText) as Record<string, unknown>;
	} catch {
		throw new Error(
			`${scriptPath} produced no JSON report (exit ${code}): ${stderrText.slice(0, 800)}`,
		);
	}
	if (code !== 0 && code !== 1) {
		throw new Error(`${scriptPath} exited ${code}: ${stderrText.slice(0, 800)}`);
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
	version: "2026.08.03.1",
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
				const handle = await context.writeResource("tracking", "tracking-latest", {
					...report,
					clean,
				});
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
	},
};
