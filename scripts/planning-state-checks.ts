// Pure planning-state drift checks — the logic behind
// scripts/audit-planning-state.ts (`pnpm audit:planning`).
// Operates on plain inputs so scripts/planning-state-checks.test.ts
// can exercise every drift class against focused fixtures without touching the
// filesystem or the dex CLI.
//
// The planning tiers and their declared meanings (docs/briefs/README.md,
// docs/ideas/README.md, docs/adr/README.md, docs/roadmap.md § Active factory
// runway) are the contract; each check mechanizes one drift class from the
// 2026-08-04 baseline reconciliation (dex 6qlggrda).

/** One markdown document handed to the checks, keyed by repo-relative path. */
export type PlanningMarkdownFile = {
	path: string;
	markdown: string;
};

/** The subset of a dex task record the planning checks read. */
export type PlanningDexTask = {
	id: string;
	parentId: string | null;
	name: string;
	description: string;
	priority: number;
	completed: boolean;
	started: boolean;
	blockedBy: string[];
};

/** A built-in Preset listing entry (slug + its declared listing kind). */
export type PlanningPresetListing = {
	slug: string;
	kind: string;
};

export type PlanningStateInputs = {
	roadmap: PlanningMarkdownFile;
	adrIndex: PlanningMarkdownFile;
	adrDocs: PlanningMarkdownFile[];
	briefDocs: PlanningMarkdownFile[];
	ideaIndex: PlanningMarkdownFile;
	ideaDocs: PlanningMarkdownFile[];
	historyIndex: PlanningMarkdownFile | null;
	historyDocs: PlanningMarkdownFile[];
	presets: PlanningPresetListing[];
	dexTasks: PlanningDexTask[];
};

export type PlanningCheckId =
	| 'adr-index-coverage'
	| 'adr-status-drift'
	| 'roadmap-adr-reference'
	| 'roadmap-ship-claim'
	| 'stale-brief'
	| 'ideas-inventory'
	| 'ideas-historical'
	| 'dex-shipped-claim'
	| 'dex-blocker-contradiction'
	| 'dex-graph-invalid'
	| 'dex-active-work'
	| 'dex-ready-runway';

export type PlanningStateFinding = {
	check: PlanningCheckId;
	message: string;
	paths: string[];
};

/**
 * `findings` gate (clean = none); `advisories` are heuristic marker hits that
 * need human judgment and never gate on their own.
 */
export type PlanningStateCheckResult = {
	clean: boolean;
	findings: PlanningStateFinding[];
	advisories: PlanningStateFinding[];
	runway: PlanningRunway;
};

/** `rootEpicId` is the established field name for the effective open execution root id. */
export type PlanningActiveLane = {
	rootEpicId: string;
	activeTaskId: string;
	activeTaskName: string;
};

/** `rootEpicId` is the established field name for the effective open execution root id. */
export type PlanningReadyLane = {
	rootEpicId: string;
	nextTaskId: string;
	nextTaskName: string;
	topPriority: number;
	readyLeafCount: number;
};

/** Machine-readable per-root handoff from planning policy to Delivery. */
export type PlanningRunway = {
	activeLanes: PlanningActiveLane[];
	readyLanes: PlanningReadyLane[];
	/** @deprecated Deterministic compatibility projection; use activeLanes. */
	activeTaskId: string | null;
	/** @deprecated Deterministic compatibility projection; use activeLanes. */
	activeTaskName: string | null;
	/** @deprecated Deterministic compatibility projection; use lane rootEpicId. */
	activeEpicId: string | null;
	/** @deprecated Deterministic compatibility projection; use readyLanes. */
	nextTaskId: string | null;
	/** @deprecated Deterministic compatibility projection; use readyLanes. */
	nextTaskName: string | null;
	/** @deprecated Deterministic compatibility projection; use readyLanes. */
	topPriority: number | null;
	readyLeafCount: number;
};

export type AdrStatusCategory = 'canon' | 'build-harness' | 'superseded' | 'designed' | 'unknown';

/**
 * Classify an ADR status phrase into the four categories the ADR index
 * declares. Prefix-matched: "Canon (gate partly build-harness)" is canon —
 * qualifier text after the leading keyword never reclassifies.
 */
