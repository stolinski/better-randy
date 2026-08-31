// Verify the reproducible Node/ffmpeg production image (ADR-0052).
//
// Builds the image, rebuilds its pinned runtime layer, then drives the running
// container the way the public origin will be driven: readiness, nonroot
// execution, the temp volume, the assets it serves, one export per format
// through the real HTTP session API, and a signalled shutdown. It also proves
// the other direction — that a host missing a deployment input exits before it
// binds a port.
//
//   pnpm verify:production-image
//
// Writes docs/runtime-probes/production-image.json and fails, naming the check,
// when the image the repository builds today cannot serve public traffic.
//
// Deliberately not a native-target sweep: `pnpm verify:export-decode:public-matrix`
// owns lane fidelity at 4K. This runs the same lanes at a reduced size — which
// the transport accepts, because the public envelope is sized so only native
// work fits and frame dimensions are never checked — so what is measured here is
// the image, not the encoder.
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { format, resolveConfig } from 'prettier';

import type {
	DecodedExportMeasurement,
	PublicExportDecodeLane
} from '../src/lib/platform/public-export-decode-contract.ts';
import { registerGfxRuntimeModuleHooks } from './gfx-runtime-module-hooks.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
registerGfxRuntimeModuleHooks(repoRoot);

const { PUBLIC_EXPORT_RUNTIME_LIMITS, REQUIRED_FFMPEG_ENCODERS } =
	await import('../src/lib/platform/public-runtime-contract.ts');
const { expectedDecodedExport, findDecodedExportShapeFaults } =
	await import('../src/lib/platform/public-export-decode-contract.ts');
const { PUBLIC_PERMISSIONS_POLICY, PUBLIC_SECURITY_RESPONSE_HEADERS } =
	await import('../src/lib/platform/public-response-headers.ts');
const { PUBLIC_SURFACE_INVENTORY } =
	await import('../src/lib/platform/public-surface-inventory.ts');

const execFileAsync = promisify(execFile);

const IMAGE_TAG = 'gfx-production-image:verify';
const REBUILD_TAG = 'gfx-production-image:verify-rebuild';
const CONTAINER_NAME = 'gfx-production-image-verify';
const EXPORT_VOLUME_NAME = 'gfx-production-image-verify-export';
const CONTAINER_EXPORT_DIRECTORY = '/var/lib/gfx/export';
const EVIDENCE_PATH = resolve(
	process.env.GFX_PROBE_EVIDENCE ?? join(repoRoot, 'docs/runtime-probes/production-image.json')
);

/** Reduced-size frames: this measures the image, not the encoder's native cost. */
const SMOKE_WIDTH = 640;
const SMOKE_HEIGHT = 360;
const SMOKE_FRAME_COUNT = 4;
const SMOKE_FPS = 30;

/**
 * A path that really exists behind each development-only prefix that names a
 * subtree, so a 404 from the running image means "excluded" rather than "no such
 * route". Prefixes that are already a whole path are probed as themselves.
 */
const DEVELOPMENT_ONLY_SURFACE_PROBES: Readonly<Record<string, string>> = {
	'/poc/': '/poc/dof3d',
	'/api/posters/': '/api/posters/abcdef01',
	'/api/verification/': '/api/verification/source-identity'
};

/** Seconds `docker stop` waits before SIGKILL. Must exceed the image's SHUTDOWN_TIMEOUT. */
const STOP_GRACE_SECONDS = 30;
const HEALTH_TIMEOUT_MS = 90_000;

interface CommandResult {
	code: number;
	stdout: string;
	stderr: string;
}

async function runCommand(command: string, args: readonly string[]): Promise<CommandResult> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(command, [...args], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
		child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
		child.on('error', rejectPromise);
		child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
	});
}

async function docker(...args: string[]): Promise<CommandResult> {
	return runCommand('docker', args);
}

async function dockerOrThrow(...args: string[]): Promise<string> {
	const result = await docker(...args);
	if (result.code !== 0) {
		throw new Error(`docker ${args.join(' ')} failed (${result.code}):\n${result.stderr.trim()}`);
	}
	return result.stdout.trim();
}

const failures: string[] = [];

