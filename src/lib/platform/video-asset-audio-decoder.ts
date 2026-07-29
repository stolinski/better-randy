import { ALL_FORMATS, AudioSampleSink, Input, UrlSource, type AudioSample } from 'mediabunny';

export const VIDEO_ASSET_AUDIO_SAMPLE_RATE = 48000;

export interface VideoAssetAudioPcm {
	sampleRate: typeof VIDEO_ASSET_AUDIO_SAMPLE_RATE;
	channels: readonly [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
}

export interface VideoAssetAudioDecoderMetadata {
	/** Primary-video PTS that corresponds to media-relative source time zero. */
	sourceFirstTimestamp: number;
	/** First audio PTS, retained so delayed audio remains delayed in the mix. */
	audioFirstTimestamp: number;
}

export interface DecodedVideoAssetAudioSample {
	timestamp: number;
	sampleRate: number;
	numberOfFrames: number;
	channels: readonly Float32Array<ArrayBuffer>[];
}

export interface VideoAssetAudioDecoderBackend {
	initialize(): Promise<VideoAssetAudioDecoderMetadata | null>;
	samples(
		startTimestamp: number,
		endTimestamp: number
	): AsyncGenerator<DecodedVideoAssetAudioSample, void, unknown>;
	dispose(): void;
}

export interface VideoAssetAudioDecoderServices {
	createBackend(assetUrl: string): VideoAssetAudioDecoderBackend;
}

export interface VideoAssetAudioDecodeRequest {
	sourceStartSeconds: number;
	sourceEndSeconds: number;
	outputSampleCount: number;
	signal?: AbortSignal;
}

function copyVideoAssetAudioSample(sample: AudioSample): DecodedVideoAssetAudioSample {
	const channels: Float32Array<ArrayBuffer>[] = [];
	for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
		const data = new Float32Array(sample.numberOfFrames);
		sample.copyTo(data, { planeIndex: channel, format: 'f32-planar' });
		channels.push(data);
	}
	return {
		timestamp: sample.timestamp,
		sampleRate: sample.sampleRate,
		numberOfFrames: sample.numberOfFrames,
		channels
	};
}

class MediabunnyVideoAssetAudioDecoderBackend implements VideoAssetAudioDecoderBackend {
	readonly #input: Input;
	#sink: AudioSampleSink | null = null;

	constructor(assetUrl: string) {
		this.#input = new Input({
			formats: ALL_FORMATS,
			source: new UrlSource(assetUrl, { maxCacheSize: 64 * 1024 * 1024, parallelism: 2 })
		});
	}

	async initialize(): Promise<VideoAssetAudioDecoderMetadata | null> {
		const [audioTrack, videoTrack] = await Promise.all([
			this.#input.getPrimaryAudioTrack(),
			this.#input.getPrimaryVideoTrack()
		]);
		if (!audioTrack) return null;
		if (!(await audioTrack.canDecode())) {
			throw new TypeError('Video asset audio codec is not decodable in this browser.');
		}

		const [sourceFirstTimestamp, audioFirstTimestamp] = await Promise.all([
			videoTrack ? videoTrack.getFirstTimestamp() : this.#input.getFirstTimestamp(),
			audioTrack.getFirstTimestamp()
		]);
		this.#sink = new AudioSampleSink(audioTrack);
		return { sourceFirstTimestamp, audioFirstTimestamp };
	}

	async *samples(
		startTimestamp: number,
		endTimestamp: number
	): AsyncGenerator<DecodedVideoAssetAudioSample, void, unknown> {
		if (!this.#sink) throw new Error('Video asset audio decoder is not initialized.');
		for await (const sample of this.#sink.samples(startTimestamp, endTimestamp)) {
			try {
				yield copyVideoAssetAudioSample(sample);
			} finally {
				sample.close();
			}
		}
	}

	dispose(): void {
		this.#input.dispose();
		this.#sink = null;
	}
}

const DEFAULT_VIDEO_ASSET_AUDIO_DECODER_SERVICES: VideoAssetAudioDecoderServices = {
	createBackend: (assetUrl) => new MediabunnyVideoAssetAudioDecoderBackend(assetUrl)
};

