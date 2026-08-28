import { execFile } from 'node:child_process';
import { mkdtemp, rm, statfs, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { resolveGitRelease } from '$lib/platform/git-version.server';
import {
	PUBLIC_EXPORT_RUNTIME_LIMITS,
	REQUIRED_FFMPEG_ENCODERS,
	type PublicRuntimeConfig
} from '$lib/platform/public-runtime-contract';

const execFileAsync = promisify(execFile);
const READINESS_PROBE_PREFIX = 'gfx-readiness-';

export interface FfmpegReadiness {
	ok: boolean;
	path: string;
	version: string | null;
	missingEncoders: readonly string[];
	failure: string | null;
}

export interface TemporaryDiskReadiness {
	ok: boolean;
	path: string;
	writable: boolean;
	freeBytes: number | null;
	requiredBytes: number;
	failure: string | null;
}

export interface PublicRuntimeReadiness {
	ready: boolean;
	release: string | null;
	ffmpeg: FfmpegReadiness;
	temporaryDisk: TemporaryDiskReadiness;
}

/** Public health payload: liveness and release only — never paths, versions, or capacity. */
export interface PublicRuntimeHealthBody {
	status: 'ready' | 'unavailable';
	release: string | null;
	checks: {
		ffmpeg: 'ok' | 'unavailable';
		temporaryDisk: 'ok' | 'unavailable';
	};
}

/** Encoder names from `ffmpeg -encoders` output — the trailing table rows only. */
export function parseFfmpegEncoderNames(encodersOutput: string): Set<string> {
	const names = new Set<string>();
	for (const line of encodersOutput.split('\n')) {
		const match = /^\s[A-Z.]{6}\s(\w[\w\-.]*)/.exec(line);
		if (match) names.add(match[1]);
	}
	return names;
}

async function inspectFfmpeg(ffmpegPath: string): Promise<FfmpegReadiness> {
	try {
		const [version, encoders] = await Promise.all([
			execFileAsync(ffmpegPath, ['-hide_banner', '-version']),
			execFileAsync(ffmpegPath, ['-hide_banner', '-encoders'], { maxBuffer: 4 * 1024 * 1024 })
		]);
		const available = parseFfmpegEncoderNames(encoders.stdout);
		const missingEncoders = REQUIRED_FFMPEG_ENCODERS.filter((name) => !available.has(name));
		return {
			ok: missingEncoders.length === 0,
			path: ffmpegPath,
			version: version.stdout.split('\n', 1)[0]?.trim() ?? null,
			missingEncoders,
			failure: null
		};
	} catch (cause) {
		return {
			ok: false,
			path: ffmpegPath,
			version: null,
			missingEncoders: REQUIRED_FFMPEG_ENCODERS,
			failure: cause instanceof Error ? cause.message : String(cause)
		};
	}
}

async function inspectTemporaryDisk(directory: string): Promise<TemporaryDiskReadiness> {
	const requiredBytes = PUBLIC_EXPORT_RUNTIME_LIMITS.requiredTemporaryDiskBytes;
	let probeDirectory: string | null = null;
	try {
		probeDirectory = await mkdtemp(join(directory, READINESS_PROBE_PREFIX));
		await writeFile(join(probeDirectory, 'probe'), 'gfx');
		const stats = await statfs(directory);
		const freeBytes = stats.bavail * stats.bsize;
		return {
			ok: freeBytes >= requiredBytes,
			path: directory,
			writable: true,
			freeBytes,
			requiredBytes,
			failure:
				freeBytes >= requiredBytes
					? null
					: `Free temp disk ${freeBytes} is below the ${requiredBytes} the public export limits reserve.`
		};
	} catch (cause) {
		return {
			ok: false,
			path: directory,
			writable: false,
			freeBytes: null,
			requiredBytes,
			failure: cause instanceof Error ? cause.message : String(cause)
		};
	} finally {
		if (probeDirectory) await rm(probeDirectory, { recursive: true, force: true });
	}
}

/**
 * Measure the live host against the ratified runtime contract: an ffmpeg that
 * can encode both public lanes, temp disk with room for the bounded export
 * envelope, and the release identity a rollback is verified against.
 */
export async function inspectPublicRuntimeReadiness(
	config: PublicRuntimeConfig
): Promise<PublicRuntimeReadiness> {
	const [ffmpeg, temporaryDisk] = await Promise.all([
		inspectFfmpeg(config.ffmpegPath),
		inspectTemporaryDisk(config.exportTemporaryDirectory ?? tmpdir())
	]);
	return {
		ready: ffmpeg.ok && temporaryDisk.ok,
		release: config.release ?? resolveGitRelease() ?? null,
		ffmpeg,
		temporaryDisk
	};
}

/** Reduce a readiness report to the redacted public health response. */
export function summarizePublicRuntimeHealth(readiness: PublicRuntimeReadiness): {
	httpStatus: number;
	body: PublicRuntimeHealthBody;
} {
	return {
		httpStatus: readiness.ready ? 200 : 503,
		body: {
			status: readiness.ready ? 'ready' : 'unavailable',
			release: readiness.release,
			checks: {
				ffmpeg: readiness.ffmpeg.ok ? 'ok' : 'unavailable',
				temporaryDisk: readiness.temporaryDisk.ok ? 'ok' : 'unavailable'
			}
		}
	};
}
