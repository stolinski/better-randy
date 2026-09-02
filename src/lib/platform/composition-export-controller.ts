import * as Sentry from '@sentry/sveltekit';

import { audioBufferToWavBytes } from '$lib/utils/audio-wav';
import {
	framesToSeconds,
	resolveFrameRate,
	secondsToFrames,
	type FrameRate
} from '$lib/utils/composition-timing';
import { isEngineStateOpaque, isTransitionOpaque } from '$lib/utils/output-classification';
import { getVideoFrameSize, type VideoFrameSize } from '$lib/utils/video-frame';

import { AnimationManager, type AnimationManifest } from './animation-manager';
import { renderAudioMix, type AudioMixRenderRequest } from './audio-mix';
import { exportWebMInBrowser } from './browser-webm-export';
import {
	isCompositionExportFormatAvailable,
	unavailableCompositionExportFormatMessage
} from './composition-export-formats';
import type { CompositionFrameRenderResult } from './composition-frame-renderer';
import type { EngineState, Preset } from './engine-schema';
import { IS_HOSTED_ORIGIN } from './hosted-origin';
import {
	videoTrackExportSentryContext,
	videoTrackExportSentryTags
} from './video-track-export-sentry';
import {
	downloadBlob,
	downloadVideoExport,
	exportTransparentProRes,
	exportTransparentWebM,
	type SyncExportRequest,
	type TransparentVideoExportOptions,
	type VideoExportDownload
} from './export-video';

export type CompositionExportCodec = 'vp9-alpha' | 'vp9-opaque' | 'prores-4444';
export type CompositionOutputClassification = 'transparent' | 'opaque';

export interface CompositionExportFrame {
	frame: number;
	timestamp: number;
}

export interface CompositionExportPlan {
	format: EngineState['transport']['format'];
	codec: CompositionExportCodec;
	output: CompositionOutputClassification;
	size: VideoFrameSize;
	durationSeconds: number;
	fps: number;
	frameRate: FrameRate;
	frameCount: number;
	basename: 'gfx-overlay' | 'gfx-bumper';
	videoFilename: string;
	wavFilename: string;
	startTimecode?: string;
}

export interface CompositionExportTransition {
	from: Preset;
	to: Preset;
}

export interface CompositionExportUiState {
	isExporting: boolean;
	progress: number;
	status: string;
}

/**
 * What one export invocation really did. The GUI reads this as status text; the
 * `delivery` family turns it into a receipt or a corrective refusal, which is
 * why every way an export can end has its own case rather than collapsing into
 * "finished". A `delivered` outcome means the browser received the whole encoded
 * file — never that an encode was queued or a download was merely started
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §7).
 */
export type CompositionExportOutcome =
	| {
			status: 'delivered';
			plan: CompositionExportPlan;
			/** Bytes the browser actually received — the proof the download landed. */
			videoByteLength: number;
			/** The sidecar WAV filename, or null when audio stayed in the video. */
			wavFilename: string | null;
	  }
	| { status: 'busy' }
	| { status: 'unavailable'; message: string }
	| { status: 'cancelled' }
	| { status: 'failed'; message: string };

interface CompositionExportAnimationManager {
	rebuild(manifest: AnimationManifest): void;
	progress(fraction: number): void;
	dispose(): void;
}

export interface CompositionExportControllerDependencies {
	readState(): EngineState;
	readTransition(): CompositionExportTransition | null;
	readCanvas(): HTMLCanvasElement | OffscreenCanvas | null;
	isFrameRendererReady(): boolean;
	readSeparateWav(): boolean;
	pauseTimeline(): void;
	buildAnimationManifest(): AnimationManifest;
	writeGlobalProgress(fraction: number): void;
	waitForCompositionResources(signal: AbortSignal): Promise<void>;
	flushDom(): Promise<void>;
	settleCompositionPaint(signal: AbortSignal): Promise<void>;
	prepareCompositionFrame(frame: number, timestamp: number): Promise<void>;
	renderCompositionFrame(timestamp: number): CompositionFrameRenderResult;
	writeExportUiState(state: CompositionExportUiState): void;
}

export interface CompositionExportControllerServices {
	createAnimationManager(): CompositionExportAnimationManager;
	renderAudio(request: AudioMixRenderRequest): Promise<AudioBuffer | null>;
	exportWebM(options: TransparentVideoExportOptions): Promise<VideoExportDownload>;
	exportProRes(options: TransparentVideoExportOptions): Promise<VideoExportDownload>;
	/** Resolves with the delivered byte count once the browser holds the file. */
	downloadVideo(video: VideoExportDownload, filename: string, signal: AbortSignal): Promise<number>;
	downloadBlob(blob: Blob, filename: string): void;
	encodeWav(audio: AudioBuffer): Uint8Array;
	reportFailure(message: string, error: unknown): void;
}

