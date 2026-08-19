import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	mergePresetValidationChangedPaths,
	parsePresetValidationCommand,
	type PresetValidationCommandOptions
} from './preset-validation-command.ts';
import {
	selectAffectedStaticPresetPackAxes,
	type StaticPresetPackAxis
} from './preset-validation-scope.ts';
import { createPackCalibrationVerificationInputs } from './pack-calibration-verification-inputs.ts';
import { registerSupersRuntimeModuleHooks } from './supers-runtime-module-hooks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

registerSupersRuntimeModuleHooks(repoRoot);

type Orientation = 'horizontal' | 'vertical';

interface StaticPreset {
	kind?: string;
	pack: string;
	state: {
		transport: { orientation: Orientation };
	};
	transition?: { from: string; to: string };
}

interface ParseResult {
	success: boolean;
	data?: StaticPreset;
	error?: unknown;
}

interface ValidationIssue {
	path: (string | number)[];
	message: string;
}

interface RubricIssue {
	rule: string;
	severity: 'error' | 'warn';
	path: string;
	message: string;
}

function gitChangedPaths(baseRevision?: string): string[] {
	const paths = new Set<string>();
	if (baseRevision) {
		const output = execFileSync('git', ['diff', '--name-only', '-z', `${baseRevision}...HEAD`], {
			cwd: repoRoot,
			encoding: 'utf8'
		});
		for (const path of output.split('\0')) if (path) paths.add(path);
	}
	const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
		cwd: repoRoot,
		encoding: 'utf8'
	});
	const { parseGitWorkingTreeStatus } = requireChangeImpactModule;
	for (const path of parseGitWorkingTreeStatus(status)) paths.add(path);
	return [...paths].sort((left, right) => left.localeCompare(right));
}

const ingressPath = pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-ingress.ts')).href;
const semanticPath = pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-validation.ts')).href;
const rubricPath = pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-rubric.ts')).href;
const packRegistryPath = pathToFileURL(
	resolve(repoRoot, 'src/lib/platform/packs/registry.ts')
).href;
const packValidationPath = pathToFileURL(
	resolve(repoRoot, 'src/lib/platform/packs/validation.ts')
).href;
const identityRegistryPath = pathToFileURL(
	resolve(repoRoot, 'src/lib/platform/pipelines/identity-registry.ts')
).href;
const packCatalogPath = pathToFileURL(resolve(repoRoot, 'src/lib/platform/packs/catalog.ts')).href;
const packCatalogValidationPath = pathToFileURL(
	resolve(repoRoot, 'src/lib/platform/packs/catalog-validation.ts')
).href;
const renderRegistryFingerprintPath = pathToFileURL(
	resolve(repoRoot, 'src/lib/platform/deterministic-render-registry-fingerprint.ts')
).href;

const [
	ingressModule,
	semanticModule,
	rubricModule,
	packRegistryModule,
	packValidationModule,
	identityModule,
	packCatalogModule,
	packCatalogValidationModule,
	renderRegistryFingerprintModule,
	matrixModule,
	changeImpactModule
] = await Promise.all([
	import(ingressPath),
	import(semanticPath),
	import(rubricPath),
	import(packRegistryPath),
	import(packValidationPath),
	import(identityRegistryPath),
	import(packCatalogPath),
	import(packCatalogValidationPath),
	import(renderRegistryFingerprintPath),
	import(pathToFileURL(resolve(repoRoot, 'scripts/derive-supers-render-matrix-manifest.ts')).href),
	import(pathToFileURL(resolve(repoRoot, 'scripts/change-impact-classifier.ts')).href)
]);

const PresetIngressSchema = ingressModule.PresetIngressSchema as {
	safeParse: (value: unknown) => ParseResult;
};
const validatePresetSemantics = semanticModule.validatePresetSemantics as (
	preset: StaticPreset,
	options?: { resolvePreset: (slug: string) => StaticPreset | null }
) => readonly ValidationIssue[];
const lintPreset = rubricModule.lintPreset as (preset: StaticPreset) => RubricIssue[];
const PACK_REGISTRY = packRegistryModule.PACK_REGISTRY as Readonly<Record<string, unknown>>;
const validatePackRegistry = packValidationModule.validatePackRegistry as (
	registry: Readonly<Record<string, unknown>>
) => readonly { kind: string; pack: string; path: (string | number)[]; message: string }[];
const validateIdentityRegistry = identityModule.validateIdentityRegistry as (
	manifest: unknown
) => readonly { kind: string; pipeline: string; message: string }[];
const PACK_CATALOG_REGISTRY = packCatalogModule.PACK_CATALOG_REGISTRY as Readonly<
	Record<string, { status: 'draft' } | { status: 'ratified'; verificationBundleId: string }>
