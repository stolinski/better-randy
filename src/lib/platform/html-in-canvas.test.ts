import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
	CanvasPaintGenerationTracker,
	getDomFrameCaptureQueue,
	type HtmlInCanvasPaintEvent
} from './html-in-canvas';
import type { StandardBrowserDomCaptureScheduler } from './standard-browser-dom-capture';

function element(parentElement: Element | null = null): Element {
	return { parentElement } as unknown as Element;
}

function canvas(children: readonly Element[]): HTMLCanvasElement {
	return { children } as unknown as HTMLCanvasElement;
}

interface RecordedExternalImageUpload {
	source: unknown;
	texture: GPUTexture;
	premultipliedAlpha: boolean | undefined;
	size: readonly number[];
}

function captureQueue(recorded: {
	elementCopies: unknown[];
	externalImages: RecordedExternalImageUpload[];
}): GPUQueue {
	return {
		copyElementImageToTexture(...args: unknown[]) {
			recorded.elementCopies.push(args);
		},
		copyExternalImageToTexture(
			source: { source: unknown },
			destination: { texture: GPUTexture; premultipliedAlpha?: boolean },
			size: readonly number[]
		) {
			recorded.externalImages.push({
				source: source.source,
				texture: destination.texture,
				premultipliedAlpha: destination.premultipliedAlpha,
				size
			});
		}
	} as unknown as GPUQueue;
}

function rasterStore(raster: HTMLCanvasElement | null): StandardBrowserDomCaptureScheduler {
	return { readElementRaster: () => raster } as unknown as StandardBrowserDomCaptureScheduler;
}

describe('getDomFrameCaptureQueue', () => {
	it('captures through the browser API in the HTML-in-Canvas lane', () => {
		const recorded = {
			elementCopies: [] as unknown[],
			externalImages: [] as RecordedExternalImageUpload[]
		};
		const texture = {} as GPUTexture;
		const source = {} as Element;

		getDomFrameCaptureQueue(captureQueue(recorded), {
			mode: 'canvas-draw-element'
		}).captureElementToTexture(source, 3840, 2160, { texture });

		assert.equal(recorded.externalImages.length, 0);
		assert.deepEqual(recorded.elementCopies, [[source, 3840, 2160, { texture }]]);
	});

	it('uploads the prepared straight-alpha raster at native size in the rasterization lane', () => {
		const recorded = {
			elementCopies: [] as unknown[],
			externalImages: [] as RecordedExternalImageUpload[]
		};
		const texture = {} as GPUTexture;
		const raster = {} as HTMLCanvasElement;

		getDomFrameCaptureQueue(captureQueue(recorded), {
			mode: 'dom-rasterization',
			capture: rasterStore(raster)
		}).captureElementToTexture({} as Element, 2160, 3840, { texture });

		assert.equal(recorded.elementCopies.length, 0);
		assert.deepEqual(recorded.externalImages, [
			{ source: raster, texture, premultipliedAlpha: false, size: [2160, 3840] }
		]);
	});

	it('refuses to render a frame whose raster was never prepared', () => {
		const recorded = {
			elementCopies: [] as unknown[],
			externalImages: [] as RecordedExternalImageUpload[]
		};

		assert.throws(
			() =>
				getDomFrameCaptureQueue(captureQueue(recorded), {
					mode: 'dom-rasterization',
					capture: rasterStore(null)
				}).captureElementToTexture({} as Element, 3840, 2160, { texture: {} as GPUTexture }),
			/Request a composition paint before rendering the frame/
		);
		assert.equal(recorded.externalImages.length, 0);
	});
});

describe('CanvasPaintGenerationTracker', () => {
	it('advances only the changed direct canvas child', () => {
		const composition = element();
		const overlay = element();
		const targetCanvas = canvas([composition, overlay]);
		Object.defineProperty(composition, 'parentElement', { value: targetCanvas });
		Object.defineProperty(overlay, 'parentElement', { value: targetCanvas });
		const nested = element(composition);
		const tracker = new CanvasPaintGenerationTracker();

		tracker.record(
			targetCanvas,
			{ changedElements: [nested] } as unknown as HtmlInCanvasPaintEvent
		);

		assert.equal(tracker.generationFor(composition), 1);
		assert.equal(tracker.generationFor(overlay), 0);
	});

	it('settles an empty manual paint without dirtying DOM captures', () => {
		const composition = element();
		const targetCanvas = canvas([composition]);
		Object.defineProperty(composition, 'parentElement', { value: targetCanvas });
		const tracker = new CanvasPaintGenerationTracker();

		tracker.record(
			targetCanvas,
			{ changedElements: [composition] } as unknown as HtmlInCanvasPaintEvent
		);
		tracker.record(targetCanvas, { changedElements: [] } as unknown as HtmlInCanvasPaintEvent);

		assert.equal(tracker.generationFor(composition), 1);
	});

	it('conservatively dirties all direct children when changedElements is unavailable', () => {
		const composition = element();
		const overlay = element();
		const targetCanvas = canvas([composition, overlay]);
		Object.defineProperty(composition, 'parentElement', { value: targetCanvas });
		Object.defineProperty(overlay, 'parentElement', { value: targetCanvas });
		const tracker = new CanvasPaintGenerationTracker();

		tracker.record(targetCanvas, {} as HtmlInCanvasPaintEvent);

		assert.equal(tracker.generationFor(composition), 1);
		assert.equal(tracker.generationFor(overlay), 1);
	});
});