// The hosted origin has no encoder, so its WebM lane is the browser's and its
// ProRes lane does not exist; `buildCompositionExportPlan` refuses the format
// before this seam is reached, and the seam refuses again rather than reaching
// for a transport the origin answers 404 for.
const DEFAULT_SERVICES: CompositionExportControllerServices = {
	createAnimationManager: () => new AnimationManager(),
	renderAudio: renderAudioMix,
	exportWebM: IS_HOSTED_ORIGIN ? exportWebMInBrowser : exportTransparentWebM,
	exportProRes: IS_HOSTED_ORIGIN
		? () => Promise.reject(new Error(unavailableCompositionExportFormatMessage('prores')))
		: exportTransparentProRes,
	downloadVideo: downloadVideoExport,
	downloadBlob,
	encodeWav: audioBufferToWavBytes,
	reportFailure: (message, error) => console.error(message, error)
};

function compositionExportErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unable to export overlay.';
}

function isCompositionExportCancellation(error: unknown, signal: AbortSignal): boolean {
	return signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
}

function assertNativeCanvasSize(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	size: VideoFrameSize
): void {
	if (canvas.width !== size.width || canvas.height !== size.height) {
		throw new Error(
			`Export canvas must be ${size.width}x${size.height}, got ${canvas.width}x${canvas.height}.`
		);
	}
}

/** Resolve the immutable media contract used by one export invocation. */
export function buildCompositionExportPlan(options: {
	state: EngineState;
	transition: CompositionExportTransition | null;
	request?: SyncExportRequest;
}): CompositionExportPlan {
	const { state, transition, request } = options;
	const { durationSeconds, fps, format, orientation } = state.transport;
	if (!isCompositionExportFormatAvailable(format)) {
		throw new Error(unavailableCompositionExportFormatMessage(format));
	}
	if (request?.startTimecode && format !== 'prores') {
		throw new Error('A start timecode requires the ProRes format.');
	}

	const frameRate = resolveFrameRate(fps);
	const frameCount = Math.max(1, secondsToFrames(durationSeconds, frameRate));
	const isOpaque = transition ? isTransitionOpaque(transition) : isEngineStateOpaque(state);
	const output: CompositionOutputClassification = isOpaque ? 'opaque' : 'transparent';
	const basename = isOpaque ? 'gfx-bumper' : 'gfx-overlay';
	const extension = format === 'prores' ? 'mov' : 'webm';
	const codec: CompositionExportCodec =
		format === 'prores' ? 'prores-4444' : isOpaque ? 'vp9-opaque' : 'vp9-alpha';

	return {
		format,
		codec,
		output,
		size: getVideoFrameSize(orientation),
		durationSeconds,
		fps,
		frameRate,
		frameCount,
		basename,
		videoFilename: request?.filename ?? `${basename}.${extension}`,
		wavFilename: `${basename}.wav`,
		startTimecode: request?.startTimecode
	};
}

/** Exact rational frame index → timestamp mapping for preview/export parity. */
export function compositionExportFrameAt(
	plan: Pick<CompositionExportPlan, 'frameCount' | 'frameRate'>,
	frame: number
): CompositionExportFrame {
	if (!Number.isInteger(frame) || frame < 0 || frame >= plan.frameCount) {
		throw new RangeError(`Export frame ${frame} is outside 0..${plan.frameCount - 1}.`);
	}
	return { frame, timestamp: framesToSeconds(frame, plan.frameRate) };
}

/**
 * Owns one export operation at a time. Workspace remains the composition root:
 * it supplies live Svelte/DOM/GPU callbacks, while this controller owns media
 * planning, deterministic stepping, audio/video handoff, state, and cleanup.
 */
export class CompositionExportController {
	readonly #services: CompositionExportControllerServices;
	#activeAbortController: AbortController | null = null;
	#uiState: CompositionExportUiState = { isExporting: false, progress: 0, status: '' };
	#isDisposed = false;

	constructor(services: CompositionExportControllerServices = DEFAULT_SERVICES) {
		this.#services = services;
	}

