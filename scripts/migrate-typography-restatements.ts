/**
 * ADR-0038 corpus migration: delete Preset `typography.paperColor` /
 * `typography.inkColor` values that merely restate the active Pack's core
 * `fill-treatment` / `ink-treatment` — absent keys now resolve to the Pack
 * cores via `resolveTypographyColors`, so a restatement is dead weight that
 * pins the composition to one Pack's look.
 *
 * Formatting-preserving: edits are surgical string operations on the
 * typography member only (never a whole-document JSON.stringify), then the
 * result is re-parsed and deep-compared against the expected object before
 * anything is written.
 *
 * Usage:
 *   npx tsx scripts/migrate-typography-restatements.ts          # dry run (default)
 *   npx tsx scripts/migrate-typography-restatements.ts --write  # apply deletions
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The Pack manifests transitively import @fontsource side-effect stylesheets
// (`packs/syntax/fonts.ts`), which Node/tsx cannot load — stub `.css` modules
// so the registry is importable outside Vite (same pattern as verify-presets).
registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith('.css')) {
			return { format: 'module', source: '', shortCircuit: true };
		}
		return nextLoad(url, context);
	}
});

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const packRegistryModulePath = resolve(repoRoot, 'src/lib/platform/packs/registry.ts');
const packResolveModulePath = resolve(repoRoot, 'src/lib/platform/packs/resolve.ts');

interface PackManifestLike {
	slug: string;
}

const { PACK_REGISTRY } = (await import(pathToFileURL(packRegistryModulePath).href)) as {
	PACK_REGISTRY: Readonly<Record<string, PackManifestLike>>;
};
const { resolveTypographyColors } = (await import(pathToFileURL(packResolveModulePath).href)) as {
	resolveTypographyColors: (
		manifest: PackManifestLike,
		typography: { paperColor?: string; inkColor?: string }
	) => { paperColor: string; inkColor: string };
};

const shouldWrite = process.argv.includes('--write');

/** Normalize a hex colour for comparison: lowercase, 3/4-digit expanded to 6/8. */
function normalizeHex(value: string): string | null {
	const match = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
	if (!match) {
		return null;
	}
	const digits = match[1].toLowerCase();
	if (digits.length === 3 || digits.length === 4) {
		return `#${[...digits].map((d) => d + d).join('')}`;
	}
	if (digits.length === 6 || digits.length === 8) {
		return `#${digits}`;
	}
	return null;
}

function hexEquals(a: string, b: string): boolean {
	const na = normalizeHex(a);
	const nb = normalizeHex(b);
	return na !== null && nb !== null && na === nb;
}

/** Canonical (key-sorted) stringify for structural deep-equality checks. */
function canonicalize(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalize).join(',')}]`;
	}
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value);
}

/** Find the index of the `}` matching the `{` at `openIndex`, string-aware. */
function findMatchingBrace(text: string, openIndex: number): number {
	let depth = 0;
	let inString = false;
	for (let i = openIndex; i < text.length; i += 1) {
		const char = text[i];
		if (inString) {
			if (char === '\\') {
				i += 1;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
		} else if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return i;
			}
		}
	}
	throw new Error(`Unbalanced braces from index ${openIndex}`);
}

interface Slice {
	start: number;
	end: number; // inclusive index of the closing brace
}

/**
 * Locate the raw-text slice of the typography object whose parsed value
 * matches `expected` (guards against the literal appearing inside strings).
 */
function findTypographySlice(raw: string, expected: unknown): Slice {
	const memberRe = /"typography"\s*:\s*\{/g;
	let match: RegExpExecArray | null;
	while ((match = memberRe.exec(raw)) !== null) {
		const start = match.index + match[0].length - 1;
		let end: number;
		try {
			end = findMatchingBrace(raw, start);
		} catch {
			continue;
		}
		try {
			const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
			if (canonicalize(parsed) === canonicalize(expected)) {
				return { start, end };
			}
		} catch {
			// A false positive inside a string literal — keep scanning.
		}
	}
	throw new Error('typography member not found in raw text');
}

/**
 * Delete one string-valued member from a JSON object's raw text, preserving
 * the surrounding formatting (single-line and member-per-line forms).
 */
function deleteMember(objectText: string, key: string): string {
	const memberRe = new RegExp(`"${key}"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"`);
	const match = memberRe.exec(objectText);
	if (!match) {
		throw new Error(`member "${key}" not found in typography object text`);
	}
	const start = match.index;
	const end = start + match[0].length;
	const after = objectText.slice(end);
	const trailingComma = /^\s*,\s*/.exec(after);
	if (trailingComma) {
		return objectText.slice(0, start) + objectText.slice(end + trailingComma[0].length);
	}
	const before = objectText.slice(0, start);
	const leadingComma = /,\s*$/.exec(before);
	if (!leadingComma) {
		throw new Error(`member "${key}" is the only member — refusing to leave an empty object`);
	}
	return before.slice(0, start - leadingComma[0].length) + objectText.slice(end);
}

interface TypographyValue {
	fontFamily?: string;
	paperColor?: string;
	inkColor?: string;
	[key: string]: unknown;
}

