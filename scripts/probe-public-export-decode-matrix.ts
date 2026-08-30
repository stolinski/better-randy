// Decode-verify every public export lane, and prove none of them leaks
// (ADR-0052 §export, ADR-0053 §public session).
//
// `probe-public-runtime.ts` measures whether the live host satisfies the runtime
// contract — readiness, cost, retention on the terminal paths. This probe asks
// the narrower question that one cannot: is the file a visitor downloads the
// file they rendered? It drives the real HTTP session API for all eight lanes
// (WebM and ProRes, transparent and opaque, with and without audio) at both
// native target sizes, then decodes each result back to RGBA with ffmpeg and
// measures it against the frames that were uploaded — codec and chroma layout,
// native size, one frame per uploaded frame on an exact rational cadence, the
// declared output class read off decoded alpha, and frame-for-frame identity
// with the source.
//
// It then exercises the paths where an export ends badly: a saturated host, an
// aborted upload, a cancelled session, an abandoned download, and every bound
// the public envelope refuses — checking each one is corrective rather than
// silently downgraded, and that the origin is holding nothing afterwards.
//
//   pnpm verify:export-decode:public-matrix
//   GFX_PROBE_ORIGIN=http://localhost:3000 pnpm verify:export-decode:public-matrix
//
// Flags: --frames N (default 6), --orientation horizontal|vertical|both.
// Writes docs/runtime-probes/public-export-decode-matrix.json and exits non-zero
// on the first fault it can name.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PNG } from 'pngjs';
import { format as formatSource, resolveConfig } from 'prettier';

// Type-only, so the ratified bound names stay checked without the probe having
// to load the module through the runtime hooks below.
import type { PublicExportLimitName } from '$lib/platform/public-export-limits';

import { registerGfxRuntimeModuleHooks } from './gfx-runtime-module-hooks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
registerGfxRuntimeModuleHooks(repoRoot);

const {
	expectedDecodedExport,
	findDecodedExportShapeFaults,
	findDecodedOutputClassFaults,
	findExportCadenceFaults,
	findExportFrameIdentityFaults,
	findExportRefusalFaults,
	formatPublicExportLaneName,
	NATIVE_EXPORT_TARGET_SIZES,
	PUBLIC_EXPORT_DECODE_LANES,
	PUBLIC_EXPORT_DECODE_TOLERANCES
} = await import('../src/lib/platform/public-export-decode-contract.ts');
type DecodeContract = typeof import('../src/lib/platform/public-export-decode-contract.ts');
type PublicExportDecodeLane = DecodeContract['PUBLIC_EXPORT_DECODE_LANES'][number];
type NativeExportTargetSize = DecodeContract['NATIVE_EXPORT_TARGET_SIZES'][number];
type PublicExportOutputClass = PublicExportDecodeLane['outputClass'];
type DecodedFrameIdentityMeasurement = Parameters<
	DecodeContract['findExportFrameIdentityFaults']
>[0][number];
type RefusedExportObservation = Parameters<DecodeContract['findExportRefusalFaults']>[0];

const { PUBLIC_EXPORT_RUNTIME_LIMITS, parsePublicRuntimeConfig } = await import(
	'../src/lib/platform/public-runtime-contract.ts'
);
const { measureRenderedFramePixels } = await import('../src/lib/utils/rendered-frame-pixels.ts');
const { isSweptExportDirectoryName } = await import(
	'../src/lib/utils/legacy-supers-compatibility.ts'
);
const { framesToSeconds, resolveFrameRate } = await import('../src/lib/utils/composition-timing.ts');

const execFileAsync = promisify(execFile);
const PROBE_ORIGIN = process.env.GFX_PROBE_ORIGIN ?? 'http://localhost:7263';
const EVIDENCE_PATH = resolve(
	process.env.GFX_PROBE_EVIDENCE ??
		join(repoRoot, 'docs/runtime-probes/public-export-decode-matrix.json')
);
const runtimeConfig = parsePublicRuntimeConfig(process.env);
const exportTemporaryDirectory = runtimeConfig.exportTemporaryDirectory ?? tmpdir();
const FFMPEG = runtimeConfig.ffmpegPath;
const FFPROBE = FFMPEG.endsWith('ffmpeg')
	? `${FFMPEG.slice(0, -'ffmpeg'.length)}ffprobe`
	: (process.env.FFPROBE_PATH ?? 'ffprobe');

/** The rate the matrix runs at: an integer rational, so every timestamp is exact. */
const MATRIX_FPS = 30;
/** The rate the cadence lane runs at: the NTSC rational a decimal literal drifts against. */
const NTSC_CADENCE_FPS = 29.97;
/** Clear border every transparent source frame carries, in pixels. */
const CLEAR_MARGIN_PIXELS = 96;
/** Soft alpha ramp inside that border — the detail a hard key would destroy. */
const ALPHA_FEATHER_PIXELS = 48;
/**
 * Pixel stride for the nearest-source search. Identity of ordering is a coarse
 * question, so it is asked of a sampled grid; the drift tolerances below are
 * measured at full resolution. Prime, so the sample never aligns with a row.
 */
const IDENTITY_SAMPLE_STRIDE = 97;

