import { compareCanonicalText } from '../src/lib/utils/canonical-text-order.ts';

/** Deterministic work-domain and changed-path routing for Supers Delivery. */
export type VerificationLaneId =
	| 'policy-sweep'
	| 'check'
	| 'unit'
	| 'browser'
	| 'preset-static'
	| 'layout-contract'
	| 'render-matrix'
	| 'pack-matrix'
	| 'export-decode'
	| 'performance'
	| 'repository-infrastructure'
	| 'swamp-control-plane'
	| 'timing-coverage'
	| 'authoring-dependency-tracking'
	| 'inspector-editor-parity'
	| 'planning-discoverability'
	| 'unknown';

export type AutomatedVerificationLaneId = Exclude<
	VerificationLaneId,
	'policy-sweep' | 'render-matrix' | 'pack-matrix' | 'unknown'
>;

export type WorkDomainId =
	| 'preset'
	| 'pack'
	| 'authoring-app'
	| 'rendering'
	| 'export'
	| 'performance'
	| 'repository-infrastructure'
	| 'swamp-control-plane'
	| 'documentation-planning'
	| 'unknown';

export type WorkDomainStatus = 'known' | 'mixed' | 'unknown';

export type VerificationLane = {
	id: VerificationLaneId;
	reasons: string[];
};

export type WorkDomain = {
	id: WorkDomainId;
	reasons: string[];
};

export type ChangeSurfaceId =
	'authoring-app' | 'rendered-composition' | 'export-pipeline' | 'control-plane';

export type HumanReviewKind = 'authoring-app-visual' | 'rendered-composition-aesthetic';

export type ChangeSurface = {
	id: ChangeSurfaceId;
	reasons: string[];
};

export type HumanReviewRequirement = {
	kind: HumanReviewKind;
	reasons: string[];
};

export type SupersTaskIntentSource = {
	name: string;
	description: string;
	metadata: Record<string, unknown> | null;
};

export type SupersWorkDomainIntent = {
	status: WorkDomainStatus;
	declaredDomains: Exclude<WorkDomainId, 'unknown'>[];
	benchmarkScripts: string[];
	exportDecodeScripts: string[];
	selectedSkills: string[];
	constraintPaths: string[];
	reasons: string[];
};

export type ChangeImpactClassification = {
	paths: string[];
	classification: WorkDomainStatus;
	domains: WorkDomain[];
	unknownPaths: string[];
	intent: SupersWorkDomainIntent;
	surfaces: ChangeSurface[];
	requiredHumanReviews: HumanReviewRequirement[];
	lanes: VerificationLane[];
};

const PORCELAIN_STATUS_WIDTH = 3;
const DECLARED_DOMAIN_ORDER: Array<Exclude<WorkDomainId, 'unknown'>> = [
	'preset',
	'pack',
	'authoring-app',
	'rendering',
	'export',
	'performance',
	'repository-infrastructure',
	'swamp-control-plane',
	'documentation-planning'
];
const LANE_ORDER: VerificationLaneId[] = [
	'policy-sweep',
	'check',
	'unit',
	'browser',
	'preset-static',
	'layout-contract',
	'render-matrix',
	'pack-matrix',
	'export-decode',
	'performance',
	'repository-infrastructure',
	'swamp-control-plane',
	'timing-coverage',
	'authoring-dependency-tracking',
	'inspector-editor-parity',
	'planning-discoverability',
	'unknown'
];

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
const RENDER_PATH_PREFIXES = [
	'src/lib/annotations/',
	'src/lib/assets/',
	'src/lib/pipelines/',
	'src/lib/platform/packs/',
	'src/lib/platform/pipelines/',
	'src/lib/presets/',
	'src/lib/packs/',
	'src/lib/text-animations/'
];
const RENDER_PLATFORM_TERMS = [
	'engine-schema',
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
	'api/user-assets'
];
const SWAMP_SCRIPT_PREFIXES = [
	'scripts/change-impact-',
	'scripts/audit-change-impact',
	'scripts/factory-',
	'scripts/materialize-dex-software-factory',
	'scripts/delivery-handoff-',
	'scripts/sentry-factory-driver-'
];
const SWAMP_CONTROL_PLANE_SHARED_PATHS = ['src/lib/utils/canonical-text-order.ts'];
const BENCHMARK_SCRIPT_PATTERN = /^benchmark:[a-z0-9][a-z0-9:_-]{0,127}$/;
const EXPORT_DECODE_SCRIPT_PATTERN = /^verify:export-decode:[a-z0-9][a-z0-9:_-]{0,127}$/;

