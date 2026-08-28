/**
 * Structural enforcement of ADR-0053's Legacy Supers compatibility matrix.
 *
 * ADR-0053 classifies every remaining `supers` spelling with exactly one name
 * disposition. Its closing consequence is the rule this module implements:
 * because every occurrence is classified, an occurrence that is neither a
 * declared legacy surface nor a historical record is a defect.
 *
 * Three failure modes, deliberately no more:
 *
 * 1. `unclassified-legacy-name` — a Legacy Supers spelling in a current file
 *    that no declared surface below covers. Either it was missed by a rename,
 *    or it is a new surface that owes an ADR-0053 matrix row.
 * 2. `stale-current-name` — a `rename-now` value that ADR-0053 says must no
 *    longer exist anywhere current. These never come back, in any file.
 * 3. `undeclared-legacy-documentation` — current documentation spells a Legacy
 *    Supers name without anywhere saying under which disposition, so a reader
 *    cannot tell a deliberate legacy reader from stale prose.
 *
 * `DECLARED_LEGACY_SURFACES` is the executable mirror of the ADR matrix, keyed
 * by value rather than by file, so a row here reads against its ADR row. Adding
 * a surface here without adding its matrix row is the guess the ADR forbids.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Every Legacy Supers spelling, and nothing else. The lookahead excludes the
 * ordinary English words that share the prefix — supersede(d/s/ing),
 * supersession, superscript, superset — which carry no naming meaning.
 */
const LEGACY_NAME_PATTERN = /supers(?!ed|ession|cript|et)/gi;

/** The same test without `g`, so a presence check cannot carry `lastIndex` state. */
const LEGACY_NAME_PRESENCE_PATTERN = new RegExp(LEGACY_NAME_PATTERN.source, 'i');

