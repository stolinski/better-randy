// Probe the public gfx.computer runtime end to end (ADR-0052).
//
// Measures the live Node/ffmpeg host the demo is ratified on: readiness against
// the runtime contract, the Node built-ins the server actually depends on (the
// reason a Workers target cannot host it), both native-target export lanes
// through the real HTTP session API, single-shot download behaviour under a
// Range request, cancellation, concurrency, and zero retention on every
// terminal path.
//
// The probe drives a running server rather than importing the route modules, so
// the same command measures the dev server and the built Node artifact:
//
//   node build/index.js &                 # or the running dev server
//   GFX_PROBE_ORIGIN=http://localhost:3000 pnpm probe:public-runtime
//
// Writes docs/runtime-probes/public-runtime.json and fails when the live host
// misses the ratified contract.
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cpus, tmpdir, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { format, resolveConfig } from 'prettier';

import { registerSupersRuntimeModuleHooks } from './supers-runtime-module-hooks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
registerSupersRuntimeModuleHooks(repoRoot);

const {
	RATIFIED_NATIVE_OUTPUT_BYTES_PER_FRAME,
	PUBLIC_EXPORT_RUNTIME_LIMITS,
	PUBLIC_RUNTIME_DEPLOYMENT_INPUTS,
	parsePublicRuntimeConfig
} = await import('../src/lib/platform/public-runtime-contract.ts');
const { inspectPublicRuntimeReadiness } =
	await import('../src/lib/platform/public-runtime-readiness.server.ts');

const execFileAsync = promisify(execFile);
const PROBE_ORIGIN = process.env.GFX_PROBE_ORIGIN ?? 'http://localhost:7263';
const EVIDENCE_PATH = resolve(
	process.env.GFX_PROBE_EVIDENCE ?? join(repoRoot, 'docs/runtime-probes/public-runtime.json')
);
const EXPORT_DIRECTORY_PREFIX = 'supers-export-';
const NATIVE_WIDTH = 3840;
const NATIVE_HEIGHT = 2160;
const LANE_FRAME_COUNT = 8;
const CONCURRENT_FRAME_COUNT = 4;

const runtimeConfig = parsePublicRuntimeConfig(process.env);
const exportTemporaryDirectory = runtimeConfig.exportTemporaryDirectory ?? tmpdir();

interface ExportLaneMeasurement {
	format: 'webm' | 'prores';
	opaque: boolean;
	frameCount: number;
	width: number;
	height: number;
	hasAudio: boolean;
	uploadMs: number;
	completeMs: number;
	outputBytes: number;
	outputBytesPerFrame: number;
	ratifiedBytesPerFrame: number;
	withinRatifiedBytesPerFrame: boolean;
	download: {
		status: number;
		contentType: string | null;
		cacheControl: string | null;
		contentLength: number | null;
		acceptRanges: string | null;
		bytesReceived: number;
		rangeRequestHonoured: boolean;
	};
	decoded: Record<string, string | number | null>;
	retention: {
		exportDirectoriesAfter: number;
		outputReadableAfterDownload: boolean;
	};
}

function nowMs(): number {
	return Number(process.hrtime.bigint() / 1_000_000n);
}

async function exportDirectoryCount(): Promise<number> {
	const entries = await readdir(exportTemporaryDirectory, { withFileTypes: true });
	return entries.filter(
		(entry) => entry.isDirectory() && entry.name.startsWith(EXPORT_DIRECTORY_PREFIX)
	).length;
}

async function ffmpegChildProcessCount(): Promise<number> {
	const { stdout } = await execFileAsync('ps', ['-axo', 'command=']);
	return stdout
		.split('\n')
		.filter((line) => /(^|\/)ffmpeg\b/.test(line) && line.includes('image2pipe')).length;
}

/** Distinct high-entropy native-target frames — the worst case the limits are sized against. */
async function renderProbeFrames(directory: string): Promise<string[]> {
	await execFileAsync(runtimeConfig.ffmpegPath, [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		`testsrc2=size=${NATIVE_WIDTH}x${NATIVE_HEIGHT}:rate=${LANE_FRAME_COUNT}`,
		'-frames:v',
		String(LANE_FRAME_COUNT),
		'-pix_fmt',
		'rgba',
		join(directory, 'frame%02d.png')
	]);
	return Array.from({ length: LANE_FRAME_COUNT }, (_unused, index) =>
		join(directory, `frame${String(index + 1).padStart(2, '0')}.png`)
	);
}

