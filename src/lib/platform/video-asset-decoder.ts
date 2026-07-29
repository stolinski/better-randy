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

import { videoAssetPresentationTimestampAt } from '$lib/utils/video-asset-timing';

import type { VideoAsset } from './engine-schema';

export interface VideoAssetDecoderMetadata {
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

export interface DecodedVideoAssetFrame {
	sourceTimeSeconds: number;
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

interface VideoAssetDecoderBackend {
	initialize(): Promise<VideoAssetDecoderMetadata>;
	getSample(timestamp: number): Promise<VideoSample | null>;
	dispose(): void;
}

export interface VideoAssetDecoderServices {
	createBackend(assetUrl: string): VideoAssetDecoderBackend;
}

class MediabunnyVideoAssetDecoderBackend implements VideoAssetDecoderBackend {
	readonly #input: Input;
	#sink: VideoSampleSink | null = null;

	constructor(assetUrl: string) {
		this.#input = new Input({
			formats: ALL_FORMATS,
			source: new UrlSource(assetUrl, { maxCacheSize: 64 * 1024 * 1024, parallelism: 2 })
		});
	}

	async initialize(): Promise<VideoAssetDecoderMetadata> {
		const track = await this.#input.getPrimaryVideoTrack();
		if (!track) throw new TypeError('Video asset contains no video track.');
		if (!(await track.canDecode())) {
			throw new TypeError('Video asset codec is not decodable in this browser.');
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
			throw new TypeError('Video asset timing or codec metadata is invalid.');
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
		if (!this.#sink) throw new Error('Video asset decoder is not initialized.');
		return this.#sink.getSample(timestamp);
	}

	dispose(): void {
		this.#input.dispose();
		this.#sink = null;
	}
}

const DEFAULT_VIDEO_ASSET_DECODER_SERVICES: VideoAssetDecoderServices = {
	createBackend: (assetUrl) => new MediabunnyVideoAssetDecoderBackend(assetUrl)
};

export class VideoAssetDecoderSeekSupersededError extends Error {
	constructor() {
		super('Video asset seek was superseded by a newer timeline request.');
		this.name = 'VideoAssetDecoderSeekSupersededError';
	}
}

function decodedVideoAssetFrame(
	sample: VideoSample,
	sourceTimeSeconds: number,
	requestedSourceTimestamp: number
): DecodedVideoAssetFrame {
	let isClosed = false;
	return {
		sourceTimeSeconds,
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

export class VideoAssetDecoder {
	readonly #backend: VideoAssetDecoderBackend;
	#metadata: VideoAssetDecoderMetadata | null = null;
	#initializePromise: Promise<VideoAssetDecoderMetadata> | null = null;
	#requestSequence = 0;
	#isDisposed = false;

	constructor(
		asset: Pick<VideoAsset, 'assetUrl'>,
		services: VideoAssetDecoderServices = DEFAULT_VIDEO_ASSET_DECODER_SERVICES
	) {
		this.#backend = services.createBackend(asset.assetUrl);
	}

	async initialize(): Promise<VideoAssetDecoderMetadata> {
		if (this.#isDisposed) throw new Error('Video asset decoder is disposed.');
		this.#initializePromise ??= this.#backend.initialize().then((metadata) => {
			this.#metadata = metadata;
			return metadata;
		});
		return this.#initializePromise;
	}

	async frameAt(sourceTimeSeconds: number, signal?: AbortSignal): Promise<DecodedVideoAssetFrame> {
		const metadata = this.#requireMetadata();
		const requestSequence = ++this.#requestSequence;
		const requestedSourceTimestamp = videoAssetPresentationTimestampAt({
			firstTimestamp: metadata.firstTimestamp,
			sourceTimeSeconds
		});
		signal?.throwIfAborted();
		const sample = await this.#backend.getSample(requestedSourceTimestamp);
		if (!sample) {
			throw new RangeError(
				`Video asset has no frame at source time ${sourceTimeSeconds.toFixed(6)}s.`
			);
		}
		if (sample.timestamp > requestedSourceTimestamp) {
			sample.close();
			throw new RangeError(
				`Video asset decoder returned presentation timestamp ${sample.timestamp.toFixed(6)}s after requested timestamp ${requestedSourceTimestamp.toFixed(6)}s.`
			);
		}
		if (this.#isDisposed || requestSequence !== this.#requestSequence) {
			sample.close();
			throw new VideoAssetDecoderSeekSupersededError();
		}
		try {
			signal?.throwIfAborted();
		} catch (errorValue) {
			sample.close();
			throw errorValue;
		}
		return decodedVideoAssetFrame(sample, sourceTimeSeconds, requestedSourceTimestamp);
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#requestSequence += 1;
		this.#backend.dispose();
		this.#metadata = null;
	}

	#requireMetadata(): VideoAssetDecoderMetadata {
		if (this.#isDisposed) throw new Error('Video asset decoder is disposed.');
		if (!this.#metadata) throw new Error('Video asset decoder is not initialized.');
		return this.#metadata;
	}
}

interface CachedVideoAssetDecoder {
	assetUrl: string;
	decoder: VideoAssetDecoder;
}

/** Retains decoders by canonical asset identity while treating a URL change as
 * new immutable bytes. Clip trims and slips never participate in this cache. */
export class VideoAssetDecoderCache {
	readonly #services: VideoAssetDecoderServices;
	readonly #entries = new Map<string, CachedVideoAssetDecoder>();
	#isDisposed = false;

	constructor(services: VideoAssetDecoderServices = DEFAULT_VIDEO_ASSET_DECODER_SERVICES) {
		this.#services = services;
	}

	acquire(asset: Pick<VideoAsset, 'id' | 'assetUrl'>): VideoAssetDecoder {
		if (this.#isDisposed) throw new Error('Video asset decoder cache is disposed.');
		const cached = this.#entries.get(asset.id);
		if (cached?.assetUrl === asset.assetUrl) {
			return cached.decoder;
		}
		cached?.decoder.dispose();
		const decoder = new VideoAssetDecoder(asset, this.#services);
		this.#entries.set(asset.id, { assetUrl: asset.assetUrl, decoder });
		return decoder;
	}

	reconcile(assets: readonly Pick<VideoAsset, 'id' | 'assetUrl'>[]): boolean {
		if (this.#isDisposed) return false;
		const currentUrls = new Map(assets.map((asset) => [asset.id, asset.assetUrl]));
		let didDispose = false;
		for (const [assetId, cached] of this.#entries) {
			if (currentUrls.get(assetId) === cached.assetUrl) continue;
			cached.decoder.dispose();
			this.#entries.delete(assetId);
			didDispose = true;
		}
		return didDispose;
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		for (const cached of this.#entries.values()) {
			cached.decoder.dispose();
		}
		this.#entries.clear();
	}
}