export const LEGACY_NAME_DISPOSITION_CONFIG = Object.freeze({
	scannedExtensions: [
		'.ts',
		'.tsx',
		'.js',
		'.jsx',
		'.mjs',
		'.cjs',
		'.svelte',
		'.md',
		'.json',
		'.jsonc',
		'.yaml',
		'.yml',
		'.html',
		'.css',
		'.py',
		'.sh'
	],

	// Extensionless executables that still carry classified values.
	scannedExtensionlessRoots: ['scripts/git-hooks'],

	scannedFileExclusions: ['pnpm-lock.yaml', 'package-lock.json'],

	/**
	 * Records ADR-0053 never rewrites. An occurrence inside one of these is
	 * never a naming violation and never evidence the rename is incomplete.
	 */
	historicalRoots: [
		{
			path: 'docs/adr',
			reason:
				'ADRs are decision-time records; ADR-0053 itself is the contract this check enforces, not a surface it audits.'
		},
		{ path: 'docs/history', reason: 'Superseded documentation, retained verbatim.' },
		{ path: 'docs/critic-captures', reason: 'Dated advisory captures of past renders.' },
		{ path: '.dex', reason: 'Append-only task history authored before and across the rename.' },
		{
			path: 'fixtures',
			reason:
				'Consumer fixtures of the swamp control plane removed on 2026-08-28; nothing current reads them.'
		},
		{
			path: '.prime',
			reason:
				'Agent scratch captures, critic notes, and extension code from that same removed control plane.'
		}
	],

	/**
	 * Not part of this repository's naming surface at all.
	 *
	 * `docs-site` is a separately deployed sub-application whose worker name and
	 * title parsing ADR-0053's matrix does not list. Classifying a deployment
	 * identity is its own decision and owes its own matrix row; guessing one
	 * here is exactly what the "no global string replacement" rule prevents.
	 */
	unscannedRoots: [
		{ path: 'node_modules', reason: 'Third-party packages.' },
		{ path: '.git', reason: 'Git history is never rewritten.' },
		{ path: '.svelte-kit', reason: 'Generated build output.' },
		{ path: 'build', reason: 'Generated build output.' },
		{ path: 'dist', reason: 'Generated build output.' },
		{
			path: 'docs-site',
			reason: 'Separately deployed sub-application outside the ADR-0053 matrix.'
		},
		{
			path: 'scripts/fixtures',
			reason: 'Check fixtures deliberately contain the violations they prove.'
		},
		{
			path: '.claude/skills/software-factory',
			reason:
				'Pulled verbatim from @swamp/software-factory and re-fetched on update, so its examples are not ours to rename.'
		}
	],

	/**
	 * Current GFX vocabulary that happens to contain the old spelling. "Legacy
	 * Supers artifact" is a ratified glossary term in docs/CONTEXT.md, so naming
	 * it — in prose, in an identifier, or in a module path — is current use.
	 */
	currentVocabularyPatterns: [/\bLegacy Supers\b/g, /\blegacy[-_]supers\b/gi, /\bLEGACY_SUPERS_/g],

	declaredSurfaces: [
		{
			value: 'the Legacy Supers reader module',
			disposition: 'current',
			reason:
				'legacy-supers-compatibility.ts is the one module that names every accepted legacy spelling, and its test is the fixture proving each one still loads.',
			paths: [
				'src/lib/utils/legacy-supers-compatibility.ts',
				'src/lib/utils/legacy-supers-compatibility.test.ts'
			],
			pattern: /supers/gi
		},
		{
			value: 'supers@1 / supers@2 composition schema id',
			disposition: 'accept-old / write-new',
			reason:
				'Ingress folds the Legacy Supers id onto the id writers emit; the two name one identical document shape, so no corpus Preset or saved composition needs migrating.',
			paths: [
				'src/lib/presets/*.json',
				'src/lib/platform/preset-ingress.ts',
				'src/lib/platform/preset-ingress.test.ts',
				'src/lib/platform/engine-schema.ts',
				'docs/CONTEXT.md',
				'docs/preset-format.md'
			],
			pattern: /\bsupers@[12]\b/g
		},
		{
			value: 'supers-sync@1 marker receipt',
			disposition: 'accept-old / write-new',
			reason:
				'The receipt lives in the editor’s Resolve project; a group nobody re-syncs stays findable forever.',
			paths: [
				'src/lib/utils/marker-sync.ts',
				'src/lib/utils/marker-sync.test.ts',
				'docs/CONTEXT.md'
			],
			pattern: /\bsupers-sync@1\b/g
		},
		{
			value: 'supers <slug> marker head note',
			disposition: 'accept-old / write-new',
			reason:
				'A human typed the note onto the editor’s timeline; the sync reads both spellings and rewrites neither.',
			paths: [
				'src/lib/utils/marker-sync.ts',
				'src/lib/utils/marker-sync.test.ts',
				'.claude/skills/resolve-sync/SKILL.md'
			],
			pattern: /'supers '|\bsupers <slug>|\bsupers [a-z][a-z0-9-]*\b/g
		},
		{
			value: 'Supers bin and SUPERS track in the editor’s Resolve project',
			disposition: 'accept-old / write-new',
			reason:
				'Placement prefers a bin or track the project already has, so a rename never splits one edit across two of either.',
			paths: ['scripts/resolve-place.py', '.claude/skills/resolve-sync/SKILL.md'],
			pattern: /"SUPERS"|"Supers"|`SUPERS`|`Supers`/g
		},
		{
			value: 'supers-export- temp-directory prefix',
			disposition: 'accept-old / write-new',
			reason:
				'The startup sweep spans both prefixes, so a deploy or rollback across the rename cannot orphan the previous release’s private export directories.',
			paths: ['src/routes/api/export/export.test.ts'],
			pattern: /\bsupers-export-[a-z-]*/g
		},
		{
			value: 'supers@<sha> Sentry release string',
			disposition: 'accept-old / write-new',
			reason:
				'Every historical event carries it; new releases register as gfx@<sha> while the old ones stay queryable.',
			paths: [
				'src/lib/platform/git-version.server.ts',
				'scripts/git-hooks/post-commit',
				'docs/CONTEXT.md',
				'docs/sentry-dev-flow.md'
			],
			pattern: /\bsupers@(?:<git sha>|<sha>|\$\{sha\})/g
		},
		{
			value: 'the scott-tolinski-projects/supers Sentry project and its SUPERS-<n> short ids',
			disposition: 'frozen',
			reason:
				'The project holds every historical event and lives in Sentry; renaming it would invalidate every recorded short id, DSN, and CLI invocation.',
			paths: [
				'scripts/git-hooks/post-commit',
				'workflows/*.yaml',
				'docs/sentry-dev-flow.md',
				'docs/project-control-plane.md',
				'.claude/skills/gfx-factory/SKILL.md'
			],
			pattern: /projects\/supers\b|--project supers\b|\bSUPERS-|\bSupers Dev\b/g
		},
		{
			value: 'SUPERS_* environment variables',
			disposition: 'deprecated alias',
			reason:
				'readGfxEnvironmentValue prefers the GFX_ name and falls back to this one, so an existing shell or launchd profile keeps working.',
			paths: ['docs/CONTEXT.md'],
			pattern: /\bSUPERS_[A-Z_]*\*?/g
		},
		{
			value: 'Supers-Delivery-* directives and metadata.supersDelivery',
			disposition: 'deprecated alias',
			reason:
				'Open Dex tasks already carry the Legacy Supers spelling, and both route identically through change-impact-classifier.ts.',
			paths: [
				'scripts/change-impact-classifier.ts',
				'scripts/change-impact-classifier.test.ts',
				'.claude/skills/gfx-domain-aware-implementation/SKILL.md'
			],
			pattern: /\bSupers-Delivery-[A-Za-z${}*-]+|\bsupersDelivery\b|\bSupers spelling\b/g
		},
		{
			value: 'supers-foley-<cue> PRNG seed',
			disposition: 'frozen',
			reason:
				'The seed determines the bytes of the committed cue WAVs; renaming it regenerates different audio on the next gen:sounds.',
			paths: ['scripts/gen-foley-sounds.mjs'],
			pattern: /\bsupers-foley-(?:<cue>|\$\{cue\})/g
		},
		{
			value: 'Supers as the legacy product name, named by the naming contract itself',
			disposition: 'historical',
			reason:
				'The glossary and the binding rules have to spell the name they retire in order to retire it.',
			paths: ['AGENTS.md', 'docs/CONTEXT.md'],
			pattern: /\bSupers\b|`supers`/g
		},
		{
			value: 'the disposition rule table itself',
			disposition: 'current',
			reason:
				'This module and its test spell every classified and every retired value in order to enforce them.',
			paths: [
				'scripts/check-legacy-name-dispositions.mjs',
				'scripts/check-legacy-name-dispositions.test.mjs'
			],
			pattern: /supers/gi
		}
	],

	/**
	 * ADR-0053 `rename-now` values: the only readers lived in this working tree
	 * and nothing persisted them, so they were renamed outright with every
	 * consumer. None of them may reappear, in any current file.
	 */
	staleCurrentNames: [
		{ pattern: /\bsupers (?:render|batch|preset)\b/g, replacement: 'Use the gfx CLI: `gfx render`, `gfx batch`, `gfx preset`.' },
		{ pattern: /\b(?:pnpm|npm run|scripts\/)supers\b|\bsupers\.ts\b|\bsupers-cli\b/g, replacement: 'Use `pnpm gfx` and `scripts/gfx.ts`.' },
		{ pattern: /__[A-Za-z]*[Ss]upers[A-Za-z]*/g, replacement: 'Use the __gfx* window handle; WebMCP is the supported agent surface.' },
		{ pattern: /\bdata-supers-[a-z-]+/g, replacement: 'Use the data-gfx-* HTML-in-Canvas attribute prefix.' },
		{ pattern: /\bsupers-ease-/g, replacement: 'Use the gfx-ease-<a>-<b>-<c>-<d> GSAP registry name.' },
		{ pattern: /\bSUPERS_TEXT_EFFECT_MODULES\b|\bsupers-effects\b/g, replacement: 'Use GFX_TEXT_EFFECT_MODULES and src/lib/text-animations/gfx-effects/.' },
		{ pattern: /vnd\.supers\./g, replacement: 'Use application/vnd.gfx.media-library-asset+json.' },
		{ pattern: /\bsupers[-.]release\b/g, replacement: 'Use the gfx-release meta name and %gfx.release% placeholder.' },
		{ pattern: /\bsupers-(?:overlay|bumper)\b/g, replacement: 'Use the gfx-overlay / gfx-bumper export basename.' },
		{ pattern: /"name":\s*"supers"/g, replacement: 'The package is named gfx.' },
		{ pattern: /\bsupers-(?:render-matrix|layout-contract|runtime-module-hooks)/g, replacement: 'Use the gfx-* automation filenames.' },
		{ pattern: /\bsupers-(?:export-test|video-store)-/g, replacement: 'Use the gfx-* test and CI temp prefixes.' },
		{ pattern: /@supers\b/g, replacement: 'Use the @gfx handle and the current control-plane model names.' }
	],

	/**
	 * Current documentation may spell a Legacy Supers name, but the file has to
	 * say somewhere under what disposition — otherwise a reader cannot tell a
	 * deliberate legacy reader from prose the rename missed.
	 */
	dispositionDeclarationPattern: /ADR-0053|Legacy Supers|legacy-supers/
});

