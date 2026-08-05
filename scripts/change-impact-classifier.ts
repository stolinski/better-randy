/** Deterministic changed-path routing for the Supers delivery factory. */
export type VerificationLaneId =
	| 'policy-sweep'
	| 'check'
	| 'unit'
	| 'structural'
	| 'corpus'
	| 'browser'
	| 'visual'
	| 'pack-matrix'
	| 'export-decode';

export type VerificationLane = {
	id: VerificationLaneId;
	reasons: string[];
};

export type ChangeImpactClassification = {
	paths: string[];
	lanes: VerificationLane[];
	visualReviewCandidate: boolean;
};

const PORCELAIN_STATUS_WIDTH = 3;

type LaneRule = {
	id: Exclude<VerificationLaneId, 'policy-sweep'>;
	reason: string;
	matches: (path: string) => boolean;
};

const CODE_EXTENSIONS = ['.ts', '.svelte', '.js', '.mjs', '.json'];
const STYLESHEET_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];
const VISUAL_ASSET_EXTENSIONS = [
	'.avif',
	'.gif',
	'.jpeg',
	'.jpg',
	'.otf',
	'.png',
	'.svg',
	'.ttf',
	'.webp',
	'.woff',
	'.woff2'
];
const STRUCTURAL_PATH_PREFIXES = [
	'src/lib/platform/',
	'src/lib/pipelines/',
	'src/lib/presets/',
	'scripts/',
	'extensions/'
];
const RENDER_PATH_PREFIXES = [
	'src/lib/pipelines/',
	'src/lib/presets/',
	'src/lib/packs/',
	'src/lib/text-animations/'
];
const RENDER_PLATFORM_TERMS = [
	'composition-frame-renderer',
	'Composition.svelte',
	'Workspace.svelte',
	'effect-chain',
	'shader-pass',
	'depth-stage',
	'substrate'
];
const EXPORT_TERMS = [
	'export',
	'encoder',
	'encoding',
	'media-decoder',
	'media-audio',
	'video-track',
	'video-clip',
	'composition-frame-renderer',
	'api/user-assets'
];

function isCodePath(path: string): boolean {
	return CODE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function hasExtension(path: string, extensions: string[]): boolean {
	const lowerPath = path.toLowerCase();
	return extensions.some((extension) => lowerPath.endsWith(extension));
}

function isStylesheetPath(path: string): boolean {
	return hasExtension(path, STYLESHEET_EXTENSIONS);
}

function isVisualAssetPath(path: string): boolean {
	return hasExtension(path, VISUAL_ASSET_EXTENSIONS);
}

function isAutomationContractPath(path: string): boolean {
	const isContractFile = hasExtension(path, ['.json', '.yaml', '.yml']);
	return (
		isContractFile &&
		(path.startsWith('models/') || path.startsWith('workflows/') || path.startsWith('extensions/'))
	);
}

function isRenderPath(path: string): boolean {
	return (
		RENDER_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
		RENDER_PLATFORM_TERMS.some((term) => path.includes(term))
	);
}

function isCheckPath(path: string): boolean {
	return [
		isCodePath(path),
		isStylesheetPath(path),
		isAutomationContractPath(path),
		path === 'package.json',
		path === 'pnpm-lock.yaml'
	].some(Boolean);
}

function isUnitPath(path: string): boolean {
	const isRuntimeCode = ['src/', 'scripts/', 'extensions/'].some(
		(prefix) => path.startsWith(prefix) && isCodePath(path)
	);
	return [isRuntimeCode, isAutomationContractPath(path)].some(Boolean);
}

function isStructuralPath(path: string): boolean {
	return [
		STRUCTURAL_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)),
		isStylesheetPath(path),
		isVisualAssetPath(path),
		isAutomationContractPath(path)
	].some(Boolean);
}

function isCorpusPath(path: string): boolean {
	return [
		isRenderPath(path),
		isStylesheetPath(path),
		isVisualAssetPath(path),
		path.endsWith('engine-schema.ts'),
		path.endsWith('preset-rubric.ts'),
		path.endsWith('preset-semantics.ts')
	].some(Boolean);
}

function isBrowserPath(path: string): boolean {
	return [
		path.endsWith('.svelte'),
		isStylesheetPath(path),
		isVisualAssetPath(path),
		path.startsWith('src/routes/'),
		path.includes('test-browser-render'),
		path.includes('cdp-')
	].some(Boolean);
}

