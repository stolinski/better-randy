import assert from 'node:assert/strict';

import { isHttpError } from '@sveltejs/kit';
import { beforeAll, beforeEach, describe, it, vi } from 'vitest';

import validPreset from '$lib/presets/blank.json';
import { PresetSchema } from '$lib/platform/engine-schema';
import { presetToWireFormat } from '$lib/platform/preset-pure';

const fsMocks = vi.hoisted(() => ({
	mkdir: vi.fn<(path: string, options: { recursive: true }) => Promise<string | undefined>>(),
	readdir: vi.fn<(path: string) => Promise<string[]>>(),
	readFile: vi.fn<(path: string, encoding: 'utf-8') => Promise<string>>(),
	writeFile: vi.fn<(path: string, data: string, encoding: 'utf-8') => Promise<void>>(),
	unlink: vi.fn<(path: string) => Promise<void>>()
}));

vi.mock('node:fs/promises', () => fsMocks);

let collectionHandlers: typeof import('./+server.ts');
let slugHandlers: typeof import('./[slug]/+server.ts');

beforeAll(async () => {
	collectionHandlers = await import('./+server.ts');
	slugHandlers = await import('./[slug]/+server.ts');
});

beforeEach(() => {
	vi.clearAllMocks();
	fsMocks.mkdir.mockResolvedValue(undefined);
	fsMocks.readdir.mockResolvedValue([]);
	fsMocks.writeFile.mockResolvedValue(undefined);
	fsMocks.unlink.mockResolvedValue(undefined);
});

