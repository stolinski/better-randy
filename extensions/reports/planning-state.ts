/**
 * Planning-state drift report for the @supers/repo-audit `audit-planning`
 * method — renders the stored `planning` resource (findings and advisories
 * with actionable repo paths and dex ids) as markdown + JSON.
 *
 * The resource is produced by scripts/audit-planning-state.ts and already
 * schema-validated by the model's writeResource; this report is the
 * human/automation-facing summary (`swamp report get @supers/planning-state
 * --model repo-audit`).
 *
 * @module
 */
import { z } from 'npm:zod@4';

const PlanningFindingSchema = z.object({
	check: z.string(),
	message: z.string(),
	paths: z.array(z.string())
});

const PlanningResourceSchema = z.object({
	audit: z.string(),
	generatedAt: z.string(),
	adrDocs: z.number(),
	briefDocs: z.number(),
	ideaDocs: z.number(),
	presets: z.number(),
	dexOpenTasks: z.number(),
	runway: z.object({
		activeLanes: z.array(
			z.object({
				rootEpicId: z.string(),
				activeTaskId: z.string(),
				activeTaskName: z.string()
			})
		),
		readyLanes: z.array(
			z.object({
				rootEpicId: z.string(),
				nextTaskId: z.string(),
				nextTaskName: z.string(),
				topPriority: z.number(),
				readyLeafCount: z.number()
			})
		),
		activeTaskId: z.string().nullable(),
		activeTaskName: z.string().nullable(),
		activeEpicId: z.string().nullable(),
		nextTaskId: z.string().nullable(),
		nextTaskName: z.string().nullable(),
		topPriority: z.number().nullable(),
		readyLeafCount: z.number()
	}),
	findings: z.array(PlanningFindingSchema),
	advisories: z.array(PlanningFindingSchema),
	crash: z.string().nullable(),
	clean: z.boolean()
});

type PlanningFinding = z.infer<typeof PlanningFindingSchema>;

type PlanningReportDataHandle = {
	specName?: string;
	name: string;
	version?: number;
};

type PlanningReportContext = {
	methodName: string;
	executionStatus: 'succeeded' | 'failed';
	modelType: string;
	modelId: string;
	dataHandles: PlanningReportDataHandle[];
	dataRepository: {
		getContent: (
			type: string,
			modelId: string,
			dataName: string,
			version?: number
		) => Promise<Uint8Array | null>;
	};
};

function renderPlanningFindingLines(entries: PlanningFinding[]): string {
	return entries
		.map((entry) => `- **${entry.check}** — ${entry.message}\n  - ${entry.paths.join('\n  - ')}`)
		.join('\n');
}

/** Report definition — attached as a @supers/repo-audit model-type default. */
export const report = {
	name: '@supers/planning-state',
	description:
		'Planning-state drift summary — findings and advisories with actionable repo paths and dex ids',
	scope: 'method',
	labels: ['planning', 'audit'],
	execute: async (context: PlanningReportContext) => {
		if (context.methodName !== 'audit-planning') {
			return {
				markdown: 'Planning-state report applies to audit-planning executions only.',
				json: { applicable: false, methodName: context.methodName }
			};
		}
		const handle = context.dataHandles.find((entry) => entry.specName === 'planning');
		if (!handle) {
			return {
				markdown: 'No planning resource was stored by this execution.',
				json: { applicable: true, error: 'missing planning data handle' }
			};
		}
		const raw = await context.dataRepository.getContent(
			context.modelType,
			context.modelId,
			handle.name,
			handle.version
		);
		if (!raw) {
			return {
				markdown: 'Planning resource content was not readable.',
				json: { applicable: true, error: 'unreadable planning data' }
			};
		}
		const parsed = PlanningResourceSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
		const header = [
			'# Planning-state drift',
			'',
			`- **Clean**: ${parsed.clean}`,
			`- **Generated**: ${parsed.generatedAt}`,
			`- **Scope**: ${parsed.adrDocs} ADRs, ${parsed.briefDocs} Briefs, ${parsed.ideaDocs} ideas, ${parsed.presets} presets, ${parsed.dexOpenTasks} open dex tasks`,
			`- **Active lanes**: ${
				parsed.runway.activeLanes.length > 0
					? parsed.runway.activeLanes
							.map((lane) => `${lane.rootEpicId}:${lane.activeTaskId}`)
							.join(', ')
					: 'none'
			}`,
			`- **Ready lanes**: ${
				parsed.runway.readyLanes.length > 0
					? parsed.runway.readyLanes
							.map((lane) => `${lane.rootEpicId}:${lane.nextTaskId}`)
							.join(', ')
					: 'none'
			}`,
			`- **Compatibility active projection**: ${
				parsed.runway.activeTaskId
					? `${parsed.runway.activeTaskId} — ${parsed.runway.activeTaskName}`
					: 'none'
			}`,
			`- **Compatibility next projection**: ${
				parsed.runway.nextTaskId
					? `${parsed.runway.nextTaskId} — ${parsed.runway.nextTaskName}`
					: 'none'
			}`,
			`- **Ready leaves**: ${parsed.runway.readyLeafCount}`,
			parsed.crash ? `- **Crash**: ${parsed.crash}` : null
		]
			.filter((line): line is string => line !== null)
			.join('\n');
		const findingsSection =
			parsed.findings.length > 0
				? `\n\n## Findings (gate)\n\n${renderPlanningFindingLines(parsed.findings)}`
				: '\n\n## Findings (gate)\n\nNone.';
		const advisoriesSection =
			parsed.advisories.length > 0
				? `\n\n## Advisories (human judgment)\n\n${renderPlanningFindingLines(parsed.advisories)}`
				: '\n\n## Advisories (human judgment)\n\nNone.';
		return {
			markdown: `${header}${findingsSection}${advisoriesSection}\n`,
			json: { applicable: true, ...parsed }
		};
	}
};