/** Record a failed check without abandoning the remaining ones. */
function fail(check: string, detail: string): void {
	failures.push(`${check}: ${detail}`);
	console.error(`FAIL ${check}: ${detail}`);
}

function expect(check: string, condition: boolean, detail: string): boolean {
	if (condition) {
		console.log(`ok   ${check}`);
		return true;
	}
	fail(check, detail);
	return false;
}

// --- image build -----------------------------------------------------------

interface RuntimeVersionManifest {
	node: string;
	ffmpeg: string;
	ffmpegPackage: string;
}

async function buildImage(tag: string, release: string, extra: readonly string[]): Promise<number> {
	const startedAt = Date.now();
	const result = await docker(
		'build',
		'--build-arg',
		`GFX_RELEASE=${release}`,
		...extra,
		'--tag',
		tag,
		repoRoot
	);
	if (result.code !== 0) {
		throw new Error(`Production image build failed:\n${result.stderr.slice(-4000)}`);
	}
	return Date.now() - startedAt;
}

async function readRuntimeVersions(tag: string): Promise<RuntimeVersionManifest> {
	const stdout = await dockerOrThrow(
		'run',
		'--rm',
		'--entrypoint',
		'node',
		tag,
		'--print',
		"require('fs').readFileSync('/app/runtime-versions.json','utf8')"
	);
	return JSON.parse(stdout) as RuntimeVersionManifest;
}

// --- deployment refusals ---------------------------------------------------

interface RefusedStart {
	name: string;
	env: readonly string[];
	expectedInName: string;
}

/**
 * Every input the public profile requires, withdrawn one at a time. A host that
 * starts anyway would answer a visitor's export with a failure it cannot
 * explain, so each of these must exit before the adapter binds a port.
 */
const REFUSED_STARTS: readonly RefusedStart[] = [
	{ name: 'missing-origin', env: [], expectedInName: 'ORIGIN' },
	{
		name: 'adapter-default-body-ceiling',
		env: ['ORIGIN=http://localhost:3000', 'BODY_SIZE_LIMIT=512K'],
		expectedInName: 'BODY_SIZE_LIMIT'
	},
	{
		name: 'os-temp-directory',
		env: ['ORIGIN=http://localhost:3000', 'GFX_EXPORT_TEMPORARY_DIRECTORY='],
		expectedInName: 'GFX_EXPORT_TEMPORARY_DIRECTORY'
	},
	{
		name: 'disk-backed-composition-store',
		env: ['ORIGIN=http://localhost:3000', 'PUBLIC_GFX_COMPOSITION_STORE=origin'],
		expectedInName: 'PUBLIC_GFX_COMPOSITION_STORE'
	},
	{
		name: 'unreserved-concurrency',
		env: ['ORIGIN=http://localhost:3000', 'GFX_EXPORT_MAX_CONCURRENT_SESSIONS=8'],
		expectedInName: 'GFX_EXPORT_MAX_CONCURRENT_SESSIONS'
	}
];

async function measureRefusedStart(refusal: RefusedStart): Promise<{
	name: string;
	exitCode: number;
	namedTheInput: boolean;
	listened: boolean;
}> {
	const environment = refusal.env.flatMap((entry) => ['--env', entry]);
	const result = await docker('run', '--rm', ...environment, IMAGE_TAG);
	const output = `${result.stdout}${result.stderr}`;
	return {
		name: refusal.name,
		exitCode: result.code,
		namedTheInput: output.includes(refusal.expectedInName),
		listened: output.includes('Listening on')
	};
}

// --- export lanes ----------------------------------------------------------

interface CreatedSession {
	sessionId: string;
	audioUrl: string;
	frameUrlTemplate: string;
	completeUrl: string;
	cancelUrl: string;
	/** `name=value` of the session credential cookie; Node's fetch keeps no jar. */
	credentialCookie: string;
}

