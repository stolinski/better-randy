import assert from 'node:assert/strict';

import type { VideoSample } from 'mediabunny';
import { describe, it } from 'vitest';

import type { SourceVideo } from './engine-schema';
import {
	SourceVideoDecoder,
	SourceVideoSeekSupersededError,
	type SourceVideoDecoderMetadata,
	type SourceVideoDecoderServices
} from './source-video-decoder';

const SOURCE_VIDEO: SourceVideo = {
	assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`,
	sourceOffsetSeconds: 2,
	includeAudio: true,
	volume: 1
};

const METADATA: SourceVideoDecoderMetadata = {
	firstTimestamp: 10,
	sourceDurationSeconds: 20,
	codedWidth: 1920,
	codedHeight: 1080,
	displayWidth: 1920,
	displayHeight: 1080,
	rotation: 0,
	pixelAspectRatio: { num: 1, den: 1 },
	colorSpace: {},
	averageFrameRate: 30,
	videoCodec: 'avc'
};

interface FakeSample extends VideoSample {
	closed: boolean;
}

function fakeSample(timestamp: number): FakeSample {
	const sample = {
		timestamp,
		duration: 1 / 30,
		codedWidth: 1920,
		codedHeight: 1080,
		displayWidth: 1920,
		displayHeight: 1080,
		rotation: 0,
		pixelAspectRatio: { num: 1, den: 1 },
		visibleRect: { left: 0, top: 0, width: 1920, height: 1080 },
		closed: false,
		close() {
			this.closed = true;
		}
	};
	return sample as unknown as FakeSample;
}

interface DeferredSample {
	promise: Promise<VideoSample | null>;
	resolve(sample: VideoSample | null): void;
}

function deferredSample(): DeferredSample {
	let resolvePromise = (sample: VideoSample | null): void => {
		void sample;
	};
	const promise = new Promise<VideoSample | null>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}

describe('SourceVideoDecoder', () => {
	it('normalizes the media first timestamp and rejects insufficient coverage', async () => {
		const requested: number[] = [];
		const services: SourceVideoDecoderServices = {
			createBackend: () => ({
				initialize: async () => METADATA,
				getSample: async (timestamp) => {
					requested.push(timestamp);
					return fakeSample(timestamp - 0.01);
				},
				async *samplesAtTimestamps() {},
				dispose: () => undefined
			})
		};
		const decoder = new SourceVideoDecoder(SOURCE_VIDEO, services);
		await decoder.initialize(8);

		const frame = await decoder.frameAt(3.5);
		assert.deepEqual(requested, [15.5]);
		assert.equal(frame.requestedSourceTimestamp, 15.5);
		assert.equal(frame.presentationTimestamp, 15.49);
		frame.close();
		assert.equal((frame.sample as FakeSample).closed, true);

		const insufficient = new SourceVideoDecoder(SOURCE_VIDEO, services);
		await assert.rejects(insufficient.initialize(18.01), /18\.000s available.*18\.010s/);
	});

	it('closes stale random-seek results before they can paint', async () => {
		const first = deferredSample();
		const second = deferredSample();
		const queue = [first, second];
		const services: SourceVideoDecoderServices = {
			createBackend: () => ({
				initialize: async () => METADATA,
				getSample: async () => queue.shift()!.promise,
				async *samplesAtTimestamps() {},
				dispose: () => undefined
			})
		};
		const decoder = new SourceVideoDecoder(SOURCE_VIDEO, services);
		await decoder.initialize(8);
		const staleSample = fakeSample(12);
		const currentSample = fakeSample(13);
		const stale = decoder.frameAt(0);
		const current = decoder.frameAt(1);
		second.resolve(currentSample);
		assert.equal((await current).sample, currentSample);
		first.resolve(staleSample);

		await assert.rejects(stale, SourceVideoSeekSupersededError);
		assert.equal(staleSample.closed, true);
		assert.equal(currentSample.closed, false);
	});

	it('uses the optimized timestamp iterator for serial export frames', async () => {
		let sourceTimestamps: number[] = [];
		let isDisposed = false;
		const samples = [fakeSample(12), fakeSample(12.5), fakeSample(13)];
		const services: SourceVideoDecoderServices = {
			createBackend: () => ({
				initialize: async () => METADATA,
				getSample: async () => null,
				async *samplesAtTimestamps(timestamps) {
					sourceTimestamps = [...timestamps];
					for (const sample of samples) yield sample;
				},
				dispose: () => {
					isDisposed = true;
				}
			})
		};
		const decoder = new SourceVideoDecoder(SOURCE_VIDEO, services);
		await decoder.initialize(8);
		const frames = [];
		for await (const frame of decoder.framesAt([0, 0.5, 1])) {
			frames.push(frame);
			frame.close();
		}

		assert.deepEqual(sourceTimestamps, [12, 12.5, 13]);
		assert.deepEqual(
			frames.map((frame) => frame.presentationTimestamp),
			[12, 12.5, 13]
		);
		assert.ok(samples.every((sample) => sample.closed));
		decoder.dispose();
		assert.equal(isDisposed, true);
	});
});
