import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readGfxEnvironmentValue } from '../src/lib/utils/legacy-supers-compatibility.ts';

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

export interface VideoTrackMatrixCase {
	id: string;
	fixture: string;
	secondaryFixture?: string;
	edit: 'single-offset' | 'touching-repeat' | 'touching-assets' | 'gap';
	orientation: 'horizontal' | 'vertical';
	fps: 30 | 29.97 | 60 | 59.94;
	format: 'webm' | 'prores';
	includeVideoClipAudio: boolean;
	includeCue: boolean;
}

interface MatrixClip {
	id: string;
	assetId: string;
	fixture: string;
	timelineStartFrame: number;
	durationFrames: number;
	sourceStartSeconds: number;
	audio: { enabled: boolean; gain: number };
}

const APP_URL = readGfxEnvironmentValue(process.env, 'GFX_URL') ?? 'http://localhost:7263';
const DURATION_SECONDS = 0.2;
const CASES: readonly VideoTrackMatrixCase[] = [
	{
		id: 'h30-webm-touching-repeat-audio',
		fixture: 'cfr-horizontal-30-bframes',
		edit: 'touching-repeat',
		orientation: 'horizontal',
		fps: 30,
		format: 'webm',
		includeVideoClipAudio: true,
		includeCue: false
	},
	{
		id: 'h2997-prores-offset-muted',
		fixture: 'cfr-ntsc-30000-1001-bframes',
		edit: 'single-offset',
		orientation: 'horizontal',
		fps: 29.97,
		format: 'prores',
		includeVideoClipAudio: false,
		includeCue: false
	},
	{
		id: 'h60-prores-two-assets-cue-mix',
		fixture: 'cfr-horizontal-30-bframes',
		secondaryFixture: 'cfr-ntsc-30000-1001-bframes',
		edit: 'touching-assets',
		orientation: 'horizontal',
		fps: 60,
		format: 'prores',
		includeVideoClipAudio: true,
		includeCue: true
	},
	{
		id: 'h5994-webm-gap-audio',
		fixture: 'cfr-ntsc-30000-1001-bframes',
		edit: 'gap',
		orientation: 'horizontal',
		fps: 59.94,
		format: 'webm',
		includeVideoClipAudio: true,
		includeCue: false
	},
	{
		id: 'v30-prores-rotated-repeat-audio',
		fixture: 'rotated-portrait-30-bframes',
		edit: 'touching-repeat',
		orientation: 'vertical',
		fps: 30,
		format: 'prores',
		includeVideoClipAudio: true,
		includeCue: false
	},
	{
		id: 'v2997-webm-vfr-muted',
		fixture: 'vfr-horizontal-bframes',
		edit: 'single-offset',
		orientation: 'vertical',
		fps: 29.97,
		format: 'webm',
		includeVideoClipAudio: false,
		includeCue: false
	},
	{
		id: 'v60-webm-rotated-cue-only',
		fixture: 'rotated-portrait-30-bframes',
		edit: 'single-offset',
		orientation: 'vertical',
		fps: 60,
		format: 'webm',
		includeVideoClipAudio: false,
		includeCue: true
	},
	{
		id: 'v5994-prores-vfr-repeat-cue-mix',
		fixture: 'vfr-horizontal-bframes',
		edit: 'touching-repeat',
		orientation: 'vertical',
		fps: 59.94,
		format: 'prores',
		includeVideoClipAudio: true,
		includeCue: true
	}
];