const CENTER_GAIN = Math.SQRT1_2;
const SURROUND_GAIN = Math.SQRT1_2;
const LFE_GAIN = 0.5;
const EXTRA_CHANNEL_GAIN = 0.5;
const SAMPLE_INDEX_EPSILON = 1e-7;

function interpolateChannel(
	sample: DecodedVideoAssetAudioSample,
	channel: number,
	position: number,
	nextSample: DecodedVideoAssetAudioSample | null
): number {
	const data = sample.channels[channel];
	const frame = Math.min(sample.numberOfFrames - 1, Math.max(0, Math.floor(position)));
	const fraction = position - frame;
	const current = data[frame] ?? 0;
	if (fraction <= 0) return current;
	if (frame + 1 < sample.numberOfFrames) {
		return current + ((data[frame + 1] ?? current) - current) * fraction;
	}

	const sampleEnd = sample.timestamp + sample.numberOfFrames / sample.sampleRate;
	const isContiguous =
		nextSample !== null &&
		nextSample.sampleRate === sample.sampleRate &&
		nextSample.channels.length === sample.channels.length &&
		Math.abs(nextSample.timestamp - sampleEnd) <= 0.5 / sample.sampleRate;
	const next = isContiguous ? (nextSample.channels[channel][0] ?? current) : current;
	return current + (next - current) * fraction;
}

/**
 * Fixed channel-order downmix. 1ch duplicates; 2ch passes through; 3ch is
 * L/R/C; 4ch is L/R/SL/SR; 5ch is L/R/C/SL/SR; 6+ is
 * L/R/C/LFE/SL/SR followed by alternating rear/auxiliary channels.
 */
function downmixVideoAssetAudioFrame(
	sample: DecodedVideoAssetAudioSample,
	position: number,
	nextSample: DecodedVideoAssetAudioSample | null
): readonly [number, number] {
	const read = (channel: number): number =>
		interpolateChannel(sample, channel, position, nextSample);
	const channelCount = sample.channels.length;
	if (channelCount === 1) {
		const mono = read(0);
		return [mono, mono];
	}
	if (channelCount === 2) return [read(0), read(1)];

	let left = read(0);
	let right = read(1);
	if (channelCount === 3) {
		const center = read(2) * CENTER_GAIN;
		return [left + center, right + center];
	}
	if (channelCount === 4) {
		return [left + read(2) * SURROUND_GAIN, right + read(3) * SURROUND_GAIN];
	}

	const center = read(2) * CENTER_GAIN;
	left += center;
	right += center;
	if (channelCount >= 6) {
		const lfe = read(3) * LFE_GAIN;
		left += lfe + read(4) * SURROUND_GAIN;
		right += lfe + read(5) * SURROUND_GAIN;
		for (let channel = 6; channel < channelCount; channel += 1) {
			if ((channel - 6) % 2 === 0) left += read(channel) * EXTRA_CHANNEL_GAIN;
			else right += read(channel) * EXTRA_CHANNEL_GAIN;
		}
	} else {
		left += read(3) * SURROUND_GAIN;
		right += read(4) * SURROUND_GAIN;
	}
	return [left, right];
}