function normalizePath(filePath) {
	return filePath.split(sep).join('/');
}

function globToRegExp(glob) {
	const source = glob
		.split('**')
		.map((segment) =>
			segment
				.split('*')
				.map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
				.join('[^/]*')
		)
		.join('.*');
	return new RegExp(`^${source}$`);
}

const globCache = new Map();

function matchesGlob(relativeFile, glob) {
	let compiled = globCache.get(glob);
	if (!compiled) {
		compiled = globToRegExp(glob);
		globCache.set(glob, compiled);
	}
	return compiled.test(relativeFile);
}

function isUnderPath(relativeFile, root) {
	return relativeFile === root || relativeFile.startsWith(`${root}/`);
}

function isScannedFile(relativeFile, config) {
	const fileName = relativeFile.split('/').at(-1);
	if (config.scannedFileExclusions.includes(fileName)) return false;
	const extension = extname(fileName);
	if (extension === '') {
		return config.scannedExtensionlessRoots.some((root) => isUnderPath(relativeFile, root));
	}
	return config.scannedExtensions.includes(extension);
}

function collectScannedFiles(absoluteRoot, config) {
	const skippedRoots = [
		...config.unscannedRoots.map((entry) => entry.path),
		...config.historicalRoots.map((entry) => entry.path)
	];
	const files = [];

	function visit(directory) {
		for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			const entryPath = join(directory, entry.name);
			const relativeFile = normalizePath(relative(absoluteRoot, entryPath));
			if (skippedRoots.some((root) => isUnderPath(relativeFile, root))) continue;
			// Dirent symlinks are deliberately not followed: CLAUDE.md is a symlink
			// to AGENTS.md and must not be audited, or reported, twice.
			if (entry.isDirectory()) visit(entryPath);
			else if (entry.isFile() && isScannedFile(relativeFile, config)) files.push(relativeFile);
		}
	}

	visit(absoluteRoot);
	return files;
}