interface FileReport {
	file: string;
	pack: string;
	surfaceType: string;
	paperVerdict: string;
	inkVerdict: string;
	deletions: number;
}

interface Survivor {
	file: string;
	surfaceType: string;
	field: 'paperColor' | 'inkColor';
	value: string;
	packValue: string;
}

const presetDir = resolve(repoRoot, 'src/lib/presets');
const files = (await readdir(presetDir)).filter((file) => file.endsWith('.json')).sort();

const reports: FileReport[] = [];
const survivors: Survivor[] = [];
let totalDeletions = 0;
let filesChanged = 0;

for (const file of files) {
	const path = resolve(presetDir, file);
	const raw = await readFile(path, 'utf8');
	const json = JSON.parse(raw) as {
		pack?: string;
		state?: { typography?: TypographyValue; surface?: { type?: string } };
	};

	const packSlug = json.pack;
	if (typeof packSlug !== 'string' || !(packSlug in PACK_REGISTRY)) {
		throw new Error(`${file}: unknown or missing pack "${String(packSlug)}"`);
	}
	const manifest = PACK_REGISTRY[packSlug];
	const packCore = resolveTypographyColors(manifest, {});
	const surfaceType = json.state?.surface?.type ?? '(none)';
	const typography = json.state?.typography;

	if (typography === undefined) {
		reports.push({
			file,
			pack: packSlug,
			surfaceType,
			paperVerdict: 'absent',
			inkVerdict: 'absent',
			deletions: 0
		});
		continue;
	}

	const fields: Array<{ field: 'paperColor' | 'inkColor'; packValue: string }> = [
		{ field: 'paperColor', packValue: packCore.paperColor },
		{ field: 'inkColor', packValue: packCore.inkColor }
	];

	const verdicts: Record<'paperColor' | 'inkColor', string> = {
		paperColor: 'absent',
		inkColor: 'absent'
	};
	const toDelete: Array<'paperColor' | 'inkColor'> = [];

	for (const { field, packValue } of fields) {
		const value = typography[field];
		if (typeof value !== 'string') {
			continue;
		}
		if (hexEquals(value, packValue)) {
			toDelete.push(field);
			verdicts[field] = `DELETE ${value} (= pack ${packValue})`;
		} else {
			verdicts[field] = `keep ${value}`;
			survivors.push({ file, surfaceType, field, value, packValue });
		}
	}

	if (toDelete.length > 0) {
		const slice = findTypographySlice(raw, typography);
		let objectText = raw.slice(slice.start, slice.end + 1);
		for (const field of toDelete) {
			objectText = deleteMember(objectText, field);
		}
		const edited = raw.slice(0, slice.start) + objectText + raw.slice(slice.end + 1);

		// Prove validity: the edited file must parse, and must equal the
		// original document minus exactly the deleted keys.
		const expected = JSON.parse(raw) as { state: { typography: TypographyValue } };
		for (const field of toDelete) {
			delete expected.state.typography[field];
		}
		const reparsed: unknown = JSON.parse(edited);
		if (canonicalize(reparsed) !== canonicalize(expected)) {
			throw new Error(`${file}: surgical edit changed more than the deleted keys — aborting`);
		}

		if (shouldWrite) {
			await writeFile(path, edited, 'utf8');
		}
		totalDeletions += toDelete.length;
		filesChanged += 1;
	}

	reports.push({
		file,
		pack: packSlug,
		surfaceType,
		paperVerdict: verdicts.paperColor,
		inkVerdict: verdicts.inkColor,
		deletions: toDelete.length
	});
}

const fileWidth = Math.max(...reports.map((r) => r.file.length), 4);
const paperWidth = Math.max(...reports.map((r) => r.paperVerdict.length), 10);
console.log(
	`${shouldWrite ? 'WRITE MODE — deletions applied' : 'DRY RUN — no files modified (pass --write to apply)'}\n`
);
console.log(
	`${'file'.padEnd(fileWidth)}  ${'pack'.padEnd(14)}  ${'paperColor'.padEnd(paperWidth)}  inkColor`
);
for (const report of reports) {
	console.log(
		`${report.file.padEnd(fileWidth)}  ${report.pack.padEnd(14)}  ${report.paperVerdict.padEnd(paperWidth)}  ${report.inkVerdict}`
	);
}

console.log(
	`\nSummary: ${totalDeletions} deletion(s) across ${filesChanged} file(s)${shouldWrite ? ' (written)' : ' (dry run)'}.`
);

if (survivors.length > 0) {
	console.log(`\nSURVIVORS (${survivors.length}) — intentional overrides to hand-review, grouped:`);
	const groups = new Map<string, Survivor[]>();
	for (const survivor of survivors) {
		const key = `${survivor.surfaceType} | ${survivor.field} = ${survivor.value} (pack: ${survivor.packValue})`;
		const group = groups.get(key) ?? [];
		group.push(survivor);
		groups.set(key, group);
	}
	for (const [key, group] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
		console.log(`  ${key}`);
		for (const survivor of group) {
			console.log(`      ${survivor.file}`);
		}
	}
} else {
	console.log('\nNo survivors — every declared paperColor/inkColor restated its Pack.');
}
