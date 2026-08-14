import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

export const TELEMETRY_SCHEMA_VERSION = 1;
export const MAX_LEDGER_BYTES = 5 * 1024 * 1024;

export type UsageSnapshot = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		total: number;
	};
};

export type FactoryDimensions = {
	name?: string;
	profile?: string;
	stage?: string;
	definitionVersion?: string;
};

export type CockpitEvent = {
	schemaVersion: 1;
	timestamp: string;
	session: string;
	factory: FactoryDimensions;
	type: 'turn' | 'compaction' | 'skill-catalog';
	payload: Record<string, unknown>;
};

export type SkillMetadata = {
	name: string;
	description: string;
	filePath: string;
	disableModelInvocation?: boolean;
	kind?: string;
	python?: { importName?: string };
};

export type SkillOverlap = {
	left: string;
	right: string;
	score: number;
};

export type CockpitSummary = {
	turns: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	totalCost: number;
	requestBytes: number;
	toolCalls: number;
	toolErrors: number;
	toolDurationMs: number;
	compactions: number;
	skillUses: Record<string, number>;
	latestSkillCatalog?: {
		count: number;
		metadataBytes: number;
		overlaps: SkillOverlap[];
	};
};

const STOP_WORDS = new Set([
	'and',
	'the',
	'for',
	'with',
	'when',
	'this',
	'that',
	'from',
	'into',
	'use',
	'using',
	'user',
	'users',
	'asked',
	'asks',
	'work',
	'working',
	'code',
	'project',
	'skill',
	'agent',
	'including',
	'including',
	'or',
	'to',
	'of',
	'in',
	'on',
	'a',
	'an',
	'is',
	'are',
	'be',
	'as',
	'it'
]);

export function sessionFingerprint(sessionFile: string | undefined): string {
	return createHash('sha256')
		.update(sessionFile ?? 'ephemeral')
		.digest('hex')
		.slice(0, 16);
}

export function safeFactoryDimensions(env: NodeJS.ProcessEnv): FactoryDimensions {
	return {
		name: boundedDimension(env.FACTORY_NAME),
		profile: boundedDimension(env.FACTORY_PROFILE),
		stage: boundedDimension(env.FACTORY_STAGE),
		definitionVersion: boundedDimension(env.FACTORY_DEFINITION_VERSION)
	};
}

function boundedDimension(value: string | undefined): string | undefined {
	if (!value || !/^[A-Za-z0-9._:-]{1,120}$/.test(value)) return undefined;
	return value;
}

export function serializedByteLength(value: unknown): number {
	try {
		return Buffer.byteLength(JSON.stringify(value));
	} catch {
		return 0;
	}
}

export function skillCatalogSnapshot(skills: readonly SkillMetadata[]) {
	const invokable = skills.filter((skill) => !skill.disableModelInvocation);
	return {
		count: invokable.length,
		metadataBytes: serializedByteLength(
			invokable.map(({ name, description, kind }) => ({ name, description, kind }))
		),
		overlaps: findSkillOverlaps(invokable)
	};
}

export function findSkillOverlaps(
	skills: readonly Pick<SkillMetadata, 'name' | 'description'>[],
	threshold = 0.34
): SkillOverlap[] {
	const tokens = skills.map((skill) => descriptionTokens(skill.description));
	const overlaps: SkillOverlap[] = [];
	for (let left = 0; left < skills.length; left += 1) {
		for (let right = left + 1; right < skills.length; right += 1) {
			const score = jaccard(tokens[left], tokens[right]);
			if (score < threshold) continue;
			overlaps.push({
				left: skills[left].name,
				right: skills[right].name,
				score: Math.round(score * 100) / 100
			});
		}
	}
	return overlaps.sort((a, b) => b.score - a.score).slice(0, 20);
}

function descriptionTokens(description: string): Set<string> {
	return new Set(
		description
			.toLowerCase()
			.match(/[a-z0-9]+/g)
			?.filter((token) => token.length > 1 && !STOP_WORDS.has(token)) ?? []
	);
}

function jaccard(left: Set<string>, right: Set<string>): number {
	if (left.size === 0 || right.size === 0) return 0;
	let intersection = 0;
	for (const token of left) if (right.has(token)) intersection += 1;
	const union = left.size + right.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

export function inferSkillUses(args: unknown, skills: readonly SkillMetadata[]): string[] {
	let serialized = '';
	try {
		serialized = JSON.stringify(args);
	} catch {
		return [];
	}
	return skills
		.filter((skill) => {
			const importName = skill.python?.importName;
			return (
				serialized.includes(skill.filePath) ||
				serialized.includes(`/skill:${skill.name}`) ||
				serialized.includes(`${skill.name}/SKILL.md`) ||
				(importName ? serialized.includes(importName) : false)
			);
		})
		.map((skill) => skill.name);
}

export async function appendCockpitEvent(path: string, event: CockpitEvent): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await rotateLedger(path);
	await appendFile(path, `${JSON.stringify(event)}\n`, 'utf8');
}

async function rotateLedger(path: string): Promise<void> {
	try {
		const current = await stat(path);
		if (current.size < MAX_LEDGER_BYTES) return;
		await rename(path, `${path}.1`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
}

export async function readCockpitEvents(path: string, session?: string): Promise<CockpitEvent[]> {
	let content: string;
	try {
		content = await readFile(path, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw error;
	}
	const events: CockpitEvent[] = [];
	for (const line of content.split('\n')) {
		if (!line) continue;
		try {
			const event = JSON.parse(line) as CockpitEvent;
			if (event.schemaVersion !== TELEMETRY_SCHEMA_VERSION) continue;
			if (session && event.session !== session) continue;
			events.push(event);
		} catch {
			// A partial final append is ignored; earlier durable events remain useful.
		}
	}
	return events;
}

export function summarizeCockpit(events: readonly CockpitEvent[]): CockpitSummary {
	const summary: CockpitSummary = {
		turns: 0,
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		totalCost: 0,
		requestBytes: 0,
		toolCalls: 0,
		toolErrors: 0,
		toolDurationMs: 0,
		compactions: 0,
		skillUses: {}
	};
	for (const event of events) {
		if (event.type === 'compaction') summary.compactions += 1;
		if (event.type === 'skill-catalog') {
			summary.latestSkillCatalog = event.payload as CockpitSummary['latestSkillCatalog'];
		}
		if (event.type !== 'turn') continue;
		summary.turns += 1;
		const usage = event.payload.usage as UsageSnapshot | undefined;
		if (usage) {
			summary.input += usage.input;
			summary.output += usage.output;
			summary.cacheRead += usage.cacheRead;
			summary.cacheWrite += usage.cacheWrite;
			summary.totalTokens += usage.totalTokens;
			summary.totalCost += usage.cost.total;
		}
		summary.requestBytes += numberValue(event.payload.requestBytes);
		summary.toolCalls += numberValue(event.payload.toolCalls);
		summary.toolErrors += numberValue(event.payload.toolErrors);
		summary.toolDurationMs += numberValue(event.payload.toolDurationMs);
		for (const name of stringArray(event.payload.skillUses)) {
			summary.skillUses[name] = (summary.skillUses[name] ?? 0) + 1;
		}
	}
	return summary;
}

function numberValue(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}
