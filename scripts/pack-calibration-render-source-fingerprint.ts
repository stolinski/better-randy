import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Conservative render-source tree for Pack ratification freshness.
 * Presets are excluded because the canonical Calibration Trio values are bound separately.
 * Catalog approval metadata is excluded so recording approval cannot invalidate itself.
 */
export const PACK_CALIBRATION_RENDER_SOURCE_ROOTS = [
	'src/lib/annotations',
	'src/lib/assets',
	'src/lib/packs',
	'src/lib/pipelines',
	'src/lib/platform',
	'src/lib/text-animations',
	'src/lib/utils',
	'src/routes',
	'package.json',
	'pnpm-lock.yaml',
	'static'
] as const;

export const PACK_CALIBRATION_RENDER_SOURCE_EXCLUSIONS = [
	'src/lib/platform/packs/catalog.ts',
	'src/lib/platform/packs/catalog-validation.ts'
] as const;

export interface PackCalibrationRenderSourceEntry {
	path: string;
	contentHash: string;
}

function repositoryRelativePath(repoRoot: string, absolutePath: string): string {
	return relative(repoRoot, absolutePath).split(sep).join('/');
}

function isExcludedRenderSource(path: string): boolean {
	if ((PACK_CALIBRATION_RENDER_SOURCE_EXCLUSIONS as readonly string[]).includes(path)) return true;
	return /(?:^|\/)(?:__snapshots__|fixtures)(?:\/|$)/.test(path) || /\.test\.[^.]+$/.test(path);
}

async function collectRenderSourceFiles(repoRoot: string, path: string): Promise<string[]> {
	const absolutePath = resolve(repoRoot, path);
	const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => null);
	if (entries === null) return [absolutePath];

	const files: string[] = [];
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue;
		const childPath = join(absolutePath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectRenderSourceFiles(repoRoot, repositoryRelativePath(repoRoot, childPath))));
		} else if (entry.isFile()) {
			files.push(childPath);
		}
	}
	return files;
}

export async function readPackCalibrationRenderSourceEntries(
	repoRoot: string
): Promise<readonly PackCalibrationRenderSourceEntry[]> {
	const files = (
		await Promise.all(
			PACK_CALIBRATION_RENDER_SOURCE_ROOTS.map((path) =>
				collectRenderSourceFiles(repoRoot, path)
			)
		)
	)
		.flat()
		.map((absolutePath) => ({
			absolutePath,
			path: repositoryRelativePath(repoRoot, absolutePath)
		}))
		.filter(({ path }) => !isExcludedRenderSource(path))
		.sort((left, right) => left.path.localeCompare(right.path));

	return Promise.all(
		files.map(async ({ absolutePath, path }) => ({
			path,
			contentHash: createHash('sha256').update(await readFile(absolutePath)).digest('hex')
		}))
	);
}

export async function createPackCalibrationRenderSourceFingerprint(
	repoRoot: string
): Promise<string> {
	const entries = await readPackCalibrationRenderSourceEntries(repoRoot);
	return createHash('sha256')
		.update(JSON.stringify({ schemaVersion: 1, entries }))
		.digest('hex');
}
