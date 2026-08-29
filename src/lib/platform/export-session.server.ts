import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Writable } from 'node:stream';

import * as Sentry from '@sentry/sveltekit';
import { createReadableStream } from '@sveltejs/kit/node';

import {
	exportSessionUploadCeilingBytes,
	findExportConcurrencyRejection,
	findExportControlDocumentRejection,
	findExportEnvelopeRejection,
	findExportFrameBytesRejection,
	findExportOutputRejection,
	findExportSessionExpiryRejection,
	type PublicExportLimitRejection
} from '$lib/platform/public-export-limits';
import {
	parsePublicRuntimeConfig,
	PUBLIC_EXPORT_RUNTIME_LIMITS,
	type PublicExportRuntimeLimits
} from '$lib/platform/public-runtime-contract';
import {
	dropTimecodeToFrames,
	formatFrameRateRational,
	isDropTimecode,
	isNonDropTimecode,
	resolveFrameRate,
	type FrameRate
} from '$lib/utils/composition-timing';
import {
	isSweptExportDirectoryName,
	type SweptExportDirectoryPrefix
} from '$lib/utils/legacy-supers-compatibility';

export type ExportSessionFormat = 'webm' | 'prores';

export interface ExportSessionRequest {
	format: ExportSessionFormat;
	fps: number;
	frameCount: number;
	opaque: boolean;
	audioBytes: number;
	startTimecode?: string;
}

export interface CreatedExportSession {
	sessionId: string;
	audioUrl: string;
	frameUrlTemplate: string;
	completeUrl: string;
	cancelUrl: string;
}

export interface CompletedExportSession {
	downloadUrl: string;
}

interface ExportEncoder {
	child: ChildProcessWithoutNullStreams;
	exit: Promise<number>;
	hasExited: boolean;
	stderrTail: string;
}

interface ExportSession {
	id: string;
	request: ExportSessionRequest;
	rate: FrameRate;
	workDir: string;
	audioPath: string;
	outputPath: string;
	nextFrame: number;
	hasAudio: boolean;
	isBusy: boolean;
	status: 'created' | 'encoding' | 'ready' | 'downloading';
	encoder: ExportEncoder | null;
	abortController: AbortController;
	createdAt: number;
	lastActiveAt: number;
	/** Audio plus frame bytes this session has ingested, against its ceiling. */
	uploadedBytes: number;
	uploadCeilingBytes: number;
	idleTimer: ReturnType<typeof setTimeout> | null;
	lifetimeTimer: ReturnType<typeof setTimeout> | null;
	cleanupPromise: Promise<void> | null;
	encodeStartedAt: number | null;
}

interface ExportSessionStoreOptions {
	temporaryDirectory?: string;
	ffmpegPath?: string;
	ttlMs?: number;
	maxLifetimeMs?: number;
	maxConcurrentSessions?: number;
	/** Envelope to admit against. Shrink it to exercise a bound in a fixture. */
	limits?: PublicExportRuntimeLimits;
	now?: () => number;
	spawnEncoder?: typeof spawn;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
/**
 * The prefix this build's private export work directories are created under.
 * The sweep below matches every prefix in `SWEPT_EXPORT_DIRECTORY_PREFIXES`,
 * not just this one, so a deploy or rollback across the ADR-0053 namespace
 * rename cannot orphan the previous release's directories.
 */
const EXPORT_DIRECTORY_PREFIX = 'gfx-export-' satisfies SweptExportDirectoryPrefix;

export class ExportSessionError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'ExportSessionError';
	}
}

/** Carry a refused public bound out over the export transport unchanged. */
function limitError(rejection: PublicExportLimitRejection): ExportSessionError {
	return new ExportSessionError(rejection.status, rejection.message);
}

function readFiniteNumber(record: Record<string, unknown>, key: string): number {
	const value = record[key];
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new ExportSessionError(400, `Expected ${key} to be a finite number.`);
	}
	return value;
}

