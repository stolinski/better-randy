import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ffmpeg and ffprobe run from the repository, never from the caller's directory.
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

interface FixtureFrame {
	identity: number;
	timestamp: number;
	duration: number;
}

interface FixtureEntry {
	name: string;
	file: string;
	frames: FixtureFrame[];
}

interface FixtureManifest {
	fixtures: FixtureEntry[];
}

interface MatrixExpected {
	width: number;
	height: number;
	rate: string;
	frameCount: number;
	durationSeconds: number;
	pixelFormat: string;
	hasAudio: boolean;
	opaque: boolean;
	audioSampleRate: number;
	audioChannels: number;
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

interface MatrixEntry {
	id: string;
	orientation: 'horizontal' | 'vertical';
	fps: number;
	format: 'webm' | 'prores';
	includeVideoClipAudio: boolean;
	includeCue: boolean;
	clips: MatrixClip[];
	exportPath: string;
	expected: MatrixExpected;
}

interface MatrixManifest {
	fixtureManifestPath: string;
	matrix: MatrixEntry[];
}

interface PreviewFrame {
	frame: number;
	progress: number;
	path: string;
}

interface PreviewCapture {
	id: string;
	frames: PreviewFrame[];
}

interface PreviewManifest {
	captures: PreviewCapture[];
}

interface ProbeStream {
	codec_name?: string;
	profile?: string;
	codec_type?: string;
	width?: number;
	height?: number;
	pix_fmt?: string;
	r_frame_rate?: string;
	avg_frame_rate?: string;
	nb_read_frames?: string;
	sample_rate?: string;
	channels?: number;
}

interface ProbePacket {
	pts_time?: string;
	duration_time?: string;
}

interface ProbeDocument {
	streams?: ProbeStream[];
	format?: { duration?: string; size?: string };
	packets?: ProbePacket[];
}

interface RawFrames {
	bytes: Buffer;
	frameSize: number;
	count: number;
	width: number;
	height: number;
	channels: number;
}

interface Region {
	x: number;
	y: number;
	width: number;
	height: number;
}

const SOURCE_PIXEL_MAE_TOLERANCE = 0.055;
const CROP_BOUNDARY_MAE_TOLERANCE = 0.07;
const PREVIEW_PRORES_MAE_TOLERANCE = 0.035;
const WEBM_TIMESTAMP_TOLERANCE_SECONDS = 0.00051;
const PRORES_TIMESTAMP_TOLERANCE_SECONDS = 0.00001;
const AUDIO_SYNC_TOLERANCE_SAMPLES = 144;

function runBinary(
	command: string,
	args: readonly string[]
): Promise<{ stdout: Buffer; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] });
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			const errorText = Buffer.concat(stderr).toString('utf8').trim();
			if (code === 0) resolvePromise({ stdout: Buffer.concat(stdout), stderr: errorText });
			else reject(new Error(errorText || `${command} exited with code ${code ?? 'unknown'}.`));
		});
	});
}

async function ffprobe(path: string, packets = false): Promise<ProbeDocument> {
	const args = [
		'-v',
		'error',
		'-count_frames',
		...(packets ? ['-select_streams', 'v:0', '-show_packets'] : ['-show_streams', '-show_format']),
		'-of',
		'json',
		path
	];
	const { stdout } = await runBinary(process.env.FFPROBE_PATH ?? 'ffprobe', args);
	return JSON.parse(stdout.toString('utf8')) as ProbeDocument;
}

function rateValue(rate: string): number {
	const [num, den] = rate.split('/').map(Number);
	return num / den;
}

function lowResolution(entry: MatrixEntry): { width: number; height: number } {
	return entry.orientation === 'horizontal'
		? { width: 320, height: 180 }
		: { width: 180, height: 320 };
}