function renderVideoAssetAudioSample(
	output: readonly [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>],
	sample: DecodedVideoAssetAudioSample,
	nextSample: DecodedVideoAssetAudioSample | null,
	sourceStartTimestamp: number
): boolean {
	if (
		sample.sampleRate <= 0 ||
		sample.numberOfFrames <= 0 ||
		sample.channels.length === 0 ||
		sample.channels.some((channel) => channel.length < sample.numberOfFrames)
	) {
		throw new TypeError('Decoded Video asset audio sample metadata is invalid.');
	}

	const sampleEndTimestamp = sample.timestamp + sample.numberOfFrames / sample.sampleRate;
	const nextBoundary = nextSample ? nextSample.timestamp : Number.POSITIVE_INFINITY;
	const renderEndTimestamp = Math.min(sampleEndTimestamp, nextBoundary);
	const startIndex = Math.max(
		0,
		Math.ceil(
			(sample.timestamp - sourceStartTimestamp) * VIDEO_ASSET_AUDIO_SAMPLE_RATE -
				SAMPLE_INDEX_EPSILON
		)
	);
	const endIndex = Math.min(
		output[0].length,
		Math.ceil(
			(renderEndTimestamp - sourceStartTimestamp) * VIDEO_ASSET_AUDIO_SAMPLE_RATE -
				SAMPLE_INDEX_EPSILON
		)
	);
	if (endIndex <= startIndex) return false;

	for (let outputIndex = startIndex; outputIndex < endIndex; outputIndex += 1) {
		const sourceTimestamp = sourceStartTimestamp + outputIndex / VIDEO_ASSET_AUDIO_SAMPLE_RATE;
		const sourcePosition = (sourceTimestamp - sample.timestamp) * sample.sampleRate;
		const [left, right] = downmixVideoAssetAudioFrame(sample, sourcePosition, nextSample);
		output[0][outputIndex] = left;
		output[1][outputIndex] = right;
	}
	return true;
}

export class VideoAssetAudioDecoder {
	readonly #assetUrl: string;
	readonly #services: VideoAssetAudioDecoderServices;

	constructor(
		assetUrl: string,
		services: VideoAssetAudioDecoderServices = DEFAULT_VIDEO_ASSET_AUDIO_DECODER_SERVICES
	) {
		this.#assetUrl = assetUrl;
		this.#services = services;
	}

	async decode(request: VideoAssetAudioDecodeRequest): Promise<VideoAssetAudioPcm | null> {
		const { sourceStartSeconds, sourceEndSeconds, outputSampleCount, signal } = request;
		if (!Number.isInteger(outputSampleCount) || outputSampleCount < 0) {
			throw new TypeError('Video asset audio output sample count must be a nonnegative integer.');
		}
		if (outputSampleCount === 0) return null;
		if (
			!Number.isFinite(sourceStartSeconds) ||
			sourceStartSeconds < 0 ||
			!Number.isFinite(sourceEndSeconds) ||
			sourceEndSeconds <= sourceStartSeconds
		) {
			throw new TypeError('Video asset audio decode requires a positive finite Source interval.');
		}

		signal?.throwIfAborted();
		const backend = this.#services.createBackend(this.#assetUrl);
		let isBackendDisposed = false;
		const disposeBackend = (): void => {
			if (isBackendDisposed) return;
			isBackendDisposed = true;
			backend.dispose();
		};
		const abort = (): void => disposeBackend();
		signal?.addEventListener('abort', abort, { once: true });
		try {
			const metadata = await backend.initialize();
			signal?.throwIfAborted();
			if (!metadata) return null;

			const sourceStartTimestamp = metadata.sourceFirstTimestamp + sourceStartSeconds;
			const sourceEndTimestamp = metadata.sourceFirstTimestamp + sourceEndSeconds;
			const output: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [
				new Float32Array(outputSampleCount),
				new Float32Array(outputSampleCount)
			];
			let pending: DecodedVideoAssetAudioSample | null = null;
			let hasSourceFrames = false;

			for await (const sample of backend.samples(sourceStartTimestamp, sourceEndTimestamp)) {
				signal?.throwIfAborted();
				if (pending) {
					hasSourceFrames =
						renderVideoAssetAudioSample(output, pending, sample, sourceStartTimestamp) ||
						hasSourceFrames;
				}
				pending = sample;
			}
			if (pending) {
				hasSourceFrames =
					renderVideoAssetAudioSample(output, pending, null, sourceStartTimestamp) ||
					hasSourceFrames;
			}
			return hasSourceFrames
				? { sampleRate: VIDEO_ASSET_AUDIO_SAMPLE_RATE, channels: output }
				: null;
		} catch (error) {
			if (signal?.aborted) signal.throwIfAborted();
			throw error;
		} finally {
			signal?.removeEventListener('abort', abort);
			disposeBackend();
		}
	}
}
