import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, it } from 'vitest';

import type { UserVideoAssetMetadata } from './user-video-asset';
import { probeStoredUserVideo, storeUserVideo } from './user-video-asset-store.server';

const TEST_METADATA: UserVideoAssetMetadata = {
	durationSeconds: 2,
	displayWidth: 1920,
	displayHeight: 1080,
	rotation: 0,
	averageFrameRate: 30,
	videoCodec: 'h264',
	hasAudio: true,
	audioCodec: 'aac',
	audioChannels: 2,
	audioSampleRate: 48000
};

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

function isoMediaBytes(): Uint8Array {
	return new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 1, 2, 3, 4]);
}

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(bytes.subarray(0, 7));
			controller.enqueue(bytes.subarray(7));
			controller.close();
		}
	});
}

function runFfmpeg(args: readonly string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.env.FFMPEG_PATH ?? 'ffmpeg', args);
		const stderr: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(Buffer.concat(stderr).toString('utf8').trim()));
		});
	});
}

describe('user video asset store', () => {
	it('streams, probes, hashes, and deduplicates immutable media', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'gfx-video-store-'));
		directories.push(directory);
		let probes = 0;
		const probe = async (): Promise<UserVideoAssetMetadata> => {
			probes += 1;
			return TEST_METADATA;
		};

		const first = await storeUserVideo(bytesStream(isoMediaBytes()), 'video/mp4', {
			storeDirectory: directory,
			probe
		});
		const second = await storeUserVideo(bytesStream(isoMediaBytes()), 'video/mp4', {
			storeDirectory: directory,
			probe
		});

		assert.equal(first.url, second.url);
		assert.equal(first.sizeBytes, isoMediaBytes().byteLength);
		assert.equal(first.displayWidth, 1920);
		assert.equal(probes, 2);
		const key = first.url.split('/').at(-1) ?? '';
		assert.deepEqual(new Uint8Array(await readFile(join(directory, key))), isoMediaBytes());
		assert.deepEqual(await readdir(join(directory, '.uploads')), []);
	});

	it('rejects mismatched signatures and removes partial uploads', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'gfx-video-store-'));
		directories.push(directory);

		await assert.rejects(
			storeUserVideo(bytesStream(new Uint8Array([1, 2, 3, 4])), 'video/webm', {
				storeDirectory: directory,
				probe: async () => TEST_METADATA
			}),
			/bytes do not match/
		);
		assert.deepEqual(await readdir(join(directory, '.uploads')), []);
	});

	it('probes real video and audio stream metadata with ffprobe', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'gfx-video-probe-'));
		directories.push(directory);
		const filePath = join(directory, 'fixture.mp4');
		await runFfmpeg([
			'-y',
			'-hide_banner',
			'-loglevel',
			'error',
			'-f',
			'lavfi',
			'-i',
			'color=c=red:s=320x180:r=30:d=1',
			'-f',
			'lavfi',
			'-i',
			'sine=frequency=1000:sample_rate=48000:duration=1',
			'-c:v',
			'mpeg4',
			'-c:a',
			'aac',
			'-shortest',
			filePath
		]);

		const metadata = await probeStoredUserVideo(filePath);

		assert.equal(metadata.displayWidth, 320);
		assert.equal(metadata.displayHeight, 180);
		assert.equal(metadata.averageFrameRate, 30);
		assert.equal(metadata.videoCodec, 'mpeg4');
		assert.equal(metadata.hasAudio, true);
		assert.equal(metadata.audioChannels, 1);
		assert.equal(metadata.audioSampleRate, 48000);
		assert.ok(metadata.durationSeconds >= 1);
	}, 15_000);
});