async function decodeFrames(
	path: string,
	width: number,
	height: number,
	rgba = false
): Promise<RawFrames> {
	const channels = rgba ? 4 : 3;
	const { stdout } = await runBinary(process.env.FFMPEG_PATH ?? 'ffmpeg', [
		'-v',
		'error',
		'-i',
		path,
		'-map',
		'0:v:0',
		'-vf',
		`scale=${width}:${height}:flags=bilinear`,
		'-fps_mode',
		'passthrough',
		'-pix_fmt',
		rgba ? 'rgba' : 'rgb24',
		'-f',
		'rawvideo',
		'pipe:1'
	]);
	const frameSize = width * height * channels;
	if (stdout.byteLength % frameSize !== 0) throw new Error(`Decoded ${path} has a partial frame.`);
	return {
		bytes: stdout,
		frameSize,
		count: stdout.byteLength / frameSize,
		width,
		height,
		channels
	};
}

async function decodeSourceFrames(path: string, width: number, height: number): Promise<RawFrames> {
	const { stdout } = await runBinary(process.env.FFMPEG_PATH ?? 'ffmpeg', [
		'-v',
		'error',
		'-i',
		path,
		'-map',
		'0:v:0',
		'-vf',
		`scale=${width}:${height}:force_original_aspect_ratio=increase:flags=bilinear,crop=${width}:${height}`,
		'-fps_mode',
		'passthrough',
		'-pix_fmt',
		'rgb24',
		'-f',
		'rawvideo',
		'pipe:1'
	]);
	const frameSize = width * height * 3;
	if (stdout.byteLength % frameSize !== 0) throw new Error(`Decoded ${path} has a partial frame.`);
	return {
		bytes: stdout,
		frameSize,
		count: stdout.byteLength / frameSize,
		width,
		height,
		channels: 3
	};
}

function frameBytes(frames: RawFrames, index: number): Uint8Array {
	return frames.bytes.subarray(index * frames.frameSize, (index + 1) * frames.frameSize);
}

function regionMae(
	a: Uint8Array,
	aChannels: number,
	b: Uint8Array,
	bChannels: number,
	frameWidth: number,
	region: Region
): number {
	let sum = 0;
	let count = 0;
	for (let y = region.y; y < region.y + region.height; y += 1) {
		for (let x = region.x; x < region.x + region.width; x += 1) {
			const pixel = y * frameWidth + x;
			for (let channel = 0; channel < 3; channel += 1) {
				sum += Math.abs(a[pixel * aChannels + channel] - b[pixel * bChannels + channel]);
				count += 1;
			}
		}
	}
	return sum / count / 255;
}

function sourceRegion(width: number, height: number): Region {
	return {
		x: Math.round(width * 0.08),
		y: Math.round(height * 0.05),
		width: Math.round(width * 0.84),
		height: Math.round(height * 0.48)
	};
}

function overlayRegion(width: number, height: number): Region {
	return {
		x: 0,
		y: Math.round(height * 0.55),
		width: Math.round(width * 0.6),
		height: Math.round(height * 0.4)
	};
}

function boundaryRegions(width: number, height: number): Record<string, Region> {
	return {
		top: { x: 0, y: 0, width, height: Math.max(2, Math.round(height * 0.03)) },
		right: {
			x: width - Math.max(2, Math.round(width * 0.03)),
			y: 0,
			width: Math.max(2, Math.round(width * 0.03)),
			height
		},
		bottomRight: {
			x: Math.round(width * 0.65),
			y: height - Math.max(2, Math.round(height * 0.03)),
			width: Math.round(width * 0.35),
			height: Math.max(2, Math.round(height * 0.03))
		},
		leftTop: {
			x: 0,
			y: 0,
			width: Math.max(2, Math.round(width * 0.03)),
			height: Math.round(height * 0.45)
		}
	};
}

function expectedSourceIdentity(frames: readonly FixtureFrame[], timestamp: number): number {
	let identity = frames[0].identity;
	for (const frame of frames) {
		if (frame.timestamp > timestamp + 1e-7) break;
		identity = frame.identity;
	}
	return identity;
}

function nearestSourceIdentity(
	outputFrame: Uint8Array,
	outputChannels: number,
	source: RawFrames,
	region: Region
): { identity: number; mae: number } {
	let identity = -1;
	let bestMae = Number.POSITIVE_INFINITY;
	for (let index = 0; index < source.count; index += 1) {
		const mae = regionMae(
			outputFrame,
			outputChannels,
			frameBytes(source, index),
			source.channels,
			source.width,
			region
		);
		if (mae < bestMae) {
			bestMae = mae;
			identity = index;
		}
	}
	return { identity, mae: bestMae };
}

