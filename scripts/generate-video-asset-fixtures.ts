import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { PNG } from 'pngjs';

interface FixtureFrame {
	identity: number;
	timestamp: number;
	duration: number;
}

interface VideoAssetFixture {
	name: string;
	file: string;
	mode: 'cfr' | 'vfr';
	rate: string | null;
	rotation: 0 | 90;
	frames: FixtureFrame[];
}

interface FixtureDefinition {
	name: string;
	mode: 'cfr' | 'vfr';
	rate?: { num: number; den: number };
	rotation: 0 | 90;
}

const WIDTH = 640;
const HEIGHT = 360;
const DURATION_SECONDS = 2;
const AUDIO_SAMPLE_RATE = 48_000;
const CLICK_SAMPLES = 144;
const GLYPHS: Record<string, readonly string[]> = {
	'0': ['111', '101', '101', '101', '111'],
	'1': ['010', '110', '010', '010', '111'],
	'2': ['111', '001', '111', '100', '111'],
	'3': ['111', '001', '111', '001', '111'],
	'4': ['101', '101', '111', '001', '001'],
	'5': ['111', '100', '111', '001', '111'],
	'6': ['111', '100', '111', '101', '111'],
	'7': ['111', '001', '010', '010', '010'],
	'8': ['111', '101', '111', '101', '111'],
	'9': ['111', '101', '111', '001', '111'],
	F: ['111', '100', '110', '100', '100'],
	T: ['111', '010', '010', '010', '010']
};

const DEFINITIONS: readonly FixtureDefinition[] = [
	{
		name: 'cfr-horizontal-30-bframes',
		mode: 'cfr',
		rate: { num: 30, den: 1 },
		rotation: 0
	},
	{
		name: 'cfr-ntsc-30000-1001-bframes',
		mode: 'cfr',
		rate: { num: 30_000, den: 1_001 },
		rotation: 0
	},
	{
		name: 'rotated-portrait-30-bframes',
		mode: 'cfr',
		rate: { num: 30, den: 1 },
		rotation: 90
	},
	{ name: 'vfr-horizontal-bframes', mode: 'vfr', rotation: 0 }
];

function ffmpeg(args: readonly string[]): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', args, {
			stdio: ['ignore', 'ignore', 'pipe']
		});
		const stderr: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			if (code === 0) resolvePromise();
			else reject(new Error(Buffer.concat(stderr).toString('utf8').slice(-4000)));
		});
	});
}

function cfrFrames(num: number, den: number): FixtureFrame[] {
	const count = Math.ceil((DURATION_SECONDS * num) / den);
	return Array.from({ length: count }, (_, identity) => ({
		identity,
		timestamp: (identity * den) / num,
		duration: den / num
	}));
}

function vfrFrames(): FixtureFrame[] {
	const durations = [1 / 30, 1 / 20, 1 / 60];
	const frames: FixtureFrame[] = [];
	let timestamp = 0;
	let identity = 0;
	while (timestamp < DURATION_SECONDS - 1e-9) {
		const duration = Math.min(durations[identity % durations.length], DURATION_SECONDS - timestamp);
		frames.push({ identity, timestamp, duration });
		timestamp += duration;
		identity += 1;
	}
	return frames;
}

function frameColor(identity: number, quadrant: number): readonly [number, number, number] {
	const channels: readonly [number, number, number][] = [
		[48 + ((identity * 17) % 176), 24, 24],
		[24, 48 + ((identity * 29) % 176), 24],
		[24, 24, 48 + ((identity * 43) % 176)],
		[48 + ((identity * 11) % 176), 48 + ((identity * 7) % 176), 24]
	];
	return channels[quadrant];
}

function setPixel(
	data: Buffer,
	x: number,
	y: number,
	color: readonly [number, number, number]
): void {
	if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
	const offset = (y * WIDTH + x) * 4;
	data[offset] = color[0];
	data[offset + 1] = color[1];
	data[offset + 2] = color[2];
	data[offset + 3] = 255;
}

function fillRect(
	data: Buffer,
	x: number,
	y: number,
	width: number,
	height: number,
	color: readonly [number, number, number]
): void {
	for (let py = y; py < y + height; py += 1) {
		for (let px = x; px < x + width; px += 1) setPixel(data, px, py, color);
	}
}

