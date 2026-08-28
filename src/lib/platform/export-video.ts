import * as Sentry from '@sentry/sveltekit';

import { audioBufferToWavBytes } from '$lib/utils/audio-wav';
import { framesToSeconds, resolveFrameRate, secondsToFrames } from '$lib/utils/composition-timing';

import { fontsReady } from './fonts';

export interface TransparentVideoExportOptions {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	durationSeconds: number;
	fps: number;
	/** Optional precomputed frame plan supplied by the composition export controller. */
	frameCount?: number;
	timestampForFrame?: (frame: number) => number;
	renderFrame: (frame: number, timestamp: number) => void | Promise<void>;
	onProgress?: (progress: number) => void;
	signal?: AbortSignal;
	/** True when backgroundFill is set — output is opaque (VP9 alpha discarded). */
	hasBackground?: boolean;
	/**
	 * The composition's deterministic offline audio mix (ADR-0033 §6), baked
	 * into the deliverable as its audio track. null/absent = no audio track —
	 * a soundless piece must not carry a silent stream.
	 */
	audio?: AudioBuffer | null;
	/**
	 * Optional non-drop `HH:MM:SS:FF` start timecode stamped into the ProRes
	 * .mov's tmcd track (ADR-0042) so the NLE lands the piece at its
	 * edit-authored frame. A sync-session value, never Preset data (the Preset
	 * carries no edit anchor). Ignored by the WebM path — Matroska carries no
	 * start-timecode concept.
	 */
	startTimecode?: string;
}

/**
 * Agent-facing export request (ADR-0042 marker-sync loop): supply the
 * embedded start timecode and the sync export filename
 * (`<slug>__<TC>__<frames>f__v<version>.mov`). The GUI export button passes
 * neither — its downloads keep the `supers-overlay` / `supers-bumper` names.
 */
export interface SyncExportRequest {
	startTimecode?: string;
	filename?: string;
}

export interface VideoExportDownload {
	downloadUrl: string;
}

interface ExportSessionControl {
	sessionId: string;
	audioUrl: string;
	frameUrlTemplate: string;
	completeUrl: string;
	cancelUrl: string;
}

declare global {
	interface Window {
		/**
		 * Workspace-bound export seam (peer to `__gfxTimeline`): lets an
		 * agent drive the real export path with a `SyncExportRequest`. Set
		 * while a Workspace is mounted.
		 */
		__gfxExport?: (request?: SyncExportRequest) => Promise<void>;
	}
}

/**
 * Span attributes shared by both export transactions (docs/sentry-dev-flow.md).
 * `export.route` is the `/p/<slug>` path — the per-composition dimension for
 * "which pieces are slow to export" charts.
 */
function exportSpanAttributes(
	options: Pick<TransparentVideoExportOptions, 'fps' | 'durationSeconds' | 'hasBackground' | 'audio'>
): Record<string, string | number | boolean> {
	return {
		'export.fps': options.fps,
		'export.duration_seconds': options.durationSeconds,
		'export.opaque': options.hasBackground === true,
		'export.has_audio': options.audio != null,
		'export.route': typeof window !== 'undefined' ? window.location.pathname : ''
	};
}

async function canvasFrameToPng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
	if (canvas instanceof OffscreenCanvas) {
		return canvas.convertToBlob({ type: 'image/png' });
	}

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((result) => {
			if (result) {
				resolve(result);
			} else {
				reject(new Error('Failed to encode canvas frame as PNG.'));
			}
		}, 'image/png');
	});
}

