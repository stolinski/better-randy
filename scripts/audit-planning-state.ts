// Planning-state drift audit — mechanizes the 2026-08-04 baseline
// reconciliation (dex 6qlggrda): roadmap/ADR status claims, stale shipped
// Briefs, historical files in docs/ideas, open dex tasks that describe shipped
// work, blocker contradictions, and co-equal strategic ready leaves.
//
// The check logic lives in scripts/planning-state-checks.ts (pure, fixture-
// tested); this entry assembles real inputs from the repo docs, the built-in
// Preset listing, and `dex list --all --json`.
//
// Usage: node --experimental-strip-types scripts/audit-planning-state.ts
// Output: JSON report on stdout; exit 1 when any gating finding (or a crash)
// is present. Advisories never gate.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	type PlanningDexTask,
	type PlanningMarkdownFile,
	type PlanningPresetListing,
	type PlanningStateCheckResult,
	runPlanningStateChecks
} from './planning-state-checks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

async function readMarkdownFile(relativePath: string): Promise<PlanningMarkdownFile> {
	return {
		path: relativePath,
		markdown: await readFile(resolve(repoRoot, relativePath), 'utf8')
	};
}

async function readMarkdownFolder(
	relativeFolder: string
): Promise<{ index: PlanningMarkdownFile | null; docs: PlanningMarkdownFile[] }> {
	const folder = resolve(repoRoot, relativeFolder);
	if (!existsSync(folder)) return { index: null, docs: [] };
	const files = (await readdir(folder)).filter((file) => file.endsWith('.md')).sort();
	let index: PlanningMarkdownFile | null = null;
	const docs: PlanningMarkdownFile[] = [];
	for (const file of files) {
		const entry = await readMarkdownFile(`${relativeFolder}/${file}`);
		if (file === 'README.md') index = entry;
		else docs.push(entry);
	}
	return { index, docs };
}

async function readPresetListing(): Promise<PlanningPresetListing[]> {
	const presetsDir = resolve(repoRoot, 'src/lib/presets');
	const files = (await readdir(presetsDir)).filter((file) => file.endsWith('.json')).sort();
	const presets: PlanningPresetListing[] = [];
	for (const file of files) {
		const slug = file.replace(/\.json$/, '');
		let kind = '';
		try {
			const parsed: unknown = JSON.parse(await readFile(resolve(presetsDir, file), 'utf8'));
			if (parsed && typeof parsed === 'object' && 'kind' in parsed) {
				const declared = (parsed as { kind: unknown }).kind;
				if (typeof declared === 'string') kind = declared;
			}
		} catch {
			// A malformed preset is corpus-verify's finding, not a planning one.
		}
		presets.push({ slug, kind });
	}
	return presets;
}

/**
 * Task records from the dex CLI when it is installed; from the committed
 * `.dex/tasks.jsonl` store otherwise (CI has no dex binary — the store is the
 * same records, one JSON object per line).
 */
function loadDexTaskRecords(): unknown {
	try {
		return JSON.parse(
			execFileSync('dex', ['list', '--all', '--json'], {
				cwd: repoRoot,
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024
			})
		);
	} catch (error) {
		if ((error as { code?: unknown }).code !== 'ENOENT') throw error;
		return readFileSync(resolve(repoRoot, '.dex/tasks.jsonl'), 'utf8')
			.split('\n')
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line) as unknown);
	}
}

function readDexTasks(): PlanningDexTask[] {
	const parsed = loadDexTaskRecords();
	if (!Array.isArray(parsed)) {
		throw new Error('dex task records did not parse to an array');
	}
	return parsed.map((entry) => {
		const record = entry as {
			id: string;
			parent_id: string | null;
			name: string;
			description: string | null;
			priority: number;
			completed: boolean;
			started_at: string | null;
			blockedBy?: string[];
		};
		return {
			id: record.id,
			parentId: record.parent_id,
			name: record.name,
			description: record.description ?? '',
			priority: record.priority,
			completed: record.completed,
			started: record.started_at !== null,
			blockedBy: record.blockedBy ?? []
		};
	});
}

let crash: string | null = null;
let result: PlanningStateCheckResult = {
	clean: true,
	findings: [],
	advisories: [],
	runway: {
		activeLanes: [],
		readyLanes: [],
		activeTaskId: null,
		activeTaskName: null,
		activeEpicId: null,
		nextTaskId: null,
		nextTaskName: null,
		topPriority: null,
		readyLeafCount: 0
	}
};
let counts = {
	adrDocs: 0,
	briefDocs: 0,
	ideaDocs: 0,
	presets: 0,
	dexOpenTasks: 0
};

try {
	const roadmap = await readMarkdownFile('docs/roadmap.md');
	const adrFolder = await readMarkdownFolder('docs/adr');
	if (!adrFolder.index) {
		throw new Error('docs/adr/README.md (the ADR index) is missing');
	}
	const briefFolder = await readMarkdownFolder('docs/briefs');
	const ideaFolder = await readMarkdownFolder('docs/ideas');
	if (!ideaFolder.index) {
		throw new Error('docs/ideas/README.md (the ideas index) is missing');
	}
	const historyFolder = await readMarkdownFolder('docs/history');
	const presets = await readPresetListing();
	const dexTasks = readDexTasks();

	counts = {
		adrDocs: adrFolder.docs.length,
		briefDocs: briefFolder.docs.length,
		ideaDocs: ideaFolder.docs.length,
		presets: presets.length,
		dexOpenTasks: dexTasks.filter((task) => !task.completed).length
	};
	result = runPlanningStateChecks({
		roadmap,
		adrIndex: adrFolder.index,
		adrDocs: adrFolder.docs,
		briefDocs: briefFolder.docs,
		ideaIndex: ideaFolder.index,
		ideaDocs: ideaFolder.docs,
		historyIndex: historyFolder.index,
		historyDocs: historyFolder.docs,
		presets,
		dexTasks
	});
} catch (error) {
	crash = error instanceof Error ? error.message : String(error);
}

const clean = crash === null && result.clean;
const report = {
	audit: 'planning-state',
	generatedAt: new Date().toISOString(),
	...counts,
	runway: result.runway,
	findings: result.findings,
	advisories: result.advisories,
	crash,
	clean
};

console.log(JSON.stringify(report, null, 2));
console.error(
	crash
		? `audit-planning-state: CRASH — ${crash}`
		: result.findings.length > 0
			? `audit-planning-state: ${result.findings.length} planning drift finding(s), ${result.advisories.length} advisory(ies): ${[
					...new Set(result.findings.map((finding) => finding.check))
				].join(', ')}`
			: `audit-planning-state: clean (${result.advisories.length} advisory(ies)) across ${counts.adrDocs} ADRs, ${counts.briefDocs} Briefs, ${counts.ideaDocs} ideas, ${counts.dexOpenTasks} open dex tasks`
);
if (crash || result.findings.length > 0) process.exit(1);
