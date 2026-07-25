import {
	ALL_FORMATS,
	Input,
	UrlSource,
	VideoSampleSink,
	type Rational,
	type Rectangle,
	type Rotation,
	type VideoSample
} from 'mediabunny';

import { assertSourceVideoCoverage, sourceVideoTimestampAt } from '$lib/utils/source-video-timing';

import type { SourceVideo } from './engine-schema';

export interface SourceVideoDecoderMetadata {
	firstTimestamp: number;
	sourceDurationSeconds: number;
	codedWidth: number;
	codedHeight: number;
	displayWidth: number;
	displayHeight: number;
	rotation: Rotation;
	pixelAspectRatio: Rational;
	colorSpace: VideoColorSpaceInit;
	averageFrameRate: number;
	videoCodec: string;
}

export interface DecodedSourceVideoFrame {
	compositionTimestamp: number;
	requestedSourceTimestamp: number;
	presentationTimestamp: number;
	duration: number;
	codedWidth: number;
	codedHeight: number;
	displayWidth: number;
	displayHeight: number;
	rotation: Rotation;
	pixelAspectRatio: Rational;
	visibleRect: Rectangle;
	sample: VideoSample;
	close(): void;
}

interface SourceVideoDecoderBackend {
	initialize(): Promise<SourceVideoDecoderMetadata>;
	getSample(timestamp: number): Promise<VideoSample | null>;
	samplesAtTimestamps(
		timestamps: Iterable<number>
	): AsyncGenerator<VideoSample | null, void, unknown>;
	dispose(): void;
}

export interface SourceVideoDecoderServices {
	createBackend(assetUrl: string): SourceVideoDecoderBackend;
}

class MediabunnySourceVideoDecoderBackend implements SourceVideoDecoderBackend {
	readonly #input: Input;
	#sink: VideoSampleSink | null = null;

