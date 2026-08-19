import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

interface PresetInventoryEntry {
	slug: string;
	kind: 'deliverable' | 'fixture';
}

interface AuditTableRow {
	slug: string;
	disposition: string;
}

const PRESET_DIRECTORY = path.resolve('src/lib/presets');
const AUDIT_PATH = path.resolve('docs/starter-template-coverage-audit.md');

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePresetKind(value: unknown, filename: string): 'deliverable' | 'fixture' {
	if (!isRecord(value)) throw new TypeError(`${filename} must contain a JSON object.`);
	if (value.kind === undefined || value.kind === 'deliverable') return 'deliverable';
	if (value.kind === 'fixture') return 'fixture';
	throw new TypeError(`${filename} has unsupported kind ${String(value.kind)}.`);
}

async function readPresetInventory(): Promise<PresetInventoryEntry[]> {
	const filenames = (await readdir(PRESET_DIRECTORY))
		.filter((filename) => filename.endsWith('.json'))
		.sort();
	return Promise.all(
		filenames.map(async (filename): Promise<PresetInventoryEntry> => {
			const value: unknown = JSON.parse(
				await readFile(path.join(PRESET_DIRECTORY, filename), 'utf8')
			);
			return {
				slug: filename.replace(/\.json$/, ''),
				kind: parsePresetKind(value, filename)
			};
		})
	);
}

function auditSection(markdown: string, heading: string, nextHeading: string): string {
	const start = markdown.indexOf(heading);
	const end = markdown.indexOf(nextHeading, start + heading.length);
	if (start < 0 || end < 0) {
		throw new Error(`Audit must contain ${heading} followed by ${nextHeading}.`);
	}
	return markdown.slice(start + heading.length, end);
}

function parseAuditRows(section: string): AuditTableRow[] {
	return section.split('\n').flatMap((line): AuditTableRow[] => {
		const cells = line.split('|').map((cell) => cell.trim());
		const slugMatch = cells[1]?.match(/^`([^`]+)`$/);
		const disposition = cells[4];
		if (!slugMatch || disposition === undefined) return [];
		const slug = slugMatch[1];
		if (slug === undefined) return [];
		return [{ slug, disposition }];
	});
}

function compareSlugSets(
	label: string,
	inventory: readonly PresetInventoryEntry[],
	rows: readonly AuditTableRow[]
): string[] {
	const errors: string[] = [];
	const expected = new Set(inventory.map((entry) => entry.slug));
	const seen = new Set<string>();
	for (const row of rows) {
		if (seen.has(row.slug)) errors.push(`${label}: duplicate audit row for ${row.slug}`);
		seen.add(row.slug);
		if (!expected.has(row.slug)) errors.push(`${label}: audit names unknown slug ${row.slug}`);
	}
	for (const slug of expected) {
		if (!seen.has(slug)) errors.push(`${label}: missing audit row for ${slug}`);
	}
	return errors;
}

async function main(): Promise<void> {
	const [inventory, markdown] = await Promise.all([
		readPresetInventory(),
		readFile(AUDIT_PATH, 'utf8')
	]);
	const deliverables = inventory.filter((entry) => entry.kind === 'deliverable');
	const fixtures = inventory.filter((entry) => entry.kind === 'fixture');
	const listedRows = parseAuditRows(
		auditSection(markdown, '## Listed Preset dispositions', '## Fixture inventory')
	);
	const fixtureRows = parseAuditRows(
		auditSection(markdown, '## Fixture inventory', '## Coverage findings')
	);
	const errors = [
		...compareSlugSets('listed Presets', deliverables, listedRows),
		...compareSlugSets('fixtures', fixtures, fixtureRows)
	];
	const count = listedRows.filter((row) => row.disposition === 'Count').length;
	const fold = listedRows.filter((row) => row.disposition.startsWith('Fold into')).length;
	const demote = listedRows.filter((row) => row.disposition === 'Demote to fixture').length;
	if (count + fold + demote !== listedRows.length) {
		errors.push('Every listed disposition must be Count, Fold into …, or Demote to fixture.');
	}
	const suffixedDeliverables = deliverables.filter((entry) =>
		/(?:-horizontal|-vertical|-clean-light|-crt|-editorial-mono)$/.test(entry.slug)
	);
	if (suffixedDeliverables.length > 0) {
		errors.push(
			`Listed Presets may not carry orientation or Pack suffixes: ${suffixedDeliverables
				.map((entry) => entry.slug)
				.join(', ')}`
		);
	}
	if (errors.length > 0) {
		for (const error of errors) console.error(`✗ ${error}`);
		process.exitCode = 1;
		return;
	}
	console.log(`✓ ${inventory.length} corpus Presets inventoried`);
	console.log(`✓ ${deliverables.length} listed Presets have creator-job dispositions`);
	console.log(`✓ ${fixtures.length} fixtures remain excluded from the listing`);
	console.log(`✓ honest structural baseline: ${count} counted, ${fold} folds, ${demote} demotions`);
	console.log('✓ no listed Preset uses an orientation or Pack suffix');
}

await main();
