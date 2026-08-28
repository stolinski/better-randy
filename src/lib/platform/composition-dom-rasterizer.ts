// Standard-browser DOM capture primitive, selected by the live probe recorded in
// `docs/standard-browser-rendering-probe.md`: native-resolution DOM clone
// rasterization with html2canvas.
//
// A browser without the WICG HTML-in-Canvas feature never lays out or paints the
// `layoutsubtree` canvas children, so `.composition` cannot be measured or
// rasterized where it sits. This module mounts a CLONE of that element in the
// real document at the native target size, rasterizes it, and removes it again.
// The clone carries the source element's resolved custom properties, so Pack
// tokens and frame metrics (`--frame-w`, `--frame-h`, `--cqmin`) resolve exactly
// as they do for the flagged lane.
//
// The raster is background-free and straight-alpha on purpose. A composition that
// declares a `backgroundFill` still gets it from the effect chain downstream, the
// same way the flagged `copyElementImageToTexture` lane does — this module never
// paints a background a composition did not ask for.
import { fontsReady } from './fonts';

export interface CompositionDomRasterRequest {
	/** A direct `layoutsubtree` child of the composition canvas — `.composition`
	 *  or, when the planes are split, the Overlay root. */
	element: HTMLElement;
	/** Native target width in device pixels (3840 horizontal, 2160 vertical). */
	width: number;
	/** Native target height in device pixels (2160 horizontal, 3840 vertical). */
	height: number;
	signal?: AbortSignal;
}

/** Every custom property the source resolves, copied onto the detached clone so
 *  the clone's own cascade starts from the same Pack + frame tokens. */
function copyResolvedCustomProperties(source: Element, clone: HTMLElement, view: Window): void {
	const sourceStyle = view.getComputedStyle(source);
	for (const property of Array.from(sourceStyle)) {
		if (property.startsWith('--')) {
			clone.style.setProperty(property, sourceStyle.getPropertyValue(property));
		}
	}
}

/**
 * Rasterize one composition DOM element into a native-resolution canvas.
 *
 * The caller owns the timestamp: this reads whatever the animation has already
 * written to the DOM and never advances it. Fonts are awaited before the raster
 * so a standard-browser frame can never contain OS-fallback glyphs.
 */
export async function rasterizeCompositionDomElement({
	element,
	width,
	height,
	signal
}: CompositionDomRasterRequest): Promise<HTMLCanvasElement> {
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new TypeError(
			`Composition raster size must be a positive native frame; received ${width}×${height}.`
		);
	}
	const ownerDocument = element.ownerDocument;
	const view = ownerDocument.defaultView;
	if (!view) {
		throw new Error('Composition DOM rasterization requires a live document view.');
	}

	await fontsReady();
	if (signal?.aborted) throw signal.reason;

	const clone = element.cloneNode(true) as HTMLElement;
	copyResolvedCustomProperties(element, clone, view);
	// Fixed positioning keeps a 3840×2160 clone out of the document's scrollable
	// overflow, and the negative stacking order keeps it behind the editor while
	// it is measured. It must stay visible: an opacity or visibility trick would
	// rasterize to an empty frame.
	clone.style.position = 'fixed';
	clone.style.insetBlockStart = '0';
	clone.style.insetInlineStart = '0';
	clone.style.inlineSize = `${width}px`;
	clone.style.blockSize = `${height}px`;
	clone.style.zIndex = '-1';
	clone.style.pointerEvents = 'none';
	ownerDocument.body.append(clone);

	try {
		const { default: html2canvas } = await import('html2canvas');
		if (signal?.aborted) throw signal.reason;
		return await html2canvas(clone, {
			backgroundColor: null,
			height,
			logging: false,
			scale: 1,
			useCORS: true,
			width,
			windowHeight: height,
			windowWidth: width
		});
	} finally {
		clone.remove();
	}
}