export function classifyAdrStatus(statusText: string): AdrStatusCategory {
	const normalized = statusText.trim().toLowerCase();
	if (normalized.startsWith('superseded')) return 'superseded';
	if (normalized.startsWith('build-harness')) return 'build-harness';
	if (normalized.startsWith('designed')) return 'designed';
	if (normalized.startsWith('canon')) return 'canon';
	return 'unknown';
}

function adrNumberFromPath(path: string): string | null {
	const basename = path.split('/').at(-1) ?? path;
	const match = /^(\d{4})-/.exec(basename);
	return match ? match[1] : null;
}

function extractAdrStatusText(markdown: string): string | null {
	const bold = /^## Status\s*\n+\*\*(.+?)\*\*/m.exec(markdown);
	if (bold) return bold[1];
	const plain = /^## Status\s*\n+(.+)$/m.exec(markdown);
	return plain ? plain[1] : null;
}

function collectAdrReferences(text: string): Set<string> {
	const refs = new Set<string>();
	for (const match of text.matchAll(/ADR-(\d{4})/g)) refs.add(match[1]);
	for (const match of text.matchAll(/\(adr\/(\d{4})[^)]*\)/g)) {
		refs.add(match[1]);
	}
	return refs;
}

function relativeMarkdownLinks(markdown: string): string[] {
	const links: string[] = [];
	for (const match of markdown.matchAll(/\]\(([^)#]+\.md)\)/g)) {
		const target = match[1];
		if (target.startsWith('http://') || target.startsWith('https://')) continue;
		if (target.includes('/')) continue;
		links.push(target.replace(/^\.\//, ''));
	}
	return links;
}

function basename(path: string): string {
	return path.split('/').at(-1) ?? path;
}

// Explicit completion claims. Word forms are matched case-sensitively in
// ALL CAPS so prose like "Done when" or "shipped truth" never trips them.
const COMPLETION_MARKER_PATTERN = /✅|\bCOMPLETE\b|\bCOMPLETED\b|\bSHIPPED\b|\bDONE\b/;

function checkAdrIndexAndStatus(
	inputs: PlanningStateInputs,
	findings: PlanningStateFinding[],
	adrCategoryByNumber: Map<string, AdrStatusCategory>
): void {
	for (const doc of inputs.adrDocs) {
		const number = adrNumberFromPath(doc.path);
		if (!number) continue;
		const statusText = extractAdrStatusText(doc.markdown);
		if (statusText === null) {
			findings.push({
				check: 'adr-status-drift',
				message: `ADR ${number} has no "## Status" line to classify`,
				paths: [doc.path]
			});
			continue;
		}
		const category = classifyAdrStatus(statusText);
		if (category === 'unknown') {
			findings.push({
				check: 'adr-status-drift',
				message: `ADR ${number} status "${statusText.slice(
					0,
					60
				)}" does not start with Canon / Build-harness / Superseded / Designed`,
				paths: [doc.path]
			});
			continue;
		}
		adrCategoryByNumber.set(number, category);
	}

	const indexedNumbers = new Map<string, { link: string; category: AdrStatusCategory }>();
	for (const row of inputs.adrIndex.markdown.matchAll(
		/^\|\s*\[(\d{4})\]\(([^)]+)\)\s*\|\s*([^|]+)\|/gm
	)) {
		indexedNumbers.set(row[1], {
			link: row[2],
			category: classifyAdrStatus(row[3])
		});
	}

	const docNumbers = new Set(
		inputs.adrDocs.map((doc) => adrNumberFromPath(doc.path)).filter((n): n is string => n !== null)
	);
	for (const number of docNumbers) {
		if (!indexedNumbers.has(number)) {
			findings.push({
				check: 'adr-index-coverage',
				message: `ADR ${number} exists but has no row in the ADR index`,
				paths: [inputs.adrIndex.path]
			});
		}
	}
	for (const [number, row] of indexedNumbers) {
		if (!docNumbers.has(number)) {
			findings.push({
				check: 'adr-index-coverage',
				message: `ADR index row ${number} links ${row.link}, which does not exist`,
				paths: [inputs.adrIndex.path]
			});
			continue;
		}
		const fileCategory = adrCategoryByNumber.get(number);
		if (fileCategory && row.category !== 'unknown' && row.category !== fileCategory) {
			findings.push({
				check: 'adr-status-drift',
				message: `ADR ${number} status drift: index says "${row.category}" but the ADR file says "${fileCategory}"`,
				paths: [inputs.adrIndex.path, `docs/adr/${row.link}`]
			});
		}
	}
}

function checkRoadmapClaims(
	inputs: PlanningStateInputs,
	findings: PlanningStateFinding[],
	adrCategoryByNumber: Map<string, AdrStatusCategory>
): void {
	const adrPathByNumber = new Map<string, string>();
	for (const doc of inputs.adrDocs) {
		const number = adrNumberFromPath(doc.path);
		if (number) adrPathByNumber.set(number, doc.path);
	}
	for (const number of collectAdrReferences(inputs.roadmap.markdown)) {
		if (!adrPathByNumber.has(number)) {
			findings.push({
				check: 'roadmap-adr-reference',
				message: `Roadmap references ADR-${number}, which has no file in docs/adr/`,
				paths: [inputs.roadmap.path]
			});
		}
	}
	for (const line of inputs.roadmap.markdown.split('\n')) {
		const claimsShipped = line.includes('✅') || /\*\*shipped\*\*/i.test(line);
		if (!claimsShipped) continue;
		for (const number of collectAdrReferences(line)) {
			if (adrCategoryByNumber.get(number) === 'designed') {
				findings.push({
					check: 'roadmap-ship-claim',
					message: `Roadmap claims shipped work against ADR-${number}, which is still "Designed, not built"`,
					paths: [inputs.roadmap.path, adrPathByNumber.get(number) ?? `docs/adr/`]
				});
			}
		}
	}
}

function checkStaleBriefs(inputs: PlanningStateInputs, findings: PlanningStateFinding[]): void {
	const deliverableSlugs = new Set(
		inputs.presets.filter((preset) => preset.kind === 'deliverable').map((preset) => preset.slug)
	);
	for (const brief of inputs.briefDocs) {
		const targetSlugs = new Set<string>();
		const filenameSlug = basename(brief.path).replace(/\.md$/, '');
		targetSlugs.add(filenameSlug);
		const declaredSlug = /\*\*Slug:\*\*\s*`?([a-z0-9-]+)`?/.exec(brief.markdown);
		if (declaredSlug) targetSlugs.add(declaredSlug[1]);
		const verificationSlug = /verification preset[^`\n]*`([a-z0-9-]+)`/i.exec(brief.markdown);
		if (verificationSlug) targetSlugs.add(verificationSlug[1]);
		for (const slug of targetSlugs) {
			if (deliverableSlugs.has(slug)) {
				findings.push({
					check: 'stale-brief',
					message: `Brief "${filenameSlug}" targets shipped deliverable preset "${slug}" — the Brief invariant requires deleting it when its target ACCEPTs`,
					paths: [brief.path, `src/lib/presets/${slug}.json`]
				});
			}
		}
	}
}

function checkFolderInventory(
	index: PlanningMarkdownFile,
	docs: PlanningMarkdownFile[],
	folderLabel: string,
	findings: PlanningStateFinding[]
): void {
	const linked = new Set(relativeMarkdownLinks(index.markdown));
	const present = new Set(docs.map((doc) => basename(doc.path)));
	for (const file of present) {
		if (!linked.has(file)) {
			findings.push({
				check: 'ideas-inventory',
				message: `${folderLabel} contains ${file}, which is not listed in its README index`,
				paths: [index.path, `${folderLabel}/${file}`]
			});
		}
	}
	for (const file of linked) {
		if (!present.has(file)) {
			findings.push({
				check: 'ideas-inventory',
				message: `${folderLabel} README links ${file}, which does not exist`,
				paths: [index.path]
			});
		}
	}
}

function checkIdeasTier(inputs: PlanningStateInputs, findings: PlanningStateFinding[]): void {
	checkFolderInventory(inputs.ideaIndex, inputs.ideaDocs, 'docs/ideas', findings);
	if (inputs.historyIndex) {
		checkFolderInventory(inputs.historyIndex, inputs.historyDocs, 'docs/history', findings);
	}
	for (const doc of inputs.ideaDocs) {
		const statusLine = /^#{0,6}\s*\*{0,2}status\*{0,2}\s*:\s*(.+)$/im.exec(doc.markdown);
		const declaresShipped =
			(statusLine && /\b(shipped|completed?|done|superseded|historical)\b/i.test(statusLine[1])) ||
			/✅\s*(shipped|complete|done)/i.test(doc.markdown);
		if (declaresShipped) {
			findings.push({
				check: 'ideas-historical',
				message: `Idea doc ${basename(
					doc.path
				)} declares shipped/complete status — historical explorations belong in docs/history/`,
				paths: [doc.path]
			});
		}
	}
}

function checkDexTaskState(
	inputs: PlanningStateInputs,
	findings: PlanningStateFinding[],
	advisories: PlanningStateFinding[]
): void {
	const taskById = new Map(inputs.dexTasks.map((task) => [task.id, task]));

	for (const task of inputs.dexTasks) {
		if (task.completed) {
			for (const blockerId of task.blockedBy) {
				const blocker = taskById.get(blockerId);
				if (blocker && !blocker.completed) {
					findings.push({
						check: 'dex-blocker-contradiction',
						message: `Completed task ${task.id} ("${task.name}") is still blocked by open task ${blockerId} ("${blocker.name}") — remove the stale edge or re-verify the completion`,
						paths: [`dex:${task.id}`, `dex:${blockerId}`]
					});
				}
			}
			continue;
		}
		const nameHit = COMPLETION_MARKER_PATTERN.exec(task.name);
		if (nameHit) {
			findings.push({
				check: 'dex-shipped-claim',
				message: `Open task ${task.id} claims completion in its name ("${
					nameHit[0]
				}") — close it out with dex complete or rename it`,
				paths: [`dex:${task.id}`]
			});
			continue;
		}
		const descriptionHit = COMPLETION_MARKER_PATTERN.exec(task.description);
		if (descriptionHit) {
			advisories.push({
				check: 'dex-shipped-claim',
				message: `Open task ${task.id} ("${task.name}") describes work as ${
					descriptionHit[0]
				} — verify the shipped half is committed and reframe the remainder`,
				paths: [`dex:${task.id}`]
			});
		}
	}
}

function indexOpenDexChildren(openTasks: PlanningDexTask[]): Map<string, PlanningDexTask[]> {
	const openChildrenByParent = new Map<string, PlanningDexTask[]>();
	for (const task of openTasks) {
		if (!task.parentId) continue;
		const children = openChildrenByParent.get(task.parentId) ?? [];
		children.push(task);
		openChildrenByParent.set(task.parentId, children);
	}
	return openChildrenByParent;
}

export type PlanningDexAncestry =
	| { status: 'resolved'; path: PlanningDexTask[]; executionRoot: PlanningDexTask }
	| { status: 'missing-parent' | 'cycle'; path: PlanningDexTask[]; invalidTaskId: string };

/** Resolve only the open execution graph; a completed parent is historical context. */
export function resolvePlanningDexAncestry(
	taskId: string,
	taskById: Map<string, PlanningDexTask>
): PlanningDexAncestry {
	const path: PlanningDexTask[] = [];
	const visited = new Set<string>();
	let currentId: string = taskId;
	while (true) {
		if (visited.has(currentId)) return { status: 'cycle', path, invalidTaskId: currentId };
		visited.add(currentId);
		const task = taskById.get(currentId);
		if (!task) return { status: 'missing-parent', path, invalidTaskId: currentId };
		path.push(task);
		if (task.parentId === null) return { status: 'resolved', path, executionRoot: task };
		const parent = taskById.get(task.parentId);
		if (!parent) return { status: 'missing-parent', path, invalidTaskId: task.parentId };
		if (parent.completed) return { status: 'resolved', path, executionRoot: task };
		currentId = parent.id;
	}
}

function analyzePlanningDexGraph(
	tasks: PlanningDexTask[],
	findings: PlanningStateFinding[]
): Set<string> {
	const taskById = new Map(tasks.map((task) => [task.id, task]));
	const openTasks = tasks.filter((task) => !task.completed);
	const openIds = new Set(openTasks.map((task) => task.id));
	const tasksWithUnknownBlockers = new Set<string>();
	for (const task of openTasks) {
		const unknownBlockers = task.blockedBy.filter((blockerId) => !taskById.has(blockerId));
		if (unknownBlockers.length === 0) continue;
		tasksWithUnknownBlockers.add(task.id);
		findings.push({
			check: 'dex-graph-invalid',
			message: `Task ${task.id} ("${task.name}") references unknown blocker id(s): ${unknownBlockers.join(', ')}`,
			paths: [`dex:${task.id}`, ...unknownBlockers.map((id) => `dex:${id}`)]
		});
	}

	const eligible = new Set<string>();
	for (const task of openTasks) {
		const ancestry = resolvePlanningDexAncestry(task.id, taskById);
		if (ancestry.status !== 'resolved') {
			findings.push({
				check: 'dex-graph-invalid',
				message: `Open task ${task.id} ("${task.name}") has ${
					ancestry.status === 'cycle' ? 'cyclic ancestry' : 'a missing parent'
				} at ${ancestry.invalidTaskId}`,
				paths: [`dex:${task.id}`, `dex:${ancestry.invalidTaskId}`]
			});
			continue;
		}
		if (ancestry.path.some((ancestor) => tasksWithUnknownBlockers.has(ancestor.id))) continue;
		const blockedAncestor = ancestry.path
			.slice(1)
			.find((ancestor) => ancestor.blockedBy.some((blockerId) => openIds.has(blockerId)));
		if (blockedAncestor) {
			const blockers = blockedAncestor.blockedBy.filter((blockerId) => openIds.has(blockerId));
			findings.push({
				check: 'dex-ready-runway',
				message: `Open task ${task.id} ("${task.name}") inherits open blocker(s) ${blockers.join(
					', '
				)} from ancestor ${blockedAncestor.id} ("${blockedAncestor.name}")`,
				paths: [`dex:${task.id}`, `dex:${blockedAncestor.id}`, ...blockers.map((id) => `dex:${id}`)]
			});
			continue;
		}
		eligible.add(task.id);
	}
	return eligible;
}

function findReadyDexLeaves(
	openTasks: PlanningDexTask[],
	openChildrenByParent: Map<string, PlanningDexTask[]>,
	projectionEligibleTaskIds: ReadonlySet<string>
): PlanningDexTask[] {
	const openIds = new Set(openTasks.map((task) => task.id));
	return openTasks.filter((task) => {
		if (
			!projectionEligibleTaskIds.has(task.id) ||
			task.started ||
			openChildrenByParent.has(task.id)
		)
			return false;
		return !task.blockedBy.some((id) => openIds.has(id));
	});
}

function createReadyDexLanes(
	readyLeaves: PlanningDexTask[],
	taskById: Map<string, PlanningDexTask>,
	findings: PlanningStateFinding[]
): PlanningReadyLane[] {
	const readyByEpic = new Map<string, PlanningDexTask[]>();
	for (const task of readyLeaves) {
		const epicId = findDexExecutionRootId(task, taskById) ?? `invalid:${task.id}`;
		const tasks = readyByEpic.get(epicId) ?? [];
		tasks.push(task);
		readyByEpic.set(epicId, tasks);
	}
	const lanes: PlanningReadyLane[] = [];
	for (const [rootEpicId, tasks] of readyByEpic) {
		const priority = Math.min(...tasks.map((task) => task.priority));
		const topTasks = tasks.filter((task) => task.priority === priority);
		if (topTasks.length > 1) {
			findings.push({
				check: 'dex-ready-runway',
				message: `${topTasks.length} co-equal priority-${priority} ready leaves in one effective execution root (${topTasks
					.map((task) => task.id)
					.join(
						', '
					)}) — order that epic with priorities or blocking edges so one leaf owns its lane`,
				paths: topTasks.map((task) => `dex:${task.id}`)
			});
			continue;
		}
		const nextTask = topTasks[0];
		lanes.push({
			rootEpicId,
			nextTaskId: nextTask.id,
			nextTaskName: nextTask.name,
			topPriority: priority,
			readyLeafCount: tasks.length
		});
	}
	return lanes.sort((left, right) => left.rootEpicId.localeCompare(right.rootEpicId));
}

function findDexExecutionRootId(
	runwayTask: PlanningDexTask | null,
	taskById: Map<string, PlanningDexTask>
): string | null {
	if (!runwayTask) return null;
	const ancestry = resolvePlanningDexAncestry(runwayTask.id, taskById);
	return ancestry.status === 'resolved' ? ancestry.executionRoot.id : null;
}

function createDexRunway(
	inputs: PlanningStateInputs,
	findings: PlanningStateFinding[]
): PlanningRunway {
	// Each effective open execution root owns one lane. Independent roots may run
	// concurrently, but one root cannot expose co-equal ready or active leaves.
	const taskById = new Map(inputs.dexTasks.map((task) => [task.id, task]));
	const openTasks = inputs.dexTasks.filter((task) => !task.completed);
	const projectionEligibleTaskIds = analyzePlanningDexGraph(inputs.dexTasks, findings);
	const openChildrenByParent = indexOpenDexChildren(openTasks);
	const startedLeaves = openTasks.filter(
		(task) =>
			projectionEligibleTaskIds.has(task.id) && task.started && !openChildrenByParent.has(task.id)
	);
	const startedByEpic = new Map<string, PlanningDexTask[]>();
	for (const task of startedLeaves) {
		const epicId = findDexExecutionRootId(task, taskById) ?? `invalid:${task.id}`;
		const tasks = startedByEpic.get(epicId) ?? [];
		tasks.push(task);
		startedByEpic.set(epicId, tasks);
	}
	for (const tasks of startedByEpic.values()) {
		if (tasks.length <= 1) continue;
		findings.push({
			check: 'dex-active-work',
			message: `${tasks.length} open leaf tasks are started in one effective execution root (${tasks
				.map((task) => task.id)
				.join(', ')}) — each execution lane permits one active work item`,
			paths: tasks.map((task) => `dex:${task.id}`)
		});
	}
	const activeLanes = [...startedByEpic.entries()]
		.filter(([, tasks]) => tasks.length === 1)
		.map(([rootEpicId, tasks]) => ({
			rootEpicId,
			activeTaskId: tasks[0].id,
			activeTaskName: tasks[0].name
		}))
		.sort((left, right) => left.rootEpicId.localeCompare(right.rootEpicId));
	const readyLeaves = findReadyDexLeaves(
		openTasks,
		openChildrenByParent,
		projectionEligibleTaskIds
	).filter((task) => {
		const rootEpicId = findDexExecutionRootId(task, taskById);
		return rootEpicId !== null && !startedByEpic.has(rootEpicId);
	});
	const readyLanes = createReadyDexLanes(readyLeaves, taskById, findings);

	// Singular fields are deterministic compatibility projections only. They do
	// not authorize lane selection; consumers must use the complete arrays.
	const compatibilityActiveLane = activeLanes[0] ?? null;
	const compatibilityReadyLane =
		[...readyLanes].sort(
			(left, right) =>
				left.topPriority - right.topPriority || left.nextTaskId.localeCompare(right.nextTaskId)
		)[0] ?? null;
	return {
		activeLanes,
		readyLanes,
		activeTaskId: compatibilityActiveLane?.activeTaskId ?? null,
		activeTaskName: compatibilityActiveLane?.activeTaskName ?? null,
		activeEpicId: compatibilityActiveLane?.rootEpicId ?? compatibilityReadyLane?.rootEpicId ?? null,
		nextTaskId: compatibilityReadyLane?.nextTaskId ?? null,
		nextTaskName: compatibilityReadyLane?.nextTaskName ?? null,
		topPriority: compatibilityReadyLane?.topPriority ?? null,
		readyLeafCount: readyLeaves.length
	};
}

/** Run every planning-state drift check over the assembled inputs. */
export function runPlanningStateChecks(inputs: PlanningStateInputs): PlanningStateCheckResult {
	const findings: PlanningStateFinding[] = [];
	const advisories: PlanningStateFinding[] = [];
	const adrCategoryByNumber = new Map<string, AdrStatusCategory>();
	checkAdrIndexAndStatus(inputs, findings, adrCategoryByNumber);
	checkRoadmapClaims(inputs, findings, adrCategoryByNumber);
	checkStaleBriefs(inputs, findings);
	checkIdeasTier(inputs, findings);
	checkDexTaskState(inputs, findings, advisories);
	const runway = createDexRunway(inputs, findings);
	return { clean: findings.length === 0, findings, advisories, runway };
}