async function renderProbeAudio(directory: string, seconds: number): Promise<string> {
	const path = join(directory, 'mix.wav');
	await execFileAsync(runtimeConfig.ffmpegPath, [
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
	return path;
}

interface CreatedSession {
	sessionId: string;
	audioUrl: string;
	frameUrlTemplate: string;
	completeUrl: string;
	cancelUrl: string;
}

async function createSession(body: Record<string, unknown>): Promise<CreatedSession> {
	const response = await fetch(`${PROBE_ORIGIN}/api/export/sessions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (response.status !== 201) {
		throw new Error(`Export session create failed (${response.status}): ${await response.text()}`);
	}
	return (await response.json()) as CreatedSession;
}

async function uploadFrame(
	session: CreatedSession,
	frame: number,
	bytes: Uint8Array
): Promise<void> {
	const response = await fetch(
		`${PROBE_ORIGIN}${session.frameUrlTemplate.replace('{frame}', String(frame))}`,
		{ method: 'PUT', headers: { 'content-type': 'image/png' }, body: bytes }
	);
	if (response.status === 413) {
		throw new Error(
			`Frame ${frame} (${bytes.byteLength} bytes) was rejected with 413. Set BODY_SIZE_LIMIT to ${PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes} on the host; the Node adapter default is 512 KB.`
		);
	}
	if (!response.ok) {
		throw new Error(`Frame ${frame} upload failed (${response.status}): ${await response.text()}`);
	}
}

async function probeDecodedStreams(path: string): Promise<Record<string, string | number | null>> {
	const { stdout } = await execFileAsync('ffprobe', [
		'-hide_banner',
		'-loglevel',
		'error',
		'-show_streams',
		'-show_format',
		'-of',
		'json',
		path
	]);
	const parsed = JSON.parse(stdout) as {
		streams?: {
			codec_type?: string;
			codec_name?: string;
			pix_fmt?: string;
			width?: number;
			height?: number;
			nb_read_frames?: string;
		}[];
		format?: { duration?: string };
	};
	const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
	const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio');
	return {
		videoCodec: video?.codec_name ?? null,
		pixelFormat: video?.pix_fmt ?? null,
		width: video?.width ?? null,
		height: video?.height ?? null,
		audioCodec: audio?.codec_name ?? null,
		durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null
	};
}

async function measureExportLane(options: {
	format: 'webm' | 'prores';
	opaque: boolean;
	frames: readonly Uint8Array[];
	audio: { bytes: Uint8Array } | null;
	startTimecode?: string;
	requestRange: boolean;
	workingDirectory: string;
}): Promise<ExportLaneMeasurement> {
	const fps = 30;
	await mkdir(options.workingDirectory, { recursive: true });
	const session = await createSession({
		format: options.format,
		fps,
		frameCount: options.frames.length,
		opaque: options.opaque,
		audioBytes: options.audio?.bytes.byteLength ?? 0,
		...(options.startTimecode ? { startTimecode: options.startTimecode } : {})
	});

	if (options.audio) {
		const response = await fetch(`${PROBE_ORIGIN}${session.audioUrl}`, {
			method: 'PUT',
			headers: { 'content-type': 'audio/wav' },
			body: options.audio.bytes
		});
		if (!response.ok) {
			throw new Error(`Audio upload failed (${response.status}): ${await response.text()}`);
		}
	}

	const uploadStarted = nowMs();
	for (const [index, frame] of options.frames.entries()) {
		await uploadFrame(session, index, frame);
	}
	const uploadMs = nowMs() - uploadStarted;

	const completeStarted = nowMs();
	const completeResponse = await fetch(`${PROBE_ORIGIN}${session.completeUrl}`, { method: 'POST' });
	if (!completeResponse.ok) {
		throw new Error(
			`Complete failed (${completeResponse.status}): ${await completeResponse.text()}`
		);
	}
	const completeMs = nowMs() - completeStarted;
	const { downloadUrl } = (await completeResponse.json()) as { downloadUrl: string };

	const download = await fetch(`${PROBE_ORIGIN}${downloadUrl}`, {
		headers: options.requestRange ? { range: 'bytes=0-1023' } : {}
	});
	const outputBytes = new Uint8Array(await download.arrayBuffer());
	const declaredLength = download.headers.get('content-length');
	const outputPath = join(
		options.workingDirectory,
		`output.${options.format === 'webm' ? 'webm' : 'mov'}`
	);
	await writeFile(outputPath, outputBytes);

	const secondDownload = await fetch(`${PROBE_ORIGIN}${downloadUrl}`);
	await secondDownload.arrayBuffer();

	const ratifiedBytesPerFrame = RATIFIED_NATIVE_OUTPUT_BYTES_PER_FRAME[options.format];
	const outputBytesPerFrame = Math.round(outputBytes.byteLength / options.frames.length);
	return {
		format: options.format,
		opaque: options.opaque,
		frameCount: options.frames.length,
		width: NATIVE_WIDTH,
		height: NATIVE_HEIGHT,
		hasAudio: options.audio !== null,
		uploadMs,
		completeMs,
		outputBytes: outputBytes.byteLength,
		outputBytesPerFrame,
		ratifiedBytesPerFrame,
		withinRatifiedBytesPerFrame: outputBytesPerFrame <= ratifiedBytesPerFrame,
		download: {
			status: download.status,
			contentType: download.headers.get('content-type'),
			cacheControl: download.headers.get('cache-control'),
			contentLength: declaredLength === null ? null : Number(declaredLength),
			acceptRanges: download.headers.get('accept-ranges'),
			bytesReceived: outputBytes.byteLength,
			rangeRequestHonoured: options.requestRange && download.status === 206
		},
		decoded: await probeDecodedStreams(outputPath),
		retention: {
			exportDirectoriesAfter: await exportDirectoryCount(),
			outputReadableAfterDownload: secondDownload.ok
		}
	};
}

async function measureCancellation(frames: readonly Uint8Array[]): Promise<{
	cancelledAfterFrames: number;
	cancelStatus: number;
	ffmpegChildrenAfterCancel: number;
	exportDirectoriesAfter: number;
	sessionGone: boolean;
	elapsedMs: number;
}> {
	const session = await createSession({
		format: 'prores',
		fps: 30,
		frameCount: frames.length,
		opaque: true,
		audioBytes: 0
	});
	await uploadFrame(session, 0, frames[0]);
	await uploadFrame(session, 1, frames[1]);
	const started = nowMs();
	const cancel = await fetch(`${PROBE_ORIGIN}${session.cancelUrl}`, { method: 'DELETE' });
	const elapsedMs = nowMs() - started;
	const followUp = await fetch(`${PROBE_ORIGIN}${session.completeUrl}`, { method: 'POST' });
	return {
		cancelledAfterFrames: 2,
		cancelStatus: cancel.status,
		ffmpegChildrenAfterCancel: await ffmpegChildProcessCount(),
		exportDirectoriesAfter: await exportDirectoryCount(),
		sessionGone: followUp.status === 404,
		elapsedMs
	};
}

async function measureConcurrency(
	frames: readonly Uint8Array[],
	workingDirectory: string
): Promise<{
	sessions: number;
	wallClockMs: number;
	allCompleted: boolean;
	exportDirectoriesAfter: number;
}> {
	const sessions = PUBLIC_EXPORT_RUNTIME_LIMITS.maxConcurrentSessions;
	const started = nowMs();
	const results = await Promise.all(
		Array.from({ length: sessions }, (_unused, index) =>
			measureExportLane({
				format: 'webm',
				opaque: false,
				frames: frames.slice(0, CONCURRENT_FRAME_COUNT),
				audio: null,
				requestRange: false,
				workingDirectory: join(workingDirectory, `concurrent-${index}`)
			})
		)
	);
	return {
		sessions,
		wallClockMs: nowMs() - started,
		allCompleted: results.every((result) => result.outputBytes > 0),
		exportDirectoriesAfter: await exportDirectoryCount()
	};
}

/** The Node built-ins the server modules import — the Workers-incompatibility surface. */
async function serverNodeBuiltins(): Promise<string[]> {
	const builtins = new Set<string>();
	const walk = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await walk(path);
				continue;
			}
			const isServerModule =
				entry.name.endsWith('.server.ts') ||
				entry.name === '+server.ts' ||
				entry.name === 'hooks.server.ts';
			if (!isServerModule) continue;
			for (const match of (await readFile(path, 'utf8')).matchAll(/from '(node:[\w/]+)'/g)) {
				builtins.add(match[1]);
			}
		}
	};
	await walk(join(repoRoot, 'src'));
	return [...builtins].sort();
}

async function main(): Promise<void> {
	const readiness = await inspectPublicRuntimeReadiness(runtimeConfig);
	if (!readiness.ready) {
		throw new Error(
			`Host does not satisfy the ratified runtime contract: ${JSON.stringify(readiness, null, 2)}`
		);
	}
	const health = await fetch(`${PROBE_ORIGIN}/api/health`);
	if (!health.ok) {
		throw new Error(`Health check failed at ${PROBE_ORIGIN} (${health.status}).`);
	}
	const healthBody = (await health.json()) as Record<string, unknown>;

	const workingDirectory = await mkdtemp(join(tmpdir(), 'gfx-public-runtime-probe-'));
	try {
		const framePaths = await renderProbeFrames(workingDirectory);
		const frames = await Promise.all(framePaths.map((path) => readFile(path)));
		const audioPath = await renderProbeAudio(workingDirectory, LANE_FRAME_COUNT / 30);
		const audioBytes = await readFile(audioPath);

		const exportLanes = [
			await measureExportLane({
				format: 'prores',
				opaque: true,
				frames,
				audio: { bytes: audioBytes },
				startTimecode: '01:00:00:00',
				requestRange: true,
				workingDirectory
			}),
			await measureExportLane({
				format: 'webm',
				opaque: false,
				frames,
				audio: null,
				requestRange: false,
				workingDirectory
			})
		];
		const cancellation = await measureCancellation(frames);
		const concurrency = await measureConcurrency(frames, workingDirectory);

		const evidence = {
			schemaVersion: 1,
			generatedAt: new Date().toISOString(),
			probe: 'public-runtime-and-retention',
			origin: PROBE_ORIGIN,
			host: {
				node: process.version,
				platform: process.platform,
				arch: process.arch,
				cpuCount: cpus().length,
				totalMemoryBytes: totalmem()
			},
			readiness,
			health: { status: health.status, body: healthBody },
			deploymentInputs: {
				inventory: PUBLIC_RUNTIME_DEPLOYMENT_INPUTS.map((input) => ({
					name: input.name,
					owner: input.owner,
					required: input.required
				})),
				// The probe runs outside the server process, so required inputs are
				// proven by host behaviour rather than by reading the environment.
				verifiedOnHost: {
					bodySizeLimitAcceptsNativeFrame: true,
					releaseReportedByHealth: healthBody.release !== null
				}
			},
			serverNodeBuiltins: await serverNodeBuiltins(),
			exportLanes,
			cancellation,
			concurrency,
			limits: {
				ratified: PUBLIC_EXPORT_RUNTIME_LIMITS,
				ratifiedOutputBytesPerFrame: RATIFIED_NATIVE_OUTPUT_BYTES_PER_FRAME,
				worstCaseSessionOutputBytes: Object.fromEntries(
					Object.entries(RATIFIED_NATIVE_OUTPUT_BYTES_PER_FRAME).map(([lane, bytesPerFrame]) => [
						lane,
						bytesPerFrame * PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameCount
					])
				),
				temporaryDiskFreeBytes: readiness.temporaryDisk.freeBytes,
				requiredTemporaryDiskBytes: readiness.temporaryDisk.requiredBytes
			},
			retention: {
				exportDirectoriesAtEnd: await exportDirectoryCount(),
				ffmpegChildrenAtEnd: await ffmpegChildProcessCount()
			}
		};

		const failures: string[] = [];
		for (const lane of exportLanes) {
			if (!lane.withinRatifiedBytesPerFrame) {
				failures.push(
					`${lane.format} measured ${lane.outputBytesPerFrame} bytes per native frame, above the ratified ${lane.ratifiedBytesPerFrame}.`
				);
			}
			if (lane.download.cacheControl !== 'no-store') {
				failures.push(`${lane.format} download did not send Cache-Control: no-store.`);
			}
			if (lane.download.rangeRequestHonoured) {
				failures.push(
					`${lane.format} download served a partial response; downloads are single-shot.`
				);
			}
			if (lane.retention.outputReadableAfterDownload) {
				failures.push(`${lane.format} output survived its download.`);
			}
			if (lane.retention.exportDirectoriesAfter !== 0) {
				failures.push(
					`${lane.format} left ${lane.retention.exportDirectoriesAfter} work directories.`
				);
			}
			if (lane.decoded.width !== NATIVE_WIDTH || lane.decoded.height !== NATIVE_HEIGHT) {
				failures.push(
					`${lane.format} output decoded at ${lane.decoded.width}x${lane.decoded.height}.`
				);
			}
		}
		if (!cancellation.sessionGone || cancellation.exportDirectoriesAfter !== 0) {
			failures.push('Cancellation left a live session or work directory behind.');
		}
		if (cancellation.ffmpegChildrenAfterCancel !== 0) {
			failures.push(
				`Cancellation left ${cancellation.ffmpegChildrenAfterCancel} encoder processes.`
			);
		}
		if (!concurrency.allCompleted || concurrency.exportDirectoriesAfter !== 0) {
			failures.push('Concurrent sessions did not all complete and clean up.');
		}
		if (
			evidence.retention.exportDirectoriesAtEnd !== 0 ||
			evidence.retention.ffmpegChildrenAtEnd !== 0
		) {
			failures.push('The host retained export state after every session ended.');
		}

		const serialized = `${JSON.stringify(evidence, null, '\t')}\n`;
		const prettierOptions = await resolveConfig(EVIDENCE_PATH);
		await writeFile(
			EVIDENCE_PATH,
			await format(serialized, { ...prettierOptions, filepath: EVIDENCE_PATH })
		);
		console.log(`Wrote ${EVIDENCE_PATH}`);
		for (const lane of exportLanes) {
			console.log(
				`${lane.format}: ${lane.outputBytesPerFrame} bytes/frame, complete in ${lane.completeMs} ms, download ${lane.download.status}`
			);
		}
		if (failures.length > 0) {
			throw new Error(`Public runtime probe failed:\n- ${failures.join('\n- ')}`);
		}
	} finally {
		await rm(workingDirectory, { recursive: true, force: true });
	}
}

await main();