	constructor(assetUrl: string) {
		this.#input = new Input({
			formats: ALL_FORMATS,
			source: new UrlSource(assetUrl, { maxCacheSize: 64 * 1024 * 1024, parallelism: 2 })
		});
	}

	async initialize(): Promise<SourceVideoDecoderMetadata> {
		const track = await this.#input.getPrimaryVideoTrack();
		if (!track) throw new TypeError('Source video contains no video track.');
		if (!(await track.canDecode())) {
			throw new TypeError('Source video codec is not decodable in this browser.');
		}

		const [
			firstTimestamp,
			endTimestamp,
			codedWidth,
			codedHeight,
			displayWidth,
			displayHeight,
			rotation,
			pixelAspectRatio,
			colorSpace,
			packetStats,
			videoCodec
		] = await Promise.all([
			this.#input.getFirstTimestamp([track]),
			this.#input.computeDuration([track]),
			track.getCodedWidth(),
			track.getCodedHeight(),
			track.getDisplayWidth(),
			track.getDisplayHeight(),
			track.getRotation(),
			track.getPixelAspectRatio(),
			track.getColorSpace(),
			track.computePacketStats(120),
			track.getCodec()
		]);
		if (!videoCodec || endTimestamp <= firstTimestamp) {
			throw new TypeError('Source video timing or codec metadata is invalid.');
		}

		this.#sink = new VideoSampleSink(track);
		return {
			firstTimestamp,
			sourceDurationSeconds: endTimestamp - firstTimestamp,
			codedWidth,
			codedHeight,
			displayWidth,
			displayHeight,
			rotation,
			pixelAspectRatio,
			colorSpace,
			averageFrameRate: packetStats.averagePacketRate,
			videoCodec
		};
	}

	getSample(timestamp: number): Promise<VideoSample | null> {
		if (!this.#sink) throw new Error('Source video decoder is not initialized.');
		return this.#sink.getSample(timestamp);
	}

	samplesAtTimestamps(
		timestamps: Iterable<number>
	): AsyncGenerator<VideoSample | null, void, unknown> {
		if (!this.#sink) throw new Error('Source video decoder is not initialized.');
		return this.#sink.samplesAtTimestamps(timestamps);
	}

	dispose(): void {
		this.#input.dispose();
		this.#sink = null;
	}
}

const DEFAULT_SOURCE_VIDEO_DECODER_SERVICES: SourceVideoDecoderServices = {
	createBackend: (assetUrl) => new MediabunnySourceVideoDecoderBackend(assetUrl)
};

export class SourceVideoSeekSupersededError extends Error {
	constructor() {
		super('Source video seek was superseded by a newer timeline request.');
		this.name = 'SourceVideoSeekSupersededError';
	}
}

function decodedSourceVideoFrame(
	sample: VideoSample,
	compositionTimestamp: number,
	requestedSourceTimestamp: number
): DecodedSourceVideoFrame {
	let isClosed = false;
	return {
		compositionTimestamp,
		requestedSourceTimestamp,
		presentationTimestamp: sample.timestamp,
		duration: sample.duration,
		codedWidth: sample.codedWidth,
		codedHeight: sample.codedHeight,
		displayWidth: sample.displayWidth,
		displayHeight: sample.displayHeight,
		rotation: sample.rotation,
		pixelAspectRatio: sample.pixelAspectRatio,
		visibleRect: sample.visibleRect,
		sample,
		close: () => {
			if (isClosed) return;
			isClosed = true;
			sample.close();
		}
	};
}

export class SourceVideoDecoder {
	readonly #sourceVideo: SourceVideo;
	readonly #backend: SourceVideoDecoderBackend;
	#metadata: SourceVideoDecoderMetadata | null = null;
	#initializePromise: Promise<SourceVideoDecoderMetadata> | null = null;
	#requestSequence = 0;
	#isDisposed = false;

	constructor(
		sourceVideo: SourceVideo,
		services: SourceVideoDecoderServices = DEFAULT_SOURCE_VIDEO_DECODER_SERVICES
	) {
		this.#sourceVideo = { ...sourceVideo };
		this.#backend = services.createBackend(sourceVideo.assetUrl);
	}

	async initialize(compositionDurationSeconds: number): Promise<SourceVideoDecoderMetadata> {
		if (this.#isDisposed) throw new Error('Source video decoder is disposed.');
		this.#initializePromise ??= this.#backend.initialize().then((metadata) => {
			this.#metadata = metadata;
			return metadata;
		});
		const metadata = await this.#initializePromise;
		assertSourceVideoCoverage({
			sourceDurationSeconds: metadata.sourceDurationSeconds,
			sourceOffsetSeconds: this.#sourceVideo.sourceOffsetSeconds,
			compositionDurationSeconds
		});
		return metadata;
	}

	async frameAt(
		compositionTimestamp: number,
		signal?: AbortSignal
	): Promise<DecodedSourceVideoFrame> {
		const metadata = this.#requireMetadata();
		const requestSequence = ++this.#requestSequence;
		const requestedSourceTimestamp = sourceVideoTimestampAt({
			firstTimestamp: metadata.firstTimestamp,
			sourceOffsetSeconds: this.#sourceVideo.sourceOffsetSeconds,
			compositionTimestamp
		});
		signal?.throwIfAborted();
		const sample = await this.#backend.getSample(requestedSourceTimestamp);
		if (!sample) {
			throw new RangeError(
				`Source video has no frame at composition timestamp ${compositionTimestamp.toFixed(6)}s.`
			);
		}
		if (this.#isDisposed || requestSequence !== this.#requestSequence) {
			sample.close();
			throw new SourceVideoSeekSupersededError();
		}
		try {
			signal?.throwIfAborted();
		} catch (errorValue) {
			sample.close();
			throw errorValue;
		}
		return decodedSourceVideoFrame(sample, compositionTimestamp, requestedSourceTimestamp);
	}

	async *framesAt(
		compositionTimestamps: readonly number[],
		signal?: AbortSignal
	): AsyncGenerator<DecodedSourceVideoFrame, void, unknown> {
		const metadata = this.#requireMetadata();
		const requestSequence = ++this.#requestSequence;
		const sourceTimestamps = compositionTimestamps.map((compositionTimestamp) =>
			sourceVideoTimestampAt({
				firstTimestamp: metadata.firstTimestamp,
				sourceOffsetSeconds: this.#sourceVideo.sourceOffsetSeconds,
				compositionTimestamp
			})
		);
		let index = 0;
		for await (const sample of this.#backend.samplesAtTimestamps(sourceTimestamps)) {
			signal?.throwIfAborted();
			if (!sample) {
				throw new RangeError(
					`Source video has no frame at composition timestamp ${compositionTimestamps[index].toFixed(6)}s.`
				);
			}
			if (this.#isDisposed || requestSequence !== this.#requestSequence) {
				sample.close();
				throw new SourceVideoSeekSupersededError();
			}
			yield decodedSourceVideoFrame(sample, compositionTimestamps[index], sourceTimestamps[index]);
			index += 1;
		}
		if (index !== compositionTimestamps.length) {
			throw new Error(
				`Source video decoder returned ${index} frames for ${compositionTimestamps.length} timestamps.`
			);
		}
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#requestSequence += 1;
		this.#backend.dispose();
		this.#metadata = null;
	}

	#requireMetadata(): SourceVideoDecoderMetadata {
		if (this.#isDisposed) throw new Error('Source video decoder is disposed.');
		if (!this.#metadata) throw new Error('Source video decoder is not initialized.');
		return this.#metadata;
	}
}
