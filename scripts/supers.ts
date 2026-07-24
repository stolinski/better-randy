import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

import { chromium, type Page } from 'playwright';

interface RenderJob {
	preset: string;
	out: string;
}

interface PreparedPreset {
	slug: string;
	cleanup: () => Promise<void>;
}

const APP_URL = process.env.SUPERS_URL ?? 'http://localhost:7263';
const CDP_URL = process.env.SUPERS_CDP_URL ?? `http://localhost:${process.env.CDP_PORT ?? '9223'}`;
const RENDER_TIMEOUT_MS = Number(process.env.SUPERS_RENDER_TIMEOUT_MS ?? 10 * 60_000);
const READY_TIMEOUT_MS = Number(process.env.SUPERS_READY_TIMEOUT_MS ?? 30_000);

function usage(): never {
	throw new Error(
		'Usage: supers render --preset <slug-or-path> --out <file> | supers batch <manifest.json>'
	);
}

function readFlag(args: readonly string[], flag: string): string {
	const index = args.indexOf(flag);
	const value = index >= 0 ? args[index + 1] : undefined;
	if (!value || value.startsWith('--')) usage();
	return value;
}

function isFilePreset(value: string): boolean {
	return value.endsWith('.json') || value.includes('/') || value.includes('\\');
}

async function responseFailure(response: Response): Promise<string> {
	const text = await response.text();
	if (!text) return `${response.status} ${response.statusText}`.trim();
	try {
		const value: unknown = JSON.parse(text);
		if (typeof value === 'object' && value !== null && 'message' in value) {
			const message = (value as { message?: unknown }).message;
			if (typeof message === 'string') return message;
		}
	} catch {
		return text;
	}
	return text;
}

async function assertRuntimeAvailable(): Promise<void> {
	const [appResponse, cdpResponse] = await Promise.all([
		fetch(APP_URL),
		fetch(`${CDP_URL}/json/version`)
	]);
	if (!appResponse.ok) {
		throw new Error(`Supers dev server is unavailable at ${APP_URL}.`);
	}
	if (!cdpResponse.ok) {
		throw new Error(`CanvasDrawElement browser is unavailable at ${CDP_URL}.`);
	}
}

async function preparePreset(presetInput: string): Promise<PreparedPreset> {
	if (!isFilePreset(presetInput)) {
		return { slug: presetInput, cleanup: async () => {} };
	}

	const presetPath = resolve(presetInput);
	let preset: unknown;
	try {
		preset = JSON.parse(await readFile(presetPath, 'utf-8')) as unknown;
	} catch (error) {
		throw new Error(`Failed to read Preset ${presetPath}.`, { cause: error });
	}

	const slug = `agent-render-${randomUUID()}`;
	const response = await fetch(`${APP_URL}/api/user-compositions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ slug, preset, forkedFrom: null })
	});
	if (!response.ok) {
		throw new Error(`Preset import failed: ${await responseFailure(response)}`);
	}

	return {
		slug,
		cleanup: async () => {
			const cleanupResponse = await fetch(
				`${APP_URL}/api/user-compositions/${encodeURIComponent(slug)}`,
				{ method: 'DELETE' }
			);
			if (!cleanupResponse.ok && cleanupResponse.status !== 404) {
				throw new Error(
					`Temporary Preset cleanup failed: ${await responseFailure(cleanupResponse)}`
				);
			}
		}
	};
}

async function renderJob(page: Page, job: RenderJob): Promise<void> {
	const prepared = await preparePreset(job.preset);
	try {
		await page.goto(`${APP_URL}/p/${encodeURIComponent(prepared.slug)}`, {
			waitUntil: 'networkidle',
			timeout: READY_TIMEOUT_MS
		});
		await page.waitForFunction(
			(slug) =>
				typeof (window as Window & { __supersExport?: unknown }).__supersExport === 'function' &&
				document.querySelector('.topbar__name')?.textContent?.trim() === slug,
			prepared.slug,
			{ timeout: READY_TIMEOUT_MS }
		);
		await page.evaluate(() => document.fonts.ready);

		const outputPath = resolve(job.out);
		await mkdir(dirname(outputPath), { recursive: true });
		const downloadPromise = page.waitForEvent('download', { timeout: RENDER_TIMEOUT_MS });
		const exportPromise = page.evaluate(async (filename) => {
			const exportComposition = (
				window as Window & {
					__supersExport?: (request: { filename: string }) => Promise<void>;
				}
			).__supersExport;
			if (!exportComposition) throw new Error('Workspace export seam is unavailable.');
			await exportComposition({ filename });
		}, basename(outputPath));
		const [download] = await Promise.all([downloadPromise, exportPromise]);
		await download.saveAs(outputPath);
		const output = await stat(outputPath);
		if (output.size === 0) throw new Error(`Renderer produced an empty file at ${outputPath}.`);
		process.stdout.write(`${outputPath}\n`);
	} finally {
		await prepared.cleanup();
	}
}

function parseBatchManifest(value: unknown, manifestPath: string): RenderJob[] {
	if (!Array.isArray(value)) {
		throw new TypeError('Batch manifest must be an array.');
	}
	const baseDirectory = dirname(manifestPath);
	return value.map((entry, index) => {
		if (
			typeof entry !== 'object' ||
			entry === null ||
			!('preset' in entry) ||
			!('out' in entry) ||
			typeof entry.preset !== 'string' ||
			typeof entry.out !== 'string'
		) {
			throw new TypeError(`Invalid batch job at index ${index}.`);
		}
		const preset =
			isFilePreset(entry.preset) && !isAbsolute(entry.preset)
				? resolve(baseDirectory, entry.preset)
				: entry.preset;
		const out = isAbsolute(entry.out) ? entry.out : resolve(baseDirectory, entry.out);
		return { preset, out };
	});
}

async function run(): Promise<void> {
	const [command, ...args] = process.argv.slice(2);
	let jobs: RenderJob[];
	if (command === 'render') {
		jobs = [{ preset: readFlag(args, '--preset'), out: readFlag(args, '--out') }];
	} else if (command === 'batch') {
		const manifestPath = resolve(args[0] ?? usage());
		const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf-8'));
		jobs = parseBatchManifest(manifest, manifestPath);
	} else {
		usage();
	}

	await assertRuntimeAvailable();
	const browser = await chromium.connectOverCDP(CDP_URL);
	const context = browser.contexts()[0];
	if (!context) throw new Error(`No browser context is available at ${CDP_URL}.`);
	const page = await context.newPage();
	const failures: string[] = [];
	try {
		for (const job of jobs) {
			try {
				await renderJob(page, job);
			} catch (error) {
				failures.push(`${job.preset}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} finally {
		await page.close();
		// This Browser was attached with connectOverCDP, so close disconnects the
		// Playwright client without terminating the shared Chrome process.
		await browser.close({ reason: 'Supers render jobs complete' });
	}

	if (failures.length > 0) {
		throw new Error(`Render failures:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
	}
}

run().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
});