function alphaRange(frames: RawFrames): { min: number; max: number } {
	let min = 255;
	let max = 0;
	for (let offset = 3; offset < frames.bytes.length; offset += 4) {
		min = Math.min(min, frames.bytes[offset]);
		max = Math.max(max, frames.bytes[offset]);
	}
	return { min, max };
}

function regionAlphaRange(
	frame: Uint8Array,
	frameWidth: number,
	region: Region
): { min: number; max: number } {
	let min = 255;
	let max = 0;
	for (let y = region.y; y < region.y + region.height; y += 1) {
		for (let x = region.x; x < region.x + region.width; x += 1) {
			const alpha = frame[(y * frameWidth + x) * 4 + 3];
			min = Math.min(min, alpha);
			max = Math.max(max, alpha);
		}
	}
	return { min, max };
}

function activeMatrixClip(entry: MatrixEntry, frame: number): MatrixClip | null {
	return (
		entry.clips.find(
			(clip) =>
				frame >= clip.timelineStartFrame && frame < clip.timelineStartFrame + clip.durationFrames
		) ?? null
	);
}

async function decodeAudio(path: string): Promise<{ samples: Float32Array; warning: string }> {
	const { stdout, stderr } = await runBinary(process.env.FFMPEG_PATH ?? 'ffmpeg', [
		'-v',
		'error',
		'-i',
		path,
		'-map',
		'0:a:0',
		'-ar',
		'48000',
		'-ac',
		'2',
		'-c:a',
		'pcm_f32le',
		'-f',
		'f32le',
		'pipe:1'
	]);
	return {
		samples: new Float32Array(stdout.buffer, stdout.byteOffset, stdout.byteLength / 4),
		warning: stderr
	};
}

function audioAmplitude(samples: Float32Array, frame: number): number {
	return Math.max(Math.abs(samples[frame * 2] ?? 0), Math.abs(samples[frame * 2 + 1] ?? 0));
}

function nearestAudioPeak(
	samples: Float32Array,
	expectedFrame: number,
	radius: number
): { frame: number; amplitude: number } {
	let frame = expectedFrame;
	let amplitude = 0;
	const frameCount = samples.length / 2;
	for (
		let candidate = Math.max(0, expectedFrame - radius);
		candidate < Math.min(frameCount, expectedFrame + radius + 1);
		candidate += 1
	) {
		const value = audioAmplitude(samples, candidate);
		if (value > amplitude) {
			frame = candidate;
			amplitude = value;
		}
	}
	return { frame, amplitude };
}

async function previewComparisons(
	entry: MatrixEntry,
	preview: PreviewCapture | undefined,
	decodedOutput: RawFrames
): Promise<unknown[]> {
	if (!preview) return [];
	const results: unknown[] = [];
	for (const frame of preview.frames) {
		const captured = await decodeFrames(frame.path, decodedOutput.width, decodedOutput.height);
		const mae = regionMae(
			frameBytes(captured, 0),
			captured.channels,
			frameBytes(decodedOutput, frame.frame),
			decodedOutput.channels,
			decodedOutput.width,
			{ x: 0, y: 0, width: decodedOutput.width, height: decodedOutput.height }
		);
		results.push({
			frame: frame.frame,
			path: frame.path,
			mae,
			pass: mae <= PREVIEW_PRORES_MAE_TOLERANCE
		});
	}
	return results;
}