function drawText(data: Buffer, text: string, x: number, y: number, scale: number): void {
	let cursor = x;
	for (const character of text) {
		const glyph = GLYPHS[character];
		if (!glyph) {
			cursor += scale * 2;
			continue;
		}
		for (let row = 0; row < glyph.length; row += 1) {
			for (let column = 0; column < glyph[row].length; column += 1) {
				if (glyph[row][column] === '1') {
					fillRect(data, cursor + column * scale, y + row * scale, scale, scale, [255, 255, 255]);
				}
			}
		}
		cursor += scale * 4;
	}
}

function renderFrame(frame: FixtureFrame): Buffer {
	const png = new PNG({ width: WIDTH, height: HEIGHT });
	for (let y = 0; y < HEIGHT; y += 1) {
		for (let x = 0; x < WIDTH; x += 1) {
			const quadrant = (x >= WIDTH / 2 ? 1 : 0) + (y >= HEIGHT / 2 ? 2 : 0);
			setPixel(png.data, x, y, frameColor(frame.identity, quadrant));
		}
	}

	// Distinct crop/rotation boundaries: top red, right green, bottom blue, left yellow.
	fillRect(png.data, 0, 0, WIDTH, 8, [255, 24, 24]);
	fillRect(png.data, WIDTH - 8, 0, 8, HEIGHT, [24, 255, 24]);
	fillRect(png.data, 0, HEIGHT - 8, WIDTH, 8, [24, 24, 255]);
	fillRect(png.data, 0, 0, 8, HEIGHT, [255, 255, 24]);
	fillRect(png.data, WIDTH / 2 - 2, 0, 4, HEIGHT, [0, 0, 0]);
	fillRect(png.data, 0, HEIGHT / 2 - 2, WIDTH, 4, [0, 0, 0]);

	const identity = String(frame.identity).padStart(5, '0');
	const milliseconds = String(Math.round(frame.timestamp * 1000)).padStart(6, '0');
	fillRect(png.data, 80, 142, 480, 76, [0, 0, 0]);
	drawText(png.data, `F${identity} T${milliseconds}`, 96, 158, 8);

	// The white/black center flash is welded to the matching audio click.
	fillRect(
		png.data,
		WIDTH / 2 - 16,
		HEIGHT / 2 - 16,
		32,
		32,
		frame.identity % 2 === 0 ? [255, 255, 255] : [0, 0, 0]
	);
	return PNG.sync.write(png);
}