>;
const CALIBRATION_TRIO_FRAME_SPECS = packCatalogModule.CALIBRATION_TRIO_FRAME_SPECS as readonly {
	presetSlug: string;
}[];
const validatePackCatalogRegistry = packCatalogValidationModule.validatePackCatalogRegistry as (
	packRegistry: Readonly<Record<string, unknown>>,
	catalogRegistry: Readonly<Record<string, unknown>>
) => readonly { kind: string; pack: string; path: (string | number)[]; message: string }[];
const validatePackCatalogBundleFreshness =
	packCatalogValidationModule.validatePackCatalogBundleFreshness as (
		catalogRegistry: Readonly<Record<string, unknown>>,
		runtimeIdentity: unknown,
		renderSourceFingerprint: string
	) => Promise<
		readonly { kind: string; pack: string; path: (string | number)[]; message: string }[]
	>;
const createRuntimeRenderRegistryIdentity =
	renderRegistryFingerprintModule.createRuntimeRenderRegistryIdentity as (
		deliverablePresets: readonly { id: string; value: unknown }[],
		packs: readonly { id: string; value: unknown }[]
	) => Promise<unknown>;
const collectPresetPipelineReferences = matrixModule.collectPresetPipelineReferences as (
	preset: StaticPreset
) => string[];
const requireChangeImpactModule = changeImpactModule as {
	parseGitWorkingTreeStatus: (status: string) => string[];
};

function fail(message: string): never {
	console.error(`✗ ${message}`);
	process.exit(1);
}

function issuePath(path: readonly (string | number)[]): string {
	return path.length > 0 ? path.join('.') : '<root>';
}

function readPresetDependencies(preset: StaticPreset): string[] {
	return preset.transition
		? [preset.transition.from, preset.transition.to].sort((left, right) =>
				left.localeCompare(right)
			)
		: [];
}

async function loadBuiltInPresets(): Promise<Map<string, StaticPreset>> {
	const presetDirectory = resolve(repoRoot, 'src/lib/presets');
	const presets = new Map<string, StaticPreset>();
	const filenames = (await readdir(presetDirectory))
		.filter((filename) => filename.endsWith('.json'))
		.sort((left, right) => left.localeCompare(right));

	for (const filename of filenames) {
		const slug = filename.slice(0, -'.json'.length);
		let json: unknown;
		try {
			json = JSON.parse(await readFile(resolve(presetDirectory, filename), 'utf8'));
		} catch (error) {
			fail(
				`${slug} schema JSON parse failed — ${error instanceof Error ? error.message : String(error)}`
			);
		}
		const result = PresetIngressSchema.safeParse(json);
		if (!result.success || !result.data) fail(`${slug} schema failed — ${String(result.error)}`);
		presets.set(slug, result.data);
	}

	for (const [slug, preset] of presets) {
		const issues = validatePresetSemantics(preset, {
			resolvePreset: (identity) => presets.get(identity) ?? null
		});
		const first = issues[0];
		if (first) fail(`${slug} semantic ${issuePath(first.path)} — ${first.message}`);
	}
	return presets;
}

function explicitAxes(
	presets: ReadonlyMap<string, StaticPreset>,
	presetSlugs: readonly string[],
	packIds: readonly string[]
): StaticPresetPackAxis[] {
	const axes: StaticPresetPackAxis[] = [];
	for (const slug of [...presetSlugs].sort((left, right) => left.localeCompare(right))) {
		const preset = presets.get(slug);
		if (!preset) fail(`Unknown built-in Preset: ${slug}`);
		if (preset.kind === 'fixture') fail(`Preset ${slug} is a fixture, not a deliverable`);
		for (const packId of packIds) axes.push({ presetSlug: slug, packId });
	}
	return axes;
}

