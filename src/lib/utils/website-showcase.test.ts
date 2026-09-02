import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
	calculateFilmedPageLayout,
	calculateWebsiteShowcaseLayout,
	createEnterBlurCommitDeduper,
	normalizeWebsiteCaptureUrl,
	websiteDisplayUrl,
	websiteImageState
} from './website-showcase';

describe('website showcase utilities', () => {
	it('normalizes capture and display URLs', () => {
		assert.equal(normalizeWebsiteCaptureUrl('github.com/syntaxfm'), 'https://github.com/syntaxfm');
		assert.equal(websiteDisplayUrl('https://www.github.com/syntaxfm/'), 'github.com/syntaxfm');
		assert.throws(() => normalizeWebsiteCaptureUrl('file:///tmp/site.html'), /http or https/);
		assert.throws(() => normalizeWebsiteCaptureUrl(''), /required/);
	});

	it('deduplicates the Enter to blur event pair without suppressing later blurs', () => {
		const deduper = createEnterBlurCommitDeduper();
		assert.equal(deduper.shouldCommit('enter'), true);
		assert.equal(deduper.shouldCommit('blur'), false);
		assert.equal(deduper.shouldCommit('blur'), true);
	});

	it('centers the URL plate halfway across the browser chrome top edge inside both safe layouts', () => {
		for (const [orientation, width, height] of [
			['horizontal', 3840, 2160],
			['vertical', 2160, 3840]
		] as const) {
			const layout = calculateWebsiteShowcaseLayout(orientation, width, height);
			assert.equal(
				Math.round((layout.browser.width / layout.browser.screenshotHeight) * 10) / 10,
				1.6
			);
			assert.ok(layout.browser.x >= width * 0.05);
			assert.ok(
				layout.browser.x + layout.browser.width <=
					width * (orientation === 'vertical' ? 0.91 : 0.95)
			);
			assert.ok(layout.browser.y >= height * (orientation === 'vertical' ? 0.06 : 0.05));
			assert.equal(layout.urlPlate.centerX, layout.browser.x + layout.browser.width / 2);
			assert.equal(layout.urlPlate.centerY, layout.browser.y);
			assert.equal(layout.overlapHeight, layout.urlPlate.height / 2);
			assert.equal(
				layout.urlPlate.centerY + layout.overlapHeight,
				layout.browser.y + layout.urlPlate.height / 2
			);
			assert.ok(
				layout.urlPlate.centerY - layout.urlPlate.height / 2 >=
					height * (orientation === 'vertical' ? 0.06 : 0.05)
			);
			assert.ok(
				layout.browser.y + layout.browser.height <=
					height * (orientation === 'vertical' ? 0.84 : 0.95)
			);
			assert.ok(layout.urlPlate.fontSize >= (orientation === 'vertical' ? 64 : 48));
		}
	});

	it('distinguishes missing, loading, ready, and broken image states', () => {
		assert.equal(websiteImageState(undefined, '', ''), 'missing');
		assert.equal(websiteImageState('/image.png', '', ''), 'loading');
		assert.equal(websiteImageState('/image.png', '/image.png', ''), 'ready');
		assert.equal(websiteImageState('/image.png', '', '/image.png'), 'broken');
	});
});

describe('filmed page layout (ADR-0057)', () => {
	it('covers the frame at the smallest scale and centres the anchored page point', () => {
		const layout = calculateFilmedPageLayout(3840, 2160, 2880, 5120, { x: 0.5, y: 0.25 });
		assert.ok(Math.abs(layout.scale - 3840 / 2880) < 1e-9);
		assert.equal(layout.width, 3840);
		assert.ok(Math.abs(layout.height - 5120 * (3840 / 2880)) < 1e-9);
		assert.equal(layout.left, 0);
		assert.ok(Math.abs(layout.top - (1080 - 0.25 * layout.height)) < 1e-9);
	});

	it('minifies a tall capture to cover the vertical frame exactly', () => {
		const layout = calculateFilmedPageLayout(2160, 3840, 2880, 5120);
		assert.equal(layout.scale, 0.75);
		assert.equal(layout.width, 2160);
		assert.equal(layout.height, 3840);
		assert.equal(layout.left, 0);
		assert.equal(layout.top, 0);
	});

	it('clamps the anchor so no frame edge sees past the page', () => {
		const top = calculateFilmedPageLayout(3840, 2160, 2880, 5120, { x: 0, y: 0 });
		assert.equal(top.left, 0);
		assert.equal(top.top, 0);
		const bottom = calculateFilmedPageLayout(3840, 2160, 2880, 5120, { x: 1, y: 1 });
		assert.ok(Math.abs(bottom.top - (2160 - bottom.height)) < 1e-9);
		assert.ok(bottom.top + bottom.height >= 2160);
	});

	it('refuses empty frames or captures', () => {
		assert.throws(() => calculateFilmedPageLayout(0, 2160, 2880, 5120), /positive/);
		assert.throws(() => calculateFilmedPageLayout(3840, 2160, 0, 5120), /positive/);
	});
});