function matchRanges(line, pattern) {
	const scanner = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
	const ranges = [];
	for (const match of line.matchAll(scanner)) {
		ranges.push([match.index, match.index + match[0].length]);
	}
	return ranges;
}

function coveringSurfaces(relativeFile, config) {
	return config.declaredSurfaces.filter((surface) =>
		surface.paths.some((glob) => matchesGlob(relativeFile, glob))
	);
}

function addViolation(violations, file, line, rule, message, remediation) {
	violations.push({ file, line, rule, message, remediation });
}

function auditLegacyNameCoverage(relativeFile, lines, config, violations) {
	const surfaces = coveringSurfaces(relativeFile, config);
	const allowedPatterns = [
		...config.currentVocabularyPatterns,
		...surfaces.map((surface) => surface.pattern)
	];

	for (const [index, line] of lines.entries()) {
		const occurrences = [...line.matchAll(LEGACY_NAME_PATTERN)];
		if (occurrences.length === 0) continue;
		const allowedRanges = allowedPatterns.flatMap((pattern) => matchRanges(line, pattern));
		const uncovered = occurrences.find(
			(occurrence) =>
				!allowedRanges.some(([start, end]) => occurrence.index >= start && occurrence.index < end)
		);
		if (!uncovered) continue;
		addViolation(
			violations,
			relativeFile,
			index + 1,
			'unclassified-legacy-name',
			`Legacy Supers name "${line.slice(uncovered.index, uncovered.index + 40).trim()}" carries no recorded disposition here.`,
			'Rename it to the GFX spelling, or add its ADR-0053 matrix row and the matching declared surface in scripts/check-legacy-name-dispositions.mjs.'
		);
	}
}

