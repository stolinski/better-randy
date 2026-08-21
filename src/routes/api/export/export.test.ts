import assert from 'node:assert/strict';
import type { ChildProcessWithoutNullStreams, spawn as nodeSpawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { afterEach, describe, it } from 'vitest';

import {
	cleanupOrphanedExportDirectories,
	ExportSessionError,
	ExportSessionStore,
	hasPngSignature,
	parseExportFrameIndex,
	parseExportSessionRequest
} from '$lib/platform/export-session.server';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
	);
});

interface FakeEncoderOptions {
	exitCode?: number;
	stderr?: string;
	createInput?: () => Writable;
}

interface FakeEncoderHarness {
	spawnEncoder: typeof nodeSpawn;
	spawnedArguments: string[][];
	children: FakeEncoderProcess[];
}

class FakeEncoderProcess extends EventEmitter {
	readonly stdin: Writable;
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	killed = false;

	constructor(
		outputPath: string,
		options: FakeEncoderOptions
	) {
		super();
		this.stdin = options.createInput?.() ?? new Writable({ write: (_chunk, _encoding, done) => done() });
		this.stdin.once('finish', () => {
			void (async () => {
				if ((options.exitCode ?? 0) === 0) await writeFile(outputPath, 'encoded-video');
				if (options.stderr) this.stderr.write(options.stderr);
				this.stderr.end();
				this.emit('close', options.exitCode ?? 0, null);
			})();
		});
	}

	kill(signal?: NodeJS.Signals | number): boolean {
		if (this.killed) return false;
		this.killed = true;
		this.stdin.destroy();
		queueMicrotask(() => this.emit('close', null, signal ?? 'SIGTERM'));
		return true;
	}
}

function createFakeEncoder(options: FakeEncoderOptions = {}): FakeEncoderHarness {
	const spawnedArguments: string[][] = [];
	const children: FakeEncoderProcess[] = [];
	const spawnEncoder = ((_command: string, args?: readonly string[]) => {
		const normalized = [...(args ?? [])];
		spawnedArguments.push(normalized);
		const outputPath = normalized.at(-1);
		assert.ok(outputPath);
		const child = new FakeEncoderProcess(outputPath, options);
		children.push(child);
		return child as unknown as ChildProcessWithoutNullStreams;
	}) as typeof nodeSpawn;
	return { spawnEncoder, spawnedArguments, children };
}

async function createStore(
	options: FakeEncoderOptions = {},
	storeOptions: { ttlMs?: number; now?: () => number } = {}
): Promise<{ store: ExportSessionStore; directory: string; encoder: FakeEncoderHarness }> {
	const directory = await mkdtemp(join(tmpdir(), 'supers-export-test-'));
	temporaryDirectories.push(directory);
	const encoder = createFakeEncoder(options);
	return {
		directory,
		encoder,
		store: new ExportSessionStore({
			temporaryDirectory: directory,
			spawnEncoder: encoder.spawnEncoder,
			ttlMs: storeOptions.ttlMs,
			now: storeOptions.now
		})
	};
}

function frameRequest(signal?: AbortSignal, type = 'image/png'): Request {
	return new Request('http://localhost/frame', {
		method: 'PUT',
		headers: { 'Content-Type': type },
		body: new Blob([PNG], { type }),
		signal
	});
}

function audioRequest(bytes: Uint8Array): Request {
	return new Request('http://localhost/audio', {
		method: 'PUT',
		headers: { 'Content-Type': 'audio/wav' },
		body: new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' })
	});
}

function optionValue(args: string[], option: string): string | undefined {
	const index = args.indexOf(option);
	return index >= 0 ? args[index + 1] : undefined;
}

