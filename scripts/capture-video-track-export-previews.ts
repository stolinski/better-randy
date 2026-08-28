import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { readGfxEnvironmentValue } from '../src/lib/utils/legacy-supers-compatibility.ts';

interface MatrixEntry {
	id: string;
	format: 'webm' | 'prores';
	fps: number;
	presetPath: string;
	expected: { frameCount: number };
}

interface MatrixManifest {
	durationSeconds: number;
	matrix: MatrixEntry[];
}

const APP_URL = readGfxEnvironmentValue(process.env, 'GFX_URL') ?? 'http://localhost:7263';

function runCapture(slug: string, outDirectory: string, samples: readonly number[]): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.execPath, ['scripts/cdp-capture.mjs', slug], {
			cwd: process.cwd(),
			env: {
				...process.env,
				CDP_URL: `${APP_URL}/p/${slug}`,
				CDP_OUTDIR: outDirectory,
				CDP_SAMPLES: samples.join(',')
			},
			stdio: 'inherit'
		});
		child.once('error', reject);
		child.once('close', (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(`CDP preview capture exited with code ${code ?? 'unknown'}.`));
		});
	});
}

async function storePreviewPreset(slug: string, presetPath: string): Promise<void> {
	const response = await fetch(`${APP_URL}/api/user-compositions/${slug}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: await readFile(presetPath, 'utf8')
	});
	if (!response.ok) throw new Error(`Preview Preset import failed: ${await response.text()}`);
}

async function deletePreviewPreset(slug: string): Promise<void> {
	const response = await fetch(`${APP_URL}/api/user-compositions/${slug}`, { method: 'DELETE' });
	if (!response.ok && response.status !== 404) {
		throw new Error(`Preview Preset cleanup failed: ${await response.text()}`);
	}
}

export async function captureVideoTrackExportPreviews(
	matrixPath: string,
	outputDirectory: string
): Promise<string> {
	const manifest = JSON.parse(await readFile(matrixPath, 'utf8')) as MatrixManifest;
	const output = resolve(outputDirectory);
	await mkdir(output, { recursive: true });
	const captures: unknown[] = [];

	for (const entry of manifest.matrix.filter((candidate) => candidate.format === 'prores')) {
		const slug = `machine-preview-${entry.id}`;
		const frameIndexes = [
			0,
			Math.floor(entry.expected.frameCount / 2),
			entry.expected.frameCount - 1
		];
		const rate =
			entry.fps === 29.97 ? 30_000 / 1_001 : entry.fps === 59.94 ? 60_000 / 1_001 : entry.fps;
		const samples = frameIndexes.map((frame) => frame / rate / manifest.durationSeconds);
		const caseDirectory = join(output, entry.id);
		await storePreviewPreset(slug, entry.presetPath);
		try {
			await runCapture(slug, caseDirectory, samples);
		} finally {
			await deletePreviewPreset(slug);
		}
		captures.push({
			id: entry.id,
			frames: frameIndexes.map((frame, index) => ({
				frame,
				progress: samples[index],
				path: join(caseDirectory, `p${samples[index].toFixed(2)}.png`)
			}))
		});
	}

	const previewManifestPath = join(output, 'preview-manifest.json');
	await writeFile(previewManifestPath, JSON.stringify({ version: 1, captures }, null, 2), 'utf8');
	return previewManifestPath;
}

const [matrixPath, outputDirectory] = process.argv.slice(2);
if (!matrixPath || !outputDirectory) {
	process.stderr.write(
		'usage: capture-video-track-export-previews.ts <matrix.json> <output-directory>\n'
	);
	process.exitCode = 2;
} else {
	captureVideoTrackExportPreviews(matrixPath, outputDirectory)
		.then((manifestPath) => process.stdout.write(`${manifestPath}\n`))
		.catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		});
}