/** Parse the small JSON control document before allocating a session. */
export function parseExportSessionRequest(value: unknown): ExportSessionRequest {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new ExportSessionError(400, 'Expected an export session object.');
	}
	const record = value as Record<string, unknown>;
	const format = record.format;
	if (format !== 'webm' && format !== 'prores') {
		throw new ExportSessionError(400, 'Expected format to be webm or prores.');
	}
	const fps = readFiniteNumber(record, 'fps');
	try {
		resolveFrameRate(fps);
	} catch (cause) {
		throw new ExportSessionError(
			400,
			cause instanceof Error ? cause.message : 'Unsupported fps.'
		);
	}
	// Shape only — every ceiling belongs to the public envelope, which
	// `ExportSessionStore.create` applies to the parsed request.
	const frameCount = readFiniteNumber(record, 'frameCount');
	if (!Number.isInteger(frameCount) || frameCount < 1) {
		throw new ExportSessionError(400, 'Expected frameCount to be a positive integer.');
	}
	const audioBytes = readFiniteNumber(record, 'audioBytes');
	if (!Number.isSafeInteger(audioBytes) || audioBytes < 0) {
		throw new ExportSessionError(400, 'Expected audioBytes to be a non-negative safe integer.');
	}
	if (typeof record.opaque !== 'boolean') {
		throw new ExportSessionError(400, 'Expected opaque to be a boolean.');
	}
	const startTimecode = record.startTimecode;
	if (startTimecode !== undefined) {
		if (format !== 'prores') {
			throw new ExportSessionError(400, 'A start timecode requires the ProRes format.');
		}
		if (typeof startTimecode !== 'string') {
			throw new ExportSessionError(400, 'Expected an HH:MM:SS:FF or HH:MM:SS;FF start timecode.');
		}
		if (isDropTimecode(startTimecode)) {
			// DF is only defined at 29.97/59.94 and its first minute labels don't
			// all exist — the conversion validates both before ffmpeg sees the TC.
			try {
				dropTimecodeToFrames(startTimecode, resolveFrameRate(fps));
			} catch (cause) {
				throw new ExportSessionError(
					400,
					cause instanceof Error ? cause.message : 'Invalid drop-frame start timecode.'
				);
			}
		} else if (!isNonDropTimecode(startTimecode)) {
			throw new ExportSessionError(400, 'Expected an HH:MM:SS:FF or HH:MM:SS;FF start timecode.');
		}
	}
	return { format, fps, frameCount, opaque: record.opaque, audioBytes, startTimecode };
}

export function parseExportFrameIndex(value: string): number {
	if (!/^(0|[1-9]\d*)$/.test(value)) {
		throw new ExportSessionError(400, `Invalid export frame index "${value}".`);
	}
	const frame = Number(value);
	if (!Number.isSafeInteger(frame)) {
		throw new ExportSessionError(400, `Invalid export frame index "${value}".`);
	}
	return frame;
}