	async export(
		dependencies: CompositionExportControllerDependencies,
		request?: SyncExportRequest,
		externalSignal?: AbortSignal
	): Promise<CompositionExportOutcome> {
		if (this.#isDisposed || this.#activeAbortController) {
			return { status: 'busy' };
		}
		if (externalSignal?.aborted) {
			return { status: 'cancelled' };
		}

		const canvas = dependencies.readCanvas();
		if (!canvas || !dependencies.isFrameRendererReady()) {
			this.#publish(dependencies, { status: 'Stage is unavailable.' });
			return { status: 'unavailable', message: 'Stage is unavailable.' };
		}

		let plan: CompositionExportPlan;
		try {
			plan = buildCompositionExportPlan({
				state: dependencies.readState(),
				transition: dependencies.readTransition(),
				request
			});
			assertNativeCanvasSize(canvas, plan.size);
		} catch (error) {
			const message = compositionExportErrorMessage(error);
			this.#publish(dependencies, { status: message });
			return { status: 'unavailable', message };
		}

		const abortController = new AbortController();
		const { signal } = abortController;
		// A caller's own signal cancels the same run the Export button cancels;
		// there is one export at a time and one way to stop it.
		const relayExternalAbort = (): void => abortController.abort();
		externalSignal?.addEventListener('abort', relayExternalAbort, { once: true });
		this.#activeAbortController = abortController;
		const animationManager = this.#services.createAnimationManager();
		const state = dependencies.readState();

		dependencies.pauseTimeline();
		this.#publish(dependencies, { isExporting: true, progress: 0, status: '' });

		try {
			await dependencies.waitForCompositionResources(signal);
			signal.throwIfAborted();
			animationManager.rebuild(dependencies.buildAnimationManifest());
			const audio = await this.#services.renderAudio({
				state,
				frameCount: plan.frameCount,
				frameRate: plan.frameRate,
				signal
			});
			signal.throwIfAborted();

			const renderFrame: TransparentVideoExportOptions['renderFrame'] = async (frame) => {
				signal.throwIfAborted();
				const exportFrame = compositionExportFrameAt(plan, frame);
				const { timestamp } = exportFrame;
				const fraction = plan.durationSeconds > 0 ? timestamp / plan.durationSeconds : 0;
				animationManager.progress(fraction);
				dependencies.writeGlobalProgress(fraction);
				await dependencies.flushDom();
				await dependencies.settleCompositionPaint(signal);
				await dependencies.prepareCompositionFrame(exportFrame.frame, timestamp);
				signal.throwIfAborted();
				if (dependencies.renderCompositionFrame(timestamp) === 'unavailable') {
					throw new Error('Composition frame renderer is unavailable.');
				}
			};

			const exportOptions: TransparentVideoExportOptions = {
				canvas,
				durationSeconds: plan.durationSeconds,
				fps: plan.fps,
				frameCount: plan.frameCount,
				timestampForFrame: (frame) => compositionExportFrameAt(plan, frame).timestamp,
				onProgress: (progress) => {
					if (!signal.aborted) this.#publish(dependencies, { progress });
				},
				renderFrame,
				audio,
				signal
			};

			const videoTrackContext = videoTrackExportSentryContext(state);
			const video = await Sentry.withScope(async (scope) => {
				scope.setTags(videoTrackExportSentryTags(videoTrackContext));
				scope.setContext('media_video_track', videoTrackContext);
				return plan.format === 'prores'
					? this.#services.exportProRes({
							...exportOptions,
							startTimecode: plan.startTimecode
						})
					: this.#services.exportWebM({
							...exportOptions,
							hasBackground: plan.output === 'opaque'
						});
			});
			signal.throwIfAborted();
			// The receipt below is only reachable once this resolves, so a download
			// the browser never completed cannot be reported as a delivered file.
			const videoByteLength = await this.#services.downloadVideo(video, plan.videoFilename, signal);

			let wavFilename: string | null = null;
			if (dependencies.readSeparateWav() && audio) {
				signal.throwIfAborted();
				const wavBytes = new Uint8Array(this.#services.encodeWav(audio));
				this.#services.downloadBlob(new Blob([wavBytes], { type: 'audio/wav' }), plan.wavFilename);
				wavFilename = plan.wavFilename;
			}
			return { status: 'delivered', plan, videoByteLength, wavFilename };
		} catch (error) {
			if (isCompositionExportCancellation(error, signal)) {
				return { status: 'cancelled' };
			}
			const message = compositionExportErrorMessage(error);
			this.#services.reportFailure('Unable to export overlay.', error);
			this.#publish(dependencies, { status: message });
			return { status: 'failed', message };
		} finally {
			externalSignal?.removeEventListener('abort', relayExternalAbort);
			animationManager.dispose();
			if (this.#activeAbortController === abortController) {
				this.#activeAbortController = null;
			}
			this.#publish(dependencies, { isExporting: false });
		}
	}

	cancel(): void {
		this.#activeAbortController?.abort();
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.cancel();
	}

	#publish(
		dependencies: CompositionExportControllerDependencies,
		patch: Partial<CompositionExportUiState>
	): void {
		this.#uiState = { ...this.#uiState, ...patch };
		dependencies.writeExportUiState({ ...this.#uiState });
	}
}
