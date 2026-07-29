import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import type { FrameRate } from '$lib/utils/composition-timing';

import {
	AUDIO_MIX_SAMPLE_RATE,
	audioMixSampleAtFrame,
	audioMixSampleCount,
	renderAudioMix,
	type AudioMixServices,
	type VideoClipAudioDecodeRequest
} from './audio-mix';
import {
	createDefaultEngineState,
	type EngineState,
	type VideoAsset,
	type VideoClip
} from './engine-schema';
import type { VideoAssetAudioPcm } from './video-asset-audio-decoder';

const NTSC_2997: FrameRate = { fps: 29.97, num: 30000, den: 1001 };
const ASSET: VideoAsset = {
	id: 'asset-a',
	kind: 'video',
	name: 'Creator footage',
	assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`
};

function silentState(): EngineState {
	const state = createDefaultEngineState();
	state.marks = { defaults: {}, timings: [] };
	state.surface = { type: 'plain', content: { body: [] } };
	state.media.assets = [ASSET];
	return state;
}

function videoClip(options: {
	id: string;
	timelineStartFrame: number;
	durationFrames: number;
	sourceStartSeconds?: number;
	enabled?: boolean;
	gain?: number;
}): VideoClip {
	return {
		id: options.id,
		assetId: ASSET.id,
		timelineStartFrame: options.timelineStartFrame,
		durationFrames: options.durationFrames,
		sourceStartSeconds: options.sourceStartSeconds ?? 0,
		audio: { enabled: options.enabled ?? true, gain: options.gain ?? 1 }
	};
}

function testAudioBuffer(channelData: readonly Float32Array[]): AudioBuffer {
	return {
		length: channelData[0]?.length ?? 0,
		duration: (channelData[0]?.length ?? 0) / AUDIO_MIX_SAMPLE_RATE,
		numberOfChannels: channelData.length,
		sampleRate: AUDIO_MIX_SAMPLE_RATE,
		getChannelData: (channel: number) => channelData[channel],
		copyToChannel: (source: Float32Array, channel: number) => channelData[channel].set(source)
	} as unknown as AudioBuffer;
}

function stereoPcm(sampleCount: number, left: number, right = left): VideoAssetAudioPcm {
	return {
		sampleRate: AUDIO_MIX_SAMPLE_RATE,
		channels: [new Float32Array(sampleCount).fill(left), new Float32Array(sampleCount).fill(right)]
	};
}

function mixServices(
	options: {
		decode?: (request: VideoClipAudioDecodeRequest) => VideoAssetAudioPcm | null;
		cue?: AudioBuffer | null;
		onDecode?: (request: VideoClipAudioDecodeRequest) => void;
	} = {}
): AudioMixServices {
	return {
		decodeVideoClipAudio: async (request) => {
			options.onDecode?.(request);
			return options.decode?.(request) ?? null;
		},
		createCueDecodeContext: () => ({}) as BaseAudioContext,
		loadCueBuffer: () => (options.cue ? Promise.resolve(options.cue) : null),
		createOutputBuffer: ({ length, numberOfChannels }) =>
			testAudioBuffer(
				Array.from({ length: numberOfChannels ?? 1 }, () => new Float32Array(length ?? 0))
			)
	};
}

describe('deterministic audio mix', () => {
	it('places touching NTSC clips on shared absolute sample boundaries', async () => {
		const state = silentState();
		state.media.videoTrack.clips = [
			videoClip({ id: 'first', timelineStartFrame: 0, durationFrames: 1, sourceStartSeconds: 2 }),
			videoClip({ id: 'second', timelineStartFrame: 1, durationFrames: 1, sourceStartSeconds: 8 })
		];
		const requests: VideoClipAudioDecodeRequest[] = [];
		const rendered = await renderAudioMix(
			{ state, frameCount: 2, frameRate: NTSC_2997 },
			mixServices({
				onDecode: (request) => requests.push(request),
				decode: (request) =>
					stereoPcm(request.outputSampleCount, request.sourceStartSeconds === 2 ? 0.25 : 0.75)
			})
		);

		assert.equal(audioMixSampleAtFrame(1, NTSC_2997), 1602);
		assert.equal(audioMixSampleAtFrame(2, NTSC_2997), 3203);
		assert.deepEqual(
			requests.map(({ sourceStartSeconds, sourceEndSeconds, outputSampleCount }) => ({
				sourceStartSeconds,
				sourceEndSeconds,
				outputSampleCount
			})),
			[
				{
					sourceStartSeconds: 2,
					sourceEndSeconds: 2 + 1001 / 30000,
					outputSampleCount: 1602
				},
				{
					sourceStartSeconds: 8,
					sourceEndSeconds: 8 + 1001 / 30000,
					outputSampleCount: 1601
				}
			]
		);
		const left = rendered!.getChannelData(0);
		assert.equal(left[1601], 0.25);
		assert.equal(left[1602], 0.75);
		assert.equal(left.length, 3203);
	});

	it('leaves gaps and disabled clips silent while applying each clip gain', async () => {
		const frameRate: FrameRate = { fps: 30, num: 30, den: 1 };
		const state = silentState();
		state.media.videoTrack.clips = [
			videoClip({ id: 'opening', timelineStartFrame: 0, durationFrames: 1, gain: 0.5 }),
			videoClip({ id: 'muted', timelineStartFrame: 1, durationFrames: 1, enabled: false }),
			videoClip({ id: 'closing', timelineStartFrame: 3, durationFrames: 1, gain: 2 })
		];
		let decodeCalls = 0;
		const rendered = await renderAudioMix(
			{ state, frameCount: 4, frameRate },
			mixServices({
				decode: (request) => {
					decodeCalls += 1;
					return stereoPcm(request.outputSampleCount, 0.4);
				}
			})
		);

		const left = rendered!.getChannelData(0);
		assert.equal(decodeCalls, 2);
		assert.ok(left.subarray(0, 1600).every((sample) => Math.abs(sample - 0.2) < 1e-6));
		assert.ok(left.subarray(1600, 4800).every((sample) => sample === 0));
		assert.ok(left.subarray(4800).every((sample) => Math.abs(sample - 0.8) < 1e-6));
	});

	it('preserves legacy full-span audio while combining cues and bed in fixed order', async () => {
		const frameRate: FrameRate = { fps: 30, num: 30, den: 1 };
		const state = silentState();
		state.transport.durationSeconds = 1 / 30;
		state.media.videoTrack.clips = [
			videoClip({
				id: 'legacy-source-video-clip',
				timelineStartFrame: 0,
				durationFrames: 1,
				sourceStartSeconds: 18.25,
				gain: 0.8
			})
		];
		state.audioCues = [
			{ id: 'bed', kind: 'bed', assetSlug: 'fixture', start: 0, duration: 1, volume: 0.5 }
		];
		const sampleCount = audioMixSampleCount(1, frameRate);
		const rendered = await renderAudioMix(
			{ state, frameCount: 1, frameRate },
			mixServices({
				decode: (request) => stereoPcm(request.outputSampleCount, 0.25, 0.1),
				cue: testAudioBuffer([
					new Float32Array(sampleCount).fill(0.5),
					new Float32Array(sampleCount).fill(0.25)
				])
			})
		);

		assert.ok(Math.abs(rendered!.getChannelData(0)[0] - 0.4) < 1e-6);
		assert.ok(Math.abs(rendered!.getChannelData(1)[0] - 0.18) < 1e-6);
	});

	it('applies one final deterministic peak policy after clip and cue mixing', async () => {
		const frameRate: FrameRate = { fps: 30, num: 30, den: 1 };
		const state = silentState();
		state.media.videoTrack.clips = [
			videoClip({ id: 'full', timelineStartFrame: 0, durationFrames: 1 })
		];
		state.audioCues = [
			{ id: 'cue', kind: 'cue', assetSlug: 'fixture', start: 0, duration: 1, volume: 1 }
		];
		const sampleCount = audioMixSampleCount(1, frameRate);
		const rendered = await renderAudioMix(
			{ state, frameCount: 1, frameRate },
			mixServices({
				decode: (request) => stereoPcm(request.outputSampleCount, 0.8, 0.4),
				cue: testAudioBuffer([
					new Float32Array(sampleCount).fill(0.5),
					new Float32Array(sampleCount).fill(0.25)
				])
			})
		);

		assert.ok(Math.abs(rendered!.getChannelData(0)[0] - 0.98) < 1e-6);
		assert.ok(Math.abs(rendered!.getChannelData(1)[0] - 0.49) < 1e-6);
	});

	it('preserves cue-only behavior and emits no stream when every input is silent', async () => {
		const state = silentState();
		const frameRate: FrameRate = { fps: 30, num: 30, den: 1 };
		assert.equal(await renderAudioMix({ state, frameCount: 1, frameRate }, mixServices()), null);

		state.media.videoTrack.clips = [
			videoClip({ id: 'no-track', timelineStartFrame: 0, durationFrames: 1 })
		];
		assert.equal(await renderAudioMix({ state, frameCount: 1, frameRate }, mixServices()), null);

		state.media.videoTrack.clips = [];
		state.audioCues = [
			{ id: 'cue-only', kind: 'cue', assetSlug: 'fixture', start: 0, duration: 1, volume: 1 }
		];
		const sampleCount = audioMixSampleCount(1, frameRate);
		const rendered = await renderAudioMix(
			{ state, frameCount: 1, frameRate },
			mixServices({ cue: testAudioBuffer([new Float32Array(sampleCount).fill(0.25)]) })
		);
		assert.ok(Math.abs(rendered!.getChannelData(0)[0] - 0.2) < 1e-6);
		assert.ok(Math.abs(rendered!.getChannelData(1)[0] - 0.2) < 1e-6);
	});

	it('does not schedule a bed when Video clips leave transparent gaps', async () => {
		const state = silentState();
		state.transport.durationSeconds = 1;
		state.transport.fps = 2;
		state.media.videoTrack.clips = [
			videoClip({
				id: 'partial',
				timelineStartFrame: 1,
				durationFrames: 1,
				enabled: false
			})
		];
		state.audioCues = [
			{ id: 'ineligible-bed', kind: 'bed', assetSlug: 'fixture', start: 0, duration: 1 }
		];
		let cueLoads = 0;
		const services = mixServices({
			cue: testAudioBuffer([new Float32Array(AUDIO_MIX_SAMPLE_RATE)]),
			onDecode: () => undefined
		});
		services.loadCueBuffer = () => {
			cueLoads += 1;
			return Promise.resolve(testAudioBuffer([new Float32Array(AUDIO_MIX_SAMPLE_RATE)]));
		};

		assert.equal(
			await renderAudioMix(
				{ state, frameCount: 2, frameRate: { fps: 2, num: 2, den: 1 } },
				services
			),
			null
		);
		assert.equal(cueLoads, 0);
	});
});
