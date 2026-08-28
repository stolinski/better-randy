// Which DOM-capture lane this browser runs, and the standard-browser lane's
// paint tick.
//
// GFX prefers the WICG HTML-in-Canvas lane (`GPUQueue.copyElementImageToTexture`
// + `HTMLCanvasElement.requestPaint`), where the browser itself rasterizes the
// canvas layout subtree. A supported standard browser exposes neither, so the
// composition is rasterized here instead (ADR-0052's public demo runs on stock
// Chrome). Selection is explicit capability detection, resolved once per session
// and published on `window.__gfxDomFrameCaptureMode` — there is no silent
// downgrade, and a browser with neither lane fails loudly.
//
// The standard lane reproduces the paint contract the renderer already depends
// on rather than inventing a second one: a paint request rasterizes every direct
// canvas child at native size, commits those rasters as one set, and then
// dispatches the same paint event the WICG lane would. Preview and export
// therefore keep driving the one shared frame renderer through
// `CanvasPaintGenerationTracker`, and the GPU upload still happens inside the
// frame's own render pass, after the capture and before the draw.
import {
	rasterizeCompositionDomElement,
	type CompositionDomRasterRequest
} from './composition-dom-rasterizer';
import type { CanvasPaintHandler, HtmlInCanvasPaintEvent } from './html-in-canvas';

export type DomFrameCaptureMode = 'canvas-draw-element' | 'dom-rasterization';

export interface DomFrameCaptureCapabilities {
	hasCopyElementImageToTexture: boolean;
	hasCanvasRequestPaint: boolean;
	hasDomRasterization: boolean;
}

export function readDomFrameCaptureCapabilities(): DomFrameCaptureCapabilities {
	const gpuQueueConstructor = (
		globalThis as {
			GPUQueue?: { prototype?: { copyElementImageToTexture?: unknown } };
		}
	).GPUQueue;
	const canvasPrototype =
		typeof HTMLCanvasElement === 'undefined' ? null : HTMLCanvasElement.prototype;
	return {
		hasCopyElementImageToTexture:
			typeof gpuQueueConstructor?.prototype?.copyElementImageToTexture === 'function',
		hasCanvasRequestPaint: typeof canvasPrototype?.requestPaint === 'function',
		hasDomRasterization: typeof document !== 'undefined' && canvasPrototype !== null
	};
}

export function selectDomFrameCaptureMode(
	capabilities: DomFrameCaptureCapabilities
): DomFrameCaptureMode {
	if (capabilities.hasCopyElementImageToTexture && capabilities.hasCanvasRequestPaint) {
		return 'canvas-draw-element';
	}
	if (capabilities.hasDomRasterization) {
		return 'dom-rasterization';
	}
	throw new Error(
		'No DOM frame capture lane is available: this browser exposes neither HTML-in-Canvas (copyElementImageToTexture with requestPaint) nor a document to rasterize.'
	);
}

// One browser per session — the lane is process-global, like the WICG API form.
let sessionCaptureMode: DomFrameCaptureMode | null = null;

export function resolveDomFrameCaptureMode(): DomFrameCaptureMode {
	if (sessionCaptureMode === null) {
		sessionCaptureMode = selectDomFrameCaptureMode(readDomFrameCaptureCapabilities());
		if (typeof window !== 'undefined') {
			window.__gfxDomFrameCaptureMode = sessionCaptureMode;
		}
	}
	return sessionCaptureMode;
}

type CompositionDomRasterizer = (
	request: CompositionDomRasterRequest
) => Promise<HTMLCanvasElement>;

export interface StandardBrowserDomCaptureOptions {
	rasterize?: CompositionDomRasterizer;
}

function createSyntheticPaintEvent(changedElements: readonly Element[]): HtmlInCanvasPaintEvent {
	return Object.assign(new Event('paint'), { changedElements });
}

/**
 * The standard-browser replacement for the browser's own canvas paint tick.
 *
 * A paint request rasterizes the canvas's direct children at the canvas's native
 * bitmap size, publishes them as one atomic set, and then calls the registered
 * paint handler — so the renderer sees exactly the settlement contract the WICG
 * lane gives it. Concurrent requests collapse onto a single follow-up pass, and a
 * failed or cancelled pass publishes nothing and rejects, so a caller can never
 * mistake a stale frame for a fresh one.
 */
