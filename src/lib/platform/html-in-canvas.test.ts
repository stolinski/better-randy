import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { CanvasPaintGenerationTracker, type HtmlInCanvasPaintEvent } from './html-in-canvas';

function element(parentElement: Element | null = null): Element {
	return { parentElement } as unknown as Element;
}

function canvas(children: readonly Element[]): HTMLCanvasElement {
	return { children } as unknown as HTMLCanvasElement;
}

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