function flagValue(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseFrameCount(): number {
	const raw = flagValue('--frames');
	if (raw === undefined) return 6;
	const value = Number.parseInt(raw, 10);
	if (!Number.isSafeInteger(value) || value < 3) {
		throw new TypeError(`--frames must be an integer of at least 3; received "${raw}".`);
	}
	return value;
}

function parseTargetSizes(): readonly NativeExportTargetSize[] {
	const raw = flagValue('--orientation') ?? 'both';
	if (raw === 'both') return NATIVE_EXPORT_TARGET_SIZES;
	const size = NATIVE_EXPORT_TARGET_SIZES.find((candidate) => candidate.orientation === raw);
	if (!size) {
		throw new TypeError(`--orientation must be horizontal, vertical, or both; received "${raw}".`);
	}
	return [size];
}

const FRAME_COUNT = parseFrameCount();
const TARGET_SIZES = parseTargetSizes();

function nowMs(): number {
	return Math.round(performance.now());
}

async function exportDirectoryCount(): Promise<number> {
	const entries = await readdir(exportTemporaryDirectory, { withFileTypes: true });
	// Counts both namespaces' prefixes (ADR-0053): a directory under the spelling
	// this build no longer writes is still one it has to be seen cleaning up.
	return entries.filter((entry) => entry.isDirectory() && isSweptExportDirectoryName(entry.name))
		.length;
}

async function encoderProcessCount(): Promise<number> {
	const { stdout } = await execFileAsync('ps', ['-axo', 'command=']);
	return stdout
		.split('\n')
		.filter((line) => /(^|\/)ffmpeg\b/.test(line) && line.includes('image2pipe')).length;
}

/**
 * What the origin was already holding before this probe touched it. Every
 * retention reading below is judged against this rather than against zero, so a
 * developer's own export running alongside the probe is not read as its leak.
 */
const RETENTION_BASELINE = {
	exportDirectories: await exportDirectoryCount(),
	encoderProcesses: await encoderProcessCount()
};

/** Retention this probe is responsible for, over and above what it inherited. */
function findRetentionFaults(retained: {
	exportDirectories: number;
	encoderProcesses: number;
}): string[] {
	const faults: string[] = [];
	const directories = retained.exportDirectories - RETENTION_BASELINE.exportDirectories;
	const encoders = retained.encoderProcesses - RETENTION_BASELINE.encoderProcesses;
	if (directories !== 0) faults.push(`left ${directories} export work directories behind`);
	if (encoders !== 0) faults.push(`left ${encoders} encoder processes behind`);
	return faults;
}

// ---------------------------------------------------------------------------
// Source frames — what the browser would have presented.
// ---------------------------------------------------------------------------

function featheredAlpha(x: number, y: number, size: NativeExportTargetSize): number {
	const inset =
		Math.min(x, y, size.width - 1 - x, size.height - 1 - y) - CLEAR_MARGIN_PIXELS;
	if (inset < 0) return 0;
	if (inset >= ALPHA_FEATHER_PIXELS) return 255;
	return Math.round((255 * inset) / ALPHA_FEATHER_PIXELS);
}

/**
 * One deterministic native-target frame.
 *
 * Red ramps across x and green across y, so the frame carries real spatial
 * structure; blue is a flat level unique to the frame index, so every frame
 * differs from every other frame at every pixel by a wide margin — which is what
 * makes a reordered or duplicated export visible rather than merely plausible.
 * Smooth by construction, so a lossless 4K encode stays affordable.
 */
function createSourceFrame(
	size: NativeExportTargetSize,
	outputClass: PublicExportOutputClass,
	frameIndex: number,
	frameCount: number
): Uint8Array {
	const data = new Uint8Array(size.width * size.height * 4);
	const level = frameCount === 1 ? 0 : Math.round((255 * frameIndex) / (frameCount - 1));
	for (let y = 0; y < size.height; y += 1) {
		const green = Math.round((255 * y) / (size.height - 1));
		for (let x = 0; x < size.width; x += 1) {
			const alpha = outputClass === 'opaque' ? 255 : featheredAlpha(x, y, size);
			// A cleared pixel keeps RGBA zero, so the transparent lane carries no
			// colour under alpha the compositor will never show.
			if (alpha === 0) continue;
			const offset = (y * size.width + x) * 4;
			data[offset] = Math.round((255 * x) / (size.width - 1));
			data[offset + 1] = green;
			data[offset + 2] = level;
			data[offset + 3] = alpha;
		}
	}
	return data;
}

interface SourceFrameSet {
	size: NativeExportTargetSize;
	outputClass: PublicExportOutputClass;
	/** Straight RGBA, four bytes per pixel — what the frame comparison reads. */
	pixels: readonly Uint8Array[];
	/** The PNG bodies the transport is given, one per frame. */
	encoded: readonly Uint8Array[];
}

function encodeSourcePng(size: NativeExportTargetSize, pixels: Uint8Array): Uint8Array {
	const png = new PNG({ width: size.width, height: size.height });
	png.data.set(pixels);
	// The transport never stores a frame, so the cheapest encode that still fits
	// the per-frame ceiling is the right one for a probe of this size.
	return PNG.sync.write(png, { deflateLevel: 1, filterType: 0 });
}

function createSourceFrameSet(
	size: NativeExportTargetSize,
	outputClass: PublicExportOutputClass,
	frameCount: number
): SourceFrameSet {
	const pixels = Array.from({ length: frameCount }, (_unused, index) =>
		createSourceFrame(size, outputClass, index, frameCount)
	);
	return { size, outputClass, pixels, encoded: pixels.map((frame) => encodeSourcePng(size, frame)) };
}

async function renderProbeAudio(directory: string, seconds: number): Promise<Uint8Array> {
	const path = join(directory, 'mix.wav');
	await execFileAsync(FFMPEG, [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		`sine=frequency=440:duration=${seconds}`,
		'-ac',
		'2',
		'-ar',
		'48000',
		'-c:a',
		'pcm_s16le',
		path
	]);
	return readFile(path);
}

// ---------------------------------------------------------------------------
// The export transport, driven exactly as a browser drives it.
// ---------------------------------------------------------------------------

interface OpenExportSession {
	sessionId: string;
	audioUrl: string;
	frameUrlTemplate: string;
	completeUrl: string;
	cancelUrl: string;
	/** `name=value` of the session credential cookie; Node's fetch keeps no jar. */
	credentialCookie: string;
}

interface ExportSessionRequestBody {
	format: 'webm' | 'prores';
	fps: number;
	frameCount: number;
	opaque: boolean;
	audioBytes: number;
	startTimecode?: string;
}

function sessionHeaders(
	session: OpenExportSession,
	extra: Record<string, string> = {}
): Record<string, string> {
	return { origin: PROBE_ORIGIN, cookie: session.credentialCookie, ...extra };
}

async function createExportSession(body: ExportSessionRequestBody): Promise<OpenExportSession> {
	const response = await fetch(`${PROBE_ORIGIN}/api/export/sessions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: PROBE_ORIGIN },
		body: JSON.stringify(body)
	});
	if (response.status !== 201) {
		throw new Error(`Export session create failed (${response.status}): ${await response.text()}`);
	}
	const credentialCookie = response.headers.get('set-cookie')?.split(';', 1)[0];
	if (!credentialCookie) throw new Error('Export session create issued no credential.');
	return {
		...((await response.json()) as Omit<OpenExportSession, 'credentialCookie'>),
		credentialCookie
	};
}

function frameUrl(session: OpenExportSession, frame: number): string {
	return `${PROBE_ORIGIN}${session.frameUrlTemplate.replace('{frame}', String(frame))}`;
}

async function uploadExportFrame(
	session: OpenExportSession,
	frame: number,
	bytes: Uint8Array
): Promise<void> {
	const response = await fetch(frameUrl(session, frame), {
		method: 'PUT',
		headers: sessionHeaders(session, { 'content-type': 'image/png' }),
		body: bytes
	});
	if (response.status === 413) {
		throw new Error(
			`Frame ${frame} (${bytes.byteLength} bytes) was refused with 413. Set BODY_SIZE_LIMIT to ${PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes} on the host.`
		);
	}
	if (!response.ok) {
		throw new Error(`Frame ${frame} upload failed (${response.status}): ${await response.text()}`);
	}
}

async function uploadExportAudio(session: OpenExportSession, bytes: Uint8Array): Promise<void> {
	const response = await fetch(`${PROBE_ORIGIN}${session.audioUrl}`, {
		method: 'PUT',
		headers: sessionHeaders(session, { 'content-type': 'audio/wav' }),
		body: bytes
	});
	if (!response.ok) {
		throw new Error(`Audio upload failed (${response.status}): ${await response.text()}`);
	}
}

async function completeExportSession(session: OpenExportSession): Promise<string> {
	const response = await fetch(`${PROBE_ORIGIN}${session.completeUrl}`, {
		method: 'POST',
		headers: sessionHeaders(session)
	});
	if (!response.ok) {
		throw new Error(`Complete failed (${response.status}): ${await response.text()}`);
	}
	return ((await response.json()) as { downloadUrl: string }).downloadUrl;
}

async function cancelExportSession(session: OpenExportSession): Promise<number> {
	const response = await fetch(`${PROBE_ORIGIN}${session.cancelUrl}`, {
		method: 'DELETE',
		headers: sessionHeaders(session)
	});
	await response.arrayBuffer();
	return response.status;
}

/** A session the origin has forgotten: nothing it owned answers for it again. */
async function isExportSessionGone(session: OpenExportSession): Promise<boolean> {
	const response = await fetch(`${PROBE_ORIGIN}${session.completeUrl}`, {
		method: 'POST',
		headers: sessionHeaders(session)
	});
	await response.arrayBuffer();
	return response.status === 404 || response.status === 410;
}

interface ExportDownload {
	status: number;
	contentType: string | null;
	cacheControl: string | null;
	acceptRanges: string | null;
	declaredLength: number | null;
	bytes: Uint8Array;
}

async function downloadExportOutput(
	session: OpenExportSession,
	downloadUrl: string
): Promise<ExportDownload> {
	// A download is a same-origin navigation: it carries the credential cookie and
	// Sec-Fetch-Site rather than an Origin header.
	const response = await fetch(`${PROBE_ORIGIN}${downloadUrl}`, {
		headers: { cookie: session.credentialCookie, 'sec-fetch-site': 'same-origin' }
	});
	const declared = response.headers.get('content-length');
	return {
		status: response.status,
		contentType: response.headers.get('content-type'),
		cacheControl: response.headers.get('cache-control'),
		acceptRanges: response.headers.get('accept-ranges'),
		declaredLength: declared === null ? null : Number(declared),
		bytes: new Uint8Array(await response.arrayBuffer())
	};
}

// ---------------------------------------------------------------------------
// Decode measurement.
// ---------------------------------------------------------------------------

interface ProbedStreams {
	videoCodec: string | null;
	pixelFormat: string | null;
	audioCodec: string | null;
	audioSampleRate: number | null;
	audioChannels: number | null;
	width: number | null;
	height: number | null;
	containerDurationSeconds: number | null;
	startTimecode: string | null;
}

async function probeStreams(path: string): Promise<ProbedStreams> {
	const { stdout } = await execFileAsync(FFPROBE, [
		'-hide_banner',
		'-loglevel',
		'error',
		'-show_streams',
		'-show_format',
		'-of',
		'json',
		path
	]);
	const parsed: unknown = JSON.parse(stdout);
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`ffprobe produced no stream document for ${path}.`);
	}
	const document = parsed as {
		streams?: {
			codec_type?: string;
			codec_name?: string;
			pix_fmt?: string;
			width?: number;
			height?: number;
			sample_rate?: string;
			channels?: number;
			tags?: Record<string, string>;
		}[];
		format?: { duration?: string; tags?: Record<string, string> };
	};
	const video = document.streams?.find((stream) => stream.codec_type === 'video');
	const audio = document.streams?.find((stream) => stream.codec_type === 'audio');
	const timecodeStream = document.streams?.find((stream) => stream.tags?.timecode !== undefined);
	return {
		videoCodec: video?.codec_name ?? null,
		pixelFormat: video?.pix_fmt ?? null,
		audioCodec: audio?.codec_name ?? null,
		audioSampleRate: audio?.sample_rate === undefined ? null : Number(audio.sample_rate),
		audioChannels: audio?.channels ?? null,
		width: video?.width ?? null,
		height: video?.height ?? null,
		containerDurationSeconds: document.format?.duration
			? Number(document.format.duration)
			: null,
		startTimecode:
			document.format?.tags?.timecode ?? timecodeStream?.tags?.timecode ?? null
	};
}

/**
 * Decoder arguments a lane needs on the way in. VP9 carries alpha as WebM
 * `BlockAdditional` side data, which only the libvpx decoder reads, so a
 * transparent export decoded by the native decoder comes back fully opaque.
 * ffmpeg only — ffprobe has no decoder selection, and reads timestamps off the
 * packets either way.
 */
function decoderArguments(format: 'webm' | 'prores'): readonly string[] {
	return format === 'webm' ? ['-c:v', 'libvpx-vp9'] : [];
}

async function probePresentationSeconds(path: string): Promise<number[]> {
	const { stdout } = await execFileAsync(FFPROBE, [
		'-hide_banner',
		'-loglevel',
		'error',
		'-select_streams',
		'v:0',
		'-show_entries',
		'frame=pts_time,best_effort_timestamp_time',
		'-of',
		'csv=p=0',
		path
	]);
	return stdout
		.trim()
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => {
			const value = line
				.split(',')
				.map((field) => Number(field))
				.find((field) => Number.isFinite(field));
			if (value === undefined) throw new Error(`ffprobe reported no timestamp in "${line}".`);
			return value;
		});
}

async function decodeToRgbaFrames(
	path: string,
	format: 'webm' | 'prores',
	directory: string
): Promise<PNG[]> {
	await mkdir(directory, { recursive: true });
	await execFileAsync(FFMPEG, [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		...decoderArguments(format),
		'-i',
		path,
		'-pix_fmt',
		'rgba',
		join(directory, 'decoded_%04d.png')
	]);
	const names = (await readdir(directory)).filter((name) => name.endsWith('.png')).sort();
	return Promise.all(names.map(async (name) => PNG.sync.read(await readFile(join(directory, name)))));
}

interface FrameDrift {
	rgbMeanAbsoluteError: number;
	alphaMeanAbsoluteError: number;
}

/**
 * How far one decoded frame sits from one source frame. Colour is compared only
 * where the source declared the pixel fully opaque: under partial or zero alpha
 * the codec is free to carry whatever colour it likes, because nothing composites
 * it.
 */
function measureFrameDrift(decoded: Uint8Array, source: Uint8Array, stride: number): FrameDrift {
	let rgbSum = 0;
	let rgbCount = 0;
	let alphaSum = 0;
	let alphaCount = 0;
	const step = stride * 4;
	for (let offset = 0; offset < source.length; offset += step) {
		alphaSum += Math.abs(decoded[offset + 3] - source[offset + 3]);
		alphaCount += 1;
		if (source[offset + 3] !== 255) continue;
		rgbSum +=
			Math.abs(decoded[offset] - source[offset]) +
			Math.abs(decoded[offset + 1] - source[offset + 1]) +
			Math.abs(decoded[offset + 2] - source[offset + 2]);
		rgbCount += 3;
	}
	return {
		rgbMeanAbsoluteError: rgbCount === 0 ? 0 : rgbSum / rgbCount,
		alphaMeanAbsoluteError: alphaCount === 0 ? 0 : alphaSum / alphaCount
	};
}

function driftDistance(drift: FrameDrift): number {
	return drift.rgbMeanAbsoluteError + drift.alphaMeanAbsoluteError;
}

function measureFrameIdentity(
	decodedFrames: readonly PNG[],
	source: SourceFrameSet
): DecodedFrameIdentityMeasurement[] {
	return decodedFrames.map((decoded, frameIndex) => {
		const sampled = source.pixels.map((candidate) =>
			driftDistance(measureFrameDrift(decoded.data, candidate, IDENTITY_SAMPLE_STRIDE))
		);
		let nearestSourceFrameIndex = 0;
		let nearestOtherSourceDistance = Number.POSITIVE_INFINITY;
		for (const [candidateIndex, distance] of sampled.entries()) {
			if (distance < sampled[nearestSourceFrameIndex]) nearestSourceFrameIndex = candidateIndex;
			if (candidateIndex !== frameIndex && distance < nearestOtherSourceDistance) {
				nearestOtherSourceDistance = distance;
			}
		}
		// Drift is the fine question, so it is measured against every pixel of the
		// frame's own source rather than the sampled grid the search ran on.
		const drift = measureFrameDrift(decoded.data, source.pixels[frameIndex], 1);
		return {
			frameIndex,
			rgbMeanAbsoluteError: Number(drift.rgbMeanAbsoluteError.toFixed(4)),
			alphaMeanAbsoluteError: Number(drift.alphaMeanAbsoluteError.toFixed(4)),
			nearestSourceFrameIndex,
			sourceDistance: Number(sampled[frameIndex].toFixed(4)),
			nearestOtherSourceDistance: Number(nearestOtherSourceDistance.toFixed(4))
		};
	});
}

// ---------------------------------------------------------------------------
// One lane, end to end.
// ---------------------------------------------------------------------------

interface LaneMeasurement {
	lane: string;
	format: 'webm' | 'prores';
	outputClass: PublicExportOutputClass;
	hasAudio: boolean;
	orientation: string;
	frameCount: number;
	fps: number;
	startTimecode: string | null;
	uploadMs: number;
	completeMs: number;
	outputBytes: number;
	download: {
		status: number;
		contentType: string | null;
		cacheControl: string | null;
		acceptRanges: string | null;
		declaredLength: number | null;
		bytesReceived: number;
		replayStatus: number;
	};
	streams: ProbedStreams;
	presentationSeconds: number[];
	frames: {
		alphaCoverage: number;
		opaqueCoverage: number;
		edgeClass: string;
		isBlank: boolean;
	}[];
	identity: DecodedFrameIdentityMeasurement[];
	retention: { exportDirectoriesAfter: number; encoderProcessesAfter: number; sessionGone: boolean };
	faults: string[];
}

interface LaneRun {
	measurement: LaneMeasurement;
	/** The encoded file, kept only long enough for a byte-equality comparison. */
	outputBytes: Uint8Array;
}

async function runExportLane(options: {
	lane: PublicExportDecodeLane;
	size: NativeExportTargetSize;
	source: SourceFrameSet;
	audio: Uint8Array | null;
	fps: number;
	startTimecode?: string;
	workingDirectory: string;
}): Promise<LaneRun> {
	const { lane, size, source, audio, fps } = options;
	const laneName = formatPublicExportLaneName(lane, size);
	await mkdir(options.workingDirectory, { recursive: true });

	const session = await createExportSession({
		format: lane.format,
		fps,
		frameCount: source.encoded.length,
		opaque: lane.outputClass === 'opaque',
		audioBytes: audio?.byteLength ?? 0,
		...(options.startTimecode ? { startTimecode: options.startTimecode } : {})
	});
	if (audio) await uploadExportAudio(session, audio);

	const uploadStarted = nowMs();
	for (const [index, frame] of source.encoded.entries()) {
		await uploadExportFrame(session, index, frame);
	}
	const uploadMs = nowMs() - uploadStarted;

	const completeStarted = nowMs();
	const downloadUrl = await completeExportSession(session);
	const completeMs = nowMs() - completeStarted;

	const download = await downloadExportOutput(session, downloadUrl);
	const outputPath = join(options.workingDirectory, lane.format === 'webm' ? 'out.webm' : 'out.mov');
	await writeFile(outputPath, download.bytes);
	// The origin destroys the session as the body finishes, so the same URL with
	// the same credential must find nothing the second time.
	const replay = await fetch(`${PROBE_ORIGIN}${downloadUrl}`, {
		headers: { cookie: session.credentialCookie, 'sec-fetch-site': 'same-origin' }
	});
	await replay.arrayBuffer();

	const [streams, presentationSeconds] = await Promise.all([
		probeStreams(outputPath),
		probePresentationSeconds(outputPath)
	]);
	const decodedFrames = await decodeToRgbaFrames(
		outputPath,
		lane.format,
		join(options.workingDirectory, 'decoded')
	);
	const measuredFrames = decodedFrames.map((frame) =>
		measureRenderedFramePixels({
			width: frame.width,
			height: frame.height,
			data: new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)
		})
	);
	const identity = measureFrameIdentity(decodedFrames, source);

	const expected = expectedDecodedExport(lane, size, { frameCount: source.encoded.length, fps });
	const faults = [
		...findDecodedExportShapeFaults(expected, {
			videoCodec: streams.videoCodec,
			pixelFormat: streams.pixelFormat,
			audioCodec: streams.audioCodec,
			width: streams.width,
			height: streams.height,
			decodedFrameCount: decodedFrames.length,
			containerDurationSeconds: streams.containerDurationSeconds
		}),
		...findExportCadenceFaults(presentationSeconds, {
			frameCount: source.encoded.length,
			fps,
			format: lane.format
		}),
		...findDecodedOutputClassFaults(measuredFrames, lane.outputClass),
		...findExportFrameIdentityFaults(identity, PUBLIC_EXPORT_DECODE_TOLERANCES[lane.format])
	];
	if (download.status !== 200) faults.push(`download answered ${download.status}`);
	if (download.cacheControl !== 'no-store') faults.push('download was not sent no-store');
	if (download.acceptRanges !== 'none') {
		faults.push(`download advertised Accept-Ranges: ${download.acceptRanges}`);
	}
	if (download.declaredLength !== download.bytes.byteLength) {
		faults.push(
			`download declared ${download.declaredLength} bytes and sent ${download.bytes.byteLength}`
		);
	}
	if (replay.status === 200) faults.push('the export output survived its single-shot download');
	if (options.startTimecode && streams.startTimecode !== options.startTimecode) {
		faults.push(
			`start timecode decoded as ${streams.startTimecode}; ${options.startTimecode} was requested`
		);
	}
	if (audio && (streams.audioSampleRate !== 48_000 || streams.audioChannels !== 2)) {
		faults.push(
			`audio decoded as ${streams.audioChannels}ch at ${streams.audioSampleRate} Hz; the bed is stereo 48 kHz`
		);
	}

	const [exportDirectoriesAfter, encoderProcessesAfter, sessionGone] = await Promise.all([
		exportDirectoryCount(),
		encoderProcessCount(),
		isExportSessionGone(session)
	]);
	faults.push(
		...findRetentionFaults({
			exportDirectories: exportDirectoriesAfter,
			encoderProcesses: encoderProcessesAfter
		})
	);
	if (!sessionGone) faults.push('the session outlived its download');

	return {
		outputBytes: download.bytes,
		measurement: {
			lane: laneName,
			format: lane.format,
			outputClass: lane.outputClass,
			hasAudio: lane.hasAudio,
			orientation: size.orientation,
			frameCount: source.encoded.length,
			fps,
			startTimecode: streams.startTimecode,
			uploadMs,
			completeMs,
			outputBytes: download.bytes.byteLength,
			download: {
				status: download.status,
				contentType: download.contentType,
				cacheControl: download.cacheControl,
				acceptRanges: download.acceptRanges,
				declaredLength: download.declaredLength,
				bytesReceived: download.bytes.byteLength,
				replayStatus: replay.status
			},
			streams,
			presentationSeconds,
			frames: measuredFrames.map((frame) => ({
				alphaCoverage: Number(frame.alphaCoverage.toFixed(6)),
				opaqueCoverage: Number(frame.opaqueCoverage.toFixed(6)),
				edgeClass: frame.edgeClass,
				isBlank: frame.isBlank
			})),
			identity,
			retention: { exportDirectoriesAfter, encoderProcessesAfter, sessionGone },
			faults
		}
	};
}

// ---------------------------------------------------------------------------
// Failure and leak paths.
// ---------------------------------------------------------------------------

interface AdmissionRefusalCase {
	/** A ratified bound, or the request shape the parser refuses outright. */
	shape: PublicExportLimitName | 'webm-start-timecode';
	body: unknown;
	expectedStatus: number;
	/** Values the corrective message has to name: the bound, and what would fit. */
	messageTokens: readonly string[];
}

/**
 * The bounds a caller can actually reach on the create path.
 *
 * `outputBytes` is deliberately absent: at the ratified per-frame cost, 900
 * frames of ProRes project below the 2 GiB ceiling, so `frameCount` always binds
 * first and no admissible request can trip it. It is enforced on the encoded
 * result instead, which `public-export-limits.test.ts` covers directly.
 */
function admissionRefusalCases(): AdmissionRefusalCase[] {
	const limits = PUBLIC_EXPORT_RUNTIME_LIMITS;
	const ntscAdmissibleFrames = Math.floor(
		(limits.maxDurationSeconds * resolveFrameRate(59.94).num) / resolveFrameRate(59.94).den
	);
	return [
		{
			shape: 'frameRate',
			body: { format: 'webm', fps: 120, frameCount: 10, opaque: false, audioBytes: 0 },
			expectedStatus: 400,
			messageTokens: ['120', String(limits.maxFrameRate)]
		},
		{
			shape: 'frameCount',
			body: {
				format: 'webm',
				fps: 60,
				frameCount: limits.maxFrameCount + 1,
				opaque: false,
				audioBytes: 0
			},
			expectedStatus: 400,
			messageTokens: [String(limits.maxFrameCount + 1), String(limits.maxFrameCount)]
		},
		{
			shape: 'durationSeconds',
			body: {
				format: 'prores',
				fps: 59.94,
				frameCount: limits.maxFrameCount,
				opaque: true,
				audioBytes: 0
			},
			expectedStatus: 400,
			messageTokens: ['15.015', String(ntscAdmissibleFrames)]
		},
		{
			shape: 'audioBytes',
			body: {
				format: 'prores',
				fps: 30,
				frameCount: 10,
				opaque: true,
				audioBytes: limits.maxAudioBytes + 1
			},
			expectedStatus: 413,
			messageTokens: [String(limits.maxAudioBytes + 1), String(limits.maxAudioBytes)]
		},
		{
			shape: 'controlDocumentBytes',
			body: {
				format: 'webm',
				fps: 30,
				frameCount: 10,
				opaque: false,
				audioBytes: 0,
				// Padding a field the parser never reads, so the document is refused on
				// its declared length before a byte of it is parsed.
				padding: 'x'.repeat(8_192)
			},
			expectedStatus: 413,
			messageTokens: ['4096']
		},
		{
			// Not a ratified bound but the same obligation: a start timecode is a
			// ProRes control, and a WebM session asking for one has to be told which
			// format carries it rather than have it silently dropped.
			shape: 'webm-start-timecode',
			body: {
				format: 'webm',
				fps: 30,
				frameCount: 10,
				opaque: false,
				audioBytes: 0,
				startTimecode: '01:00:00:00'
			},
			expectedStatus: 400,
			messageTokens: ['ProRes']
		}
	];
}

interface AdmissionRefusalMeasurement extends RefusedExportObservation {
	expectedStatus: number;
	faults: string[];
}

async function measureAdmissionRefusals(): Promise<AdmissionRefusalMeasurement[]> {
	const measurements: AdmissionRefusalMeasurement[] = [];
	for (const refusal of admissionRefusalCases()) {
		const response = await fetch(`${PROBE_ORIGIN}/api/export/sessions`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', origin: PROBE_ORIGIN },
			body: JSON.stringify(refusal.body)
		});
		const message = await response.text();
		const observation: RefusedExportObservation = {
			shape: refusal.shape,
			status: response.status,
			message,
			exportDirectoriesAfter: await exportDirectoryCount(),
			wasAdmitted: response.status === 201
		};
		measurements.push({
			...observation,
			expectedStatus: refusal.expectedStatus,
			faults: findExportRefusalFaults(observation, {
				status: refusal.expectedStatus,
				messageTokens: refusal.messageTokens,
				baselineExportDirectories: RETENTION_BASELINE.exportDirectories
			})
		});
	}
	return measurements;
}

interface InSessionRefusalMeasurement {
	name: string;
	status: number;
	message: string;
	faults: string[];
	exportDirectoriesAfterCancel: number;
	encoderProcessesAfterCancel: number;
	sessionGone: boolean;
}

/**
 * Refusals a session can only produce once it is open. Each one has to name what
 * the transport was expecting, and the session it happened in still has to leave
 * nothing behind once it is given up.
 */
async function measureInSessionRefusals(
	source: SourceFrameSet
): Promise<InSessionRefusalMeasurement[]> {
	const measurements: InSessionRefusalMeasurement[] = [];

	const outOfOrder = await createExportSession({
		format: 'webm',
		fps: MATRIX_FPS,
		frameCount: 3,
		opaque: false,
		audioBytes: 0
	});
	const outOfOrderResponse = await fetch(frameUrl(outOfOrder, 1), {
		method: 'PUT',
		headers: sessionHeaders(outOfOrder, { 'content-type': 'image/png' }),
		body: source.encoded[0]
	});
	const outOfOrderMessage = await outOfOrderResponse.text();
	const outOfOrderFaults: string[] = [];
	if (outOfOrderResponse.status !== 409) {
		outOfOrderFaults.push(`an out-of-order frame answered ${outOfOrderResponse.status}, not 409`);
	}
	if (!outOfOrderMessage.includes('Expected export frame 0')) {
		outOfOrderFaults.push(
			`an out-of-order frame was refused without naming the frame the encoder wanted — "${outOfOrderMessage}"`
		);
	}
	await cancelExportSession(outOfOrder);
	const outOfOrderState = await waitForExportDisposal(outOfOrder);
	outOfOrderFaults.push(
		...findExportDisposalFaults(outOfOrderState, 'a session refused an out-of-order frame')
	);
	measurements.push({
		name: 'frame-out-of-order',
		status: outOfOrderResponse.status,
		message: outOfOrderMessage,
		faults: outOfOrderFaults,
		exportDirectoriesAfterCancel: outOfOrderState.exportDirectories,
		encoderProcessesAfterCancel: outOfOrderState.encoderProcesses,
		sessionGone: outOfOrderState.sessionGone
	});

	const short = await createExportSession({
		format: 'webm',
		fps: MATRIX_FPS,
		frameCount: 3,
		opaque: false,
		audioBytes: 0
	});
	await uploadExportFrame(short, 0, source.encoded[0]);
	const shortResponse = await fetch(`${PROBE_ORIGIN}${short.completeUrl}`, {
		method: 'POST',
		headers: sessionHeaders(short)
	});
	const shortMessage = await shortResponse.text();
	const shortFaults: string[] = [];
	if (shortResponse.status !== 409) {
		shortFaults.push(`an unfinished export answered ${shortResponse.status}, not 409`);
	}
	if (!shortMessage.includes('received 1 of 3')) {
		shortFaults.push(
			`an unfinished export was refused without naming the frames it still wanted — "${shortMessage}"`
		);
	}
	await cancelExportSession(short);
	const shortState = await waitForExportDisposal(short);
	shortFaults.push(
		...findExportDisposalFaults(shortState, 'a session refused an unfinished completion')
	);
	measurements.push({
		name: 'complete-before-every-frame',
		status: shortResponse.status,
		message: shortMessage,
		faults: shortFaults,
		exportDirectoriesAfterCancel: shortState.exportDirectories,
		encoderProcessesAfterCancel: shortState.encoderProcesses,
		sessionGone: shortState.sessionGone
	});
	return measurements;
}

/** Bytes of the frame the aborted upload delivers before it stalls. */
const ABORTED_FRAME_HEAD_BYTES = 64 * 1024;
/** Ceiling on waiting for the runtime to take that head chunk. */
const STALLED_BODY_TIMEOUT_MS = 5_000;

interface StalledFrameBody {
	body: ReadableStream<Uint8Array>;
	/** Resolves once the runtime has taken the head chunk and asked for more. */
	stalled: Promise<void>;
	/** Whether that happened — read after the bounded wait, never raced against. */
	readonly wasStalled: boolean;
}

/**
 * A frame body that delivers a PNG head and then stalls open.
 *
 * A buffered body is written to the socket in full before an abort can land, so
 * the origin rightly treats the frame as accepted and the abort measures
 * nothing. Stalling mid-body is the only way to observe what an export the
 * browser walked away from part-way through a frame leaves behind.
 */
function stalledFrameBody(head: Uint8Array): StalledFrameBody {
	let markStalled: () => void = () => undefined;
	let wasStalled = false;
	const stalled = new Promise<void>((resolvePromise) => {
		markStalled = resolvePromise;
	});
	let didDeliverHead = false;
	const body = new ReadableStream<Uint8Array>({
		pull: (controller) => {
			if (!didDeliverHead) {
				didDeliverHead = true;
				controller.enqueue(head);
				return;
			}
			wasStalled = true;
			markStalled();
			// Never settles, so the request stays open until the caller aborts it.
			return new Promise<void>(() => undefined);
		}
	});
	return {
		body,
		stalled,
		get wasStalled(): boolean {
			return wasStalled;
		}
	};
}

/** Ceiling on waiting for a disposal, well above the encoder's own kill grace. */
const EXPORT_DISPOSAL_TIMEOUT_MS = 10_000;
const EXPORT_DISPOSAL_POLL_MS = 100;

interface ExportDisposalState {
	sessionGone: boolean;
	exportDirectories: number;
	encoderProcesses: number;
}

async function readExportDisposalState(
	session: OpenExportSession
): Promise<ExportDisposalState> {
	const [sessionGone, exportDirectories, encoderProcesses] = await Promise.all([
		isExportSessionGone(session),
		exportDirectoryCount(),
		encoderProcessCount()
	]);
	return { sessionGone, exportDirectories, encoderProcesses };
}

function isExportFullyReleased(state: ExportDisposalState): boolean {
	return (
		state.sessionGone &&
		findRetentionFaults({
			exportDirectories: state.exportDirectories,
			encoderProcesses: state.encoderProcesses
		}).length === 0
	);
}

/**
 * Wait for the origin to finish releasing a session, then report what it was
 * still holding.
 *
 * A client abort reaches the origin over the socket, and the disposal behind it
 * has to kill an encoder — `SIGKILL` and a reap grace — before it can remove the
 * directory the encoder was writing to. So the release is observable shortly
 * after the abort rather than in the same tick, and reading retention
 * immediately would measure the probe's own timing rather than the origin's
 * behaviour. Bounded, so a release that never comes fails the probe instead of
 * hanging it.
 */
async function waitForExportDisposal(
	session: OpenExportSession
): Promise<ExportDisposalState & { releasedAfterMs: number }> {
	const started = nowMs();
	let state = await readExportDisposalState(session);
	while (!isExportFullyReleased(state) && nowMs() - started < EXPORT_DISPOSAL_TIMEOUT_MS) {
		await delay(EXPORT_DISPOSAL_POLL_MS);
		state = await readExportDisposalState(session);
	}
	return { ...state, releasedAfterMs: nowMs() - started };
}

/**
 * Wait until the origin is actually reading the stalled frame.
 *
 * A streamed request is queued in the client before it is flushed, so aborting
 * the moment the body stalls can destroy it before the origin has seen a byte —
 * which measures the client's buffering rather than the origin's cleanup, and
 * leaves behind a session that was never touched rather than one that leaked.
 * The origin marks a session busy for exactly as long as it is reading a frame
 * and says so when asked to complete, so that answer is the signal to abort on.
 */
async function waitForFrameUploadInFlight(session: OpenExportSession): Promise<boolean> {
	const started = nowMs();
	while (nowMs() - started < EXPORT_DISPOSAL_TIMEOUT_MS) {
		const response = await fetch(`${PROBE_ORIGIN}${session.completeUrl}`, {
			method: 'POST',
			headers: sessionHeaders(session)
		});
		const message = await response.text();
		if (response.status === 409 && message.includes('still being encoded')) return true;
		await delay(EXPORT_DISPOSAL_POLL_MS);
	}
	return false;
}

/** Faults a terminal path is responsible for once the origin has settled. */
function findExportDisposalFaults(state: ExportDisposalState, abandonment: string): string[] {
	return [
		...(state.sessionGone ? [] : [`${abandonment} left its session open`]),
		...findRetentionFaults({
			exportDirectories: state.exportDirectories,
			encoderProcesses: state.encoderProcesses
		})
	];
}

interface CancellationMeasurement {
	path: 'upload-abort' | 'session-cancel' | 'download-abort';
	/** How long the origin took to release everything the session held. */
	releasedAfterMs: number;
	detail: Record<string, string | number | boolean | null>;
	exportDirectoriesAfter: number;
	encoderProcessesAfter: number;
	sessionGone: boolean;
	faults: string[];
}

/**
 * The three ways a visitor abandons an export: the browser drops an in-flight
 * frame, the app cancels the session outright, and the download is closed
 * part-way through. Each has to release the encoder, the work directory, and the
 * output descriptor — an unlinked file that is still open keeps its blocks.
 */
async function measureCancellationPaths(
	source: SourceFrameSet
): Promise<CancellationMeasurement[]> {
	const measurements: CancellationMeasurement[] = [];

	const aborted = await createExportSession({
		format: 'prores',
		fps: MATRIX_FPS,
		frameCount: source.encoded.length,
		opaque: source.outputClass === 'opaque',
		audioBytes: 0
	});
	await uploadExportFrame(aborted, 0, source.encoded[0]);
	const controller = new AbortController();
	const stalling = stalledFrameBody(source.encoded[1].subarray(0, ABORTED_FRAME_HEAD_BYTES));
	// `duplex: 'half'` is required of a streamed request body; it is spelled on a
	// typed init rather than inline so the option survives whichever fetch
	// typings the checkout resolves.
	const stalledUpload: RequestInit & { duplex: 'half' } = {
		method: 'PUT',
		headers: sessionHeaders(aborted, { 'content-type': 'image/png' }),
		body: stalling.body,
		duplex: 'half',
		signal: controller.signal
	};
	const inFlight = fetch(frameUrl(aborted, 1), stalledUpload);
	// Bounded, so a body the runtime never pulls fails the probe rather than
	// hanging it. The assertions below are on what the origin did, not on timing.
	await Promise.race([stalling.stalled, delay(STALLED_BODY_TIMEOUT_MS)]);
	const uploadInFlight = await waitForFrameUploadInFlight(aborted);
	controller.abort();
	let uploadRejected = false;
	try {
		await inFlight;
	} catch {
		uploadRejected = true;
	}
	const abortState = await waitForExportDisposal(aborted);
	const abortFaults: string[] = [];
	if (!stalling.wasStalled) {
		abortFaults.push('the frame body was never pulled, so nothing was aborted mid-upload');
	}
	if (!uploadInFlight) {
		abortFaults.push('the origin never began reading the stalled frame, so nothing was aborted');
	}
	if (!uploadRejected) abortFaults.push('an aborted frame upload resolved as if it had been accepted');
	abortFaults.push(...findExportDisposalFaults(abortState, 'an aborted frame upload'));
	// Measured first, then tidied: a session the abort failed to release is a
	// fault this probe reports, not one it hides by cleaning up before it looks.
	await cancelExportSession(aborted);
	measurements.push({
		path: 'upload-abort',
		releasedAfterMs: abortState.releasedAfterMs,
		detail: {
			framesUploadedBeforeAbort: 1,
			headBytesDelivered: ABORTED_FRAME_HEAD_BYTES,
			bodyStalled: stalling.wasStalled,
			uploadInFlight,
			uploadRejected
		},
		exportDirectoriesAfter: abortState.exportDirectories,
		encoderProcessesAfter: abortState.encoderProcesses,
		sessionGone: abortState.sessionGone,
		faults: abortFaults
	});

	const cancelled = await createExportSession({
		format: 'prores',
		fps: MATRIX_FPS,
		frameCount: source.encoded.length,
		opaque: source.outputClass === 'opaque',
		audioBytes: 0
	});
	await uploadExportFrame(cancelled, 0, source.encoded[0]);
	await uploadExportFrame(cancelled, 1, source.encoded[1]);
	const cancelStatus = await cancelExportSession(cancelled);
	// Giving up a session that is already gone is the outcome the caller asked
	// for, so the second cancellation answers the same way as the first.
	const repeatCancelStatus = await cancelExportSession(cancelled);
	const cancelState = await waitForExportDisposal(cancelled);
	const cancelFaults: string[] = [];
	if (cancelStatus !== 204) cancelFaults.push(`cancellation answered ${cancelStatus}, not 204`);
	if (repeatCancelStatus !== 204) {
		cancelFaults.push(`a repeated cancellation answered ${repeatCancelStatus}, not 204`);
	}
	cancelFaults.push(...findExportDisposalFaults(cancelState, 'a cancelled session'));
	measurements.push({
		path: 'session-cancel',
		releasedAfterMs: cancelState.releasedAfterMs,
		detail: { cancelStatus, repeatCancelStatus },
		exportDirectoriesAfter: cancelState.exportDirectories,
		encoderProcessesAfter: cancelState.encoderProcesses,
		sessionGone: cancelState.sessionGone,
		faults: cancelFaults
	});

	const abandoned = await createExportSession({
		format: 'prores',
		fps: MATRIX_FPS,
		frameCount: source.encoded.length,
		opaque: source.outputClass === 'opaque',
		audioBytes: 0
	});
	for (const [index, frame] of source.encoded.entries()) {
		await uploadExportFrame(abandoned, index, frame);
	}
	const abandonedUrl = await completeExportSession(abandoned);
	const downloadController = new AbortController();
	const partial = await fetch(`${PROBE_ORIGIN}${abandonedUrl}`, {
		headers: { cookie: abandoned.credentialCookie, 'sec-fetch-site': 'same-origin' },
		signal: downloadController.signal
	});
	const reader = partial.body?.getReader();
	const firstChunk = reader ? await reader.read() : { done: true, value: undefined };
	downloadController.abort();
	await reader?.cancel().catch(() => undefined);
	const abandonedState = await waitForExportDisposal(abandoned);
	const retry = await fetch(`${PROBE_ORIGIN}${abandonedUrl}`, {
		headers: { cookie: abandoned.credentialCookie, 'sec-fetch-site': 'same-origin' }
	});
	await retry.arrayBuffer();
	const downloadFaults: string[] = [];
	if (firstChunk.done) downloadFaults.push('the abandoned download delivered no bytes to abandon');
	if (retry.status === 200) downloadFaults.push('an abandoned download could be resumed');
	downloadFaults.push(...findExportDisposalFaults(abandonedState, 'an abandoned download'));
	measurements.push({
		path: 'download-abort',
		releasedAfterMs: abandonedState.releasedAfterMs,
		detail: {
			bytesBeforeAbort: firstChunk.value?.byteLength ?? 0,
			retryStatus: retry.status
		},
		exportDirectoriesAfter: abandonedState.exportDirectories,
		encoderProcessesAfter: abandonedState.encoderProcesses,
		sessionGone: abandonedState.sessionGone,
		faults: downloadFaults
	});
	return measurements;
}

interface ConcurrencyMeasurement {
	admittedSessions: number;
	wallClockMs: number;
	saturatedStatus: number;
	saturatedMessage: string;
	slotReleased: boolean;
	exportDirectoriesAfter: number;
	encoderProcessesAfter: number;
	faults: string[];
}

/**
 * Saturate the host, prove the next caller is turned away with a corrective
 * refusal rather than queued, and prove the slot a finished session releases is
 * immediately available to whoever asks next.
 */
async function measureConcurrency(
	source: SourceFrameSet,
	workingDirectory: string
): Promise<ConcurrencyMeasurement> {
	const limit = PUBLIC_EXPORT_RUNTIME_LIMITS.maxConcurrentSessions;
	const sessions = await Promise.all(
		Array.from({ length: limit }, () =>
			createExportSession({
				format: 'webm',
				fps: MATRIX_FPS,
				frameCount: source.encoded.length,
				opaque: source.outputClass === 'opaque',
				audioBytes: 0
			})
		)
	);
	const saturated = await fetch(`${PROBE_ORIGIN}/api/export/sessions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: PROBE_ORIGIN },
		body: JSON.stringify({
			format: 'webm',
			fps: MATRIX_FPS,
			frameCount: 2,
			opaque: false,
			audioBytes: 0
		})
	});
	const saturatedMessage = await saturated.text();

	const started = nowMs();
	const outputs = await Promise.all(
		sessions.map(async (session, index) => {
			for (const [frame, bytes] of source.encoded.entries()) {
				await uploadExportFrame(session, frame, bytes);
			}
			const url = await completeExportSession(session);
			const download = await downloadExportOutput(session, url);
			await writeFile(join(workingDirectory, `concurrent-${index}.webm`), download.bytes);
			return download;
		})
	);
	const wallClockMs = nowMs() - started;

	const released = await createExportSession({
		format: 'webm',
		fps: MATRIX_FPS,
		frameCount: 2,
		opaque: false,
		audioBytes: 0
	});
	await cancelExportSession(released);

	const faults: string[] = [];
	if (saturated.status !== 429) {
		faults.push(`a saturated host answered ${saturated.status}; the ratified refusal is 429`);
	}
	if (!saturatedMessage.includes(String(limit))) {
		faults.push(
			`a saturated host refused without naming its ${limit}-session ceiling — "${saturatedMessage}"`
		);
	}
	if (outputs.some((download) => download.status !== 200 || download.bytes.byteLength === 0)) {
		faults.push('a concurrent session did not produce a downloadable output');
	}
	const exportDirectoriesAfter = await exportDirectoryCount();
	const encoderProcessesAfter = await encoderProcessCount();
	faults.push(
		...findRetentionFaults({
			exportDirectories: exportDirectoriesAfter,
			encoderProcesses: encoderProcessesAfter
		})
	);

	return {
		admittedSessions: sessions.length,
		wallClockMs,
		saturatedStatus: saturated.status,
		saturatedMessage,
		slotReleased: true,
		exportDirectoriesAfter,
		encoderProcessesAfter,
		faults
	};
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const health = await fetch(`${PROBE_ORIGIN}/api/health`);
	if (!health.ok) throw new Error(`Health check failed at ${PROBE_ORIGIN} (${health.status}).`);
	const healthBody = (await health.json()) as Record<string, unknown>;

	// Deliberately outside every SWEPT_EXPORT_DIRECTORY_PREFIXES spelling: the
	// retention counts above sweep all of them, and a probe that names its own
	// scratch directory that way reports itself as the leak.
	const workingDirectory = await mkdtemp(join(tmpdir(), 'gfx-decode-matrix-probe-'));
	try {
		const audio = await renderProbeAudio(
			workingDirectory,
			framesToSeconds(FRAME_COUNT, resolveFrameRate(MATRIX_FPS))
		);
		const sources = new Map<string, SourceFrameSet>();
		for (const size of TARGET_SIZES) {
			for (const outputClass of ['transparent', 'opaque'] as const) {
				sources.set(
					`${size.orientation}-${outputClass}`,
					createSourceFrameSet(size, outputClass, FRAME_COUNT)
				);
			}
		}
		const sourceFor = (
			size: NativeExportTargetSize,
			outputClass: PublicExportOutputClass
		): SourceFrameSet => {
			const set = sources.get(`${size.orientation}-${outputClass}`);
			if (!set) throw new Error(`No source frames for ${size.orientation} ${outputClass}.`);
			return set;
		};

		const lanes: LaneMeasurement[] = [];
		for (const size of TARGET_SIZES) {
			for (const lane of PUBLIC_EXPORT_DECODE_LANES) {
				const laneName = formatPublicExportLaneName(lane, size);
				const run = await runExportLane({
					lane,
					size,
					source: sourceFor(size, lane.outputClass),
					audio: lane.hasAudio ? audio : null,
					fps: MATRIX_FPS,
					// The Resolve sync lane stamps a timecode on ProRes, so the one lane
					// that carries both audio and a timecode is measured with one.
					...(lane.format === 'prores' && lane.hasAudio
						? { startTimecode: '01:00:00:00' }
						: {}),
					workingDirectory: join(workingDirectory, laneName)
				});
				lanes.push(run.measurement);
				await rm(join(workingDirectory, laneName), { recursive: true, force: true });
				console.log(
					`${laneName}: ${run.measurement.outputBytes} bytes, ${run.measurement.faults.length} faults`
				);
			}
		}

		// One lane at the NTSC rational, where a decimal literal drifts and an exact
		// one does not: 6 frames at 30000/1001 is 0.2002 s, never 0.2.
		const ntscSize = TARGET_SIZES[0];
		const ntscRun = await runExportLane({
			lane: { format: 'prores', outputClass: 'opaque', hasAudio: false },
			size: ntscSize,
			source: sourceFor(ntscSize, 'opaque'),
			audio: null,
			fps: NTSC_CADENCE_FPS,
			workingDirectory: join(workingDirectory, 'ntsc-cadence')
		});
		await rm(join(workingDirectory, 'ntsc-cadence'), { recursive: true, force: true });

		// The ProRes lane is byte-deterministic, so the same frames exported twice
		// must produce the same file — the strongest form of preview/export
		// identity the transport can be held to.
		const repeatSize = TARGET_SIZES[0];
		const repeatLane: PublicExportDecodeLane = {
			format: 'prores',
			outputClass: 'transparent',
			hasAudio: false
		};
		const repeatRuns: LaneRun[] = [];
		for (const repetition of [0, 1]) {
			repeatRuns.push(
				await runExportLane({
					lane: repeatLane,
					size: repeatSize,
					source: sourceFor(repeatSize, 'transparent'),
					audio: null,
					fps: MATRIX_FPS,
					workingDirectory: join(workingDirectory, `repeat-${repetition}`)
				})
			);
			await rm(join(workingDirectory, `repeat-${repetition}`), { recursive: true, force: true });
		}
		const repeatedIdentical =
			repeatRuns[0].outputBytes.byteLength === repeatRuns[1].outputBytes.byteLength &&
			repeatRuns[0].outputBytes.every((byte, index) => byte === repeatRuns[1].outputBytes[index]);

		const concurrency = await measureConcurrency(
			sourceFor(TARGET_SIZES[0], 'transparent'),
			workingDirectory
		);
		const cancellation = await measureCancellationPaths(sourceFor(TARGET_SIZES[0], 'opaque'));
		const inSessionRefusals = await measureInSessionRefusals(sourceFor(TARGET_SIZES[0], 'opaque'));
		const admissionRefusals = await measureAdmissionRefusals();

		const exportDirectoriesAtEnd = await exportDirectoryCount();
		const encoderProcessesAtEnd = await encoderProcessCount();

		const faults = [
			...lanes.flatMap((lane) => lane.faults.map((fault) => `${lane.lane}: ${fault}`)),
			...ntscRun.measurement.faults.map((fault) => `ntsc-cadence: ${fault}`),
			...repeatRuns.flatMap((run, index) =>
				run.measurement.faults.map((fault) => `repeat-${index}: ${fault}`)
			),
			...(repeatedIdentical
				? []
				: ['repeated ProRes exports of identical frames produced different files']),
			...concurrency.faults.map((fault) => `concurrency: ${fault}`),
			...cancellation.flatMap((path) => path.faults.map((fault) => `${path.path}: ${fault}`)),
			...inSessionRefusals.flatMap((refusal) =>
				refusal.faults.map((fault) => `${refusal.name}: ${fault}`)
			),
			...admissionRefusals.flatMap((refusal) => refusal.faults),
			...findRetentionFaults({
				exportDirectories: exportDirectoriesAtEnd,
				encoderProcesses: encoderProcessesAtEnd
			}).map((fault) => `the origin ${fault}`)
		];

		const evidence = {
			schemaVersion: 1,
			generatedAt: new Date().toISOString(),
			probe: 'public-export-decode-matrix',
			origin: PROBE_ORIGIN,
			host: {
				node: process.version,
				platform: process.platform,
				arch: process.arch,
				cpuCount: cpus().length,
				totalMemoryBytes: totalmem()
			},
			health: { status: health.status, body: healthBody },
			request: { frameCount: FRAME_COUNT, fps: MATRIX_FPS, ntscCadenceFps: NTSC_CADENCE_FPS },
			tolerances: PUBLIC_EXPORT_DECODE_TOLERANCES,
			lanes,
			ntscCadence: ntscRun.measurement,
			repeatedExport: {
				lane: formatPublicExportLaneName(repeatLane, repeatSize),
				repetitions: repeatRuns.length,
				outputBytes: repeatRuns.map((run) => run.measurement.outputBytes),
				byteIdentical: repeatedIdentical
			},
			concurrency,
			cancellation,
			inSessionRefusals,
			admissionRefusals,
			retention: {
				baselineExportDirectories: RETENTION_BASELINE.exportDirectories,
				baselineEncoderProcesses: RETENTION_BASELINE.encoderProcesses,
				exportDirectoriesAtEnd,
				encoderProcessesAtEnd
			},
			faults
		};

		const serialized = `${JSON.stringify(evidence, null, '\t')}\n`;
		const prettierOptions = await resolveConfig(EVIDENCE_PATH);
		await writeFile(
			EVIDENCE_PATH,
			await formatSource(serialized, { ...prettierOptions, filepath: EVIDENCE_PATH })
		);
		console.log(`Wrote ${EVIDENCE_PATH}`);
		console.log(
			`${lanes.length} lanes decoded, ${cancellation.length} cancellation paths, ${admissionRefusals.length + inSessionRefusals.length} refusals, ${faults.length} faults`
		);
		if (faults.length > 0) {
			throw new Error(`Public export decode matrix failed:\n- ${faults.join('\n- ')}`);
		}
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
}

await main();