export class StandardBrowserDomCaptureScheduler {
	readonly #rasterize: CompositionDomRasterizer;
	readonly #paintHandlers = new WeakMap<HTMLCanvasElement, CanvasPaintHandler>();
	readonly #runningPaints = new WeakMap<HTMLCanvasElement, Promise<void>>();
	readonly #pendingPaints = new WeakMap<HTMLCanvasElement, Promise<void>>();
	readonly #elementRasters = new WeakMap<Element, HTMLCanvasElement>();
	// The exact child set the last committed pass published, so a child that
	// leaves the canvas — the Overlay plane when the DOF/stage split turns off,
	// every child when the Workspace unmounts — drops its native-resolution
	// raster instead of keeping a 4K canvas alive and answering a later capture
	// with a frame that is no longer in the composition.
	readonly #committedChildren = new WeakMap<HTMLCanvasElement, readonly Element[]>();

	constructor({
		rasterize = rasterizeCompositionDomElement
	}: StandardBrowserDomCaptureOptions = {}) {
		this.#rasterize = rasterize;
	}

	setPaintHandler(canvas: HTMLCanvasElement, handler: CanvasPaintHandler): void {
		this.#paintHandlers.set(canvas, handler);
	}

	clearPaintHandler(canvas: HTMLCanvasElement): void {
		this.#paintHandlers.delete(canvas);
		this.#releaseRasters(this.#committedChildren.get(canvas) ?? []);
		this.#committedChildren.delete(canvas);
	}

	/** The most recent committed raster for a direct canvas child, or null when no
	 *  paint has captured it yet. */
	readElementRaster(element: Element): HTMLCanvasElement | null {
		return this.#elementRasters.get(element) ?? null;
	}

	requestPaint(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<void> {
		if (signal?.aborted) {
			return Promise.reject(signal.reason);
		}
		const running = this.#runningPaints.get(canvas);
		if (!running) {
			return this.#startPaint(canvas, signal);
		}
		const pending = this.#pendingPaints.get(canvas);
		if (pending) {
			return pending;
		}
		// One follow-up pass captures whatever the DOM holds once the running pass
		// ends, so a burst of requests during a raster costs one extra raster, not
		// one per request.
		const followUp = running
			.catch(() => undefined)
			.then(() => {
				this.#pendingPaints.delete(canvas);
				return this.#startPaint(canvas, signal);
			});
		this.#pendingPaints.set(canvas, followUp);
		return followUp;
	}

	#startPaint(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<void> {
		const paint = this.#capturePaint(canvas, signal);
		this.#runningPaints.set(canvas, paint);
		const release = (): void => {
			if (this.#runningPaints.get(canvas) === paint) {
				this.#runningPaints.delete(canvas);
			}
		};
		paint.then(release, release);
		return paint;
	}

	async #capturePaint(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<void> {
		const handler = this.#paintHandlers.get(canvas);
		// A paint nobody is listening to is a no-op in the WICG lane too — the
		// composition has not mounted its handler yet.
		if (!handler) return;

		const children = Array.from(canvas.children);
		const captured: Array<{ element: Element; raster: HTMLCanvasElement }> = [];
		for (const element of children) {
			captured.push({
				element,
				raster: await this.#rasterize({
					element: element as HTMLElement,
					width: canvas.width,
					height: canvas.height,
					signal
				})
			});
		}
		if (signal?.aborted) throw signal.reason;

		// Commit as one set: a half-updated capture would composite one plane from
		// this frame against another from the last one. Children the composition
		// dropped since the previous pass lose their rasters in the same commit, so
		// the plane split can never be captured from a frame it no longer has.
		const retained = new Set<Element>(children);
		this.#releaseRasters(
			(this.#committedChildren.get(canvas) ?? []).filter((element) => !retained.has(element))
		);
		for (const { element, raster } of captured) {
			this.#elementRasters.set(element, raster);
		}
		this.#committedChildren.set(canvas, children);
		handler(createSyntheticPaintEvent(children));
	}

	#releaseRasters(elements: readonly Element[]): void {
		for (const element of elements) {
			this.#elementRasters.delete(element);
		}
	}
}

export const standardBrowserDomCapture = new StandardBrowserDomCaptureScheduler();

declare global {
	interface Window {
		/** Which DOM-capture lane this session resolved (ADR-0052 public demo runs
		 *  the `dom-rasterization` lane). Read by browser render verification. */
		__gfxDomFrameCaptureMode?: DomFrameCaptureMode;
	}
}