type Rule<Id extends string> = {
	id: Id;
	reason: string;
	matches: (path: string) => boolean;
};

function hasExtension(path: string, extensions: string[]): boolean {
	const lowerPath = path.toLowerCase();
	return extensions.some((extension) => lowerPath.endsWith(extension));
}

function isCodePath(path: string): boolean {
	return hasExtension(path, CODE_EXTENSIONS);
}

function isStylesheetPath(path: string): boolean {
	return hasExtension(path, STYLESHEET_EXTENSIONS);
}

function isVisualAssetPath(path: string): boolean {
	return hasExtension(path, VISUAL_ASSET_EXTENSIONS);
}

function isTestPath(path: string): boolean {
	return /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec|bench)\.[^/]+$)/.test(path);
}

function isPresetPath(path: string): boolean {
	return path.startsWith('src/lib/presets/') && path.endsWith('.json');
}

function isPackPath(path: string): boolean {
	return (
		path.startsWith('src/lib/packs/') ||
		path.startsWith('src/lib/platform/packs/') ||
		path.includes('pack-registry')
	);
}

/** Pack contract inventories validate source ownership but cannot change rendered pixels. */
function isPackContractMetadataPath(path: string): boolean {
	return path === 'src/lib/platform/packs/role-contract-registry.ts';
}

function isRenderPath(path: string): boolean {
	if (isTestPath(path) || path.endsWith('/Editor.svelte') || isPackContractMetadataPath(path)) {
		return false;
	}
	return (
		RENDER_PATH_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
		RENDER_PLATFORM_TERMS.some((term) => path.includes(term))
	);
}

function isExportPath(path: string): boolean {
	return (
		!isTestPath(path) &&
		EXPORT_TERMS.some((term) => path.toLowerCase().includes(term.toLowerCase()))
	);
}

function isAmbiguousVisualPath(path: string): boolean {
	return path === 'src/app.css' || (path.startsWith('static/') && isVisualAssetPath(path));
}

function isRenderedCompositionPath(path: string): boolean {
	return isRenderPath(path) || isAmbiguousVisualPath(path);
}

function isAuthoringAppPath(path: string): boolean {
	if (isPackPath(path) || isSwampControlPlanePath(path)) return false;
	if (path.startsWith('src/') && isTestPath(path)) return true;
	const mixedRenderShell = ['Workspace.svelte', 'Composition.svelte'].some((term) =>
		path.includes(term)
	);
	return (
		(path.startsWith('src/') &&
			((!isRenderedCompositionPath(path) && !isExportPath(path)) ||
				mixedRenderShell ||
				path.endsWith('/engine-schema.ts') ||
				path === 'src/app.css')) ||
		(path.startsWith('static/') && isVisualAssetPath(path))
	);
}

function isSwampControlPlanePath(path: string): boolean {
	return (
		SWAMP_CONTROL_PLANE_SHARED_PATHS.includes(path) ||
		path.startsWith('extensions/') ||
		path.startsWith('models/') ||
		path.startsWith('workflows/') ||
		path.startsWith('.claude/skills/software-factory/') ||
		path.startsWith('.claude/skills/supers-factory-fleet/') ||
		path.startsWith('.claude/skills/supers-domain-aware-implementation/') ||
		SWAMP_SCRIPT_PREFIXES.some((prefix) => path.startsWith(prefix))
	);
}

function isDocumentationPlanningPath(path: string): boolean {
	return (
		path.startsWith('docs/') ||
		path.startsWith('.dex/') ||
		path === 'AGENTS.md' ||
		path === 'CLAUDE.md' ||
		path === 'README.md' ||
		path === 'scripts/audit-planning-state.ts' ||
		path === 'scripts/planning-state-checks.ts' ||
		path === 'scripts/planning-state-checks.test.ts' ||
		path.endsWith('.md')
	);
}