async function responseFailure(response: Response, fallback: string): Promise<Error> {
	const message = await response.text();
	return new Error(message || `${fallback} with status ${response.status}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function createExportSession(options: {
	format: 'webm' | 'prores';
	fps: number;
	frameCount: number;
	opaque: boolean;
	audioBytes: number;
	startTimecode?: string;
	signal?: AbortSignal;
}): Promise<ExportSessionControl> {
	const { signal, ...metadata } = options;
	const response = await fetch('/api/export/sessions', {
		method: 'POST',
		signal,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(metadata)
	});
	if (!response.ok) throw await responseFailure(response, 'Export session creation failed');
	const value: unknown = await response.json();
	if (
		!isRecord(value) ||
		typeof value.sessionId !== 'string' ||
		typeof value.audioUrl !== 'string' ||
		typeof value.frameUrlTemplate !== 'string' ||
		typeof value.completeUrl !== 'string' ||
		typeof value.cancelUrl !== 'string'
	) {
		throw new Error('Export session returned an invalid control document.');
	}
	return {
		sessionId: value.sessionId,
		audioUrl: value.audioUrl,
		frameUrlTemplate: value.frameUrlTemplate,
		completeUrl: value.completeUrl,
		cancelUrl: value.cancelUrl
	};
}

async function cancelExportSession(session: ExportSessionControl): Promise<void> {
	await fetch(session.cancelUrl, { method: 'DELETE', keepalive: true }).catch(() => undefined);
}

async function exportCanvasVideo(
	format: 'webm' | 'prores',
	options: TransparentVideoExportOptions
): Promise<VideoExportDownload> {
	const {
		canvas,
		durationSeconds,
		fps,
		renderFrame,
		onProgress,
		hasBackground,
		audio,
		startTimecode,
		frameCount: plannedFrameCount,
		timestampForFrame,
		signal
	} = options;
	await fontsReady();
	signal?.throwIfAborted();

	const rate = resolveFrameRate(fps);
	const frameCount = plannedFrameCount ?? Math.max(1, secondsToFrames(durationSeconds, rate));
	const yieldEvery = Math.max(1, Math.round(rate.num / rate.den));
	const wavBytes = audio ? audioBufferToWavBytes(audio) : null;
	let session: ExportSessionControl | null = null;
	let isComplete = false;
	try {
		session = await createExportSession({
			format,
			fps,
			frameCount,
			opaque: hasBackground === true,
			audioBytes: wavBytes?.byteLength ?? 0,
			startTimecode,
			signal
		});
		const activeSession = session;
		if (wavBytes) {
			const audioResponse = await fetch(activeSession.audioUrl, {
				method: 'PUT',
				signal,
				headers: { 'Content-Type': 'audio/wav' },
				body: new Blob([wavBytes], { type: 'audio/wav' })
			});
			if (!audioResponse.ok) {
				throw await responseFailure(audioResponse, 'Export audio upload failed');
			}
		}

		await Sentry.startSpan({ name: 'export.render-frames', op: 'export.render' }, async () => {
			for (let frame = 0; frame < frameCount; frame += 1) {
				signal?.throwIfAborted();
				const timestamp = timestampForFrame?.(frame) ?? framesToSeconds(frame, rate);
				await renderFrame(frame, timestamp);
				signal?.throwIfAborted();
				const png = await canvasFrameToPng(canvas);
				const frameResponse = await fetch(
					activeSession.frameUrlTemplate.replace('{frame}', String(frame)),
					{
						method: 'PUT',
						signal,
						headers: { 'Content-Type': 'image/png' },
						body: png
					}
				);
				if (!frameResponse.ok) {
					throw await responseFailure(frameResponse, `Export frame ${frame} upload failed`);
				}
				onProgress?.((frame + 1) / frameCount);
				if ((frame + 1) % yieldEvery === 0) {
					await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
				}
			}
		});

		const response = await fetch(activeSession.completeUrl, { method: 'POST', signal });
		if (!response.ok) throw await responseFailure(response, `${format} export failed`);
		const value: unknown = await response.json();
		if (!isRecord(value) || typeof value.downloadUrl !== 'string') {
			throw new Error('Export completion returned an invalid download document.');
		}
		signal?.throwIfAborted();
		isComplete = true;
		return { downloadUrl: value.downloadUrl };
	} finally {
		if (session && !isComplete) await cancelExportSession(session);
	}
}

export async function exportTransparentWebM({
	canvas,
	durationSeconds,
	fps,
	renderFrame,
	onProgress,
	hasBackground,
	audio,
	frameCount: plannedFrameCount,
	timestampForFrame,
	signal
}: TransparentVideoExportOptions): Promise<VideoExportDownload> {
	// The whole export is its own Sentry transaction: total wall-clock is the
	// headline metric, the render-loop and encode-upload children break it down.
	return Sentry.startSpan(
		{
			name: 'export.webm',
			op: 'export',
			forceTransaction: true,
			attributes: exportSpanAttributes({ fps, durationSeconds, hasBackground, audio })
		},
		async (exportSpan) => {
			const rate = resolveFrameRate(fps);
			const frameCount = plannedFrameCount ?? Math.max(1, secondsToFrames(durationSeconds, rate));
			exportSpan.setAttribute('export.frames', frameCount);
			return Sentry.startSpan({ name: 'export.encode', op: 'export.encode' }, () =>
				exportCanvasVideo('webm', {
					canvas,
					durationSeconds,
					fps,
					renderFrame,
					onProgress,
					hasBackground,
					audio,
					frameCount: plannedFrameCount,
					timestampForFrame,
					signal
				})
			);
		}
	);
}

export async function exportTransparentProRes({
	canvas,
	durationSeconds,
	fps,
	renderFrame,
	onProgress,
	audio,
	startTimecode,
	frameCount: plannedFrameCount,
	timestampForFrame,
	signal
}: TransparentVideoExportOptions): Promise<VideoExportDownload> {
	// Same transaction shape as the WebM path — see exportTransparentWebM.
	return Sentry.startSpan(
		{
			name: 'export.prores',
			op: 'export',
			forceTransaction: true,
			attributes: exportSpanAttributes({ fps, durationSeconds, audio })
		},
		async (exportSpan) => {
			const rate = resolveFrameRate(fps);
			const frameCount = plannedFrameCount ?? Math.max(1, secondsToFrames(durationSeconds, rate));
			exportSpan.setAttribute('export.frames', frameCount);
			return Sentry.startSpan({ name: 'export.encode', op: 'export.encode' }, () =>
				exportCanvasVideo('prores', {
					canvas,
					durationSeconds,
					fps,
					renderFrame,
					onProgress,
					audio,
					startTimecode,
					frameCount: plannedFrameCount,
					timestampForFrame,
					signal
				})
			);
		}
	);
}

export function downloadVideoExport(exportedVideo: VideoExportDownload, filename: string): void {
	const link = document.createElement('a');
	link.href = exportedVideo.downloadUrl;
	link.download = filename;
	link.click();
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	try {
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
	} finally {
		URL.revokeObjectURL(url);
	}
}
