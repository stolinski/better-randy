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

declare global {
	interface Window {
		/**
		 * Workspace-bound export seam (peer to `__supersTimeline`): lets an
		 * agent drive the real export path with a `SyncExportRequest`. Set
		 * while a Workspace is mounted.
		 */
		__supersExport?: (request?: SyncExportRequest) => Promise<void>;
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
}: TransparentVideoExportOptions): Promise<Blob> {
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
			await fontsReady();
			signal?.throwIfAborted();

			// Frame math runs on the exact rational (ADR-0042): the exported duration
			// is a whole frame count at the composition rate, and each timestamp is
			// the frame's exact time — 29.97 the literal never touches the loop.
			const rate = resolveFrameRate(fps);
			const frameCount = plannedFrameCount ?? Math.max(1, secondsToFrames(durationSeconds, rate));
			exportSpan.setAttribute('export.frames', frameCount);
			const yieldEvery = Math.max(1, Math.round(rate.num / rate.den));
			const chunks: Blob[] = [];

			await Sentry.startSpan({ name: 'export.render-frames', op: 'export.render' }, async () => {
				for (let frame = 0; frame < frameCount; frame += 1) {
					signal?.throwIfAborted();
					const timestamp = timestampForFrame?.(frame) ?? framesToSeconds(frame, rate);

					await renderFrame(frame, timestamp);
					signal?.throwIfAborted();
					chunks.push(await canvasFrameToPng(canvas));
					onProgress?.((frame + 1) / frameCount);

					if ((frame + 1) % yieldEvery === 0) {
						await new Promise<void>((resolve) => {
							requestAnimationFrame(() => resolve());
						});
					}
				}
			});

			const wavBytes = audio ? audioBufferToWavBytes(audio) : null;
			const body = new Blob(wavBytes ? [wavBytes, ...chunks] : chunks, {
				type: 'application/octet-stream'
			});
			const response = await Sentry.startSpan(
				{
					name: 'export.encode',
					op: 'export.encode',
					attributes: { 'export.upload_bytes': body.size }
				},
				() =>
					fetch(`/api/export/webm?fps=${fps}&opaque=${hasBackground === true}`, {
						method: 'POST',
						body,
						signal,
						headers: {
							'Content-Type': 'application/octet-stream',
							...(wavBytes ? { 'x-supers-audio-bytes': String(wavBytes.byteLength) } : {})
						}
					})
			);

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || `WebM export failed with status ${response.status}.`);
			}

			return response.blob();
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
}: TransparentVideoExportOptions): Promise<Blob> {
	// Same transaction shape as the WebM path — see exportTransparentWebM.
	return Sentry.startSpan(
		{
			name: 'export.prores',
			op: 'export',
			forceTransaction: true,
			attributes: exportSpanAttributes({ fps, durationSeconds, audio })
		},
		async (exportSpan) => {
			await fontsReady();
			signal?.throwIfAborted();

			// Frame math runs on the exact rational (ADR-0042) — see the WebM path.
			const rate = resolveFrameRate(fps);
			const frameCount = plannedFrameCount ?? Math.max(1, secondsToFrames(durationSeconds, rate));
			exportSpan.setAttribute('export.frames', frameCount);
			const yieldEvery = Math.max(1, Math.round(rate.num / rate.den));
			const chunks: Blob[] = [];

			await Sentry.startSpan({ name: 'export.render-frames', op: 'export.render' }, async () => {
				for (let frame = 0; frame < frameCount; frame += 1) {
					signal?.throwIfAborted();
					const timestamp = timestampForFrame?.(frame) ?? framesToSeconds(frame, rate);

					await renderFrame(frame, timestamp);
					signal?.throwIfAborted();
					chunks.push(await canvasFrameToPng(canvas));
					onProgress?.((frame + 1) / frameCount);

					if ((frame + 1) % yieldEvery === 0) {
						await new Promise<void>((resolve) => {
							requestAnimationFrame(() => resolve());
						});
					}
				}
			});

			// The offline mix rides ahead of the PNG stream as a WAV prefix; the
			// endpoint splits on the declared byte length and hands ffmpeg the WAV as
			// its second input (ADR-0033 §6).
			const wavBytes = audio ? audioBufferToWavBytes(audio) : null;

			// Chrome rejects fetch() with a ReadableStream body unless the connection is
			// HTTP/2; Vite's dev server is HTTP/1.1. Buffer the PNGs into a Blob so the
			// upload uses the browser's normal body handling.
			const body = new Blob(wavBytes ? [wavBytes, ...chunks] : chunks, {
				type: 'application/octet-stream'
			});
			const timecodeParam = startTimecode ? `&tc=${encodeURIComponent(startTimecode)}` : '';
			const response = await Sentry.startSpan(
				{
					name: 'export.encode',
					op: 'export.encode',
					attributes: { 'export.upload_bytes': body.size }
				},
				() =>
					fetch(`/api/export/prores?fps=${fps}${timecodeParam}`, {
						method: 'POST',
						body,
						signal,
						headers: {
							'Content-Type': 'application/octet-stream',
							...(wavBytes ? { 'x-supers-audio-bytes': String(wavBytes.byteLength) } : {})
						}
					})
			);

			if (!response.ok) {
				const text = await response.text();

				throw new Error(text || `ProRes export failed with status ${response.status}.`);
			}

			return response.blob();
		}
	);
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
