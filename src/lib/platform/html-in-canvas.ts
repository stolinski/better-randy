// The DOM-to-GPU capture seam.
//
// `getHtmlInCanvasQueue` and the `requestPaint` helpers below are the WICG
// HTML-in-Canvas lane. `getDomFrameCaptureQueue` and the paint helpers are the
// lane-neutral seam every render path uses. Lane selection is a hard capability
// gate (Dex qju2qity): a session either resolves `canvas-draw-element` or the
// app never mounts, so the `dom-rasterization` branches below are reachable
// only through an explicitly injected mode — the mothballed scheduler in
// `./standard-browser-dom-capture` kept for a possible future public demo.
//
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

import {
	resolveDomFrameCaptureMode,
	standardBrowserDomCapture,
	type DomFrameCaptureMode,
	type StandardBrowserDomCaptureScheduler
} from './standard-browser-dom-capture';

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

	function callSpecForm(
		element: Element,
		width: number,
		height: number,
		texture: GPUTexture
	): void {
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

export interface DomFrameCaptureQueue {
	readonly mode: DomFrameCaptureMode;
	/** Upload the element's current native-resolution frame into `destination`.
	 *  Queue-ordered ahead of the frame's own draw calls, in both lanes. */
	captureElementToTexture(
		element: Element,
		width: number,
		height: number,
		destination: { texture: GPUTexture }
	): void;
}

export interface DomFrameCaptureQueueOptions {
	mode?: DomFrameCaptureMode;
	capture?: StandardBrowserDomCaptureScheduler;
}

/**
 * The capture queue every Surface Pipeline and plane capture uses. In the WICG
 * lane the browser rasterizes the live element; in the standard lane the frame
 * was already rasterized by the paint tick, so this uploads that exact raster.
 *
 * Both lanes deliver straight-alpha rgba8 into a texture the caller owns, so the
 * premultiply and compose passes downstream are identical.
 */
export function getDomFrameCaptureQueue(
	queue: GPUQueue,
	{
		mode = resolveDomFrameCaptureMode(),
		capture = standardBrowserDomCapture
	}: DomFrameCaptureQueueOptions = {}
): DomFrameCaptureQueue {
	if (mode === 'canvas-draw-element') {
		const htmlQueue = getHtmlInCanvasQueue(queue);
		return {
			mode,
			captureElementToTexture(element, width, height, destination): void {
				htmlQueue.copyElementImageToTexture(element, width, height, destination);
			}
		};
	}

	return {
		mode,
		captureElementToTexture(element, width, height, destination): void {
			const raster = capture.readElementRaster(element);
			if (!raster) {
				throw new Error(
					'No standard-browser composition raster is prepared for this element. Request a composition paint before rendering the frame.'
				);
			}
			queue.copyExternalImageToTexture(
				{ source: raster, flipY: false },
				{ texture: destination.texture, premultipliedAlpha: false },
				[width, height]
			);
		}
	};
}

export function requestCanvasPaint(canvas: HTMLCanvasElement): void {
	if (resolveDomFrameCaptureMode() === 'canvas-draw-element') {
		canvas.requestPaint?.();
		return;
	}
	void standardBrowserDomCapture.requestPaint(canvas).catch((error: unknown) => {
		console.error('Standard-browser composition paint failed.', error);
	});
}

export interface HtmlInCanvasPaintEvent extends Event {
	changedElements?: readonly Element[];
}

export type CanvasPaintHandler = (event: HtmlInCanvasPaintEvent) => void;

function directCanvasChild(canvas: HTMLCanvasElement, element: Element): Element | null {
	let current: Element | null = element;
	while (current?.parentElement && current.parentElement !== canvas) {
		current = current.parentElement;
	}
	return current?.parentElement === canvas ? current : null;
}

/**
 * Which lane a paint wait drives, and which scheduler serves it — the same seam
 * `getDomFrameCaptureQueue` takes. Production passes neither: the lane is the
 * session's own, resolved lazily so a server render never asks for a DOM.
 */
export interface CanvasPaintWaitOptions {
	mode?: DomFrameCaptureMode;
	capture?: StandardBrowserDomCaptureScheduler;
}

/**
 * Tracks browser paint snapshots independently from render requests. A manual
 * `requestPaint()` may report no changed elements; that advances paint
 * settlement without invalidating an already resident DOM texture.
 */
export class CanvasPaintGenerationTracker {
	#paintGeneration = 0;
	readonly #elementGenerations = new WeakMap<Element, number>();
	readonly #waiters = new Set<() => void>();

	record(canvas: HTMLCanvasElement, event: HtmlInCanvasPaintEvent): void {
		this.#paintGeneration += 1;
		const changedElements = event.changedElements;
		if (changedElements === undefined) {
			for (const child of canvas.children) {
				this.#elementGenerations.set(child, this.#paintGeneration);
			}
		} else {
			for (const changedElement of changedElements) {
				const child = directCanvasChild(canvas, changedElement);
				if (child) {
					this.#elementGenerations.set(child, this.#paintGeneration);
				}
			}
			// A paint event is delivered after the browser painted. A direct child
			// present now that this paint did NOT list was painted by an earlier
			// paint — one this tracker never observed, because the child mounted
			// before the paint handler attached and its DOM has not changed since.
			// A Surface whose DOM is static from its first frame (the newspaper
			// page: no enter motion, the camera push lives in its shader) is
			// exactly that child, and no later paint ever reports it — left at the
			// never-painted sentinel it was never captured, and the composition
			// stayed empty until a relayout (a window resize) listed it. Seed it at
			// this generation: the browser holds its paint record. The one window
			// this misjudges — a child inserted between the browser's paint and this
			// event — is tolerated at the capture seam (`captureSurfaceDom`), and the
			// next paint reports that child with a real generation.
			for (const child of canvas.children) {
				if (!this.#elementGenerations.has(child)) {
					this.#elementGenerations.set(child, this.#paintGeneration);
				}
			}
		}

		for (const resolve of this.#waiters) {
			resolve();
		}
		this.#waiters.clear();
	}

	/** 0 is the "never painted" sentinel — see `hasCapturedPaintRecord`. */
	generationFor(element: Element | null): number {
		return element ? (this.#elementGenerations.get(element) ?? 0) : 0;
	}

	waitForNextPaint(
		canvas: HTMLCanvasElement,
		signal?: AbortSignal,
		{
			mode = resolveDomFrameCaptureMode(),
			capture = standardBrowserDomCapture
		}: CanvasPaintWaitOptions = {}
	): Promise<void> {
		if (signal?.aborted) {
			return Promise.reject(signal.reason);
		}
		const requestPaint = canvas.requestPaint;
		if (mode === 'canvas-draw-element' && typeof requestPaint !== 'function') {
			return Promise.reject(
				new Error('HTML-in-Canvas requestPaint is unavailable in this browser.')
			);
		}

		const settled = new Promise<void>((resolve, reject) => {
			const settle = (): void => {
				signal?.removeEventListener('abort', abort);
				resolve();
			};
			const abort = (): void => {
				this.#waiters.delete(settle);
				reject(signal?.reason);
			};
			this.#waiters.add(settle);
			signal?.addEventListener('abort', abort, { once: true });
		});

		if (mode === 'canvas-draw-element') {
			requestPaint?.call(canvas);
			return settled;
		}
		// The rasterization lane must settle on a raster taken at or after THIS
		// call. `requestPaint` guarantees that — a pass already running gets a
		// follow-up that reads the DOM once it ends — so requiring it is the
		// contract. Racing a bare `settled` instead resolves on whichever paint
		// lands first, and the caller has just seeked: the pass in flight is still
		// rasterizing the PREVIOUS frame, so the settle returned in ~60 ms (far less
		// than a 4K raster costs) with the pre-seek frame resident, and every export
		// frame was the one before it. A failed or aborted pass rejects here rather
		// than leaving the waiter stalled on a paint that will never come.
		//
		// Both promises are claimed together. `settled` exists before the paint is
		// requested — it has to, or a paint landing during the request would be
		// missed — so chaining it only after a *resolved* request orphans it when
		// the request rejects: cancelling an export rejects the request and the
		// waiter from the same abort, and the waiter's rejection reaches nobody.
		// That is the unhandled `AbortError` a mid-export unmount used to report.
		return Promise.all([capture.requestPaint(canvas, signal), settled]).then(() => undefined);
	}
}

/**
 * Whether a `CanvasPaintGenerationTracker` generation means the browser holds a
 * paint record this element can actually be captured from.
 *
 * Generation 0 is the tracker's "no paint has ever reported this element"
 * sentinel: a first mount before its first paint, or a hot-module replacement
 * that swapped the node out from under a resident texture. Capturing then has
 * nothing to read — the WICG lane throws
 * `InvalidStateError: No cached paint record for element` and the
 * rasterization lane throws its own missing-raster error — so callers must
 * check this before asking the capture seam for a frame.
 */
export function hasCapturedPaintRecord(generation: number): boolean {
	return generation > 0;
}

export function setCanvasPaintHandler(
	canvas: HTMLCanvasElement,
	handler: CanvasPaintHandler
): void {
	if (resolveDomFrameCaptureMode() === 'canvas-draw-element') {
		(canvas as HTMLCanvasElement & { onpaint: CanvasPaintHandler }).onpaint = handler;
		return;
	}
	standardBrowserDomCapture.setPaintHandler(canvas, handler);
}

export function clearCanvasPaintHandler(canvas: HTMLCanvasElement): void {
	if (resolveDomFrameCaptureMode() === 'canvas-draw-element') {
		(canvas as HTMLCanvasElement & { onpaint: (() => void) | null }).onpaint = null;
		return;
	}
	standardBrowserDomCapture.clearPaintHandler(canvas);
}
