/**
 * What a rendered frame's pixels actually say, measured rather than inferred
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * The `verification` family exists because a composition that validates can
 * still render nothing: a Surface that never loaded, an Overlay animated to
 * zero opacity at the frame under inspection, a transparent lane that silently
 * became opaque. Every question this module answers is asked of the bytes the
 * canvas presented, so the answer is the same one an encoder would get.
 *
 * The two classifications are deliberately different questions:
 *
 * - **Blankness** is whole-frame uniformity. A frame every one of whose pixels
 *   equals its first pixel carries no image, whether that uniform value is
 *   transparent black or a flat background fill.
 * - **The edge class** is the transparent-overlay / full-frame distinction the
 *   render matrix already uses (`scripts/_probe-output-class.ts`), read off the
 *   frame border: a border that is entirely clear is a transparent overlay, one
 *   that is entirely opaque is a full-frame piece, and anything else is `mixed`.
 */

/** How the frame border classifies the piece's output lane. */
export type RenderedFrameEdgeClass = 'transparent' | 'opaque' | 'mixed';

/** Straight RGBA bytes as the canvas presented them, four per pixel, row-major. */
export interface RenderedFramePixels {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

export interface RenderedFrameMeasurement {
	width: number;
	height: number;
	pixelCount: number;
	/** Pixels differing from the frame's first pixel; zero means a blank frame. */
	nonUniformPixelCount: number;
	/** Fraction of pixels carrying any alpha at all. */
	alphaCoverage: number;
	/** Fraction of pixels that are fully opaque. */
	opaqueCoverage: number;
	edgeClass: RenderedFrameEdgeClass;
	/** True when every pixel is identical, so the frame renders nothing at all. */
	isBlank: boolean;
}

function requireFramePixels(frame: RenderedFramePixels): void {
	if (!Number.isSafeInteger(frame.width) || frame.width < 1) {
		throw new TypeError(`Rendered frame width must be a positive integer, got ${frame.width}.`);
	}
	if (!Number.isSafeInteger(frame.height) || frame.height < 1) {
		throw new TypeError(`Rendered frame height must be a positive integer, got ${frame.height}.`);
	}
	const expected = frame.width * frame.height * 4;
	if (frame.data.length !== expected) {
		throw new TypeError(
			`Rendered frame ${frame.width}x${frame.height} needs ${expected} RGBA bytes, got ${frame.data.length}.`
		);
	}
}

function isSamePixel(data: Uint8ClampedArray, offset: number, reference: number): boolean {
	return (
		data[offset] === data[reference] &&
		data[offset + 1] === data[reference + 1] &&
		data[offset + 2] === data[reference + 2] &&
		data[offset + 3] === data[reference + 3]
	);
}

/**
 * The frame-edge output classification, read off the complete decoded border
 * rather than a sampled one — the same rule the browser-render matrix applies
 * to an exported PNG.
 */
export function classifyRenderedFrameEdge(frame: RenderedFramePixels): RenderedFrameEdgeClass {
	requireFramePixels(frame);
	let everyTransparent = true;
	let everyOpaque = true;
	const inspect = (x: number, y: number): void => {
		const alpha = frame.data[(y * frame.width + x) * 4 + 3];
		everyTransparent &&= alpha === 0;
		everyOpaque &&= alpha === 255;
	};
	for (let x = 0; x < frame.width; x += 1) {
		inspect(x, 0);
		if (frame.height > 1) inspect(x, frame.height - 1);
	}
	for (let y = 1; y < frame.height - 1; y += 1) {
		inspect(0, y);
		if (frame.width > 1) inspect(frame.width - 1, y);
	}
	return everyTransparent ? 'transparent' : everyOpaque ? 'opaque' : 'mixed';
}

/** Measure one presented frame: coverage, uniformity, and its output lane. */
export function measureRenderedFramePixels(frame: RenderedFramePixels): RenderedFrameMeasurement {
	requireFramePixels(frame);
	const pixelCount = frame.width * frame.height;
	let nonUniformPixelCount = 0;
	let coveredPixelCount = 0;
	let opaquePixelCount = 0;

	for (let offset = 0; offset < frame.data.length; offset += 4) {
		const alpha = frame.data[offset + 3];
		if (alpha > 0) coveredPixelCount += 1;
		if (alpha === 255) opaquePixelCount += 1;
		if (offset > 0 && !isSamePixel(frame.data, offset, 0)) nonUniformPixelCount += 1;
	}

	return {
		width: frame.width,
		height: frame.height,
		pixelCount,
		nonUniformPixelCount,
		alphaCoverage: coveredPixelCount / pixelCount,
		opaqueCoverage: opaquePixelCount / pixelCount,
		edgeClass: classifyRenderedFrameEdge(frame),
		isBlank: nonUniformPixelCount === 0
	};
}