const LANE_RULES: LaneRule[] = [
	{
		id: 'check',
		reason: 'typed or executable project source changed',
		matches: isCheckPath
	},
	{
		id: 'unit',
		reason: 'runtime, script, or extension behavior changed',
		matches: isUnitPath
	},
	{
		id: 'structural',
		reason: 'schema, registry, audit, or composition structure changed',
		matches: isStructuralPath
	},
	{
		id: 'corpus',
		reason: 'Preset validity or rendered composition behavior may change',
		matches: isCorpusPath
	},
	{
		id: 'browser',
		reason: 'browser UI or canvas integration changed',
		matches: isBrowserPath
	},
	{
		id: 'visual',
		reason: 'rendered pixels may change',
		matches: (path) => isRenderPath(path) || isStylesheetPath(path) || isVisualAssetPath(path)
	},
	{
		id: 'pack-matrix',
		reason: 'Pack appearance, Role resolution, or Identity claims changed',
		matches: (path) =>
			path.startsWith('src/lib/packs/') ||
			path.includes('/packs/') ||
			path.endsWith('/identity.ts') ||
			path.includes('pack-registry')
	},
	{
		id: 'export-decode',
		reason: 'media, frame production, encoding, or export behavior changed',
		matches: (path) => EXPORT_TERMS.some((term) => path.toLowerCase().includes(term.toLowerCase()))
	}
];

function normalizeChangedPath(path: string): string {
	const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
	const isUnsafe = [
		normalized.length === 0,
		normalized === '.',
		normalized.startsWith('/'),
		/^[A-Za-z]:\//.test(normalized),
		normalized.split('/').includes('..')
	].some(Boolean);
	if (isUnsafe) {
		throw new TypeError(`Changed path must be project-relative: ${path}`);
	}
	return normalized;
}

const UNMERGED_PORCELAIN_STATUSES = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'];
const ORDINARY_PORCELAIN_STATUSES = [...' MADRCT'].flatMap((indexStatus) =>
	[...' MDTRC'].map((workingTreeStatus) => `${indexStatus}${workingTreeStatus}`)
);
const LEGAL_PORCELAIN_STATUSES = new Set([
	'??',
	'!!',
	...UNMERGED_PORCELAIN_STATUSES,
	...ORDINARY_PORCELAIN_STATUSES.filter((status) => status !== '  ')
]);

function parseGitStatusRecordHeader(record: string): { path: string; status: string } {
	if (record.length <= PORCELAIN_STATUS_WIDTH || record[2] !== ' ') {
		throw new TypeError('Malformed Git porcelain record');
	}
	const status = record.slice(0, 2);
	if (!LEGAL_PORCELAIN_STATUSES.has(status)) {
		throw new TypeError(`Illegal Git porcelain status: ${status}`);
	}
	return { path: record.slice(PORCELAIN_STATUS_WIDTH), status };
}

function readGitOriginalPath(records: string[], index: number, status: string): string | undefined {
	const hasOriginalPath = ['R', 'C'].some((code) => status.includes(code));
	if (!hasOriginalPath) return undefined;
	const originalPath = records[index + 1];
	if (!originalPath) {
		throw new TypeError('Git rename/copy record is missing its original path');
	}
	return originalPath;
}

function parseGitStatusRecord(
	records: string[],
	index: number
): { consumedRecords: number; paths: string[] } {
	const { path, status } = parseGitStatusRecordHeader(records[index]);
	if (status === '!!') return { consumedRecords: 1, paths: [] };
	const originalPath = readGitOriginalPath(records, index, status);
	const paths = originalPath ? [path, originalPath] : [path];
	return {
		consumedRecords: paths.length,
		paths
	};
}

/** Parse `git status --porcelain=v1 -z`, retaining both paths for renames and copies. */
export function parseGitWorkingTreeStatus(output: string): string[] {
	if (output.length === 0) return [];

	const records = output.split('\0');
	if (records.pop() !== '') {
		throw new TypeError('Git porcelain output must be NUL-terminated');
	}

	const paths: string[] = [];
	for (let index = 0; index < records.length;) {
		const parsed = parseGitStatusRecord(records, index);
		paths.push(...parsed.paths);
		index += parsed.consumedRecords;
	}

	return paths;
}

/** Map changed project paths to the minimum conservative verification lanes. */
export function classifyChangeImpact(paths: string[]): ChangeImpactClassification {
	const normalizedPaths = [...new Set(paths.map(normalizeChangedPath))].sort();
	const lanes: VerificationLane[] = [
		{ id: 'policy-sweep', reasons: ['every factory transition begins and ends clean'] }
	];

	for (const rule of LANE_RULES) {
		const matchingPaths = normalizedPaths.filter(rule.matches);
		if (matchingPaths.length === 0) continue;
		lanes.push({
			id: rule.id,
			reasons: [`${rule.reason}: ${matchingPaths.join(', ')}`]
		});
	}

	return {
		paths: normalizedPaths,
		lanes,
		visualReviewCandidate: lanes.some((lane) => lane.id === 'visual')
	};
}
