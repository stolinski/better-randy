import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { Page } from 'playwright';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';
import {
	assertOutputExtension,
	preparePreset,
	renderJob,
	runRenderJobs,
	withPreparedPreset
} from '../../../scripts/supers';

const fetchMock = vi.fn<typeof fetch>();
let temporaryDirectory = '';

function sourcePreset(assetUrl: string, format: 'webm' | 'prores' = 'webm'): unknown {
	return {
		...blankPresetJson,
		state: {
			...blankPresetJson.state,
			transport: { ...blankPresetJson.state.transport, format },
			sourceVideo: {
				assetUrl,
				sourceOffsetSeconds: 0,
				includeAudio: true,
				volume: 1
			}
		}
	};
}

async function writePresetFile(preset: unknown, filename = 'source.json'): Promise<string> {
	const filePath = join(temporaryDirectory, filename);
	await writeFile(filePath, JSON.stringify(preset), 'utf-8');
	return filePath;
}

beforeEach(async () => {
	temporaryDirectory = await mkdtemp(join(tmpdir(), 'supers-cli-'));
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
	vi.unstubAllGlobals();
	await rm(temporaryDirectory, { recursive: true, force: true });
});

describe('supers Source video automation', () => {
	it('validates output extension against the Preset transport format', () => {
		assert.doesNotThrow(() => assertOutputExtension('webm', './out/video.WEBM'));
		assert.doesNotThrow(() => assertOutputExtension('prores', './out/video.mov'));
		assert.throws(
			() => assertOutputExtension('prores', './out/video.webm'),
			/does not match Preset transport\.format "prores"; expected \.mov/
		);
	});

	it('uses an asset API descriptor in a standalone Preset imported through PUT for CLI render', async () => {
		const ingestedAsset = { url: `/api/user-assets/${'a'.repeat(64)}.mp4` };
		const preset = sourcePreset(ingestedAsset.url);
		const presetPath = await writePresetFile(preset);
		fetchMock
			.mockResolvedValueOnce(new Response(null, { status: 204 }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const prepared = await preparePreset(presetPath);
		const importCall = fetchMock.mock.calls[0];
		assert.match(String(importCall?.[0]), /api\/user-compositions\/agent-render-/);
		assert.equal(importCall?.[1]?.method, 'PUT');
		assert.deepEqual(JSON.parse(String(importCall?.[1]?.body)), preset);
		assert.equal(prepared.format, 'webm');

		await prepared.cleanup();
		assert.equal(fetchMock.mock.calls[1]?.[1]?.method, 'DELETE');
	});

	it('cleans temporary User compositions after successful and failed operations', async () => {
		const presetPath = await writePresetFile(
			sourcePreset(`/api/user-assets/${'b'.repeat(64)}.webm`)
		);
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

		await withPreparedPreset(presetPath, async () => 'rendered');
		await assert.rejects(
			withPreparedPreset(presetPath, async () => Promise.reject(new Error('render failed'))),
			/render failed/
		);

		const methods = fetchMock.mock.calls.map((call) => call[1]?.method);
		assert.deepEqual(methods, ['PUT', 'DELETE', 'PUT', 'DELETE']);
	});

	it('rejects a mismatched extension before page navigation and removes the temporary import', async () => {
		const presetPath = await writePresetFile(
			sourcePreset(`/api/user-assets/${'c'.repeat(64)}.mov`, 'prores')
		);
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
		const goto = vi.fn();
		const page = { goto } as unknown as Page;

		await assert.rejects(
			renderJob(page, { preset: presetPath, out: join(temporaryDirectory, 'wrong.webm') }),
			/expected \.mov/
		);

		assert.equal(goto.mock.calls.length, 0);
		assert.deepEqual(
			fetchMock.mock.calls.map((call) => call[1]?.method),
			['PUT', 'DELETE']
		);
	});

	it('reuses one Workspace page serially for two different Source video jobs', async () => {
		const page = {} as Page;
		const jobs = [
			{ preset: 'source-a.json', out: 'source-a.webm' },
			{ preset: 'source-b.json', out: 'source-b.webm' }
		];
		const pages: Page[] = [];
		const presets: string[] = [];

		const failures = await runRenderJobs(page, jobs, async (receivedPage, job) => {
			pages.push(receivedPage);
			presets.push(job.preset);
		});

		assert.deepEqual(failures, []);
		assert.deepEqual(pages, [page, page]);
		assert.deepEqual(presets, ['source-a.json', 'source-b.json']);
	});

	it('surfaces missing Source video failures returned by the User composition API', async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(
				JSON.stringify({ message: 'Source video asset /api/user-assets/missing.mp4 is missing.' }),
				{ status: 422, headers: { 'content-type': 'application/json' } }
			)
		);

		await assert.rejects(preparePreset('source-composition'), /Source video asset .* is missing/);
	});

	it('falls back to a built-in corpus Preset when no User composition exists', async () => {
		fetchMock.mockResolvedValueOnce(Response.json(null));

		const prepared = await preparePreset('blank');

		assert.equal(prepared.slug, 'blank');
		assert.equal(prepared.format, blankPresetJson.state.transport.format);
		await prepared.cleanup();
		assert.equal(fetchMock.mock.calls.length, 1);
	});
});