async function probeEntry(
	entry: MatrixEntry,
	fixtures: ReadonlyMap<string, FixtureEntry>,
	preview: PreviewCapture | undefined
): Promise<{ result: unknown; failures: string[] }> {
	const failures: string[] = [];
	const [metadata, packetDocument] = await Promise.all([
		ffprobe(entry.exportPath),
		ffprobe(entry.exportPath, true)
	]);
	const video = metadata.streams?.find((stream) => stream.codec_type === 'video');
	const audio = metadata.streams?.find((stream) => stream.codec_type === 'audio');
	if (!video) throw new Error(`${entry.id} has no video stream.`);
	const packets = packetDocument.packets ?? [];
	const rate = rateValue(entry.expected.rate);
	const low = lowResolution(entry);
	const outputFrames = await decodeFrames(entry.exportPath, low.width, low.height, true);
	const sourceFrames = new Map<string, RawFrames>();
	await Promise.all(
		[...new Set(entry.clips.map((clip) => clip.fixture))].map(async (fixtureName) => {
			const fixture = fixtures.get(fixtureName);
			if (!fixture) throw new Error(`Missing fixture ${fixtureName}.`);
			sourceFrames.set(fixtureName, await decodeSourceFrames(fixture.file, low.width, low.height));
		})
	);

	if (video.width !== entry.expected.width || video.height !== entry.expected.height) {
		failures.push(`dimensions ${video.width}x${video.height}`);
	}
	if (
		outputFrames.count !== entry.expected.frameCount ||
		Number(video.nb_read_frames) !== entry.expected.frameCount
	) {
		failures.push(`frame count ${outputFrames.count}/${video.nb_read_frames}`);
	}
	const acceptedPixelFormats =
		entry.format === 'prores' ? new Set(['yuva444p10le', 'yuva444p12le']) : new Set(['yuv444p']);
	if (!video.pix_fmt || !acceptedPixelFormats.has(video.pix_fmt))
		failures.push(`pixel format ${video.pix_fmt}`);
	if (entry.format === 'prores' && video.profile !== '4444')
		failures.push(`ProRes profile ${video.profile}`);
	if (
		(entry.format === 'webm' && video.codec_name !== 'vp9') ||
		(entry.format === 'prores' && video.codec_name !== 'prores')
	) {
		failures.push(`video codec ${video.codec_name}`);
	}
	if (entry.expected.hasAudio !== Boolean(audio)) failures.push(`audio presence ${Boolean(audio)}`);
	if (audio) {
		if (Number(audio.sample_rate) !== entry.expected.audioSampleRate)
			failures.push(`audio rate ${audio.sample_rate}`);
		if (audio.channels !== entry.expected.audioChannels)
			failures.push(`audio channels ${audio.channels}`);
	}

	let maxTimestampError = 0;
	for (let index = 0; index < packets.length; index += 1) {
		maxTimestampError = Math.max(
			maxTimestampError,
			Math.abs(Number(packets[index].pts_time) - index / rate)
		);
	}
	const timestampTolerance =
		entry.format === 'webm' ? WEBM_TIMESTAMP_TOLERANCE_SECONDS : PRORES_TIMESTAMP_TOLERANCE_SECONDS;
	if (maxTimestampError > timestampTolerance)
		failures.push(`timestamp error ${maxTimestampError}s`);
	const containerRateExact =
		video.r_frame_rate === entry.expected.rate && video.avg_frame_rate === entry.expected.rate;
	if (entry.format === 'prores' && !containerRateExact) {
		failures.push(`container rate ${video.r_frame_rate}/${video.avg_frame_rate}`);
	}
	const packetEnd = packets.length
		? Number(packets.at(-1)?.pts_time) + Number(packets.at(-1)?.duration_time || 1 / rate)
		: 0;
	if (Math.abs(packetEnd - entry.expected.durationSeconds) > 0.0011)
		failures.push(`video duration ${packetEnd}s`);

	const identityRegion = sourceRegion(low.width, low.height);
	const identities: unknown[] = [];
	const overlayResiduals: number[] = [];
	const boundaryMaxMae: Record<string, number> = {};
	const gapFrames: unknown[] = [];
	for (let frame = 0; frame < outputFrames.count; frame += 1) {
		const timestamp = frame / rate;
		const outputFrame = frameBytes(outputFrames, frame);
		const clip = activeMatrixClip(entry, frame);
		if (!clip) {
			const gapAlpha = regionAlphaRange(outputFrame, low.width, identityRegion);
			if (gapAlpha.max !== 0)
				failures.push(`gap frame ${frame}: alpha ${gapAlpha.min}..${gapAlpha.max}`);
			gapFrames.push({ frame, timestamp, alpha: gapAlpha });
			continue;
		}
		const fixture = fixtures.get(clip.fixture);
		const fixtureFrames = sourceFrames.get(clip.fixture);
		if (!fixture || !fixtureFrames) throw new Error(`Missing decoded fixture ${clip.fixture}.`);
		const localFrame = frame - clip.timelineStartFrame;
		const sourceTimestamp = clip.sourceStartSeconds + localFrame / rate;
		const expectedIdentity = expectedSourceIdentity(fixture.frames, sourceTimestamp);
		const nearest = nearestSourceIdentity(
			outputFrame,
			outputFrames.channels,
			fixtureFrames,
			identityRegion
		);
		if (nearest.identity !== expectedIdentity || nearest.mae > SOURCE_PIXEL_MAE_TOLERANCE) {
			failures.push(
				`Video clip ${clip.id} frame ${frame}: expected ${expectedIdentity}, decoded ${nearest.identity}, mae ${nearest.mae}`
			);
		}
		const expectedFrame = frameBytes(fixtureFrames, expectedIdentity);
		overlayResiduals.push(
			regionMae(
				outputFrame,
				outputFrames.channels,
				expectedFrame,
				fixtureFrames.channels,
				low.width,
				overlayRegion(low.width, low.height)
			)
		);
		for (const [name, region] of Object.entries(boundaryRegions(low.width, low.height))) {
			boundaryMaxMae[name] = Math.max(
				boundaryMaxMae[name] ?? 0,
				regionMae(
					outputFrame,
					outputFrames.channels,
					expectedFrame,
					fixtureFrames.channels,
					low.width,
					region
				)
			);
		}
		identities.push({
			frame,
			timestamp,
			clipId: clip.id,
			fixture: clip.fixture,
			sourceTimestamp,
			expected: expectedIdentity,
			decoded: nearest.identity,
			mae: nearest.mae
		});
	}
	for (const [name, mae] of Object.entries(boundaryMaxMae)) {
		if (mae > CROP_BOUNDARY_MAE_TOLERANCE) failures.push(`crop boundary ${name} mae ${mae}`);
	}
	const overlayResidualRange = Math.max(...overlayResiduals) - Math.min(...overlayResiduals);
	if (overlayResidualRange < 0.003) failures.push(`overlay residual range ${overlayResidualRange}`);
	const alpha = alphaRange(outputFrames);
	if (entry.expected.opaque && (alpha.min !== 255 || alpha.max !== 255)) {
		failures.push(`opaque alpha range ${alpha.min}..${alpha.max}`);
	}
	if (!entry.expected.opaque && (alpha.min !== 0 || alpha.max === 0)) {
		failures.push(`transparent alpha range ${alpha.min}..${alpha.max}`);
	}

	let audioResult: unknown = null;
	if (audio) {
		const decoded = await decodeAudio(entry.exportPath);
		const audioFrameCount = decoded.samples.length / 2;
		const expectedAudioFrames = Math.round(entry.expected.durationSeconds * 48_000);
		if (audioFrameCount !== expectedAudioFrames)
			failures.push(`audio sample count ${audioFrameCount}`);
		const sourceClickResults: unknown[] = [];
		if (entry.includeVideoClipAudio) {
			for (const clip of entry.clips.filter((candidate) => candidate.audio.enabled)) {
				const fixture = fixtures.get(clip.fixture);
				if (!fixture) throw new Error(`Missing fixture ${clip.fixture}.`);
				const sourceEndSeconds = clip.sourceStartSeconds + clip.durationFrames / rate;
				for (const sourceFrame of fixture.frames.filter(
					(candidate) =>
						candidate.timestamp >= clip.sourceStartSeconds - 1e-7 &&
						candidate.timestamp < sourceEndSeconds - 1e-7
				)) {
					const destinationSeconds =
						clip.timelineStartFrame / rate + (sourceFrame.timestamp - clip.sourceStartSeconds);
					const expectedFrame = Math.round(destinationSeconds * 48_000) + 10;
					const peak = nearestAudioPeak(
						decoded.samples,
						expectedFrame,
						AUDIO_SYNC_TOLERANCE_SAMPLES
					);
					const drift = peak.frame - expectedFrame;
					if (peak.amplitude < 0.025 || Math.abs(drift) > AUDIO_SYNC_TOLERANCE_SAMPLES) {
						failures.push(
							`audio click ${clip.id}/${sourceFrame.identity}: amplitude ${peak.amplitude}, drift ${drift}`
						);
					}
					sourceClickResults.push({
						clipId: clip.id,
						identity: sourceFrame.identity,
						expectedFrame,
						...peak,
						drift
					});
				}
			}
		}
		let cuePeak: unknown = null;
		if (entry.includeCue) {
			cuePeak = nearestAudioPeak(
				decoded.samples,
				Math.round(entry.expected.durationSeconds * 0.5 * 48_000),
				960
			);
			if ((cuePeak as { amplitude: number }).amplitude < 0.02) failures.push('cue is inaudible');
		}
		audioResult = {
			sampleRate: Number(audio.sample_rate),
			channels: audio.channels,
			sampleCount: audioFrameCount,
			sourceClicks: sourceClickResults,
			cuePeak,
			decoderWarning: decoded.warning || null
		};
	}

	const previewResults = await previewComparisons(entry, preview, outputFrames);
	for (const comparison of previewResults as Array<{ frame: number; mae: number; pass: boolean }>) {
		if (!comparison.pass) failures.push(`preview frame ${comparison.frame} mae ${comparison.mae}`);
	}

	return {
		failures,
		result: {
			id: entry.id,
			verdict: failures.length === 0 ? 'pass' : 'fail',
			metadata: {
				codec: video.codec_name,
				profile: video.profile,
				width: video.width,
				height: video.height,
				pixelFormat: video.pix_fmt,
				rFrameRate: video.r_frame_rate,
				avgFrameRate: video.avg_frame_rate,
				containerRateExact,
				maxTimestampErrorSeconds: maxTimestampError,
				frameCount: outputFrames.count,
				videoDurationSeconds: packetEnd,
				formatDurationSeconds: Number(metadata.format?.duration),
				sizeBytes: Number(metadata.format?.size)
			},
			alpha,
			identities,
			gapFrames,
			boundaryMaxMae,
			overlayResiduals,
			audio: audioResult,
			previewComparisons: previewResults,
			failures
		}
	};
}