function frameRate(fps: VideoTrackMatrixCase['fps']): { num: number; den: number } {
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

function fixtureAssetId(fixture: string): string {
	return `fixture-${fixture}`;
}

function matrixClipPlan(entry: VideoTrackMatrixCase, frameCount: number): MatrixClip[] {
	const makeClip = (
		id: string,
		fixture: string,
		timelineStartFrame: number,
		durationFrames: number,
		sourceStartSeconds: number
	): MatrixClip => ({
		id,
		assetId: fixtureAssetId(fixture),
		fixture,
		timelineStartFrame,
		durationFrames,
		sourceStartSeconds,
		audio: { enabled: entry.includeVideoClipAudio, gain: 0.5 }
	});

	if (entry.edit === 'single-offset') {
		return [makeClip('clip-a', entry.fixture, 0, frameCount, 0.2)];
	}
	if (entry.edit === 'gap') {
		const clipFrames = Math.max(1, Math.floor(frameCount / 4));
		return [
			makeClip('clip-a', entry.fixture, 0, clipFrames, 0.2),
			makeClip('clip-b', entry.fixture, frameCount - clipFrames, clipFrames, 0.9)
		];
	}

	const cutFrame = Math.max(1, Math.floor(frameCount / 2));
	const secondFixture = entry.edit === 'touching-assets' ? entry.secondaryFixture : entry.fixture;
	if (!secondFixture) throw new Error(`${entry.id} requires a secondary fixture.`);
	return [
		makeClip('clip-a', entry.fixture, 0, cutFrame, 0.2),
		makeClip('clip-b', secondFixture, cutFrame, frameCount - cutFrame, 0.9)
	];
}

export function videoTrackMatrixFixturePreset(
	entry: VideoTrackMatrixCase,
	assets: ReadonlyMap<string, UserVideoAssetDescriptor>
): { preset: unknown; clips: MatrixClip[]; frameCount: number } {
	const rate = frameRate(entry.fps);
	const frameCount = Math.round((DURATION_SECONDS * rate.num) / rate.den);
	const clips = matrixClipPlan(entry, frameCount);
	return {
		preset: {
			schema: 'supers@1',
			name: `Video track export fixture ${entry.id}`,
			description:
				'Machine-only Video track fixture with exact cuts, Source offsets, clip audio, and one animated Overlay.',
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
							title: 'VIDEO CUT',
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
				media: {
					assets: Array.from(assets, ([fixture, asset]) => ({
						id: fixtureAssetId(fixture),
						kind: 'video',
						name: fixture,
						assetUrl: asset.url
					})),
					videoTrack: {
						clips: clips.map((clip) => ({
							id: clip.id,
							assetId: clip.assetId,
							timelineStartFrame: clip.timelineStartFrame,
							durationFrames: clip.durationFrames,
							sourceStartSeconds: clip.sourceStartSeconds,
							audio: clip.audio
						}))
					}
				}
			}
		},
		clips,
		frameCount
	};
}

export async function prepareVideoTrackExportMatrix(
	fixtureManifestPath: string,
	outputDirectory: string
): Promise<string> {
	const fixtureManifest = JSON.parse(
		await readFile(fixtureManifestPath, 'utf8')
	) as FixtureManifest;
	const output = resolve(outputDirectory);
	await mkdir(output, { recursive: true });
	const fixtureByName = new Map(fixtureManifest.fixtures.map((fixture) => [fixture.name, fixture]));
	const assets = new Map<string, UserVideoAssetDescriptor>();
	for (const fixtureName of new Set(
		CASES.flatMap((entry) => [entry.fixture, entry.secondaryFixture].filter(Boolean) as string[])
	)) {
		const fixture = fixtureByName.get(fixtureName);
		if (!fixture) throw new Error(`Missing fixture ${fixtureName}.`);
		assets.set(fixtureName, await uploadFixture(fixture.file));
	}

	const jobs: Array<{ preset: string; out: string }> = [];
	const matrix: unknown[] = [];
	for (const entry of CASES) {
		const { preset, clips, frameCount } = videoTrackMatrixFixturePreset(entry, assets);
		const presetPath = join(output, `${entry.id}.json`);
		const extension = entry.format === 'prores' ? 'mov' : 'webm';
		const exportPath = join(output, `${entry.id}.${extension}`);
		await writeFile(presetPath, JSON.stringify(preset, null, 2), 'utf8');
		jobs.push({ preset: basename(presetPath), out: basename(exportPath) });
		const rate = frameRate(entry.fps);
		matrix.push({
			...entry,
			presetPath,
			exportPath,
			clips,
			expected: {
				width: entry.orientation === 'horizontal' ? 3840 : 2160,
				height: entry.orientation === 'horizontal' ? 2160 : 3840,
				rate: `${rate.num}/${rate.den}`,
				frameCount,
				durationSeconds: (frameCount * rate.den) / rate.num,
				pixelFormat: entry.format === 'prores' ? 'yuva444p10le' : 'yuv444p',
				hasAudio: entry.includeVideoClipAudio || entry.includeCue,
				opaque: entry.edit !== 'gap',
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const [fixtureManifestPath, outputDirectory] = process.argv.slice(2);
	if (!fixtureManifestPath || !outputDirectory) {
		process.stderr.write(
			'usage: prepare-video-track-export-matrix.ts <fixture-manifest.json> <output-directory>\n'
		);
		process.exitCode = 2;
	} else {
		prepareVideoTrackExportMatrix(fixtureManifestPath, outputDirectory)
			.then((matrixPath) => process.stdout.write(`${matrixPath}\n`))
			.catch((error: unknown) => {
				process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
				process.exitCode = 1;
			});
	}
}
