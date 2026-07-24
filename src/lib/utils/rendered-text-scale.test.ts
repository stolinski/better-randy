import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { calculateEffectiveCapHeight, parseRenderedTextScaleY } from './rendered-text-scale.ts';

describe('rendered text scale', () => {
	it('parses computed individual CSS scale defensively', () => {
		assert.equal(parseRenderedTextScaleY('none'), 1);
		assert.equal(parseRenderedTextScaleY(''), 1);
		assert.equal(parseRenderedTextScaleY('1.6'), 1.6);
		assert.equal(parseRenderedTextScaleY('1.2 0.75'), 0.75);
		assert.equal(parseRenderedTextScaleY('-1.25'), 1.25);
		assert.equal(parseRenderedTextScaleY('150%'), 1.5);
		assert.equal(parseRenderedTextScaleY('not-a-scale'), 1);
	});

	it('applies only the live item scale to native computed font size', () => {
		assert.equal(calculateEffectiveCapHeight(50, 0.72, '1.5'), 54);
		assert.equal(calculateEffectiveCapHeight(50, 0.72, 'none'), 36);
	});

	it('keeps canonical timeline captions and headlines inside their G4 bands', () => {
		const nativeCqmin = 21.6;
		const monoCapHeightRatio = 0.72;
		const supportingCaption = calculateEffectiveCapHeight(
			2.6 * nativeCqmin,
			monoCapHeightRatio,
			'0.8'
		);
		const horizontalSectionHeadline = calculateEffectiveCapHeight(
			2.9 * nativeCqmin,
			monoCapHeightRatio,
			'1.35'
		);
		const verticalSectionHeadline = calculateEffectiveCapHeight(
			2.9 * nativeCqmin,
			monoCapHeightRatio,
			'1.7'
		);
		const horizontalTopHeadline = calculateEffectiveCapHeight(
			2.9 * nativeCqmin,
			monoCapHeightRatio,
			'2.4'
		);
		const verticalTopHeadline = calculateEffectiveCapHeight(
			2.9 * nativeCqmin,
			monoCapHeightRatio,
			'2'
		);

		assert.equal(Number(supportingCaption.toFixed(2)), 32.35);
		assert.ok(supportingCaption >= 32, 'scale 0.8 caption clears the vertical 32px floor');
		assert.equal(Number(horizontalSectionHeadline.toFixed(2)), 60.89);
		assert.ok(horizontalSectionHeadline >= 60, 'section headline clears the horizontal floor');
		assert.equal(Number(verticalSectionHeadline.toFixed(2)), 76.67);
		assert.ok(verticalSectionHeadline >= 76, 'section headline clears the vertical floor');
		assert.equal(Number(horizontalTopHeadline.toFixed(2)), 108.24);
		assert.ok(horizontalTopHeadline <= 110, 'top headline remains below the horizontal ceiling');
		assert.equal(Number(verticalTopHeadline.toFixed(2)), 90.2);
		assert.ok(verticalTopHeadline >= 76 && verticalTopHeadline <= 138);
	});
});