function isTimingCoveragePath(path: string): boolean {
	return [
		'src/lib/platform/engine-schema.ts',
		'src/lib/utils/composition-timing.ts',
		'scripts/audit-timing-coverage.ts'
	].includes(path);
}

function isAuthoringDependencyTrackingPath(path: string): boolean {
	return [
		'src/lib/platform/engine-schema.ts',
		'src/lib/platform/composition-authoring-dependencies.ts',
		'src/lib/platform/preset-ingress.ts',
		'src/lib/utils/surface-document-slots.ts',
		'scripts/audit-tracking-coverage.ts'
	].includes(path);
}

function isInspectorEditorParityPath(path: string): boolean {
	if (
		[
			'src/lib/platform/engine-schema.ts',
			'src/lib/platform/TimelineAddMenu.svelte',
			'src/lib/utils/chart-motion.ts',
			'src/lib/utils/surface-document-slots.ts',
			'scripts/audit-inspector-parity.ts'
		].includes(path)
	) {
		return true;
	}
	if (path.startsWith('src/lib/platform/') && path.endsWith('.svelte')) return true;
	return (
		path.startsWith('src/lib/pipelines/effects/') &&
		(path.endsWith('/Editor.svelte') || path.endsWith('/index.ts'))
	);
}

function isPerformancePath(path: string): boolean {
	const lowerPath = path.toLowerCase();
	return (
		path.startsWith('benchmarks/') ||
		/(?:^|\/)[^/]+\.bench\.[^/]+$/.test(path) ||
		lowerPath.includes('/benchmark') ||
		lowerPath.includes('/performance') ||
		lowerPath.includes('/perf-')
	);
}

function isRepositoryInfrastructurePath(path: string): boolean {
	if (isSwampControlPlanePath(path) || isDocumentationPlanningPath(path)) return false;
	return (
		path.startsWith('.github/') ||
		path.startsWith('scripts/') ||
		path.startsWith('tests/') ||
		path === 'package.json' ||
		path === 'pnpm-lock.yaml' ||
		path === 'tsconfig.json' ||
		path.endsWith('.config.ts')
	);
}

function isAuthoringAppVisualPath(path: string): boolean {
	return (
		isAuthoringAppPath(path) &&
		(path.endsWith('.svelte') || isStylesheetPath(path) || isVisualAssetPath(path))
	);
}

function isProductCodePath(path: string): boolean {
	return (
		path.startsWith('src/') &&
		!isPresetPath(path) &&
		!isSwampControlPlanePath(path) &&
		(isCodePath(path) || isStylesheetPath(path))
	);
}

function normalizeChangedPath(path: string): string {
	const normalized = path.replaceAll('\\', '/').replace(/^\.\//, '');
	const unsafe =
		normalized.length === 0 ||
		normalized === '.' ||
		normalized.startsWith('/') ||
		/^[A-Za-z]:\//.test(normalized) ||
		normalized.split('/').includes('..');
	if (unsafe) throw new TypeError(`Changed path must be project-relative: ${path}`);
	return normalized;
}

function sortedUnique<T extends string>(values: readonly T[], order?: readonly T[]): T[] {
	const unique = [...new Set(values)];
	if (!order) return unique.sort(compareCanonicalText);
	return unique.sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

function readStringArray(value: unknown, label: string, pattern?: RegExp): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
		throw new TypeError(`${label} must be an array of strings`);
	}
	const values = sortedUnique(value);
	if (pattern && values.some((entry) => !pattern.test(entry))) {
		throw new TypeError(`${label} contains an unsupported package script`);
	}
	return values;
}