async function createSession(
	origin: string,
	body: Record<string, unknown>
): Promise<CreatedSession> {
	const response = await fetch(`${origin}/api/export/sessions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin },
		body: JSON.stringify(body)
	});
	if (response.status !== 201) {
		throw new Error(`Export session create failed (${response.status}): ${await response.text()}`);
	}
	const credentialCookie = response.headers.get('set-cookie')?.split(';', 1)[0];
	if (!credentialCookie) throw new Error('Export session create issued no session credential.');
	return {
		...((await response.json()) as Omit<CreatedSession, 'credentialCookie'>),
		credentialCookie
	};
}

async function uploadFrame(
	origin: string,
	session: CreatedSession,
	frame: number,
	bytes: Uint8Array
): Promise<void> {
	const response = await fetch(
		`${origin}${session.frameUrlTemplate.replace('{frame}', String(frame))}`,
		{
			method: 'PUT',
			headers: {
				origin,
				cookie: session.credentialCookie,
				'content-type': 'image/png'
			},
			body: bytes
		}
	);
	if (!response.ok) {
		throw new Error(`Frame ${frame} upload failed (${response.status}): ${await response.text()}`);
	}
}

async function renderSmokeFrames(directory: string): Promise<Uint8Array[]> {
	await execFileAsync('ffmpeg', [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		`testsrc2=size=${SMOKE_WIDTH}x${SMOKE_HEIGHT}:rate=${SMOKE_FRAME_COUNT}`,
		'-frames:v',
		String(SMOKE_FRAME_COUNT),
		'-pix_fmt',
		'rgba',
		join(directory, 'frame%02d.png')
	]);
	return Promise.all(
		Array.from({ length: SMOKE_FRAME_COUNT }, (_unused, index) =>
			readFile(join(directory, `frame${String(index + 1).padStart(2, '0')}.png`))
		)
	);
}

async function renderSmokeAudio(directory: string): Promise<Uint8Array> {
	const path = join(directory, 'mix.wav');
	await execFileAsync('ffmpeg', [
		'-y',
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		`sine=frequency=440:duration=${SMOKE_FRAME_COUNT / SMOKE_FPS}`,
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

async function measureDecodedExport(path: string): Promise<DecodedExportMeasurement> {
	const { stdout } = await execFileAsync('ffprobe', [
		'-hide_banner',
		'-loglevel',
		'error',
		'-count_frames',
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
		audioCodec: audio?.codec_name ?? null,
		width: video?.width ?? null,
		height: video?.height ?? null,
		decodedFrameCount: Number(video?.nb_read_frames ?? 0),
		containerDurationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null
	};
}

interface ExportLaneResult {
	lane: string;
	outputBytes: number;
	cacheControl: string | null;
	secondDownloadStatus: number;
	shapeFaults: readonly string[];
	workDirectoriesAfter: number;
}

async function verifyExportLane(options: {
	origin: string;
	lane: PublicExportDecodeLane;
	frames: readonly Uint8Array[];
	audio: Uint8Array | null;
	workingDirectory: string;
}): Promise<ExportLaneResult> {
	const { origin, lane } = options;
	const laneName = `${lane.format}-${lane.outputClass}-${lane.hasAudio ? 'audio' : 'silent'}`;
	const session = await createSession(origin, {
		format: lane.format,
		fps: SMOKE_FPS,
		frameCount: options.frames.length,
		opaque: lane.outputClass === 'opaque',
		audioBytes: options.audio?.byteLength ?? 0
	});

	if (options.audio) {
		const response = await fetch(`${origin}${session.audioUrl}`, {
			method: 'PUT',
			headers: { origin, cookie: session.credentialCookie, 'content-type': 'audio/wav' },
			body: options.audio
		});
		if (!response.ok) {
			throw new Error(`Audio upload failed (${response.status}): ${await response.text()}`);
		}
	}

	for (const [index, frame] of options.frames.entries()) {
		await uploadFrame(origin, session, index, frame);
	}

	const completeResponse = await fetch(`${origin}${session.completeUrl}`, {
		method: 'POST',
		headers: { origin, cookie: session.credentialCookie }
	});
	if (!completeResponse.ok) {
		throw new Error(
			`Complete failed (${completeResponse.status}): ${await completeResponse.text()}`
		);
	}
	const { downloadUrl } = (await completeResponse.json()) as { downloadUrl: string };

	// A download is a same-origin navigation: credential cookie, no Origin header.
	const download = await fetch(`${origin}${downloadUrl}`, {
		headers: { cookie: session.credentialCookie, 'sec-fetch-site': 'same-origin' }
	});
	const outputBytes = new Uint8Array(await download.arrayBuffer());
	const outputPath = join(
		options.workingDirectory,
		`${laneName}.${lane.format === 'webm' ? 'webm' : 'mov'}`
	);
	await writeFile(outputPath, outputBytes);

	const secondDownload = await fetch(`${origin}${downloadUrl}`, {
		headers: { cookie: session.credentialCookie, 'sec-fetch-site': 'same-origin' }
	});
	await secondDownload.arrayBuffer();

	const measured = await measureDecodedExport(outputPath);
	const expected = expectedDecodedExport(
		lane,
		{ orientation: 'horizontal', width: SMOKE_WIDTH, height: SMOKE_HEIGHT },
		{ frameCount: options.frames.length, fps: SMOKE_FPS }
	);

	return {
		lane: laneName,
		outputBytes: outputBytes.byteLength,
		cacheControl: download.headers.get('cache-control'),
		secondDownloadStatus: secondDownload.status,
		shapeFaults: findDecodedExportShapeFaults(expected, measured),
		workDirectoriesAfter: await countContainerWorkDirectories()
	};
}

async function countContainerWorkDirectories(): Promise<number> {
	const stdout = await dockerOrThrow(
		'exec',
		CONTAINER_NAME,
		'sh',
		'-c',
		`ls -A ${CONTAINER_EXPORT_DIRECTORY} | wc -l`
	);
	return Number(stdout.trim());
}

async function countVolumeWorkDirectories(): Promise<number> {
	const stdout = await dockerOrThrow(
		'run',
		'--rm',
		'--volume',
		`${EXPORT_VOLUME_NAME}:${CONTAINER_EXPORT_DIRECTORY}`,
		'--entrypoint',
		'sh',
		IMAGE_TAG,
		'-c',
		`ls -A ${CONTAINER_EXPORT_DIRECTORY} | wc -l`
	);
	return Number(stdout.trim());
}

async function waitForHealthyOrigin(origin: string): Promise<number> {
	const startedAt = Date.now();
	for (;;) {
		try {
			const response = await fetch(`${origin}/api/health`);
			if (response.status === 200) return Date.now() - startedAt;
		} catch {
			// The port is mapped before the process listens.
		}
		if (Date.now() - startedAt > HEALTH_TIMEOUT_MS) {
			throw new Error(
				`The container never reported ready within ${HEALTH_TIMEOUT_MS} ms:\n${await dockerOrThrow('logs', CONTAINER_NAME)}`
			);
		}
		await new Promise((sleep) => setTimeout(sleep, 500));
	}
}

/** A free loopback port, released before the container claims it. */
async function reserveHostPort(): Promise<number> {
	const server = createServer();
	try {
		await new Promise<void>((listening, failed) => {
			server.once('error', failed);
			server.listen(0, '127.0.0.1', listening);
		});
		const address = server.address();
		if (address === null || typeof address === 'string') {
			throw new Error('Could not reserve a loopback port for the container.');
		}
		return address.port;
	} finally {
		await new Promise<void>((closed) => server.close(() => closed()));
	}
}

async function removeContainerAndVolume(): Promise<void> {
	await docker('rm', '--force', CONTAINER_NAME);
	await docker('volume', 'rm', '--force', EXPORT_VOLUME_NAME);
}

/**
 * Refuse to start rather than report a pass this machine could not have earned:
 * the container runtime builds and runs the image, and the local ffmpeg renders
 * the frames and decodes what comes back.
 */
async function assertVerificationToolsAvailable(): Promise<void> {
	const missing: string[] = [];
	for (const [tool, args] of [
		['docker', ['version', '--format', '{{.Server.Version}}']],
		['ffmpeg', ['-hide_banner', '-version']],
		['ffprobe', ['-hide_banner', '-version']]
	] satisfies [string, string[]][]) {
		const result = await runCommand(tool, args).catch(() => ({ code: 1, stdout: '', stderr: '' }));
		if (result.code !== 0) missing.push(tool);
	}
	if (missing.length > 0) {
		throw new Error(
			`Verifying the production image needs ${missing.join(' and ')} on this machine; ${missing.length === 1 ? 'it is' : 'they are'} unavailable.`
		);
	}
}

// --- the run ---------------------------------------------------------------

await assertVerificationToolsAvailable();

const release = (
	await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
).stdout.trim();
const gfxRelease = `gfx@${release}`;
const workingDirectory = await mkdtemp(join(tmpdir(), 'gfx-production-image-verify-'));

await removeContainerAndVolume();

const evidence: Record<string, unknown> = {
	measuredAt: new Date().toISOString(),
	image: IMAGE_TAG,
	release: gfxRelease
};

try {
	console.log('Building the production image…');
	const buildMs = await buildImage(IMAGE_TAG, gfxRelease, []);
	const versions = await readRuntimeVersions(IMAGE_TAG);
	evidence.build = { buildMs, versions };

	// A rebuild has to land on the same pinned runtime, so the pinned layer is
	// re-executed rather than replayed from cache.
	console.log('Rebuilding the pinned runtime layer…');
	const rebuildMs = await buildImage(REBUILD_TAG, gfxRelease, ['--no-cache-filter', 'runtime']);
	const rebuiltVersions = await readRuntimeVersions(REBUILD_TAG);
	evidence.rebuild = { rebuildMs, versions: rebuiltVersions };
	expect(
		'rebuild-pins-the-same-runtime',
		JSON.stringify(versions) === JSON.stringify(rebuiltVersions),
		`rebuilt ${JSON.stringify(rebuiltVersions)} against ${JSON.stringify(versions)}`
	);

	const configured = JSON.parse(
		await dockerOrThrow('image', 'inspect', IMAGE_TAG, '--format', '{{json .Config}}')
	) as {
		User?: string;
		Env?: string[];
		Volumes?: Record<string, unknown>;
		Healthcheck?: { Test?: string[] };
	};
	const imageEnv = new Map(
		(configured.Env ?? []).map((entry) => {
			const separator = entry.indexOf('=');
			return [entry.slice(0, separator), entry.slice(separator + 1)] as const;
		})
	);
	evidence.imageConfiguration = {
		user: configured.User ?? null,
		volumes: Object.keys(configured.Volumes ?? {}),
		healthcheck: configured.Healthcheck?.Test ?? null,
		bodySizeLimit: imageEnv.get('BODY_SIZE_LIMIT') ?? null,
		runtimeProfile: imageEnv.get('GFX_RUNTIME_PROFILE') ?? null,
		compositionStore: imageEnv.get('PUBLIC_GFX_COMPOSITION_STORE') ?? null,
		exportTemporaryDirectory: imageEnv.get('GFX_EXPORT_TEMPORARY_DIRECTORY') ?? null
	};

	expect('image-runs-nonroot', configured.User === 'node', `image user is ${configured.User}`);
	expect(
		'image-declares-the-export-volume',
		Object.keys(configured.Volumes ?? {}).includes(CONTAINER_EXPORT_DIRECTORY),
		`declared volumes are ${Object.keys(configured.Volumes ?? {}).join(', ') || 'none'}`
	);
	expect(
		'image-carries-a-healthcheck',
		(configured.Healthcheck?.Test ?? []).some((entry) => entry.includes('/api/health')),
		'no healthcheck reads /api/health'
	);
	expect(
		'body-ceiling-matches-the-ratified-frame-bound',
		imageEnv.get('BODY_SIZE_LIMIT') === String(PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes),
		`BODY_SIZE_LIMIT is ${imageEnv.get('BODY_SIZE_LIMIT')}; maxFrameBytes is ${PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes}`
	);
	expect(
		'image-declares-the-public-profile',
		imageEnv.get('GFX_RUNTIME_PROFILE') === 'public',
		`GFX_RUNTIME_PROFILE is ${imageEnv.get('GFX_RUNTIME_PROFILE')}`
	);
	expect(
		'image-serves-the-browser-scoped-store',
		imageEnv.get('PUBLIC_GFX_COMPOSITION_STORE') === 'browser',
		`PUBLIC_GFX_COMPOSITION_STORE is ${imageEnv.get('PUBLIC_GFX_COMPOSITION_STORE')}`
	);
	expect(
		'origin-is-not-baked-into-the-image',
		!imageEnv.has('ORIGIN'),
		`ORIGIN is baked as ${imageEnv.get('ORIGIN')}`
	);

	console.log('Withdrawing one deployment input at a time…');
	const refusedStarts = [];
	for (const refusal of REFUSED_STARTS) {
		const measurement = await measureRefusedStart(refusal);
		refusedStarts.push(measurement);
		expect(
			`refuses-to-start-${refusal.name}`,
			measurement.exitCode !== 0 && measurement.namedTheInput && !measurement.listened,
			`exit ${measurement.exitCode}, named ${refusal.expectedInName}: ${measurement.namedTheInput}, listened: ${measurement.listened}`
		);
	}
	evidence.refusedStarts = refusedStarts;

	console.log('Starting the container…');
	await dockerOrThrow('volume', 'create', EXPORT_VOLUME_NAME);
	// The public host resolves its own origin from ORIGIN alone and refuses a
	// request whose URL disagrees, so the port has to be known before the
	// container starts rather than read back from the mapping afterwards.
	const publishedPort = await reserveHostPort();
	const origin = `http://127.0.0.1:${publishedPort}`;
	await dockerOrThrow(
		'run',
		'--detach',
		'--name',
		CONTAINER_NAME,
		'--publish',
		`127.0.0.1:${publishedPort}:3000`,
		'--volume',
		`${EXPORT_VOLUME_NAME}:${CONTAINER_EXPORT_DIRECTORY}`,
		'--env',
		`ORIGIN=${origin}`,
		IMAGE_TAG
	);

	const readyMs = await waitForHealthyOrigin(origin);
	const health = await fetch(`${origin}/api/health`);
	const healthBody = (await health.json()) as {
		status: string;
		release: string | null;
		checks: Record<string, string>;
	};
	evidence.readiness = {
		readyMs,
		body: healthBody,
		cacheControl: health.headers.get('cache-control')
	};
	expect(
		'health-reports-ready-with-the-built-release',
		healthBody.status === 'ready' &&
			healthBody.release === gfxRelease &&
			healthBody.checks.ffmpeg === 'ok' &&
			healthBody.checks.temporaryDisk === 'ok',
		JSON.stringify(healthBody)
	);
	expect(
		'health-is-uncacheable',
		health.headers.get('cache-control') === 'no-store',
		`Cache-Control is ${health.headers.get('cache-control')}`
	);

	const processIdentity = await dockerOrThrow(
		'exec',
		CONTAINER_NAME,
		'sh',
		'-c',
		'id -u; id -un; stat -c "%U %a" ' + CONTAINER_EXPORT_DIRECTORY
	);
	const [uid, userName, directoryOwnership] = processIdentity
		.split('\n')
		.map((line) => line.trim());
	evidence.processIdentity = { uid, userName, exportDirectory: directoryOwnership };
	expect(
		'server-process-runs-nonroot',
		uid !== '0' && userName === 'node',
		`serving as uid ${uid} (${userName})`
	);
	expect(
		'export-volume-belongs-to-the-server-user',
		directoryOwnership?.startsWith('node ') === true,
		`export directory is ${directoryOwnership}`
	);
	const mounts = JSON.parse(
		await dockerOrThrow('inspect', CONTAINER_NAME, '--format', '{{json .Mounts}}')
	) as { Destination: string; Name?: string }[];
	expect(
		'export-directory-is-a-mounted-volume',
		mounts.some((mount) => mount.Destination === CONTAINER_EXPORT_DIRECTORY),
		`mounts are ${mounts.map((mount) => mount.Destination).join(', ') || 'none'}`
	);

	const containerEncoders = await dockerOrThrow(
		'exec',
		CONTAINER_NAME,
		'sh',
		'-c',
		'ffmpeg -hide_banner -encoders 2>/dev/null'
	);
	const missingEncoders = REQUIRED_FFMPEG_ENCODERS.filter(
		(encoder: string) => !new RegExp(`^ [A-Z.]{6} ${encoder} `, 'm').test(containerEncoders)
	);
	evidence.ffmpeg = { missingEncoders };
	expect(
		'container-ffmpeg-encodes-every-public-lane',
		missingEncoders.length === 0,
		`missing ${missingEncoders.join(', ')}`
	);

	// Both font lanes, because they arrive in the image by different routes: the
	// @fontsource faces Vite hashes into the bundle, and the `static/` faces the
	// build copies through verbatim.
	const fontPaths = await Promise.all(
		['build/client/_app/immutable/assets', 'build/client/fonts'].map((directory) =>
			dockerOrThrow(
				'exec',
				CONTAINER_NAME,
				'sh',
				'-c',
				`find ${directory} -name '*.woff2' | head -1`
			)
		)
	);
	const servedAssets = await Promise.all(
		['/', ...fontPaths].map(async (path) => {
			const url = `${origin}${path.replace(/^build\/client/, '')}`;
			const response = await fetch(url);
			const bytes = (await response.arrayBuffer()).byteLength;
			return { path: new URL(url).pathname, status: response.status, bytes };
		})
	);
	evidence.servedAssets = servedAssets;
	expect(
		'image-serves-the-app-shell-and-both-web-font-lanes',
		fontPaths.every((path) => path.endsWith('.woff2')) &&
			servedAssets.every((asset) => asset.status === 200 && asset.bytes > 0),
		`served ${JSON.stringify(servedAssets)}`
	);

	console.log('Reading the public response headers off the app shell…');
	const appShell = await fetch(`${origin}/`);
	const appShellHeaders = Object.fromEntries(
		[
			...Object.keys(PUBLIC_SECURITY_RESPONSE_HEADERS),
			'Permissions-Policy',
			'Cache-Control',
			'Content-Security-Policy'
		].map((name) => [name, appShell.headers.get(name)])
	);
	const contentSecurityPolicy = appShellHeaders['Content-Security-Policy'] ?? '';
	evidence.publicResponseHeaders = appShellHeaders;
	expect(
		'app-shell-carries-every-public-security-header',
		Object.entries(PUBLIC_SECURITY_RESPONSE_HEADERS).every(
			([name, value]) => appShellHeaders[name] === value
		) &&
			appShellHeaders['Permissions-Policy'] === PUBLIC_PERMISSIONS_POLICY &&
			appShellHeaders['Cache-Control'] === 'no-store',
		JSON.stringify(appShellHeaders)
	);
	// The nonce is the part that cannot be asserted from the contract alone: it
	// proves the composed policy still carries what SvelteKit put on the inline
	// bootstrap script, so a hardened origin serves an app shell that runs.
	expect(
		'app-shell-policy-keeps-the-bootstrap-nonce',
		/script-src [^;]*'nonce-[^']+'/.test(contentSecurityPolicy) &&
			contentSecurityPolicy.includes("frame-ancestors 'none'") &&
			contentSecurityPolicy.includes("object-src 'none'"),
		contentSecurityPolicy
	);

	console.log('Probing the development-only surfaces…');
	const excludedRows: { pathPrefix: string; exposure: string }[] = PUBLIC_SURFACE_INVENTORY.filter(
		(row: { exposure: string }) => row.exposure === 'development-only'
	);
	// A subtree prefix answers 404 for a path that does not exist either, so a new
	// one has to name a route that really is behind it before this check means
	// anything.
	const unprobedSubtrees = excludedRows
		.map((row) => row.pathPrefix)
		.filter(
			(prefix) => prefix.endsWith('/') && DEVELOPMENT_ONLY_SURFACE_PROBES[prefix] === undefined
		);
	const excludedSurfaces = await Promise.all(
		excludedRows.map(async (row) => {
			const path = DEVELOPMENT_ONLY_SURFACE_PROBES[row.pathPrefix] ?? row.pathPrefix;
			const response = await fetch(`${origin}${path}`);
			return { path, status: response.status };
		})
	);
	evidence.excludedSurfaces = { probed: excludedSurfaces, unprobedSubtrees };
	expect(
		'development-only-surfaces-are-not-served',
		unprobedSubtrees.length === 0 && excludedSurfaces.every((surface) => surface.status === 404),
		unprobedSubtrees.length > 0
			? `no probe path declared for ${unprobedSubtrees.join(', ')}`
			: JSON.stringify(excludedSurfaces)
	);

	console.log('Exporting through the container…');
	const frames = await renderSmokeFrames(workingDirectory);
	const audio = await renderSmokeAudio(workingDirectory);
	const laneResults: ExportLaneResult[] = [];
	for (const lane of [
		{ format: 'webm', outputClass: 'transparent', hasAudio: false },
		{ format: 'prores', outputClass: 'transparent', hasAudio: true }
	] satisfies PublicExportDecodeLane[]) {
		const result = await verifyExportLane({
			origin,
			lane,
			frames,
			audio: lane.hasAudio ? audio : null,
			workingDirectory
		});
		laneResults.push(result);
		expect(
			`export-lane-${result.lane}-decodes-as-encoded`,
			result.shapeFaults.length === 0,
			result.shapeFaults.join('; ')
		);
		expect(
			`export-lane-${result.lane}-downloads-once-and-uncached`,
			result.cacheControl === 'no-store' && result.secondDownloadStatus === 404,
			`Cache-Control ${result.cacheControl}, second download ${result.secondDownloadStatus}`
		);
		expect(
			`export-lane-${result.lane}-retains-nothing`,
			result.workDirectoriesAfter === 0,
			`${result.workDirectoriesAfter} work directories survived the download`
		);
	}
	evidence.exportLanes = laneResults;

	console.log('Stopping the container with an export session still open…');
	const abandoned = await createSession(origin, {
		format: 'webm',
		fps: SMOKE_FPS,
		frameCount: frames.length,
		opaque: false,
		audioBytes: 0
	});
	await uploadFrame(origin, abandoned, 0, frames[0]);
	const openBeforeStop = await countContainerWorkDirectories();

	const stopStartedAt = Date.now();
	await dockerOrThrow('stop', '--time', String(STOP_GRACE_SECONDS), CONTAINER_NAME);
	const stopMs = Date.now() - stopStartedAt;
	const exitCode = Number(
		await dockerOrThrow('inspect', CONTAINER_NAME, '--format', '{{.State.ExitCode}}')
	);
	const stopLogs = await dockerOrThrow('logs', CONTAINER_NAME);
	const retainedAfterStop = await countVolumeWorkDirectories();
	evidence.shutdown = {
		openWorkDirectoriesBeforeStop: openBeforeStop,
		stopMs,
		exitCode,
		retainedWorkDirectories: retainedAfterStop,
		stopLine: stopLogs.split('\n').findLast((line) => line.includes('GFX runtime stopped')) ?? null
	};
	expect(
		'signalled-host-exits-cleanly',
		exitCode === 0 && stopMs < STOP_GRACE_SECONDS * 1000,
		`exit ${exitCode} after ${stopMs} ms`
	);
	expect(
		'shutdown-releases-every-open-session',
		openBeforeStop === 1 && stopLogs.includes('released 1 export session'),
		`${openBeforeStop} open before stop; log said ${JSON.stringify(evidence.shutdown)}`
	);
	expect(
		'shutdown-leaves-the-export-volume-empty',
		retainedAfterStop === 0,
		`${retainedAfterStop} work directories survived the stop`
	);
} finally {
	await removeContainerAndVolume();
	await docker('image', 'rm', '--force', REBUILD_TAG);
	await rm(workingDirectory, { recursive: true, force: true });
}

evidence.failures = failures;
evidence.verified = failures.length === 0;

await mkdir(dirname(EVIDENCE_PATH), { recursive: true });
const prettierConfig = await resolveConfig(EVIDENCE_PATH);
await writeFile(
	EVIDENCE_PATH,
	await format(JSON.stringify(evidence), { ...prettierConfig, filepath: EVIDENCE_PATH })
);
console.log(`\nEvidence written to ${EVIDENCE_PATH}`);

if (failures.length > 0) {
	console.error(`\n${failures.length} production-image check(s) failed:`);
	for (const failure of failures) console.error(`  ${failure}`);
	process.exitCode = 1;
} else {
	console.log('\nThe production image serves public traffic and leaves nothing behind.');
}
