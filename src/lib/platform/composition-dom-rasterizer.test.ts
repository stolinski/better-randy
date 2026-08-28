import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { createCompositionRasterClone } from './composition-dom-rasterizer';

interface StyleRecorder {
	setProperty(property: string, value: string): void;
}

function styleRecorder(applied: Map<string, string>): StyleRecorder {
	return {
		setProperty: (property, value) => {
			applied.set(property, value);
		}
	};
}

/** A computed style is both an iterable of declared property names and a
 *  value lookup — the two shapes `createCompositionRasterClone` reads. */
function computedStyle(declared: Record<string, string>): CSSStyleDeclaration {
	const names = Object.keys(declared);
	return Object.assign(names, {
		getPropertyValue: (property: string) => declared[property] ?? ''
	}) as unknown as CSSStyleDeclaration;
}

interface CloneHarness {
	source: HTMLElement;
	view: Window;
	applied: Map<string, string>;
	clonedDeeply: boolean[];
}

function cloneHarness(declared: Record<string, string>): CloneHarness {
	const applied = new Map<string, string>();
	const clonedDeeply: boolean[] = [];
	const clone = { style: styleRecorder(applied) } as unknown as HTMLElement;
	const source = {
		cloneNode: (deep: boolean) => {
			clonedDeeply.push(deep);
			return clone;
		}
	} as unknown as HTMLElement;
	const view = { getComputedStyle: () => computedStyle(declared) } as unknown as Window;
	return { source, view, applied, clonedDeeply };
}

describe('createCompositionRasterClone', () => {
	it('carries the Pack tokens, frame metrics, and inherited typography onto the clone', () => {
		const harness = cloneHarness({
			'--frame-w': '3840',
			'--frame-h': '2160',
			'--surface-ink': '#101014',
			color: 'rgb(16, 16, 20)',
			'font-family': 'Space Grotesk, sans-serif',
			'font-size': '64px',
			'font-weight': '600',
			'letter-spacing': '-0.02em',
			'line-height': '72px',
			'text-transform': 'uppercase',
			// A resolved-but-empty inheritable property must not land as an empty
			// declaration that overrides the cascade with nothing.
			'font-variation-settings': ''
		});

		createCompositionRasterClone({
			element: harness.source,
			width: 3840,
			height: 2160,
			view: harness.view
		});

		assert.deepEqual(harness.clonedDeeply, [true]);
		assert.equal(harness.applied.get('--frame-w'), '3840');
		assert.equal(harness.applied.get('--frame-h'), '2160');
		assert.equal(harness.applied.get('--surface-ink'), '#101014');
		assert.equal(harness.applied.get('font-family'), 'Space Grotesk, sans-serif');
		assert.equal(harness.applied.get('font-size'), '64px');
		assert.equal(harness.applied.get('font-weight'), '600');
		assert.equal(harness.applied.get('letter-spacing'), '-0.02em');
		assert.equal(harness.applied.get('line-height'), '72px');
		assert.equal(harness.applied.get('text-transform'), 'uppercase');
		assert.equal(harness.applied.get('color'), 'rgb(16, 16, 20)');
		assert.equal(harness.applied.has('font-variation-settings'), false);
	});

	it('sizes the clone to the native frame in both orientations', () => {
		const horizontal = cloneHarness({});
		createCompositionRasterClone({
			element: horizontal.source,
			width: 3840,
			height: 2160,
			view: horizontal.view
		});
		assert.equal(horizontal.applied.get('inline-size'), '3840px');
		assert.equal(horizontal.applied.get('block-size'), '2160px');

		const vertical = cloneHarness({});
		createCompositionRasterClone({
			element: vertical.source,
			width: 2160,
			height: 3840,
			view: vertical.view
		});
		assert.equal(vertical.applied.get('inline-size'), '2160px');
		assert.equal(vertical.applied.get('block-size'), '3840px');
	});

	it('keeps the clone visible and out of the editor, never hidden', () => {
		const harness = cloneHarness({});

		createCompositionRasterClone({
			element: harness.source,
			width: 3840,
			height: 2160,
			view: harness.view
		});

		assert.equal(harness.applied.get('position'), 'fixed');
		assert.equal(harness.applied.get('inset-block-start'), '0');
		assert.equal(harness.applied.get('inset-inline-start'), '0');
		assert.equal(harness.applied.get('z-index'), '-1');
		assert.equal(harness.applied.get('pointer-events'), 'none');
		// An opacity/visibility/display trick rasterizes to an empty frame — the
		// same failure mode the WICG lane has when the canvas is hidden.
		assert.equal(harness.applied.has('opacity'), false);
		assert.equal(harness.applied.has('visibility'), false);
		assert.equal(harness.applied.has('display'), false);
	});

	it('never sets a background on the clone, so transparency stays the default', () => {
		const harness = cloneHarness({ 'background-color': 'rgb(12, 12, 14)' });

		createCompositionRasterClone({
			element: harness.source,
			width: 3840,
			height: 2160,
			view: harness.view
		});

		assert.equal(harness.applied.has('background-color'), false);
		assert.equal(harness.applied.has('background'), false);
	});
});
