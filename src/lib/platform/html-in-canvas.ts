// The WICG HTML-in-Canvas capture API (`GPUQueue.copyElementImageToTexture`)
// is experimental and its signature has DRIFTED across Chrome builds:
//   - legacy form:      copyElementImageToTexture(element, width, height, { texture })
//   - spec form (WICG/html-in-canvas README):
//       copyElementImageToTexture(
//         { source: element },                                // GPUCopyElementImageSource
//         { destination: { texture }, width, height }         // GPUCopyElementImageDestination
//       )
//     Newer builds implement the spec form and throw "Failed to read the
//     'source' / 'destination' property" when handed the legacy positional
//     shape — seen live 2026-07-09 across two Chromes.
// The adapter below detects which form the running browser speaks on first
// call and caches it, so every render path works in both without per-frame
// overhead.

export interface HtmlInCanvasQueue {
	copyElementImageToTexture(
		element: Element,
		width: number,
		height: number,
		destination: { texture: GPUTexture }
	): void;
}

type LegacyCopy = (
	element: Element,
	width: number,
	height: number,
	destination: { texture: GPUTexture }
) => void;

type SpecFormCopy = (
	source: { source: Element },
	destination: { destination: { texture: GPUTexture }; width: number; height: number }
) => void;

// One browser per session — the resolved form is process-global, not per-queue.
let apiForm: 'legacy' | 'spec' | null = null;

export function getHtmlInCanvasQueue(queue: GPUQueue): HtmlInCanvasQueue {
	const native = (queue as GPUQueue & { copyElementImageToTexture?: unknown })
		.copyElementImageToTexture;

	if (typeof native !== 'function') {
		throw new Error('HTML-in-Canvas copyElementImageToTexture is unavailable in this browser.');
	}

	function callSpecForm(element: Element, width: number, height: number, texture: GPUTexture): void {
		(native as SpecFormCopy).call(
			queue,
			{ source: element },
			{ destination: { texture }, width, height }
		);
	}

	return {
		copyElementImageToTexture(element, width, height, destination): void {
			if (apiForm === 'spec') {
				callSpecForm(element, width, height, destination.texture);
				return;
			}
			try {
				(native as LegacyCopy).call(queue, element, width, height, destination);
				apiForm = 'legacy';
			} catch (error) {
				// First failure on an undetected browser: retry as the spec form.
				// Any later failure is a real capture error — rethrow.
				if (apiForm === null && error instanceof TypeError) {
					callSpecForm(element, width, height, destination.texture);
					apiForm = 'spec';
					return;
				}
				throw error;
			}
		}
	};
}

export function requestCanvasPaint(canvas: HTMLCanvasElement): void {
	canvas.requestPaint?.();
}

export function setCanvasPaintHandler(canvas: HTMLCanvasElement, handler: () => void): void {
	(canvas as HTMLCanvasElement & { onpaint: () => void }).onpaint = handler;
}

export function clearCanvasPaintHandler(canvas: HTMLCanvasElement): void {
	(canvas as HTMLCanvasElement & { onpaint: (() => void) | null }).onpaint = null;
}