describe('export session protocol parsing', () => {
	it('accepts exact rational transport metadata and PNG framing', () => {
		assert.deepEqual(
			parseExportSessionRequest({
				format: 'prores',
				fps: 29.97,
				frameCount: 300,
				opaque: true,
				audioBytes: 44,
				startTimecode: '01:00:08:00'
			}),
			{
				format: 'prores',
				fps: 29.97,
				frameCount: 300,
				opaque: true,
				audioBytes: 44,
				startTimecode: '01:00:08:00'
			}
		);
		assert.equal(parseExportFrameIndex('0'), 0);
		assert.equal(hasPngSignature(PNG), true);
	});

	it('accepts a drop-frame start timecode at 29.97', () => {
		const request = parseExportSessionRequest({
			format: 'prores',
			fps: 29.97,
			frameCount: 300,
			opaque: false,
			audioBytes: 0,
			startTimecode: '01:00:00;00'
		});
		assert.equal(request.startTimecode, '01:00:00;00');
	});

	it('rejects drop-frame timecode at non-drop rates and nonexistent DF labels', () => {
		const base = { format: 'prores', frameCount: 300, opaque: false, audioBytes: 0 };
		assert.throws(
			() => parseExportSessionRequest({ ...base, fps: 30, startTimecode: '01:00:00;00' }),
			/only defined for 29\.97/
		);
		// 00:01:00;00 is a dropped label — it does not exist at 29.97 DF.
		assert.throws(
			() => parseExportSessionRequest({ ...base, fps: 29.97, startTimecode: '00:01:00;00' }),
			/dropped label/
		);
		assert.throws(
			() => parseExportSessionRequest({ ...base, fps: 29.97, startTimecode: '01;00;00;00' }),
			/HH:MM:SS:FF or HH:MM:SS;FF/
		);
	});

	it('rejects malformed counts, indexes, rates, and WebM timecode', () => {
		assert.throws(
			() =>
				parseExportSessionRequest({
					format: 'webm',
					fps: 29.9,
					frameCount: 0,
					opaque: false,
					audioBytes: 0
				}),
			ExportSessionError
		);
		assert.throws(() => parseExportFrameIndex('01'), ExportSessionError);
		assert.throws(
			() =>
				parseExportSessionRequest({
					format: 'webm',
					fps: 30,
					frameCount: 1,
					opaque: false,
					audioBytes: 0,
					startTimecode: '01:00:00:00'
				}),
			/A start timecode requires/
		);
	});
});