export function hasPngSignature(bytes: Uint8Array): boolean {
	return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function contentLength(request: Request): number | null {
	const header = request.headers.get('content-length');
	if (header === null) return null;
	const value = Number(header);
	return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function abortError(signal: AbortSignal): Error {
	return signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
}

async function writeWithBackpressure(
	writable: Writable,
	chunk: Uint8Array,
	signal: AbortSignal
): Promise<void> {
	signal.throwIfAborted();
	await new Promise<void>((resolve, reject) => {
		let isSettled = false;
		const settle = (error?: Error | null): void => {
			if (isSettled) return;
			isSettled = true;
			signal.removeEventListener('abort', handleAbort);
			if (error) reject(error);
			else resolve();
		};
		const handleAbort = (): void => settle(abortError(signal));
		signal.addEventListener('abort', handleAbort, { once: true });
		writable.write(chunk, (error) => settle(error));
	});
}

async function finishWritable(writable: Writable, signal: AbortSignal): Promise<void> {
	signal.throwIfAborted();
	await new Promise<void>((resolve, reject) => {
		let isSettled = false;
		const settle = (error?: Error): void => {
			if (isSettled) return;
			isSettled = true;
			writable.off('error', handleError);
			writable.off('finish', handleFinish);
			signal.removeEventListener('abort', handleAbort);
			if (error) reject(error);
			else resolve();
		};
		const handleError = (error: Error): void => settle(error);
		const handleFinish = (): void => settle();
		const handleAbort = (): void => settle(abortError(signal));
		writable.once('error', handleError);
		writable.once('finish', handleFinish);
		signal.addEventListener('abort', handleAbort, { once: true });
		writable.end();
	});
}

async function streamRequestBody(options: {
	body: ReadableStream<Uint8Array>;
	writable: Writable;
	signal: AbortSignal;
	expectedBytes?: number;
	/** Applied to the running byte count, so a lying Content-Length is cut off here. */
	findOverflow?: (receivedBytes: number) => PublicExportLimitRejection | null;
	requirePngSignature?: boolean;
}): Promise<number> {
	const { body, writable, signal, expectedBytes, findOverflow, requirePngSignature } = options;
	const reader = body.getReader();
	let received = 0;
	let signature = new Uint8Array(0);
	let didFinish = false;
	const handleAbort = (): void => {
		void reader.cancel(signal.reason).catch(() => undefined);
	};
	signal.addEventListener('abort', handleAbort, { once: true });
	try {
		while (true) {
			signal.throwIfAborted();
			const { done, value } = await reader.read();
			if (done) break;
			received += value.byteLength;
			if (expectedBytes !== undefined && received > expectedBytes) {
				throw new ExportSessionError(413, 'Export upload exceeded its declared byte length.');
			}
			const overflow = findOverflow?.(received);
			if (overflow) throw limitError(overflow);
			if (requirePngSignature && signature.byteLength < PNG_SIGNATURE.byteLength) {
				const required = PNG_SIGNATURE.byteLength - signature.byteLength;
				const consumed = Math.min(required, value.byteLength);
				const next = new Uint8Array(signature.byteLength + consumed);
				next.set(signature);
				next.set(value.subarray(0, consumed), signature.byteLength);
				signature = next;
				if (signature.byteLength < PNG_SIGNATURE.byteLength) continue;
				if (!hasPngSignature(signature)) {
					throw new ExportSessionError(415, 'Export frame body is not a PNG image.');
				}
				await writeWithBackpressure(writable, signature, signal);
				if (consumed < value.byteLength) {
					await writeWithBackpressure(writable, value.subarray(consumed), signal);
				}
				continue;
			}
			await writeWithBackpressure(writable, value, signal);
		}
		signal.throwIfAborted();
		if (requirePngSignature && signature.byteLength < PNG_SIGNATURE.byteLength) {
			throw new ExportSessionError(415, 'Export frame body is not a PNG image.');
		}
		if (expectedBytes !== undefined && received !== expectedBytes) {
			throw new ExportSessionError(
				400,
				`Export upload ended at ${received} bytes; expected ${expectedBytes}.`
			);
		}
		didFinish = true;
		return received;
	} finally {
		signal.removeEventListener('abort', handleAbort);
		if (!didFinish) await reader.cancel(signal.reason).catch(() => undefined);
		reader.releaseLock();
	}
}

function outputDetails(format: ExportSessionFormat): {
	filename: string;
	contentType: string;
} {
	return format === 'webm'
		? { filename: 'output.webm', contentType: 'video/webm' }
		: { filename: 'output.mov', contentType: 'video/quicktime' };
}

/**
 * Shape and cost of a requested export — never content, filenames, paths, or
 * session identities. Every key must stay inside
 * `PUBLIC_EXPORT_TELEMETRY_ATTRIBUTE_KEYS` (ADR-0052).
 */
export function exportSessionRequestTelemetry(
	request: ExportSessionRequest
): Record<string, string | number | boolean> {
	return {
		'export.format': request.format,
		'export.fps': formatFrameRateRational(resolveFrameRate(request.fps)),
		'export.frames': request.frameCount,
		'export.audio_bytes': request.audioBytes,
		'export.opaque': request.opaque,
		'export.has_timecode': request.startTimecode !== undefined
	};
}

/** Encode cost of a finished export, under the same redaction rule. */
export function exportSessionEncodeTelemetry(
	encodeMs: number,
	outputBytes: number
): Record<string, number> {
	return { 'export.ffmpeg_ms': encodeMs, 'export.output_bytes': outputBytes };
}

export class ExportSessionStore {
	readonly #sessions = new Map<string, ExportSession>();
	readonly #temporaryDirectory: string;
	readonly #ffmpegPath: string;
	readonly #ttlMs: number;
	readonly #maxLifetimeMs: number;
	readonly #maxConcurrentSessions: number;
	readonly #limits: PublicExportRuntimeLimits;
	readonly #now: () => number;
	readonly #spawnEncoder: typeof spawn;

	constructor(options: ExportSessionStoreOptions = {}) {
		const runtime = parsePublicRuntimeConfig(process.env);
		this.#temporaryDirectory =
			options.temporaryDirectory ?? runtime.exportTemporaryDirectory ?? tmpdir();
		this.#ffmpegPath = options.ffmpegPath ?? runtime.ffmpegPath;
		this.#limits = options.limits ?? PUBLIC_EXPORT_RUNTIME_LIMITS;
		this.#ttlMs = options.ttlMs ?? runtime.exportSessionIdleTimeoutMs;
		this.#maxLifetimeMs = options.maxLifetimeMs ?? this.#limits.sessionMaxLifetimeMs;
		this.#maxConcurrentSessions =
			options.maxConcurrentSessions ?? runtime.maxConcurrentExportSessions;
		this.#now = options.now ?? Date.now;
		this.#spawnEncoder = options.spawnEncoder ?? spawn;
	}

	/**
	 * Admit one export session, or refuse it. Every bound is decided here —
	 * transport shape, the public envelope, then a free concurrency slot — so
	 * nothing that will be refused ever reaches ffmpeg or the filesystem. The
	 * slot is claimed in the same tick it is checked, so two callers racing for
	 * the last one cannot both win it.
	 */
	async create(request: Request): Promise<CreatedExportSession> {
		if (request.headers.get('content-type')?.split(';', 1)[0] !== 'application/json') {
			throw new ExportSessionError(415, 'Expected application/json export session metadata.');
		}
		const declaredLength = contentLength(request);
		const oversizedDocument = findExportControlDocumentRejection(declaredLength);
		if (oversizedDocument) throw limitError(oversizedDocument);

		let document: unknown;
		try {
			document = await request.json();
		} catch {
			throw new ExportSessionError(400, 'Export session metadata is not valid JSON.');
		}
		const parsed = parseExportSessionRequest(document);
		const overEnvelope = findExportEnvelopeRejection(parsed, this.#limits);
		if (overEnvelope) throw limitError(overEnvelope);

		await this.cleanupStale();
		const saturated = findExportConcurrencyRejection(
			this.#sessions.size,
			this.#maxConcurrentSessions
		);
		if (saturated) throw limitError(saturated);

		Sentry.getActiveSpan()?.setAttributes(exportSessionRequestTelemetry(parsed));
		const id = randomUUID();
		const workDir = join(this.#temporaryDirectory, `${EXPORT_DIRECTORY_PREFIX}${id}`);
		const details = outputDetails(parsed.format);
		const now = this.#now();
		const session: ExportSession = {
			id,
			request: parsed,
			rate: resolveFrameRate(parsed.fps),
			workDir,
			audioPath: join(workDir, 'mix.wav'),
			outputPath: join(workDir, details.filename),
			nextFrame: 0,
			hasAudio: false,
			isBusy: false,
			status: 'created',
			encoder: null,
			abortController: new AbortController(),
			createdAt: now,
			lastActiveAt: now,
			uploadedBytes: 0,
			uploadCeilingBytes: exportSessionUploadCeilingBytes(parsed, this.#limits),
			idleTimer: null,
			lifetimeTimer: null,
			cleanupPromise: null,
			encodeStartedAt: null
		};
		this.#sessions.set(id, session);
		try {
			await mkdir(workDir, { recursive: false });
		} catch (cause) {
			this.#sessions.delete(id);
			throw cause;
		}
		this.#touch(session);
		session.lifetimeTimer = this.#scheduleSweep(this.#maxLifetimeMs);
		const root = `/api/export/sessions/${id}`;
		return {
			sessionId: id,
			audioUrl: `${root}/audio`,
			frameUrlTemplate: `${root}/frames/{frame}`,
			completeUrl: `${root}/complete`,
			cancelUrl: root
		};
	}

	async uploadAudio(id: string, request: Request): Promise<void> {
		const session = await this.#get(id);
		if (session.request.audioBytes === 0) {
			throw new ExportSessionError(409, 'This export session has no audio upload.');
		}
		if (session.hasAudio || session.encoder || session.isBusy) {
			throw new ExportSessionError(409, 'Export audio was already uploaded or encoding started.');
		}
		if (request.headers.get('content-type')?.split(';', 1)[0] !== 'audio/wav') {
			await this.#fail(session);
			throw new ExportSessionError(415, 'Expected audio/wav export audio.');
		}
		if (!request.body) {
			await this.#fail(session);
			throw new ExportSessionError(400, 'Missing export audio body.');
		}
		const declaredLength = contentLength(request);
		if (declaredLength !== null && declaredLength !== session.request.audioBytes) {
			await this.#fail(session);
			throw new ExportSessionError(400, 'Export audio Content-Length does not match audioBytes.');
		}

		session.isBusy = true;
		this.#touch(session);
		const file = createWriteStream(session.audioPath, { flags: 'wx' });
		const signal = AbortSignal.any([session.abortController.signal, request.signal]);
		try {
			session.uploadedBytes += await streamRequestBody({
				body: request.body,
				writable: file,
				signal,
				expectedBytes: session.request.audioBytes
			});
			await finishWritable(file, signal);
			session.hasAudio = true;
		} catch (cause) {
			file.destroy();
			await this.#fail(session);
			throw cause;
		} finally {
			session.isBusy = false;
		}
	}

	async uploadFrame(id: string, frame: number, request: Request): Promise<void> {
		const session = await this.#get(id);
		if (session.status === 'ready' || session.status === 'downloading') {
			throw new ExportSessionError(409, 'Export encoding is already complete.');
		}
		if (session.isBusy) {
			throw new ExportSessionError(409, 'Another export upload is still being encoded.');
		}
		if (frame !== session.nextFrame) {
			throw new ExportSessionError(
				409,
				`Expected export frame ${session.nextFrame}, received ${frame}.`
			);
		}
		if (frame >= session.request.frameCount) {
			throw new ExportSessionError(409, `Export expects ${session.request.frameCount} frames.`);
		}
		if (session.request.audioBytes > 0 && !session.hasAudio) {
			throw new ExportSessionError(409, 'Upload export audio before the first frame.');
		}
		if (request.headers.get('content-type')?.split(';', 1)[0] !== 'image/png') {
			await this.#fail(session);
			throw new ExportSessionError(415, 'Expected an image/png export frame.');
		}
		if (!request.body) {
			await this.#fail(session);
			throw new ExportSessionError(400, 'Missing export frame body.');
		}
		const declaredLength = contentLength(request);
		if (declaredLength !== null && declaredLength < PNG_SIGNATURE.byteLength) {
			await this.#fail(session);
			throw new ExportSessionError(400, 'Export frame Content-Length is shorter than a PNG header.');
		}
		// Refuse an over-limit frame from its declared length, before the encoder
		// is spawned and before a byte of the body is read.
		const declaredOverflow =
			declaredLength === null
				? null
				: findExportFrameBytesRejection(declaredLength, session, this.#limits);
		if (declaredOverflow) {
			await this.#fail(session);
			throw limitError(declaredOverflow);
		}

		session.isBusy = true;
		this.#touch(session);
		try {
			const encoder = session.encoder ?? this.#startEncoder(session);
			const signal = AbortSignal.any([session.abortController.signal, request.signal]);
			session.uploadedBytes += await streamRequestBody({
				body: request.body,
				writable: encoder.child.stdin,
				signal,
				findOverflow: (receivedBytes) =>
					findExportFrameBytesRejection(receivedBytes, session, this.#limits),
				requirePngSignature: true
			});
			session.nextFrame += 1;
			session.status = 'encoding';
		} catch (cause) {
			await this.#fail(session);
			throw cause;
		} finally {
			session.isBusy = false;
		}
	}

	async complete(id: string): Promise<CompletedExportSession> {
		const session = await this.#get(id);
		if (session.isBusy) {
			throw new ExportSessionError(409, 'An export upload is still being encoded.');
		}
		if (session.nextFrame !== session.request.frameCount) {
			throw new ExportSessionError(
				409,
				`Export is missing frames: received ${session.nextFrame} of ${session.request.frameCount}.`
			);
		}
		if (!session.encoder) {
			throw new ExportSessionError(409, 'Export encoder did not start.');
		}
		session.isBusy = true;
		this.#touch(session);
		try {
			const encoder = session.encoder;
			await finishWritable(encoder.child.stdin, session.abortController.signal);
			const code = await encoder.exit;
			if (code !== 0) {
				throw new ExportSessionError(
					500,
					encoder.stderrTail.trim() || `ffmpeg exited with code ${code}.`
				);
			}
			const output = await stat(session.outputPath);
			if (!output.isFile() || output.size === 0) {
				throw new ExportSessionError(500, 'ffmpeg did not produce an export output.');
			}
			const oversizedOutput = findExportOutputRejection(output.size, this.#limits);
			if (oversizedOutput) throw limitError(oversizedOutput);
			Sentry.getActiveSpan()?.setAttributes(
				exportSessionEncodeTelemetry(
					session.encodeStartedAt ? Date.now() - session.encodeStartedAt : 0,
					output.size
				)
			);
			session.status = 'ready';
			return { downloadUrl: `/api/export/sessions/${id}/output` };
		} catch (cause) {
			await this.#fail(session);
			throw cause;
		} finally {
			session.isBusy = false;
		}
	}

	async outputResponse(id: string, requestSignal?: AbortSignal): Promise<Response> {
		const session = await this.#get(id);
		if (session.status !== 'ready') {
			throw new ExportSessionError(409, 'Export output is not ready.');
		}
		session.status = 'downloading';
		if (session.idleTimer) clearTimeout(session.idleTimer);
		session.idleTimer = null;
		const output = await stat(session.outputPath);
		const source = createReadableStream(session.outputPath);
		const reader = source.getReader();
		let isCleaned = false;
		const cleanup = async (): Promise<void> => {
			if (isCleaned) return;
			isCleaned = true;
			requestSignal?.removeEventListener('abort', handleAbort);
			await this.cancel(id);
		};
		const handleAbort = (): void => {
			void Promise.all([
				reader.cancel(requestSignal?.reason).catch(() => undefined),
				cleanup()
			]);
		};
		requestSignal?.addEventListener('abort', handleAbort, { once: true });
		const body = new ReadableStream<Uint8Array>({
			pull: async (controller) => {
				try {
					const chunk = await reader.read();
					if (chunk.done) {
						await cleanup();
						controller.close();
					} else {
						controller.enqueue(chunk.value);
					}
				} catch (cause) {
					controller.error(cause);
					await cleanup();
				}
			},
			cancel: async (reason) => {
				await Promise.all([reader.cancel(reason).catch(() => undefined), cleanup()]);
			}
		});
		return new Response(body, {
			headers: {
				'Cache-Control': 'no-store',
				'Content-Length': String(output.size),
				'Content-Type': outputDetails(session.request.format).contentType
			}
		});
	}

	async cancel(id: string): Promise<void> {
		const session = this.#sessions.get(id);
		if (!session) return;
		await this.#dispose(session);
	}

	/**
	 * Remove every session that outlived a clock. A draining download is exempt
	 * from the idle timeout — it is active by definition — but not from the hard
	 * lifetime, which exists precisely to end a transfer that never finishes.
	 */
	async cleanupStale(now = this.#now()): Promise<number> {
		const stale = [...this.#sessions.values()].filter((session) =>
			session.status === 'downloading'
				? now - session.createdAt >= this.#maxLifetimeMs
				: this.#findExpiry(session, now) !== null
		);
		await Promise.all(stale.map((session) => this.#dispose(session)));
		return stale.length;
	}

	#startEncoder(session: ExportSession): ExportEncoder {
		const args = this.#ffmpegArguments(session);
		const child = this.#spawnEncoder(this.#ffmpegPath, args);
		session.encodeStartedAt = Date.now();
		const encoder: ExportEncoder = {
			child,
			exit: Promise.resolve(0),
			hasExited: false,
			stderrTail: ''
		};
		child.stderr.on('data', (chunk: Buffer | string) => {
			encoder.stderrTail = `${encoder.stderrTail}${chunk.toString()}`.slice(-2000);
		});
		encoder.exit = new Promise<number>((resolve) => {
			let isSettled = false;
			const settle = (code: number): void => {
				if (isSettled) return;
				isSettled = true;
				resolve(code);
			};
			child.once('error', (error) => {
				encoder.stderrTail = `${encoder.stderrTail}${error.message}`.slice(-2000);
				settle(1);
			});
			child.once('close', (code) => settle(code ?? 1));
		}).finally(() => {
			encoder.hasExited = true;
		});
		session.encoder = encoder;
		return encoder;
	}

	#ffmpegArguments(session: ExportSession): string[] {
		const { format, opaque, startTimecode, audioBytes } = session.request;
		const audioArguments =
			audioBytes > 0
				? format === 'webm'
					? ['-i', session.audioPath, '-map', '0:v', '-map', '1:a', '-c:a', 'libopus']
					: ['-i', session.audioPath, '-map', '0:v', '-map', '1:a', '-c:a', 'pcm_s16le']
				: [];
		const codecArguments =
			format === 'webm'
				? [
						'-c:v',
						'libvpx-vp9',
						'-lossless',
						'1',
						'-pix_fmt',
						opaque ? 'yuv444p' : 'yuva420p',
						'-auto-alt-ref',
						'0'
					]
				: [
						'-c:v',
						'prores_ks',
						'-profile:v',
						'4444',
						'-pix_fmt',
						'yuva444p10le',
						'-vendor',
						'apl0',
						...(startTimecode ? ['-timecode', startTimecode] : [])
					];
		return [
			'-y',
			'-hide_banner',
			'-loglevel',
			'error',
			'-f',
			'image2pipe',
			'-framerate',
			formatFrameRateRational(session.rate),
			'-c:v',
			'png',
			'-i',
			'pipe:0',
			...audioArguments,
			...codecArguments,
			session.outputPath
		];
	}

	/**
	 * Resolve a live session, removing it first if either clock has run out — so
	 * an expired session answers 410 with its reason rather than a bare 404 from
	 * a sweep that has not fired yet.
	 */
	async #get(id: string): Promise<ExportSession> {
		const session = this.#sessions.get(id);
		if (!session) throw new ExportSessionError(404, 'Export session not found.');
		const expired = this.#findExpiry(session, this.#now());
		if (expired) {
			await this.#dispose(session);
			throw limitError(expired);
		}
		return session;
	}

	#findExpiry(session: ExportSession, now: number): PublicExportLimitRejection | null {
		return findExportSessionExpiryRejection({
			idleMs: now - session.lastActiveAt,
			ageMs: now - session.createdAt,
			idleTimeoutMs: this.#ttlMs,
			maxLifetimeMs: this.#maxLifetimeMs
		});
	}

	#scheduleSweep(delayMs: number): ReturnType<typeof setTimeout> {
		const timer = setTimeout(() => {
			void this.cleanupStale().catch((error) =>
				console.error('Export session cleanup failed.', error)
			);
		}, delayMs);
		timer.unref();
		return timer;
	}

	#touch(session: ExportSession): void {
		session.lastActiveAt = this.#now();
		if (session.idleTimer) clearTimeout(session.idleTimer);
		session.idleTimer = this.#scheduleSweep(this.#ttlMs);
	}

	async #fail(session: ExportSession): Promise<void> {
		await this.#dispose(session);
	}

	async #dispose(session: ExportSession): Promise<void> {
		if (session.cleanupPromise) return session.cleanupPromise;
		session.cleanupPromise = (async () => {
			this.#sessions.delete(session.id);
			if (session.idleTimer) clearTimeout(session.idleTimer);
			if (session.lifetimeTimer) clearTimeout(session.lifetimeTimer);
			session.abortController.abort(new DOMException('Export session cancelled.', 'AbortError'));
			const encoder = session.encoder;
			if (encoder && !encoder.hasExited) {
				encoder.child.stdin.destroy();
				encoder.child.kill('SIGKILL');
				const timeout = new Promise<void>((resolve) => {
					const timer = setTimeout(resolve, 2_000);
					timer.unref();
				});
				await Promise.race([encoder.exit.then(() => undefined).catch(() => undefined), timeout]);
			}
			await rm(session.workDir, { recursive: true, force: true });
		})();
		return session.cleanupPromise;
	}
}

/**
 * Remove abandoned directories left by a terminated server process — under
 * every namespace's export prefix, so the release being replaced leaves nothing
 * behind whichever spelling it wrote (ADR-0052 retention, ADR-0053 matrix).
 */
export async function cleanupOrphanedExportDirectories(
	temporaryDirectory = tmpdir(),
	olderThanMs = PUBLIC_EXPORT_RUNTIME_LIMITS.sessionIdleTimeoutMs,
	now = Date.now()
): Promise<number> {
	let entries;
	try {
		entries = await readdir(temporaryDirectory, { withFileTypes: true });
	} catch {
		return 0;
	}
	const stalePaths: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !isSweptExportDirectoryName(entry.name)) continue;
		const path = join(temporaryDirectory, basename(entry.name));
		try {
			if (now - (await stat(path)).mtimeMs >= olderThanMs) stalePaths.push(path);
		} catch {
			// Another cleanup may have won the race.
		}
	}
	await Promise.all(stalePaths.map((path) => rm(path, { recursive: true, force: true })));
	return stalePaths.length;
}

export const exportSessionStore = new ExportSessionStore();
{
	// Startup sweep in the configured temp location, so a restarted host inherits
	// no output from the process it replaced (ADR-0052).
	const runtime = parsePublicRuntimeConfig(process.env);
	void cleanupOrphanedExportDirectories(
		runtime.exportTemporaryDirectory ?? tmpdir(),
		runtime.exportSessionIdleTimeoutMs
	).catch((error) => console.error('Orphaned export directory cleanup failed.', error));
}
