import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
	selectDomFrameCaptureMode,
	StandardBrowserDomCaptureScheduler,
	type DomFrameCaptureCapabilities
} from './standard-browser-dom-capture';
import type { HtmlInCanvasPaintEvent } from './html-in-canvas';

function capabilities(
	overrides: Partial<DomFrameCaptureCapabilities> = {}
): DomFrameCaptureCapabilities {
	return {
		hasCopyElementImageToTexture: false,
		hasCanvasRequestPaint: false,
		hasDomRasterization: false,
		...overrides
	};
}

function canvasWithChildren(children: readonly Element[]): HTMLCanvasElement {
	return { children, width: 3840, height: 2160 } as unknown as HTMLCanvasElement;
}

function compositionElement(): Element {
	return {} as unknown as Element;
}

function raster(): HTMLCanvasElement {
	return {} as unknown as HTMLCanvasElement;
}

describe('selectDomFrameCaptureMode', () => {
	it('takes the HTML-in-Canvas lane only when both of its APIs are present', () => {
		assert.equal(
			selectDomFrameCaptureMode(
				capabilities({
					hasCopyElementImageToTexture: true,
					hasCanvasRequestPaint: true,
					hasDomRasterization: true
				})
			),
			'canvas-draw-element'
		);
	});

	it('falls to the rasterization lane when the canvas capture API is half-present', () => {
		assert.equal(
			selectDomFrameCaptureMode(
				capabilities({ hasCopyElementImageToTexture: true, hasDomRasterization: true })
			),
			'dom-rasterization'
		);
		assert.equal(
			selectDomFrameCaptureMode(
				capabilities({ hasCanvasRequestPaint: true, hasDomRasterization: true })
			),
			'dom-rasterization'
		);
	});

	it('fails loudly rather than selecting a lane that cannot produce pixels', () => {
		assert.throws(() => selectDomFrameCaptureMode(capabilities()), /No DOM frame capture lane/);
	});
});

describe('StandardBrowserDomCaptureScheduler', () => {
	it('rasterizes every direct canvas child at native size before dispatching the paint', async () => {
		const composition = compositionElement();
		const overlayRoot = compositionElement();
		const canvas = canvasWithChildren([composition, overlayRoot]);
		const requestedSizes: Array<{ width: number; height: number }> = [];
		let rastersAtDispatch = 0;
		const scheduler = new StandardBrowserDomCaptureScheduler({
			rasterize: async ({ width, height }) => {
				requestedSizes.push({ width, height });
				return raster();
			}
		});
		scheduler.setPaintHandler(canvas, () => {
			rastersAtDispatch =
				(scheduler.readElementRaster(composition) ? 1 : 0) +
				(scheduler.readElementRaster(overlayRoot) ? 1 : 0);
		});

		await scheduler.requestPaint(canvas);

		assert.deepEqual(requestedSizes, [
			{ width: 3840, height: 2160 },
			{ width: 3840, height: 2160 }
		]);
		assert.equal(rastersAtDispatch, 2);
	});

	it('reports the rasterized children as the paint event changed elements', async () => {
		const composition = compositionElement();
		const canvas = canvasWithChildren([composition]);
		const paintEvents: HtmlInCanvasPaintEvent[] = [];
		const scheduler = new StandardBrowserDomCaptureScheduler({ rasterize: async () => raster() });
		scheduler.setPaintHandler(canvas, (paintEvent) => paintEvents.push(paintEvent));

		await scheduler.requestPaint(canvas);

		assert.equal(paintEvents.length, 1);
		assert.deepEqual(paintEvents[0].changedElements, [composition]);
	});

	it('collapses a burst of requests during one raster into a single follow-up pass', async () => {
		const canvas = canvasWithChildren([compositionElement()]);
		let started = 0;
		let releaseFirst = (): void => {};
		const scheduler = new StandardBrowserDomCaptureScheduler({
			rasterize: async () => {
				started += 1;
				if (started === 1) {
					await new Promise<void>((resolve) => {
						releaseFirst = resolve;
					});
				}
				return raster();
			}
		});
		scheduler.setPaintHandler(canvas, () => {});

		const first = scheduler.requestPaint(canvas);
		const second = scheduler.requestPaint(canvas);
		const third = scheduler.requestPaint(canvas);
		releaseFirst();
		await Promise.all([first, second, third]);

		assert.equal(started, 2);
		assert.equal(second, third);
	});

	it('publishes nothing when one child raster fails', async () => {
		const composition = compositionElement();
		const overlayRoot = compositionElement();
		const canvas = canvasWithChildren([composition, overlayRoot]);
		let painted = false;
		const scheduler = new StandardBrowserDomCaptureScheduler({
			rasterize: async ({ element }) => {
				if (element === (overlayRoot as unknown as HTMLElement)) {
					throw new Error('rasterization failed');
				}
				return raster();
			}
		});
		scheduler.setPaintHandler(canvas, () => {
			painted = true;
		});

		await assert.rejects(scheduler.requestPaint(canvas), /rasterization failed/);
		assert.equal(painted, false);
		assert.equal(scheduler.readElementRaster(composition), null);
	});

	it('rejects an aborted paint request without dispatching', async () => {
		const canvas = canvasWithChildren([compositionElement()]);
		const controller = new AbortController();
		let painted = false;
		const scheduler = new StandardBrowserDomCaptureScheduler({
			rasterize: async () => {
				controller.abort(new Error('export cancelled'));
				return raster();
			}
		});
		scheduler.setPaintHandler(canvas, () => {
			painted = true;
		});

		await assert.rejects(scheduler.requestPaint(canvas, controller.signal), /export cancelled/);
		assert.equal(painted, false);
	});

	it('skips rasterization entirely when no paint handler is mounted', async () => {
		const canvas = canvasWithChildren([compositionElement()]);
		let started = 0;
		const scheduler = new StandardBrowserDomCaptureScheduler({
			rasterize: async () => {
				started += 1;
				return raster();
			}
		});

		await scheduler.requestPaint(canvas);

		assert.equal(started, 0);
	});
});
