import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

interface FixtureManifestEntry {
	name: string;
	file: string;
}

interface FixtureManifest {
	fixtures: FixtureManifestEntry[];
}

interface UserVideoAssetDescriptor {
	url: string;
	durationSeconds: number;
	displayWidth: number;
	displayHeight: number;
	rotation: number;
	averageFrameRate: number;
	videoCodec: string;
	hasAudio: boolean;
}

interface MatrixCase {
	id: string;
	fixture: string;
	orientation: 'horizontal' | 'vertical';
	fps: 30 | 29.97 | 60 | 59.94;
	format: 'webm' | 'prores';
	includeSourceAudio: boolean;
	includeCue: boolean;
}

const APP_URL = process.env.SUPERS_URL ?? 'http://localhost:7263';
const DURATION_SECONDS = 0.2;
const CASES: readonly MatrixCase[] = [
	{
		id: 'h30-webm-cfr-source-audio',
		fixture: 'cfr-horizontal-30-bframes',
		orientation: 'horizontal',
		fps: 30,
		format: 'webm',
		includeSourceAudio: true,
		includeCue: false
	},
	{
		id: 'h2997-prores-ntsc-muted',
		fixture: 'cfr-ntsc-30000-1001-bframes',
		orientation: 'horizontal',
		fps: 29.97,
		format: 'prores',
		includeSourceAudio: false,
		includeCue: false
	},
	{
		id: 'h60-prores-cfr-source-cue-mix',
		fixture: 'cfr-horizontal-30-bframes',
		orientation: 'horizontal',
		fps: 60,
		format: 'prores',
		includeSourceAudio: true,
		includeCue: true
	},
	{
		id: 'h5994-webm-ntsc-source-audio',
		fixture: 'cfr-ntsc-30000-1001-bframes',
		orientation: 'horizontal',
		fps: 59.94,
		format: 'webm',
		includeSourceAudio: true,
		includeCue: false
	},
	{
		id: 'v30-prores-rotated-source-audio',
		fixture: 'rotated-portrait-30-bframes',
		orientation: 'vertical',
		fps: 30,
		format: 'prores',
		includeSourceAudio: true,
		includeCue: false
	},
	{
		id: 'v2997-webm-vfr-muted',
		fixture: 'vfr-horizontal-bframes',
		orientation: 'vertical',
		fps: 29.97,
		format: 'webm',
		includeSourceAudio: false,
		includeCue: false
	},
	{
		id: 'v60-webm-rotated-cue-only',
		fixture: 'rotated-portrait-30-bframes',
		orientation: 'vertical',
		fps: 60,
		format: 'webm',
		includeSourceAudio: false,
		includeCue: true
	},
	{
		id: 'v5994-prores-vfr-source-cue-mix',
		fixture: 'vfr-horizontal-bframes',
		orientation: 'vertical',
		fps: 59.94,
		format: 'prores',
		includeSourceAudio: true,
		includeCue: true
	}
];

function frameRate(fps: MatrixCase['fps']): { num: number; den: number } {
	if (fps === 29.97) return { num: 30_000, den: 1_001 };
	if (fps === 59.94) return { num: 60_000, den: 1_001 };
	return { num: fps, den: 1 };
}

async function uploadFixture(file: string): Promise<UserVideoAssetDescriptor> {
	const response = await fetch(`${APP_URL}/api/user-assets`, {
		method: 'POST',
		headers: { 'Content-Type': 'video/quicktime' },
		body: new Blob([await readFile(file)], { type: 'video/quicktime' })
	});
	if (!response.ok) throw new Error(`Fixture upload failed: ${await response.text()}`);
	return (await response.json()) as UserVideoAssetDescriptor;
}

