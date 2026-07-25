import assert from 'node:assert/strict';

import { afterEach, describe, it, vi } from 'vitest';

vi.mock('mediabunny', () => ({
	ALL_FORMATS: [],
	BlobSource: class BlobSource {},
	Input: class Input {
		async getPrimaryVideoTrack() {
			return {
				canDecode: async () => true,
				getDisplayWidth: async () => 1920,
				getDisplayHeight: async () => 1080,
				getRotation: async () => 0,
				computePacketStats: async () => ({ averagePacketRate: 30 }),
				getCodec: async () => 'avc'
			};
		}
		async getPrimaryAudioTrack() {
			return {
				canDecode: async () => true,
				getCodec: async () => 'aac',
				getNumberOfChannels: async () => 2,
				getSampleRate: async () => 48000
			};
		}
		async computeDuration() {
			return 12;
		}
		dispose() {}
	}
}));

import { uploadUserVideo } from './user-video-upload-transport';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('user video upload transport', () => {
	it('inspects then uploads supported video bytes', async () => {
		const file = new File(['video'], 'episode.mp4', { type: 'video/mp4' });
		const descriptor = {
			url: `/api/user-assets/${'a'.repeat(64)}.mp4`,
			mime: 'video/mp4',
			sizeBytes: file.size,
			durationSeconds: 12,
			displayWidth: 1920,
			displayHeight: 1080,
			rotation: 0,
			averageFrameRate: 30,
			videoCodec: 'avc',
			hasAudio: true,
			audioCodec: 'aac',
			audioChannels: 2,
			audioSampleRate: 48000
		};
		const fetchMock = vi.fn(async (): Promise<Response> =>
			Response.json(descriptor, { status: 201 })
		);
		vi.stubGlobal('fetch', fetchMock);

		assert.deepEqual(await uploadUserVideo(file), descriptor);
		assert.deepEqual(fetchMock.mock.calls, [
			[
				'/api/user-assets',
				{
					method: 'POST',
					headers: { 'Content-Type': 'video/mp4' },
					body: file
				}
			]
		]);
	});

	it('rejects unsupported formats before inspection or upload', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await assert.rejects(
			uploadUserVideo(new File(['avi'], 'episode.avi', { type: 'video/avi' })),
			/expected an MP4, MOV, or WebM/
		);
		assert.equal(fetchMock.mock.calls.length, 0);
	});
});
