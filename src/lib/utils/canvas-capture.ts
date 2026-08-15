/** Capture the native backing store as an alpha-preserving PNG. */
export async function captureCanvasPng(source: HTMLCanvasElement): Promise<Blob | null> {
	if (source.width === 0 || source.height === 0) return null;
	return new Promise<Blob | null>((resolve) => source.toBlob((blob) => resolve(blob), 'image/png'));
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
