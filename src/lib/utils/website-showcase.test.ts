import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import {
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