export async function probeVideoTrackExportMatrix(
	matrixPath: string,
	previewManifestPath?: string
): Promise<{ verdict: 'pass' | 'fail'; results: unknown[]; failures: string[] }> {
	const matrix = JSON.parse(await readFile(matrixPath, 'utf8')) as MatrixManifest;
	const fixtureManifest = JSON.parse(
		await readFile(matrix.fixtureManifestPath, 'utf8')
	) as FixtureManifest;
	const fixtures = new Map(fixtureManifest.fixtures.map((fixture) => [fixture.name, fixture]));
	const previews = previewManifestPath
		? new Map(
				(JSON.parse(await readFile(previewManifestPath, 'utf8')) as PreviewManifest).captures.map(
					(capture) => [capture.id, capture]
				)
			)
		: new Map<string, PreviewCapture>();
	const results: unknown[] = [];
	const failures: string[] = [];
	for (const entry of matrix.matrix) {
		const probed = await probeEntry(entry, fixtures, previews.get(entry.id));
		results.push(probed.result);
		failures.push(...probed.failures.map((failure) => `${entry.id}: ${failure}`));
	}
	return { verdict: failures.length === 0 ? 'pass' : 'fail', results, failures };
}

const args = process.argv.slice(2);
const matrixPath = args.find((arg) => !arg.startsWith('--'));
const previewIndex = args.indexOf('--previews');
const outputIndex = args.indexOf('--out');
if (!matrixPath) {
	process.stderr.write(
		'usage: probe-video-track-export-matrix.ts <matrix.json> [--previews preview-manifest.json] [--out results.json]\n'
	);
	process.exitCode = 2;
} else {
	probeVideoTrackExportMatrix(
		resolve(matrixPath),
		previewIndex >= 0 ? resolve(args[previewIndex + 1]) : undefined
	)
		.then(async (result) => {
			const json = `${JSON.stringify(result, null, 2)}\n`;
			if (outputIndex >= 0) await writeFile(resolve(args[outputIndex + 1]), json, 'utf8');
			process.stdout.write(json);
			if (result.verdict === 'fail') process.exitCode = 1;
		})
		.catch((error: unknown) => {
			process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			process.exitCode = 1;
		});
}