function wavBytes(frames: readonly FixtureFrame[]): Buffer {
	const sampleCount = Math.ceil(DURATION_SECONDS * AUDIO_SAMPLE_RATE);
	const channelCount = 2;
	const bytesPerSample = 2;
	const data = Buffer.alloc(sampleCount * channelCount * bytesPerSample);
	for (const frame of frames) {
		const start = Math.round(frame.timestamp * AUDIO_SAMPLE_RATE);
		for (let index = 0; index < CLICK_SAMPLES && start + index < sampleCount; index += 1) {
			const envelope = 1 - index / CLICK_SAMPLES;
			const wave = Math.sin((2 * Math.PI * 1200 * index) / AUDIO_SAMPLE_RATE) * envelope;
			const leftGain = frame.identity % 2 === 0 ? 0.8 : 0.35;
			const rightGain = frame.identity % 2 === 0 ? 0.35 : 0.8;
			const offset = (start + index) * channelCount * bytesPerSample;
			data.writeInt16LE(Math.round(wave * leftGain * 32767), offset);
			data.writeInt16LE(Math.round(wave * rightGain * 32767), offset + bytesPerSample);
		}
	}

	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(36 + data.byteLength, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(channelCount, 22);
	header.writeUInt32LE(AUDIO_SAMPLE_RATE, 24);
	header.writeUInt32LE(AUDIO_SAMPLE_RATE * channelCount * bytesPerSample, 28);
	header.writeUInt16LE(channelCount * bytesPerSample, 32);
	header.writeUInt16LE(bytesPerSample * 8, 34);
	header.write('data', 36);
	header.writeUInt32LE(data.byteLength, 40);
	return Buffer.concat([header, data]);
}

async function generateFixture(
	definition: FixtureDefinition,
	outputDirectory: string
): Promise<VideoAssetFixture> {
	const workDirectory = join(outputDirectory, `.${definition.name}`);
	await rm(workDirectory, { recursive: true, force: true });
	await mkdir(workDirectory, { recursive: true });
	const frames =
		definition.mode === 'cfr' ? cfrFrames(definition.rate!.num, definition.rate!.den) : vfrFrames();
	for (const frame of frames) {
		await writeFile(
			join(workDirectory, `frame-${String(frame.identity).padStart(5, '0')}.png`),
			renderFrame(frame)
		);
	}
	const audioPath = join(workDirectory, 'clicks.wav');
	await writeFile(audioPath, wavBytes(frames));
	const outputPath = join(outputDirectory, `${definition.name}.mov`);
	const encodedPath =
		definition.rotation === 90 ? join(workDirectory, 'unrotated.mov') : outputPath;
	const videoInput: string[] = [];
	const videoFilter: string[] = [];
	if (definition.mode === 'cfr') {
		const rate = `${definition.rate!.num}/${definition.rate!.den}`;
		videoInput.push('-framerate', rate, '-i', join(workDirectory, 'frame-%05d.png'));
	} else {
		videoInput.push('-framerate', '60', '-i', join(workDirectory, 'frame-%05d.png'));
		// PTS increments repeat 2,3,1 ticks on a 60 Hz timebase, yielding exact
		// 1/30, 1/20, 1/60 frame durations without concat's 25 Hz quantization.
		videoFilter.push('-vf', 'setpts=N+floor((N+2)/3)+2*floor((N+1)/3)');
	}

	await ffmpeg([
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		...videoInput,
		'-i',
		audioPath,
		'-map',
		'0:v:0',
		'-map',
		'1:a:0',
		...videoFilter,
		'-c:v',
		'libx264',
		'-preset',
		'medium',
		'-crf',
		'10',
		'-bf',
		'2',
		'-g',
		'60',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'pcm_s16le',
		'-ar',
		String(AUDIO_SAMPLE_RATE),
		'-ac',
		'2',
		'-fps_mode',
		definition.mode === 'vfr' ? 'vfr' : 'cfr',
		'-t',
		String(DURATION_SECONDS),
		encodedPath
	]);
	if (definition.rotation === 90) {
		await ffmpeg([
			'-y',
			'-hide_banner',
			'-loglevel',
			'error',
			'-display_rotation:v:0',
			'90',
			'-i',
			encodedPath,
			'-map',
			'0',
			'-c',
			'copy',
			outputPath
		]);
	}

	await rm(workDirectory, { recursive: true, force: true });
	return {
		name: definition.name,
		file: outputPath,
		mode: definition.mode,
		rate: definition.rate ? `${definition.rate.num}/${definition.rate.den}` : null,
		rotation: definition.rotation,
		frames
	};
}

export async function generateVideoAssetFixtures(outputDirectory: string): Promise<string> {
	const resolvedOutput = resolve(outputDirectory);
	await mkdir(resolvedOutput, { recursive: true });
	const fixtures: VideoAssetFixture[] = [];
	for (const definition of DEFINITIONS) {
		fixtures.push(await generateFixture(definition, resolvedOutput));
	}
	const manifestPath = join(resolvedOutput, 'video-asset-fixtures.json');
	await writeFile(
		manifestPath,
		JSON.stringify(
			{
				version: 1,
				width: WIDTH,
				height: HEIGHT,
				durationSeconds: DURATION_SECONDS,
				audioSampleRate: AUDIO_SAMPLE_RATE,
				clickSamples: CLICK_SAMPLES,
				fixtures
			},
			null,
			2
		),
		'utf8'
	);
	return manifestPath;
}

const outputDirectory = process.argv[2];
if (!outputDirectory) {
	process.stderr.write('usage: generate-video-asset-fixtures.ts <output-directory>\n');
	process.exitCode = 2;
} else {
	generateVideoAssetFixtures(outputDirectory)
		.then((manifestPath) => process.stdout.write(`${manifestPath}\n`))
		.catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		});
}
