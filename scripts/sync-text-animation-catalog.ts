/**
 * Re-sync the vendored text-animation catalog from the pinned upstream SHA in
 * `src/lib/text-animations/raw-catalog/CATALOG_SOURCE.md`. Idempotent: a second
 * run with no upstream changes produces no diff.
 *
 * Usage:
 *   node --experimental-strip-types scripts/sync-text-animation-catalog.ts
 *
 * Optional flags:
 *   --sha=<hex>   Pin to a different upstream sha (writes the new sha back).
 *   --check       Exit 1 if the local catalog differs from the upstream sha.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const catalogRoot = resolve(repoRoot, 'src/lib/text-animations/raw-catalog');
const sourceMdPath = resolve(catalogRoot, 'CATALOG_SOURCE.md');
const upstreamRepo = 'https://github.com/pixel-point/animate-text.git';

interface CliArgs {
	sha: string | null;
	check: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
	let sha: string | null = null;
	let check = false;
	for (const arg of argv) {
		if (arg.startsWith('--sha=')) {
			sha = arg.slice('--sha='.length);
		}
		if (arg === '--check') {
			check = true;
		}
	}
	return { sha, check };
}

function readPinnedSha(): string {
	const text = readFileSync(sourceMdPath, 'utf8');
	const match = text.match(/Commit SHA:\s*`([0-9a-f]+)`/i);
	if (!match) {
		throw new Error(`Could not find pinned SHA in ${sourceMdPath}`);
	}
	return match[1];
}

function writePinnedSha(sha: string): void {
	const text = readFileSync(sourceMdPath, 'utf8');
	const next = text.replace(/Commit SHA:\s*`([0-9a-f]+)`/i, `Commit SHA: \`${sha}\``);
	writeFileSync(sourceMdPath, next, 'utf8');
}

function ensureDirExists(path: string): void {
	try {
		const stat = statSync(path);
		if (!stat.isDirectory()) {
			throw new Error(`${path} exists but is not a directory.`);
		}
	} catch {
		throw new Error(`Expected directory ${path} does not exist.`);
	}
}

function sortedJsonFiles(dir: string): string[] {
	return readdirSync(dir)
		.filter((name) => name.endsWith('.json'))
		.sort();
}

function syncOne(srcDir: string, destDir: string): { copied: number } {
	ensureDirExists(srcDir);
	ensureDirExists(destDir);
	let copied = 0;
	for (const name of sortedJsonFiles(srcDir)) {
		cpSync(join(srcDir, name), join(destDir, name));
		copied += 1;
	}
	return { copied };
}

function main(): void {
	const args = parseArgs(process.argv.slice(2));
	const targetSha = args.sha ?? readPinnedSha();

	const tempDir = mkdtempSync(join(tmpdir(), 'animate-text-sync-'));
	try {
		execFileSync('git', ['clone', '--depth', '50', upstreamRepo, tempDir], {
			stdio: 'inherit'
		});
		execFileSync('git', ['-C', tempDir, 'checkout', targetSha], { stdio: 'inherit' });

		const upstreamAssets = join(tempDir, 'skills', 'animate-text', 'assets');
		const upstreamSpecs = join(upstreamAssets, 'specs');
		const upstreamEffects = join(upstreamAssets, 'effects');

		const specsRes = syncOne(upstreamSpecs, join(catalogRoot, 'specs'));
		const effectsRes = syncOne(upstreamEffects, join(catalogRoot, 'effects'));

		for (const top of ['runtime-presets.json', 'stage-presets.json', 'library-adapters.json', 'samples.json']) {
			cpSync(join(upstreamAssets, top), join(catalogRoot, top));
		}

		if (args.sha) {
			writePinnedSha(targetSha);
		}

		console.log(
			`Synced ${specsRes.copied} specs + ${effectsRes.copied} effects at sha ${targetSha}.`
		);

		if (args.check) {
			const diff = execFileSync('git', ['status', '--porcelain', catalogRoot], {
				cwd: repoRoot,
				encoding: 'utf8'
			}).trim();
			if (diff.length > 0) {
				console.error('Catalog differs from pinned upstream:\n' + diff);
				process.exit(1);
			}
		}
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

main();