async function main(): Promise<void> {
	let options: PresetValidationCommandOptions;
	try {
		options = parsePresetValidationCommand(process.argv.slice(2));
	} catch (error) {
		fail(error instanceof Error ? error.message : String(error));
	}

	const presets = await loadBuiltInPresets();
	const packIssues = validatePackRegistry(PACK_REGISTRY);
	const firstPackIssue = packIssues[0];
	if (firstPackIssue) {
		fail(
			`Pack ${firstPackIssue.pack} ${firstPackIssue.kind} ${issuePath(firstPackIssue.path)} — ${firstPackIssue.message}`
		);
	}
	const catalogIssue = validatePackCatalogRegistry(PACK_REGISTRY, PACK_CATALOG_REGISTRY)[0];
	if (catalogIssue) {
		fail(
			`Pack catalog ${catalogIssue.pack} ${catalogIssue.kind} ${issuePath(catalogIssue.path)} — ${catalogIssue.message}`
		);
	}
	const syntaxPack = PACK_REGISTRY.syntax;
	const identityIssue = syntaxPack ? validateIdentityRegistry(syntaxPack)[0] : undefined;
	if (!syntaxPack) fail('Reference Pack syntax is not registered');
	if (identityIssue) {
		fail(`Identity ${identityIssue.pipeline} ${identityIssue.kind} — ${identityIssue.message}`);
	}

	const packIds = Object.keys(PACK_REGISTRY).sort((left, right) => left.localeCompare(right));
	const deliverables = [...presets]
		.filter(([, preset]) => preset.kind !== 'fixture')
		.map(([slug, preset]) => ({
			slug,
			pipelineReferences: collectPresetPipelineReferences(preset),
			presetDependencies: readPresetDependencies(preset)
		}))
		.sort((left, right) => left.slug.localeCompare(right.slug));
	const { runtimeIdentity, renderSourceFingerprint } =
		await createPackCalibrationVerificationInputs({
			repoRoot,
			calibrationTrio: CALIBRATION_TRIO_FRAME_SPECS,
			packRegistry: PACK_REGISTRY,
			parsePreset: (value) => PresetIngressSchema.parse(value),
			createRuntimeIdentity: createRuntimeRenderRegistryIdentity
		});
	const staleCatalogIssue = (
		await validatePackCatalogBundleFreshness(
			PACK_CATALOG_REGISTRY,
			runtimeIdentity,
			renderSourceFingerprint
		)
	)[0];
	if (staleCatalogIssue) {
		fail(
			`Pack catalog ${staleCatalogIssue.pack} ${staleCatalogIssue.kind} ${issuePath(staleCatalogIssue.path)} — ${staleCatalogIssue.message}`
		);
	}

	let axes: StaticPresetPackAxis[];
	let changedPaths = options.changedPaths;
	if (options.mode === 'explicit') {
		axes = explicitAxes(presets, options.presetSlugs, packIds);
	} else if (options.mode === 'affected') {
		const discoveredPaths =
			options.baseRevision || changedPaths.length === 0
				? gitChangedPaths(options.baseRevision)
				: [];
		changedPaths = mergePresetValidationChangedPaths(changedPaths, discoveredPaths);
		axes = selectAffectedStaticPresetPackAxes(
			{ presets: deliverables, packs: packIds.map((id) => ({ id })) },
			changedPaths
		);
	} else {
		axes = explicitAxes(
			presets,
			deliverables.map((entry) => entry.slug),
			packIds
		);
	}

	if (axes.length === 0) {
		console.log('No deliverable Presets are affected; static Preset validation is not applicable.');
		return;
	}

	let warningCount = 0;
	for (const axis of axes) {
		const source = presets.get(axis.presetSlug);
		if (!source) fail(`Selected Preset disappeared: ${axis.presetSlug}`);
		for (const orientation of ['horizontal', 'vertical'] as const) {
			const candidate = structuredClone(source);
			candidate.pack = axis.packId;
			candidate.state.transport.orientation = orientation;
			const semanticIssue = validatePresetSemantics(candidate, {
				resolvePreset: (identity) => presets.get(identity) ?? null
			})[0];
			if (semanticIssue) {
				fail(
					`${axis.presetSlug} × ${axis.packId} × ${orientation} semantic ${issuePath(semanticIssue.path)} — ${semanticIssue.message}`
				);
			}
			const issues = lintPreset(candidate);
			const firstError = issues.find((issue) => issue.severity === 'error');
			if (firstError) {
				fail(
					`${axis.presetSlug} × ${axis.packId} × ${orientation} ${firstError.rule} ${firstError.path} — ${firstError.message}`
				);
			}
			for (const warning of issues.filter((issue) => issue.severity === 'warn')) {
				warningCount += 1;
				console.warn(
					`⚠ ${axis.presetSlug} × ${axis.packId} × ${orientation} ${warning.rule} ${warning.path} — ${warning.message}`
				);
			}
		}
		console.log(`✓ ${axis.presetSlug} × ${axis.packId} (horizontal + vertical)`);
	}

	console.log(
		`Validated ${axes.length} Preset × Pack ${axes.length === 1 ? 'axis' : 'axes'} in both orientations${warningCount > 0 ? ` with ${warningCount} warning(s)` : ''}. Static checks only; no browser, capture, export, Critic, or render matrix was launched.`
	);
}

await main();
