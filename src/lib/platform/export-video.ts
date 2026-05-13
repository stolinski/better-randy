import { BufferTarget, CanvasSource, Output, QUALITY_MEDIUM, WebMOutputFormat } from 'mediabunny';

export interface TransparentVideoExportOptions {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	durationSeconds: number;
	fps: number;
	renderFrame: (frame: number, timestamp: number) => void | Promise<void>;
	onProgress?: (progress: number) => void;
}

export async function exportTransparentWebM({
	canvas,
	durationSeconds,
	fps,
	renderFrame,
	onProgress
}: TransparentVideoExportOptions): Promise<Blob> {
	const frameCount = Math.max(1, Math.round(durationSeconds * fps));
	const frameDuration = 1 / fps;
	const target = new BufferTarget();
	const output = new Output({
		format: new WebMOutputFormat(),
		target
	});
	const source = new CanvasSource(canvas, {
		codec: 'vp9',
		bitrate: QUALITY_MEDIUM,
		alpha: 'keep'
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

export function downloadVideoBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
