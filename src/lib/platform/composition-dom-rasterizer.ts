// Standard-browser DOM capture primitive, selected by the live probe recorded in
// `docs/standard-browser-rendering-probe.md`: native-resolution DOM clone
// rasterization with html2canvas.
//
// A browser without the WICG HTML-in-Canvas feature never lays out or paints the
// `layoutsubtree` canvas children, so `.composition` cannot be measured or
// rasterized where it sits. This module mounts a CLONE of that element in the
// real document at the native target size, rasterizes it, and removes it again.
// The clone carries the source element's resolved custom properties AND its
// resolved inherited typography, so Pack tokens, frame metrics (`--frame-w`,
// `--frame-h`, `--cqmin`), and the Pack's type voice resolve exactly as they do
// for the flagged lane even though the clone is parented to `<body>`.
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

// The inheritable text properties a composition never re-declares on every
// descendant: a Block, Annotation, or Overlay that just says `font-size: 4cqmin`
// inherits its family, colour, and metrics from `.composition`. The clone is
// reparented to `<body>`, so it would otherwise inherit the editor chrome's
// typography instead of the active Pack's — the same class of break as losing
// the Pack's custom properties, and invisible until a Pack that differs from the
// chrome font renders. Copied as resolved values, so `em`-relative sizing inside
// the clone resolves against the same font-size the source had.
const INHERITED_COMPOSITION_TEXT_PROPERTIES = [
	'color',
	'direction',
	'font-family',
	'font-feature-settings',
	'font-kerning',
	'font-optical-sizing',
	'font-size',
	'font-stretch',
	'font-style',
	'font-variant-numeric',
	'font-variation-settings',
	'font-weight',
	'letter-spacing',
	'line-height',
	'text-align',
	'text-indent',
	'text-rendering',
	'text-transform',
	'white-space',
	'word-spacing',
	'writing-mode'
] as const;

export interface CompositionRasterCloneRequest {
	element: HTMLElement;
	/** Native target width in device pixels (3840 horizontal, 2160 vertical). */
	width: number;
	/** Native target height in device pixels (2160 horizontal, 3840 vertical). */
	height: number;
	view: Window;
}

/**
 * Build the detached, native-resolution clone the rasterizer measures.
 *
 * Carries every custom property and inherited text style the source resolves, so
 * the clone's own cascade starts from the same Pack tokens, frame metrics, and
 * typography no matter where it is parented. Returned unmounted — the caller
 * owns adding it to the document and removing it again.
 */
export function createCompositionRasterClone({
	element,
	width,
	height,
	view
}: CompositionRasterCloneRequest): HTMLElement {
	const clone = element.cloneNode(true) as HTMLElement;
	const sourceStyle = view.getComputedStyle(element);
	for (const property of Array.from(sourceStyle)) {
		if (property.startsWith('--')) {
			clone.style.setProperty(property, sourceStyle.getPropertyValue(property));
		}
	}
	for (const property of INHERITED_COMPOSITION_TEXT_PROPERTIES) {
		const value = sourceStyle.getPropertyValue(property);
		if (value) {
			clone.style.setProperty(property, value);
		}
	}
	// Fixed positioning keeps a 3840×2160 clone out of the document's scrollable
	// overflow, and the negative stacking order keeps it behind the editor while
	// it is measured. It must stay visible: an opacity or visibility trick would
	// rasterize to an empty frame. The explicit native size is also what makes the
	// composition's `container-type: size` resolve `cq` units at frame scale, in
	// either orientation.
	clone.style.setProperty('position', 'fixed');
	clone.style.setProperty('inset-block-start', '0');
	clone.style.setProperty('inset-inline-start', '0');
	clone.style.setProperty('inline-size', `${width}px`);
	clone.style.setProperty('block-size', `${height}px`);
	clone.style.setProperty('z-index', '-1');
	clone.style.setProperty('pointer-events', 'none');
	return clone;
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

	const clone = createCompositionRasterClone({ element, width, height, view });
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
