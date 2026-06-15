import { BufferTarget, CanvasSource, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';

import { fontsReady } from './fonts';

export interface TransparentVideoExportOptions {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	durationSeconds: number;
	fps: number;
	renderFrame: (frame: number, timestamp: number) => void | Promise<void>;
	onProgress?: (progress: number) => void;
	/** True when backgroundFill is set — output is opaque (VP9 alpha discarded). */
	hasBackground?: boolean;
}

async function canvasFrameToPng(
	canvas: HTMLCanvasElement | OffscreenCanvas
): Promise<Blob> {
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
	hasBackground
}: TransparentVideoExportOptions): Promise<Blob> {
	// Channel typefaces must be loaded before frame 0 or the export bakes in OS
	// fallbacks; preview gates the same way.
	await fontsReady();

	const frameCount = Math.max(1, Math.round(durationSeconds * fps));
	const frameDuration = 1 / fps;
	const target = new BufferTarget();
	const output = new Output({
		format: new WebMOutputFormat(),
		target
	});
	const source = new CanvasSource(canvas, {
		codec: 'vp9',
		bitrate: QUALITY_HIGH,
		alpha: hasBackground ? 'discard' : 'keep'
	});

	output.addVideoTrack(source);
	await output.start();

	for (let frame = 0; frame < frameCount; frame += 1) {
		const timestamp = frame * frameDuration;

		await renderFrame(frame, timestamp);
		await source.add(timestamp, frameDuration);
		onProgress?.((frame + 1) / frameCount);

		if (frame % fps === fps - 1) {
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});
		}
	}

	await output.finalize();

	if (!target.buffer) {
		throw new Error('Transparent video export finished without producing a buffer.');
	}

	return new Blob([target.buffer], { type: 'video/webm' });
}

export async function exportTransparentProRes({
	canvas,
	durationSeconds,
	fps,
	renderFrame,
	onProgress
}: TransparentVideoExportOptions): Promise<Blob> {
	await fontsReady();

	const frameCount = Math.max(1, Math.round(durationSeconds * fps));
	const chunks: Blob[] = [];

	for (let frame = 0; frame < frameCount; frame += 1) {
		const timestamp = frame / fps;

		await renderFrame(frame, timestamp);
		chunks.push(await canvasFrameToPng(canvas));
		onProgress?.((frame + 1) / frameCount);

		if (frame % fps === fps - 1) {
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});
		}
	}

	// Chrome rejects fetch() with a ReadableStream body unless the connection is
	// HTTP/2; Vite's dev server is HTTP/1.1. Buffer the PNGs into a Blob so the
	// upload uses the browser's normal body handling.
	const body = new Blob(chunks, { type: 'application/octet-stream' });
	const response = await fetch(`/api/export/prores?fps=${fps}`, {
		method: 'POST',
		body,
		headers: { 'Content-Type': 'application/octet-stream' }
	});

	if (!response.ok) {
		const text = await response.text();

		throw new Error(text || `ProRes export failed with status ${response.status}.`);
	}

	return response.blob();
}

export function downloadVideoBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
