import assert from 'node:assert/strict';

import { beforeAll, beforeEach, describe, it, vi } from 'vitest';

const fsMocks = vi.hoisted(() => ({
	mkdtemp: vi.fn<(prefix: string) => Promise<string>>(),
	readFile: vi.fn<(path: string) => Promise<Buffer>>(),
	rm: vi.fn<(path: string, options: { recursive: true; force: true }) => Promise<void>>(),
	writeFile: vi.fn<(path: string, data: Uint8Array) => Promise<void>>()
}));

const childProcessMocks = vi.hoisted(() => ({
	spawn: vi.fn()
}));

vi.mock('node:fs/promises', () => fsMocks);
vi.mock('node:child_process', () => childProcessMocks);

let webmHandlers: typeof import('./webm/+server.ts');
let proresHandlers: typeof import('./prores/+server.ts');

beforeAll(async () => {
	webmHandlers = await import('./webm/+server.ts');
	proresHandlers = await import('./prores/+server.ts');
});

beforeEach(() => {
	vi.clearAllMocks();
	fsMocks.mkdtemp.mockImplementation(async (prefix) =>
		prefix.endsWith('supers-prores-')
			? '/virtual/supers-prores-test-work-dir'
			: '/virtual/supers-webm-test-work-dir'
	);
	fsMocks.readFile.mockResolvedValue(Buffer.from('encoded-video'));
	fsMocks.rm.mockResolvedValue(undefined);
	fsMocks.writeFile.mockResolvedValue(undefined);
	childProcessMocks.spawn.mockImplementation(() => {
		const stdin = {
			write: vi.fn(() => true),
			once: vi.fn(),
			end: vi.fn()
		};
		return {
			stdin,
			stderr: { on: vi.fn() },
			once: vi.fn((event: string, listener: (value: number | null) => void) => {
				if (event === 'close') queueMicrotask(() => listener(0));
			}),
			killed: false,
			kill: vi.fn()
		};
	});
});

function exportRequest(url: string): Request {
	return new Request(url, {
		method: 'POST',
		body: new Blob([new Uint8Array([1, 2, 3, 4])])
	});
}

function spawnedArguments(): string[] {
	assert.equal(childProcessMocks.spawn.mock.calls.length, 1);
	const args: unknown = childProcessMocks.spawn.mock.calls[0][1];
	assert.ok(Array.isArray(args));
	assert.ok(args.every((value) => typeof value === 'string'));
	return args;
}

function assertOption(args: string[], option: string, value: string): void {
	const index = args.indexOf(option);
	assert.notEqual(index, -1, `Expected ${option} in ffmpeg arguments`);
	assert.equal(args[index + 1], value);
}

async function assertVideoResponse(response: Response, contentType: string): Promise<void> {
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), contentType);
	assert.equal(response.headers.get('content-length'), String(Buffer.byteLength('encoded-video')));
	assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from('encoded-video'));
}

describe('export handlers', () => {
	it.each([
		{ query: '', pixelFormat: 'yuva420p' },
		{ query: '?opaque=true', pixelFormat: 'yuv444p' }
	])('uses $pixelFormat for WebM export', async ({ query, pixelFormat }) => {
		const request = exportRequest(`http://localhost/api/export/webm${query}`);
		const response = await webmHandlers.POST({
			request,
			url: new URL(request.url)
		} as Parameters<(typeof webmHandlers)['POST']>[0]);

		const args = spawnedArguments();
		assertOption(args, '-c:v', 'png');
		assert.ok(args.includes('libvpx-vp9'));
		assertOption(args, '-pix_fmt', pixelFormat);
		await assertVideoResponse(response, 'video/webm');
		assert.deepEqual(fsMocks.rm.mock.calls, [
			['/virtual/supers-webm-test-work-dir', { recursive: true, force: true }]
		]);
	});

	it('uses ProRes 4444 with alpha and returns QuickTime video', async () => {
		const request = exportRequest('http://localhost/api/export/prores?fps=24');
		const response = await proresHandlers.POST({
			request,
			url: new URL(request.url)
		} as Parameters<(typeof proresHandlers)['POST']>[0]);

		const args = spawnedArguments();
		assert.ok(args.includes('prores_ks'));
		assertOption(args, '-profile:v', '4444');
		assertOption(args, '-pix_fmt', 'yuva444p10le');
		await assertVideoResponse(response, 'video/quicktime');
		assert.deepEqual(fsMocks.rm.mock.calls, [
			['/virtual/supers-prores-test-work-dir', { recursive: true, force: true }]
		]);
	});
});
