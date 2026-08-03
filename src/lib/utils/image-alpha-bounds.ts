export interface ImageAlphaBounds {
	/** Fractions of the image size, 0–1; left < right, top < bottom. */
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface MeasureImageAlphaBoundsOptions {
	/** Downsample width for the alpha scan; height follows the aspect. Default 96. */
	sampleWidth?: number;
	/** 0–255 alpha above which a pixel counts as content. Default 16. */
	alphaThreshold?: number;
	/**
	 * Per-axis coverage at or above which the image counts as full-frame and
	 * null is returned (there is nothing useful to crop to). Default 0.92.
	 */
	fullFrameCoverage?: number;
}

/**
 * Bounding box of non-transparent pixels in a same-origin image, as fractions
 * of the image size. Returns null for effectively full-frame images (content
 * reaches nearly every edge), fully transparent images, and images whose
 * pixels cannot be read (canvas taint) — callers treat null as "show whole".
 */
export function measureImageAlphaBounds(
	image: HTMLImageElement,
	options?: MeasureImageAlphaBoundsOptions
): ImageAlphaBounds | null {
	const sampleWidth = options?.sampleWidth ?? 96;
	const alphaThreshold = options?.alphaThreshold ?? 16;
	const fullFrameCoverage = options?.fullFrameCoverage ?? 0.92;

	const { naturalWidth, naturalHeight } = image;
	if (naturalWidth === 0 || naturalHeight === 0) return null;

	const width = Math.min(sampleWidth, naturalWidth);
	const height = Math.max(1, Math.round((width * naturalHeight) / naturalWidth));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;

	let data: Uint8ClampedArray;
	try {
		context.drawImage(image, 0, 0, width, height);
		data = context.getImageData(0, 0, width, height).data;
	} catch {
		return null;
	}

	// Percentile-mass bounds rather than absolute min/max: sum alpha per column
	// and per row, then take the [2%, 98%] cumulative-mass window. A stray speck
	// (timestamp, read receipt, registration mark) far from the real content no
	// longer drags the crop out to the frame edge.
	const columnMass = new Float64Array(width);
	const rowMass = new Float64Array(height);
	let totalMass = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const alpha = data[(y * width + x) * 4 + 3];
			if (alpha > alphaThreshold) {
				columnMass[x] += alpha;
				rowMass[y] += alpha;
				totalMass += alpha;
			}
		}
	}
	if (totalMass === 0) return null;

	const TRIM = 0.02;
	function massWindow(mass: Float64Array): { start: number; end: number } {
		const low = totalMass * TRIM;
		const high = totalMass * (1 - TRIM);
		let cumulative = 0;
		let start = 0;
		let end = mass.length;
		for (let i = 0; i < mass.length; i++) {
			const next = cumulative + mass[i];
			if (cumulative <= low && next > low) start = i;
			if (cumulative < high && next >= high) {
				end = i + 1;
				break;
			}
			cumulative = next;
		}
		return { start, end };
	}

	const xWindow = massWindow(columnMass);
	const yWindow = massWindow(rowMass);
	const bounds: ImageAlphaBounds = {
		left: xWindow.start / width,
		top: yWindow.start / height,
		right: xWindow.end / width,
		bottom: yWindow.end / height
	};
	if (
		bounds.right - bounds.left >= fullFrameCoverage &&
		bounds.bottom - bounds.top >= fullFrameCoverage
	) {
		return null;
	}
	return bounds;
}

/**
 * CSS `object-view-box` inset() cropping an image to its alpha content plus
 * breathing room, so a transparent overlay composition reads large in a
 * thumbnail instead of tiny in a 4K frame. Null means "show the frame whole"
 * (full-frame content, unreadable pixels, or an empty image).
 */
export function imageContentViewBoxInset(
	image: HTMLImageElement,
	options?: MeasureImageAlphaBoundsOptions
): string | null {
	const bounds = measureImageAlphaBounds(image, options);
	if (!bounds) return null;

	const spanX = bounds.right - bounds.left;
	const spanY = bounds.bottom - bounds.top;
	const pad = Math.max(spanX, spanY) * 0.1;
	let left = bounds.left - pad;
	let top = bounds.top - pad;
	let right = bounds.right + pad;
	let bottom = bounds.bottom + pad;

	// Never zoom harder than 5× per axis — a lone speck of content should read
	// as a small mark in the frame, not fill the thumbnail.
	const MIN_SPAN = 0.2;
	if (right - left < MIN_SPAN) {
		const centerX = (left + right) / 2;
		left = centerX - MIN_SPAN / 2;
		right = centerX + MIN_SPAN / 2;
	}
	if (bottom - top < MIN_SPAN) {
		const centerY = (top + bottom) / 2;
		top = centerY - MIN_SPAN / 2;
		bottom = centerY + MIN_SPAN / 2;
	}
	left = Math.max(0, left);
	top = Math.max(0, top);
	right = Math.min(1, right);
	bottom = Math.min(1, bottom);

	const pct = (fraction: number): string => `${(fraction * 100).toFixed(2)}%`;
	return `inset(${pct(top)} ${pct(1 - right)} ${pct(1 - bottom)} ${pct(left)})`;
}