function auditStaleCurrentNames(relativeFile, lines, config, violations) {
	const isRuleTable = config.declaredSurfaces
		.find((surface) => surface.value === 'the disposition rule table itself')
		.paths.some((glob) => matchesGlob(relativeFile, glob));
	if (isRuleTable) return;

	for (const [index, line] of lines.entries()) {
		for (const stale of config.staleCurrentNames) {
			const [firstMatch] = matchRanges(line, stale.pattern);
			if (!firstMatch) continue;
			addViolation(
				violations,
				relativeFile,
				index + 1,
				'stale-current-name',
				`"${line.slice(firstMatch[0], firstMatch[1])}" is an ADR-0053 rename-now value that must no longer exist.`,
				stale.replacement
			);
		}
	}
}

function auditDocumentationDeclaration(relativeFile, lines, config, violations) {
	if (extname(relativeFile) !== '.md') return;
	const source = lines.join('\n');
	if (!LEGACY_NAME_PRESENCE_PATTERN.test(source)) return;
	if (config.dispositionDeclarationPattern.test(source)) return;
	const firstLine = lines.findIndex((line) => LEGACY_NAME_PRESENCE_PATTERN.test(line));
	addViolation(
		violations,
		relativeFile,
		firstLine + 1,
		'undeclared-legacy-documentation',
		'Current documentation spells a Legacy Supers name without declaring its disposition.',
		'Name the disposition in the file — cite ADR-0053 or call the value a Legacy Supers artifact — or use the GFX spelling.'
	);
}

export function auditLegacyNameDispositions({
	root = process.cwd(),
	config = LEGACY_NAME_DISPOSITION_CONFIG
} = {}) {
	const absoluteRoot = resolve(root);
	const files = collectScannedFiles(absoluteRoot, config);
	const violations = [];

	for (const relativeFile of files) {
		const lines = readFileSync(resolve(absoluteRoot, relativeFile), 'utf8').split(/\r?\n/);
		auditLegacyNameCoverage(relativeFile, lines, config, violations);
		auditStaleCurrentNames(relativeFile, lines, config, violations);
		auditDocumentationDeclaration(relativeFile, lines, config, violations);
	}

	violations.sort(
		(a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)
	);
	return { filesChecked: files.length, violations };
}

export function formatLegacyNameViolation(violation) {
	return `${violation.file}:${violation.line}: [${violation.rule}] ${violation.message} Remediation: ${violation.remediation}`;
}

function run() {
	const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
	if (!existsSync(root) || !statSync(root).isDirectory()) {
		console.error(`legacy-name dispositions: "${root}" is not a directory`);
		process.exitCode = 1;
		return;
	}
	const result = auditLegacyNameDispositions({ root });
	if (result.violations.length > 0) {
		for (const violation of result.violations) {
			console.error(formatLegacyNameViolation(violation));
		}
		console.error(`legacy-name dispositions: ${result.violations.length} violation(s)`);
		process.exitCode = 1;
		return;
	}
	console.log(
		`legacy-name dispositions: ${result.filesChecked} current files carry only classified Legacy Supers names`
	);
}

const isDirectInvocation =
	process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectInvocation) run();