function postEvent(body: unknown): Parameters<(typeof collectionHandlers)['POST']>[0] {
	return {
		request: new Request('http://localhost/api/user-compositions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as Parameters<(typeof collectionHandlers)['POST']>[0];
}

function expectHttpError(status: number, message: string): (cause: unknown) => boolean {
	return (cause) => isHttpError(cause, status) && cause.body.message.includes(message);
}

describe('user composition handlers', () => {
	it('rejects invalid slugs and invalid presets', async () => {
		await assert.rejects(
			async () => collectionHandlers.POST(postEvent({ slug: '../escape', preset: validPreset })),
			expectHttpError(400, 'slug must be lowercase')
		);
		await assert.rejects(
			async () =>
				collectionHandlers.POST(postEvent({ slug: 'valid-slug', preset: { name: 'Incomplete' } })),
			expectHttpError(400, 'Invalid preset')
		);
		assert.equal(fsMocks.writeFile.mock.calls.length, 0);
	});

	it('writes a valid preset in wire format', async () => {
		const response = await collectionHandlers.POST(
			postEvent({ slug: 'blank-copy', preset: validPreset, forkedFrom: 'blank' })
		);

		assert.equal(response.status, 201);
		assert.deepEqual(await response.json(), { slug: 'blank-copy' });
		assert.equal(fsMocks.writeFile.mock.calls.length, 1);

		const [path, data, encoding] = fsMocks.writeFile.mock.calls[0];
		const stored = JSON.parse(data) as {
			meta: { forkedFrom: string | null; savedAt: string };
			preset: { state: { surface: { content: { body: unknown } } } };
		};
		assert.match(path, /user-compositions\/blank-copy\.json$/);
		assert.equal(encoding, 'utf-8');
		assert.equal(stored.meta.forkedFrom, 'blank');
		assert.equal(Number.isNaN(Date.parse(stored.meta.savedAt)), false);
		assert.equal(stored.preset.state.surface.content.body, '');
	});

	it('skips corrupt files when listing compositions', async () => {
		fsMocks.readdir.mockResolvedValue([
			'valid.json',
			'invalid-preset.json',
			'bad-json.json',
			'notes.txt'
		]);
		fsMocks.readFile.mockImplementation(async (path) => {
			if (path.endsWith('valid.json')) {
				return JSON.stringify({
					meta: { forkedFrom: null, savedAt: '2026-07-14T12:00:00.000Z' },
					preset: validPreset
				});
			}
			if (path.endsWith('invalid-preset.json')) {
				return JSON.stringify({
					meta: { forkedFrom: null, savedAt: '2026-07-14T13:00:00.000Z' },
					preset: { name: 'Incomplete' }
				});
			}
			return '{not-json';
		});

		const response = await collectionHandlers.GET(
			{} as Parameters<(typeof collectionHandlers)['GET']>[0]
		);

		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), [
			{
				slug: 'valid',
				name: 'Blank',
				forkedFrom: null,
				savedAt: '2026-07-14T12:00:00.000Z'
			}
		]);
	});

	it('returns null from a slug GET when no composition exists', async () => {
		fsMocks.readFile.mockRejectedValue(
			Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
		);

		const response = await slugHandlers.GET({
			params: { slug: 'absent' }
		} as Parameters<(typeof slugHandlers)['GET']>[0]);

		assert.equal(response.status, 200);
		assert.equal(await response.json(), null);
	});

	it('rejects a slug GET whose file read fails for a non-ENOENT reason', async () => {
		fsMocks.readFile.mockRejectedValue(
			Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
		);

		await assert.rejects(
			async () =>
				slugHandlers.GET({
					params: { slug: 'unreadable' }
				} as Parameters<(typeof slugHandlers)['GET']>[0]),
			expectHttpError(500, 'Failed to read user composition')
		);
	});

	it('rejects corrupt preset data from a slug GET', async () => {
		fsMocks.readFile.mockResolvedValue(
			JSON.stringify({
				meta: { forkedFrom: null, savedAt: '2026-07-14T12:00:00.000Z' },
				preset: { name: 'Incomplete' }
			})
		);

		await assert.rejects(
			async () =>
				slugHandlers.GET({
					params: { slug: 'corrupt' }
				} as Parameters<(typeof slugHandlers)['GET']>[0]),
			expectHttpError(500, 'Corrupt preset data')
		);
	});

	it('returns the standalone wire format accepted by PUT', async () => {
		fsMocks.readFile.mockResolvedValue(
			JSON.stringify({
				meta: { forkedFrom: 'blank', savedAt: '2026-07-14T12:00:00.000Z' },
				preset: validPreset
			})
		);

		const getResponse = await slugHandlers.GET({
			params: { slug: 'round-trip' }
		} as Parameters<(typeof slugHandlers)['GET']>[0]);
		const standalonePreset: unknown = await getResponse.json();
		const parsed = PresetSchema.parse(standalonePreset);

		assert.deepEqual(standalonePreset, presetToWireFormat(parsed));
		const putResponse = await slugHandlers.PUT({
			params: { slug: 'round-trip' },
			request: new Request('http://localhost/api/user-compositions/round-trip', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(standalonePreset)
			})
		} as Parameters<(typeof slugHandlers)['PUT']>[0]);

		assert.equal(putResponse.status, 204);
		const written = JSON.parse(fsMocks.writeFile.mock.calls[0]?.[1] ?? 'null') as {
			preset: unknown;
		};
		assert.deepEqual(written.preset, standalonePreset);
	});

	it('preserves agent-only fields through an agent to GUI to agent workflow', async () => {
		const agentPreset = PresetSchema.parse(validPreset);
		agentPreset.name = 'Agent-authored composition';
		agentPreset.state.transport.durationSeconds = 7.5;
		agentPreset.state.stage = {
			type: 'depth',
			camera: { move: 'push', amount: 0.2, ease: 'smooth' },
			focus: { focusZ: 0.4, aperture: 0.3, band: 0.1 }
		};
		fsMocks.readFile.mockResolvedValue(
			JSON.stringify({
				meta: { forkedFrom: null, savedAt: '2026-07-14T12:00:00.000Z' },
				preset: presetToWireFormat(agentPreset)
			})
		);

		const getResponse = await slugHandlers.GET({
			params: { slug: 'agent-composition' }
		} as Parameters<(typeof slugHandlers)['GET']>[0]);
		const guiLoadedPreset: unknown = await getResponse.json();
		const parsed = PresetSchema.parse(guiLoadedPreset);
		parsed.name = 'Edited in GUI';

		await slugHandlers.PUT({
			params: { slug: 'agent-composition' },
			request: new Request('http://localhost/api/user-compositions/agent-composition', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(presetToWireFormat(parsed))
			})
		} as Parameters<(typeof slugHandlers)['PUT']>[0]);

		const written = JSON.parse(fsMocks.writeFile.mock.calls[0]?.[1] ?? 'null') as {
			preset: unknown;
		};
		const agentReloadedPreset = PresetSchema.parse(written.preset);
		assert.equal(agentReloadedPreset.name, 'Edited in GUI');
		assert.equal(agentReloadedPreset.state.transport.durationSeconds, 7.5);
		assert.deepEqual(agentReloadedPreset.state.stage, agentPreset.state.stage);
	});
});
