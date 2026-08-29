import type { RenderedFramePixels } from './rendered-frame-pixels.ts';

/** Capture the native backing store as an alpha-preserving PNG. */
export async function captureCanvasPng(source: HTMLCanvasElement): Promise<Blob | null> {
	if (source.width === 0 || source.height === 0) return null;
	return new Promise<Blob | null>((resolve) => source.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * Decode an image blob into straight RGBA pixels. A WebGPU canvas cannot be
 * drawn into a 2D context directly, so every pixel reader in this codebase goes
 * canvas → PNG blob → bitmap → 2D context, and this is that second half.
 */
export async function readImageBlobPixels(blob: Blob): Promise<ImageData> {
	const bitmap = await createImageBitmap(blob);
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new Error('Could not create a 2D capture analysis context.');
		context.drawImage(bitmap, 0, 0);
		return context.getImageData(0, 0, bitmap.width, bitmap.height);
	} finally {
		bitmap.close();
	}
}

/**
 * Read the pixels a canvas has presented, in the shape
 * `measureRenderedFramePixels` measures. `null` means the canvas has no backing
 * store to read — a zero-sized canvas, or one whose capture came back empty.
 */
export async function readCanvasFramePixels(
	source: HTMLCanvasElement
): Promise<RenderedFramePixels | null> {
	const png = await captureCanvasPng(source);
	if (!png) return null;
	const pixels = await readImageBlobPixels(png);
	return { width: pixels.width, height: pixels.height, data: pixels.data };
}

/**
 * Read a live canvas (including a WebGPU-backed one) into a downscaled WebP
 * blob. On a WebGPU canvas `createImageBitmap(canvas)` / `drawImage(canvas)`
 * come back empty, but `toBlob` reliably reads the presented frame — so we read
 * via `toBlob`, then downscale by going through the resulting blob (a reliable
 * `createImageBitmap` source). Used to capture composition posters from the
 * settled render.
 */
export async function captureCanvasWebp(
	source: HTMLCanvasElement,
	maxWidth = 640,
	quality = 0.82
): Promise<Blob | null> {
	if (source.width === 0 || source.height === 0) return null;

	const fullBlob = await new Promise<Blob | null>((resolve) =>
		source.toBlob((blob) => resolve(blob), 'image/webp', quality)
	);
	if (!fullBlob) return null;

	const scale = Math.min(1, maxWidth / source.width);
	if (scale >= 1) return fullBlob;

	const width = Math.max(1, Math.round(source.width * scale));
	const height = Math.max(1, Math.round(source.height * scale));
	const bitmap = await createImageBitmap(fullBlob);
	try {
		const off = new OffscreenCanvas(width, height);
		const ctx = off.getContext('2d');
		if (!ctx) return fullBlob;
		ctx.drawImage(bitmap, 0, 0, width, height);
		return await off.convertToBlob({ type: 'image/webp', quality });
	} finally {
		bitmap.close();
	}
}