describe('export session encoding', () => {
	it('enforces ordered frame acknowledgements and rejects completion with missing frames', async () => {
		const { store, directory } = await createStore();
		const session = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 2,
			opaque: false,
			audioBytes: 0
		});
		await assert.rejects(() => store.uploadFrame(session.sessionId, 1, frameRequest()), /Expected export frame 0/);
		await store.uploadFrame(session.sessionId, 0, frameRequest());
		await assert.rejects(() => store.complete(session.sessionId), /received 1 of 2/);
		await assert.rejects(() => store.outputResponse(session.sessionId), /not ready/);
		await store.uploadFrame(session.sessionId, 1, frameRequest());
		const completed = await store.complete(session.sessionId);
		assert.match(completed.downloadUrl, new RegExp(session.sessionId));
		const response = await store.outputResponse(session.sessionId);
		assert.equal(response.headers.get('content-type'), 'video/webm');
		assert.equal(response.headers.get('content-length'), String('encoded-video'.length));
		assert.equal(await response.text(), 'encoded-video');
		assert.deepEqual(await readdir(directory), []);
	});

	it('rejects invalid frame content and removes the unusable session', async () => {
		const { store, directory } = await createStore();
		const session = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		await assert.rejects(
			() => store.uploadFrame(session.sessionId, 0, frameRequest(undefined, 'image/jpeg')),
			/Expected an image\/png/
		);
		assert.deepEqual(await readdir(directory), []);

		const malformed = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		const malformedRequest = new Request('http://localhost/frame', {
			method: 'PUT',
			headers: { 'Content-Type': 'image/png' },
			body: new Blob(['not a png'], { type: 'image/png' })
		});
		await assert.rejects(
			() => store.uploadFrame(malformed.sessionId, 0, malformedRequest),
			/not a PNG image/
		);
		assert.deepEqual(await readdir(directory), []);
	});

	it('does not acknowledge a frame until the encoder write callback applies backpressure', async () => {
		let releaseWrite = (): void => undefined;
		let isReleased = false;
		let markWriteStarted = (): void => undefined;
		const writeStarted = new Promise<void>((resolve) => {
			markWriteStarted = resolve;
		});
		const { store } = await createStore({
			createInput: () =>
				new Writable({
					highWaterMark: 1,
					write: (_chunk, _encoding, done) => {
						markWriteStarted();
						if (isReleased) done();
						else {
							releaseWrite = () => {
								isReleased = true;
								done();
							};
						}
					}
				})
		});
		const session = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		let didResolve = false;
		const upload = store.uploadFrame(session.sessionId, 0, frameRequest()).then(() => {
			didResolve = true;
		});
		await writeStarted;
		assert.equal(didResolve, false);
		releaseWrite();
		await upload;
		assert.equal(didResolve, true);
		await store.cancel(session.sessionId);
	});

	it('streams audio once before frames and maps it to the encoder', async () => {
		const { store, encoder } = await createStore();
		const wav = new Uint8Array([82, 73, 70, 70]);
		const session = await store.create({
			format: 'prores',
			fps: 24,
			frameCount: 1,
			opaque: true,
			audioBytes: wav.byteLength
		});
		await assert.rejects(() => store.uploadFrame(session.sessionId, 0, frameRequest()), /Upload export audio/);
		await store.uploadAudio(session.sessionId, audioRequest(wav));
		await assert.rejects(() => store.uploadAudio(session.sessionId, audioRequest(wav)), /already uploaded/);
		await store.uploadFrame(session.sessionId, 0, frameRequest());
		await store.complete(session.sessionId);
		assert.ok(encoder.spawnedArguments[0].includes('pcm_s16le'));
		assert.ok(encoder.spawnedArguments[0].some((value) => value.endsWith('/mix.wav')));
		await store.cancel(session.sessionId);
	});

	it.each([
		{ format: 'webm' as const, opaque: false, pixelFormat: 'yuva420p' },
		{ format: 'webm' as const, opaque: true, pixelFormat: 'yuv444p' },
		{ format: 'prores' as const, opaque: true, pixelFormat: 'yuva444p10le' }
	])('preserves $format codec output with $pixelFormat', async ({ format, opaque, pixelFormat }) => {
		const { store, encoder } = await createStore();
		const session = await store.create({
			format,
			fps: 29.97,
			frameCount: 1,
			opaque,
			audioBytes: 0,
			...(format === 'prores' ? { startTimecode: '01:00:08:00' } : {})
		});
		await store.uploadFrame(session.sessionId, 0, frameRequest());
		await store.complete(session.sessionId);
		const args = encoder.spawnedArguments[0];
		assert.equal(optionValue(args, '-framerate'), '30000/1001');
		assert.equal(optionValue(args, '-pix_fmt'), pixelFormat);
		if (format === 'prores') {
			assert.ok(args.includes('prores_ks'));
			assert.equal(optionValue(args, '-profile:v'), '4444');
			assert.equal(optionValue(args, '-timecode'), '01:00:08:00');
		} else {
			assert.ok(args.includes('libvpx-vp9'));
		}
		await store.cancel(session.sessionId);
	});

	it('passes a drop-frame start timecode through to ffmpeg unchanged', async () => {
		const { store, encoder } = await createStore();
		const session = await store.create({
			format: 'prores',
			fps: 29.97,
			frameCount: 1,
			opaque: false,
			audioBytes: 0,
			startTimecode: '01:00:08;00'
		});
		await store.uploadFrame(session.sessionId, 0, frameRequest());
		await store.complete(session.sessionId);
		assert.equal(optionValue(encoder.spawnedArguments[0], '-timecode'), '01:00:08;00');
		await store.cancel(session.sessionId);
	});

	it('removes the session and partial output on encoder failure', async () => {
		const { store, directory } = await createStore({ exitCode: 1, stderr: 'encoder exploded' });
		const session = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		await store.uploadFrame(session.sessionId, 0, frameRequest());
		await assert.rejects(() => store.complete(session.sessionId), /encoder exploded/);
		assert.deepEqual(await readdir(directory), []);
	});

	it('cancels output streaming and removes the finished session file', async () => {
		const { store, directory } = await createStore();
		const session = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		await store.uploadFrame(session.sessionId, 0, frameRequest());
		await store.complete(session.sessionId);
		const response = await store.outputResponse(session.sessionId);
		assert.ok(response.body);
		await response.body.cancel('download cancelled');
		assert.deepEqual(await readdir(directory), []);
	});

	it('kills the encoder and removes temp files when an active request aborts', async () => {
		let markWriteStarted = (): void => undefined;
		const writeStarted = new Promise<void>((resolve) => {
			markWriteStarted = resolve;
		});
		const { store, directory, encoder } = await createStore({
			createInput: () =>
				new Writable({
					write: () => markWriteStarted()
				})
		});
		const session = await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		const abortController = new AbortController();
		const upload = store.uploadFrame(
			session.sessionId,
			0,
			frameRequest(abortController.signal)
		);
		await writeStarted;
		abortController.abort();
		await assert.rejects(upload, /abort/i);
		assert.equal(encoder.children[0].killed, true);
		assert.deepEqual(await readdir(directory), []);
	});

	it('expires abandoned sessions and cleans orphaned directories', async () => {
		let now = 1_000;
		const { store, directory } = await createStore({}, { ttlMs: 100, now: () => now });
		await store.create({
			format: 'webm',
			fps: 30,
			frameCount: 1,
			opaque: false,
			audioBytes: 0
		});
		now = 1_101;
		assert.equal(await store.cleanupStale(), 1);
		assert.deepEqual(await readdir(directory), []);

		const orphan = join(directory, 'supers-export-orphan');
		await import('node:fs/promises').then(({ mkdir }) => mkdir(orphan));
		assert.equal(await cleanupOrphanedExportDirectories(directory, 0, Date.now() + 1_000), 1);
		assert.deepEqual(await readdir(directory), []);
	});
});