function readDescriptionDirective(description: string, name: string): string[] {
	const match = description.match(new RegExp(`^${name}:[ \\t]*(.+)$`, 'im'));
	if (!match) return [];
	return match[1]
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function taskIntentMetadata(metadata: Record<string, unknown> | null): Record<string, unknown> {
	if (metadata === null || metadata.supersDelivery === undefined) return {};
	const route = metadata.supersDelivery;
	if (typeof route !== 'object' || route === null || Array.isArray(route)) {
		throw new TypeError('metadata.supersDelivery must be an object');
	}
	const record = route as Record<string, unknown>;
	const unexpected = Object.keys(record).filter(
		(key) => !['workDomains', 'benchmarkScripts', 'exportDecodeScripts'].includes(key)
	);
	if (unexpected.length > 0) {
		throw new TypeError(`metadata.supersDelivery has unknown fields: ${unexpected.join(', ')}`);
	}
	return record;
}

function skillsForDomains(domains: readonly Exclude<WorkDomainId, 'unknown'>[]): string[] {
	const skills: Record<Exclude<WorkDomainId, 'unknown'>, string[]> = {
		preset: ['author'],
		pack: ['implementation'],
		'authoring-app': ['svelte-code-writer', 'svelte-core-bestpractices'],
		rendering: ['implementation'],
		export: ['implementation'],
		performance: ['implementation'],
		'repository-infrastructure': ['implementation'],
		'swamp-control-plane': ['swamp', 'software-factory'],
		'documentation-planning': ['domain-modeling']
	};
	return sortedUnique(['implementation', ...domains.flatMap((domain) => skills[domain])]);
}

function constraintsForDomains(domains: readonly Exclude<WorkDomainId, 'unknown'>[]): string[] {
	const constraints: Record<Exclude<WorkDomainId, 'unknown'>, string[]> = {
		preset: ['docs/packs/syntax/aesthetic.md', 'docs/preset-format.md'],
		pack: ['docs/packs/authoring-playbook.md'],
		'authoring-app': [],
		rendering: ['docs/engine-architecture.md', 'docs/html-in-canvas-typegpu.md'],
		export: ['docs/engine-architecture.md'],
		performance: ['docs/sentry-dev-flow.md'],
		'repository-infrastructure': [],
		'swamp-control-plane': [
			'docs/project-control-plane.md',
			'.claude/skills/software-factory/SKILL.md'
		],
		'documentation-planning': ['docs/CONTEXT.md', 'docs/project-control-plane.md']
	};
	return sortedUnique(['AGENTS.md', ...domains.flatMap((domain) => constraints[domain])]);
}

const NATURAL_TASK_DOMAIN_RULES: Array<{
	id: Exclude<WorkDomainId, 'unknown'>;
	pattern: RegExp;
}> = [
	{ id: 'preset', pattern: /\bpresets?\b/ },
	{ id: 'pack', pattern: /\bpacks?\b|\bbrand system\b|\bhouse archetype\b/ },
	{
		id: 'authoring-app',
		pattern:
			/\bauthoring\b|\binspectors?\b|\beditors?\b|\bselection\b|\bworkspace\b|\btimeline\b|\bgui\b|\bcanvas controls?\b/
	},
	{
		id: 'rendering',
		pattern:
			/\brenders?\b|\brenderer\b|\brendering\b|\bpixels?\b|\bwebgpu\b|\btypegpu\b|\bwgsl\b|\bshaders?\b|\beffect chain\b|\bhtml-in-canvas\b/
	},
	{
		id: 'export',
		pattern:
			/\bexports?\b|\bencoding\b|\bencoders?\b|\bdecoding\b|\bdecoders?\b|\bwebm\b|\bprores\b|\bmediabunny\b|\bmedia output\b/
	},
	{
		id: 'performance',
		pattern:
			/\bbenchmarks?\b|\bperformance\b|\blatency\b|\bthroughput\b|\bprofiling\b|\bframe time\b/
	},
	{
		id: 'repository-infrastructure',
		pattern:
			/\brepository infrastructure\b|\bgithub actions?\b|\bci\b|\bbuild config(?:uration)?\b|\bstructural tests?\b|\bpackage scripts?\b/
	},
	{
		id: 'swamp-control-plane',
		pattern:
			/\bswamp\b|\bfactory\b|\bpolicy sweep\b|\bcontrol plane\b|\bverification routing\b|\bdelivery routing\b|\bworkflows?\b|\bmodel types?\b|\blifecycle\b/
	},
	{
		id: 'documentation-planning',
		pattern:
			/\broadmap\b|\badrs?\b|\bbriefs?\b|\bplanning\b|\bdocumentation\b|\bdocs\b|\bdiscoverability\b|\bdex\b/
	}
];

function explicitProjectRelativePathHints(text: string): string[] {
	const pattern =
		/(?:^|[\s`'"(])((?:(?:src|scripts|extensions|models|workflows|docs|\.dex|\.claude)\/[A-Za-z0-9@._+/-]+|(?:AGENTS|README)\.md|package\.json))(?=$|[\s`'"),:;])/g;
	return sortedUnique([...text.matchAll(pattern)].map((match) => normalizeChangedPath(match[1])));
}

function naturalTaskDomains(source: SupersTaskIntentSource): {
	domains: Array<Exclude<WorkDomainId, 'unknown'>>;
	pathHints: string[];
} {
	const pathHintText = `${source.name}\n${source.description}`;
	const lowerTaskName = source.name.toLowerCase();
	const pathHints = explicitProjectRelativePathHints(pathHintText);
	const termDomains = NATURAL_TASK_DOMAIN_RULES.filter((rule) =>
		rule.pattern.test(lowerTaskName)
	).map((rule) => rule.id);
	const pathDomains = pathHints.flatMap((path) =>
		DOMAIN_RULES.filter((rule) => rule.matches(path)).map((rule) => rule.id)
	);
	return {
		domains: sortedUnique([...termDomains, ...pathDomains], DECLARED_DOMAIN_ORDER),
		pathHints
	};
}

/**
 * Route domain terms from the canonical human task name. The description may add only
 * typed Supers Delivery directives and explicit project-relative path hints.
 */
export function classifySupersTaskIntent(source: SupersTaskIntentSource): SupersWorkDomainIntent {
	const metadata = taskIntentMetadata(source.metadata);
	const explicitDomains = [
		...readStringArray(metadata.workDomains, 'metadata.supersDelivery.workDomains'),
		...readDescriptionDirective(source.description, 'Supers-Delivery-Domains')
	];
	const invalidDomain = explicitDomains.find(
		(domain) => !DECLARED_DOMAIN_ORDER.includes(domain as Exclude<WorkDomainId, 'unknown'>)
	);
	if (invalidDomain)
		throw new TypeError(`Unsupported Supers Delivery work domain: ${invalidDomain}`);
	const natural = naturalTaskDomains(source);
	const declaredDomains = sortedUnique(
		[...(explicitDomains as Array<Exclude<WorkDomainId, 'unknown'>>), ...natural.domains],
		DECLARED_DOMAIN_ORDER
	);
	const benchmarkScripts = sortedUnique([
		...readStringArray(
			metadata.benchmarkScripts,
			'metadata.supersDelivery.benchmarkScripts',
			BENCHMARK_SCRIPT_PATTERN
		),
		...readDescriptionDirective(source.description, 'Supers-Delivery-Benchmarks')
	]);
	if (benchmarkScripts.some((script) => !BENCHMARK_SCRIPT_PATTERN.test(script))) {
		throw new TypeError('Supers-Delivery-Benchmarks contains an unsupported package script');
	}
	const exportDecodeScripts = sortedUnique([
		...readStringArray(
			metadata.exportDecodeScripts,
			'metadata.supersDelivery.exportDecodeScripts',
			EXPORT_DECODE_SCRIPT_PATTERN
		),
		...readDescriptionDirective(source.description, 'Supers-Delivery-Export-Decode')
	]);
	if (exportDecodeScripts.some((script) => !EXPORT_DECODE_SCRIPT_PATTERN.test(script))) {
		throw new TypeError('Supers-Delivery-Export-Decode contains an unsupported package script');
	}
	if (benchmarkScripts.length > 0 && !declaredDomains.includes('performance')) {
		declaredDomains.push('performance');
	}
	if (exportDecodeScripts.length > 0 && !declaredDomains.includes('export')) {
		declaredDomains.push('export');
	}
	declaredDomains.sort(
		(left, right) => DECLARED_DOMAIN_ORDER.indexOf(left) - DECLARED_DOMAIN_ORDER.indexOf(right)
	);
	const status: WorkDomainStatus =
		declaredDomains.length === 0 ? 'unknown' : declaredDomains.length === 1 ? 'known' : 'mixed';
	const explicitSet = new Set(explicitDomains);
	const reasons = declaredDomains.map((domain) => {
		if (explicitSet.has(domain)) return `human task directive declared ${domain}`;
		if (natural.pathHints.length > 0 && natural.domains.includes(domain)) {
			return `canonical human task path hint or domain term selected ${domain}`;
		}
		return `canonical human task domain term selected ${domain}`;
	});
	return {
		status,
		declaredDomains,
		benchmarkScripts,
		exportDecodeScripts,
		selectedSkills: skillsForDomains(declaredDomains),
		constraintPaths: constraintsForDomains(declaredDomains),
		reasons:
			reasons.length === 0
				? ['canonical human task text has no unambiguous Supers domain term or path hint']
				: reasons
	};
}

const DOMAIN_RULES: Array<Rule<Exclude<WorkDomainId, 'unknown'>>> = [
	{
		id: 'preset',
		reason: 'Preset source changed',
		matches: isPresetPath
	},
	{
		id: 'pack',
		reason: 'Pack source changed',
		matches: isPackPath
	},
	{
		id: 'authoring-app',
		reason: 'authoring application source changed',
		matches: isAuthoringAppPath
	},
	{
		id: 'rendering',
		reason: 'rendering source changed',
		matches: (path) => isRenderedCompositionPath(path) && !isPresetPath(path) && !isPackPath(path)
	},
	{
		id: 'export',
		reason: 'export source changed',
		matches: isExportPath
	},
	{
		id: 'performance',
		reason: 'benchmark or performance source changed',
		matches: isPerformancePath
	},
	{
		id: 'repository-infrastructure',
		reason: 'repository infrastructure changed',
		matches: isRepositoryInfrastructurePath
	},
	{
		id: 'swamp-control-plane',
		reason: 'Swamp model, extension, workflow, or Factory control changed',
		matches: isSwampControlPlanePath
	},
	{
		id: 'documentation-planning',
		reason: 'documentation or planning source changed',
		matches: isDocumentationPlanningPath
	}
];

function pathReasons<Id extends string>(
	paths: string[],
	rules: Array<Rule<Id>>
): Array<{ id: Id; reasons: string[] }> {
	return rules.flatMap((rule) => {
		const matching = paths.filter(rule.matches);
		return matching.length === 0
			? []
			: [{ id: rule.id, reasons: [`${rule.reason}: ${matching.join(', ')}`] }];
	});
}

function addReason(map: Map<string, string[]>, id: string, reason: string): void {
	map.set(id, [...(map.get(id) ?? []), reason]);
}

function addPathLaneReasons(paths: string[], map: Map<string, string[]>): void {
	for (const path of paths) {
		if (isProductCodePath(path)) {
			addReason(map, 'check', `typed product source changed: ${path}`);
			if (!isStylesheetPath(path)) addReason(map, 'unit', `product behavior changed: ${path}`);
		}
		if (isAuthoringAppVisualPath(path)) {
			addReason(map, 'browser', `authoring app interaction or presentation changed: ${path}`);
		}
		const packPath = isPackPath(path);
		const pixelAffectingPackPath = packPath && !isPackContractMetadataPath(path);
		if (isPresetPath(path) || pixelAffectingPackPath || isRenderPath(path)) {
			addReason(map, 'preset-static', `affected Preset validity may change: ${path}`);
		}
		if (isPresetPath(path) || pixelAffectingPackPath || isRenderedCompositionPath(path)) {
			addReason(map, 'layout-contract', `rendered composition layout may change: ${path}`);
		}
		if (isExportPath(path)) addReason(map, 'export-decode', `encoded output may change: ${path}`);
		if (isPerformancePath(path))
			addReason(map, 'performance', `performance evidence changed: ${path}`);
		if (isRepositoryInfrastructurePath(path)) {
			addReason(map, 'repository-infrastructure', `repository infrastructure changed: ${path}`);
		}
		if (isSwampControlPlanePath(path)) {
			addReason(map, 'swamp-control-plane', `Swamp control-plane definition changed: ${path}`);
		}
		if (isTimingCoveragePath(path)) {
			addReason(map, 'timing-coverage', `timing schema or rescaling contract changed: ${path}`);
		}
		if (isAuthoringDependencyTrackingPath(path)) {
			addReason(
				map,
				'authoring-dependency-tracking',
				`schema or authoring-dependency contract changed: ${path}`
			);
		}
		if (isInspectorEditorParityPath(path)) {
			addReason(
				map,
				'inspector-editor-parity',
				`schema or Inspector/Editor contract changed: ${path}`
			);
		}
		if (isDocumentationPlanningPath(path)) {
			addReason(
				map,
				'planning-discoverability',
				`documentation or planning contract changed: ${path}`
			);
		}
	}
}

function addIntentLaneReasons(intent: SupersWorkDomainIntent, map: Map<string, string[]>): void {
	const lanesByDomain: Record<Exclude<WorkDomainId, 'unknown'>, VerificationLaneId[]> = {
		preset: ['preset-static', 'layout-contract'],
		pack: ['preset-static', 'layout-contract'],
		'authoring-app': ['check', 'unit', 'browser'],
		rendering: ['preset-static', 'layout-contract'],
		export: ['export-decode'],
		performance: ['performance'],
		'repository-infrastructure': ['repository-infrastructure'],
		'swamp-control-plane': ['swamp-control-plane'],
		'documentation-planning': []
	};
	for (const domain of intent.declaredDomains) {
		for (const lane of lanesByDomain[domain]) {
			addReason(map, lane, `human task intent added ${domain} obligations`);
		}
	}
}

function classifySurfaces(
	paths: string[],
	intent: SupersWorkDomainIntent
): { surfaces: ChangeSurface[]; requiredHumanReviews: HumanReviewRequirement[] } {
	const surfaceRules: Array<Rule<ChangeSurfaceId>> = [
		{
			id: 'authoring-app',
			reason: 'authoring application behavior or presentation may change',
			matches: isAuthoringAppPath
		},
		{
			id: 'rendered-composition',
			reason: 'composition pixels may change in preview or export',
			matches: isRenderedCompositionPath
		},
		{
			id: 'export-pipeline',
			reason: 'media production, decoding, encoding, or export behavior may change',
			matches: isExportPath
		}
	];
	const surfaces = pathReasons(paths, surfaceRules);
	if (
		intent.declaredDomains.includes('authoring-app') &&
		!surfaces.some(({ id }) => id === 'authoring-app')
	) {
		surfaces.push({
			id: 'authoring-app',
			reasons: ['human task intent added authoring-app obligations']
		});
	}
	const intentRequiresRendered = intent.declaredDomains.some((domain) =>
		['preset', 'pack', 'rendering'].includes(domain)
	);
	if (intentRequiresRendered && !surfaces.some(({ id }) => id === 'rendered-composition')) {
		surfaces.push({
			id: 'rendered-composition',
			reasons: ['human task intent added rendered-composition obligations']
		});
	}
	if (
		paths.some(
			(path) =>
				isRepositoryInfrastructurePath(path) ||
				isSwampControlPlanePath(path) ||
				isDocumentationPlanningPath(path)
		) ||
		surfaces.length === 0
	) {
		surfaces.push({
			id: 'control-plane',
			reasons: ['repository support or policy source changed']
		});
	}
	const requiredHumanReviews: HumanReviewRequirement[] = [];
	const appVisual = paths.filter(isAuthoringAppVisualPath);
	if (appVisual.length > 0) {
		requiredHumanReviews.push({
			kind: 'authoring-app-visual',
			reasons: [`authoring application visual source changed: ${appVisual.join(', ')}`]
		});
	}
	const aestheticAuthoredPaths = paths.filter(
		(path) =>
			isPresetPath(path) ||
			path.startsWith('src/lib/packs/') ||
			(path.startsWith('static/') && isVisualAssetPath(path))
	);
	const intentRequiresAestheticReview = intent.declaredDomains.some((domain) =>
		['preset', 'pack'].includes(domain)
	);
	if (aestheticAuthoredPaths.length > 0 || intentRequiresAestheticReview) {
		requiredHumanReviews.push({
			kind: 'rendered-composition-aesthetic',
			reasons:
				aestheticAuthoredPaths.length > 0
					? [`authored composition appearance may change: ${aestheticAuthoredPaths.join(', ')}`]
					: ['human task intent added rendered-composition aesthetic review']
		});
	}
	return { surfaces, requiredHumanReviews };
}

const EMPTY_INTENT: SupersWorkDomainIntent = {
	status: 'unknown',
	declaredDomains: [],
	benchmarkScripts: [],
	exportDecodeScripts: [],
	selectedSkills: ['implementation'],
	constraintPaths: ['AGENTS.md'],
	reasons: ['no pre-implementation task intent route was supplied']
};

/** Map trusted changed paths plus additive task intent to the smallest complete lane union. */
export function classifyChangeImpact(
	paths: string[],
	intent: SupersWorkDomainIntent = EMPTY_INTENT
): ChangeImpactClassification {
	const normalizedPaths = sortedUnique(paths.map(normalizeChangedPath));
	const pathDomains = pathReasons(normalizedPaths, DOMAIN_RULES);
	const matchedPaths = new Set(
		normalizedPaths.filter((path) => DOMAIN_RULES.some((rule) => rule.matches(path)))
	);
	const unknownPaths = normalizedPaths.filter((path) => !matchedPaths.has(path));
	const domainReasons = new Map<WorkDomainId, string[]>();
	for (const domain of pathDomains) domainReasons.set(domain.id, domain.reasons);
	for (const domain of intent.declaredDomains) {
		addReason(domainReasons, domain, `human task intent declared ${domain}`);
	}
	if (unknownPaths.length > 0 || normalizedPaths.length === 0) {
		domainReasons.set('unknown', [
			normalizedPaths.length === 0
				? 'no changed paths were available for classification'
				: `unclassified changed paths: ${unknownPaths.join(', ')}`
		]);
	}
	const orderedDomainIds: WorkDomainId[] = [...DECLARED_DOMAIN_ORDER, 'unknown'];
	const domains = orderedDomainIds.flatMap((id) => {
		const reasons = domainReasons.get(id);
		return reasons ? [{ id, reasons }] : [];
	});
	const classification: WorkDomainStatus =
		unknownPaths.length > 0 || normalizedPaths.length === 0
			? 'unknown'
			: domains.length > 1
				? 'mixed'
				: 'known';
	const laneReasons = new Map<string, string[]>([
		['policy-sweep', ['universal Factory lifecycle-integrity checks are mandatory']]
	]);
	addPathLaneReasons(normalizedPaths, laneReasons);
	addIntentLaneReasons(intent, laneReasons);
	if (classification === 'unknown') {
		laneReasons.set('unknown', [
			'change-domain evidence is unavailable; unrelated suites are not guessed'
		]);
	}
	const lanes = LANE_ORDER.flatMap((id) => {
		const reasons = laneReasons.get(id);
		return reasons ? [{ id, reasons: sortedUnique(reasons) }] : [];
	});
	const { surfaces, requiredHumanReviews } = classifySurfaces(normalizedPaths, intent);
	return {
		paths: normalizedPaths,
		classification,
		domains,
		unknownPaths,
		intent,
		surfaces,
		requiredHumanReviews,
		lanes
	};
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
	if (!['R', 'C'].some((code) => status.includes(code))) return undefined;
	const originalPath = records[index + 1];
	if (!originalPath) throw new TypeError('Git rename/copy record is missing its original path');
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
	return { consumedRecords: paths.length, paths };
}

/** Parse `git status --porcelain=v1 -z`, retaining both paths for renames and copies. */
export function parseGitWorkingTreeStatus(output: string): string[] {
	if (output.length === 0) return [];
	const records = output.split('\0');
	if (records.pop() !== '') throw new TypeError('Git porcelain output must be NUL-terminated');
	const paths: string[] = [];
	for (let index = 0; index < records.length;) {
		const parsed = parseGitStatusRecord(records, index);
		paths.push(...parsed.paths);
		index += parsed.consumedRecords;
	}
	return paths;
}