function fixturePreset(entry: MatrixCase, asset: UserVideoAssetDescriptor): unknown {
	return {
		schema: 'supers@1',
		name: `Source video export fixture ${entry.id}`,
		description:
			'Machine-only Source video export fixture with one animated lower-third and a composition Effect.',
		pack: 'syntax',
		kind: 'fixture',
		state: {
			transport: {
				orientation: entry.orientation,
				durationSeconds: DURATION_SECONDS,
				fps: entry.fps,
				format: entry.format
			},
			typography: {
				fontFamily: 'sans',
				paperColor: '#ffffff',
				inkColor: '#f5f5f5'
			},
			marks: { defaults: {}, timings: [] },
			surface: { type: 'plain', content: { body: '' } },
			textAnimations: [],
			overlays: [
				{
					type: 'lower-third',
					id: 'matrix-lower-third',
					content: {
						variant: 'standard',
						kicker: 'MACHINE',
						title: 'SOURCE FRAME',
						subtitle: entry.id
					},
					position: {
						anchor: 'bottom-left',
						offset: { x: 0.0625, y: entry.orientation === 'vertical' ? 0.2 : 0.15 }
					},
					enter: {
						start: 0,
						duration: 0.25,
						ease: 'settled',
						sound: { mute: true }
					},
					exit: {
						start: 0.7,
						duration: 0.25,
						ease: 'smooth',
						sound: { mute: true }
					}
				}
			],
			effects: [
				{
					type: 'paper-grain',
					id: 'matrix-effect',
					params: { warmth: 0.5, density: 0.3, lift: 0 }
				}
			],
			audioCues: entry.includeCue
				? [
						{
							id: 'matrix-click',
							kind: 'cue',
							assetSlug: 'core-click',
							start: 0.5,
							duration: 0.25,
							volume: 0.35
						}
					]
				: [],
			sourceVideo: {
				assetUrl: asset.url,
				sourceOffsetSeconds: 0,
				includeAudio: entry.includeSourceAudio,
				volume: 0.5
			}
		}
	};
}

export async function prepareSourceVideoExportMatrix(
	fixtureManifestPath: string,
	outputDirectory: string
): Promise<string> {
	const fixtureManifest = JSON.parse(await readFile(fixtureManifestPath, 'utf8')) as FixtureManifest;
	const output = resolve(outputDirectory);
	await mkdir(output, { recursive: true });
	const fixtureByName = new Map(fixtureManifest.fixtures.map((fixture) => [fixture.name, fixture]));
	const assets = new Map<string, UserVideoAssetDescriptor>();
	for (const fixtureName of new Set(CASES.map((entry) => entry.fixture))) {
		const fixture = fixtureByName.get(fixtureName);
		if (!fixture) throw new Error(`Missing fixture ${fixtureName}.`);
		assets.set(fixtureName, await uploadFixture(fixture.file));
	}

	const jobs: Array<{ preset: string; out: string }> = [];
	const matrix: unknown[] = [];
	for (const entry of CASES) {
		const asset = assets.get(entry.fixture)!;
		const presetPath = join(output, `${entry.id}.json`);
		const extension = entry.format === 'prores' ? 'mov' : 'webm';
		const exportPath = join(output, `${entry.id}.${extension}`);
		await writeFile(presetPath, JSON.stringify(fixturePreset(entry, asset), null, 2), 'utf8');
		jobs.push({ preset: basename(presetPath), out: basename(exportPath) });
		const rate = frameRate(entry.fps);
		matrix.push({
			...entry,
			presetPath,
			exportPath,
			asset,
			expected: {
				width: entry.orientation === 'horizontal' ? 3840 : 2160,
				height: entry.orientation === 'horizontal' ? 2160 : 3840,
				rate: `${rate.num}/${rate.den}`,
				frameCount: Math.round((DURATION_SECONDS * rate.num) / rate.den),
				durationSeconds: (Math.round((DURATION_SECONDS * rate.num) / rate.den) * rate.den) / rate.num,
				pixelFormat: entry.format === 'prores' ? 'yuva444p10le' : 'yuv444p',
				hasAudio: entry.includeSourceAudio || entry.includeCue,
				audioSampleRate: 48_000,
				audioChannels: 2
			}
		});
	}

	const batchPath = join(output, 'batch.json');
	await writeFile(batchPath, JSON.stringify(jobs, null, 2), 'utf8');
	const matrixPath = join(output, 'matrix.json');
	await writeFile(
		matrixPath,
		JSON.stringify(
			{
				version: 1,
				durationSeconds: DURATION_SECONDS,
				fixtureManifestPath: resolve(fixtureManifestPath),
				batchPath,
				matrix
			},
			null,
			2
		),
		'utf8'
	);
	return matrixPath;
}

const [fixtureManifestPath, outputDirectory] = process.argv.slice(2);
if (!fixtureManifestPath || !outputDirectory) {
	process.stderr.write(
		'usage: prepare-source-video-export-matrix.ts <fixture-manifest.json> <output-directory>\n'
	);
	process.exitCode = 2;
} else {
	prepareSourceVideoExportMatrix(fixtureManifestPath, outputDirectory)
		.then((matrixPath) => process.stdout.write(`${matrixPath}\n`))
		.catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		});
}
