import { describe, expect, it } from 'vitest';

import {
	GFX_ALPHA_CELL_VARIANTS,
	GFX_IDENTITY_PALETTES,
	GFX_IDENTITY_TILE_UNITS,
	findGfxAlphaCellVariant,
	measureGfxIdentityFeaturePixels,
	renderGfxIdentityLogotypeSvg,
	renderGfxIdentityMarkSvg,
	type GfxAlphaCellVariantId
} from './gfx-identity-geometry.ts';

const VARIANT_IDS = GFX_ALPHA_CELL_VARIANTS.map((variant) => variant.id);

/** Smallest feature that still resolves on a standard-density display. */
const MINIMUM_FEATURE_PIXELS = 1.5;

/** The favicon size a browser tab actually paints most often. */
const FAVICON_PIXELS = 16;

function extractFills(svg: string): string[] {
	return [...svg.matchAll(/fill="([^"]+)"/g)].map((match) => match[1]);
}

/**
 * Side of the first cell a logotype emits, in module units. Cells are square and
 * inset by half the gutter, so this is the variant's type weight made numeric.
 */
function firstLogotypeCellSide(svg: string): number {
	const rectangle = /M([\d.]+) ([\d.]+)H([\d.]+)/.exec(svg);
	if (!rectangle) throw new Error('logotype emitted no cell rectangles');
	return Number(rectangle[3]) - Number(rectangle[1]);
}

function logotypeWidthUnits(svg: string): number {
	const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
	if (!viewBox) throw new Error('logotype emitted no viewBox');
	return Number(viewBox[1]);
}

describe('alpha-cell variants', () => {
	it('explores four variants of the one ratified direction', () => {
		expect(VARIANT_IDS).toEqual(['alpha-cell-a', 'alpha-cell-b', 'alpha-cell-c', 'alpha-cell-d']);
	});

	it('rejects an unknown variant by name', () => {
		expect(() => findGfxAlphaCellVariant('deck-plate' as GfxAlphaCellVariantId)).toThrow(TypeError);
	});

	it('keeps every bleed field upright, because a sheared one slivers its edge cells', () => {
		for (const variant of GFX_ALPHA_CELL_VARIANTS) {
			if (variant.mark.kind === 'bleed-checker') expect(variant.shearDegrees).toBe(0);
		}
	});
});

describe('small-size legibility', () => {
	it.each(VARIANT_IDS)('keeps %s above the resolvable cell width at 16px', (id) => {
		expect(measureGfxIdentityFeaturePixels(id, FAVICON_PIXELS)).toBeGreaterThanOrEqual(
			MINIMUM_FEATURE_PIXELS
		);
	});

	it('scales the cell width linearly with the rendered size', () => {
		const small = measureGfxIdentityFeaturePixels('alpha-cell-a', 32);
		const large = measureGfxIdentityFeaturePixels('alpha-cell-a', 64);
		expect(large).toBeCloseTo(small * 2, 6);
	});

	it('refuses a non-positive rendered size', () => {
		expect(() => measureGfxIdentityFeaturePixels('alpha-cell-a', 0)).toThrow(TypeError);
	});
});

describe('mark emission', () => {
	it.each(VARIANT_IDS)('draws %s inside the shared 64-unit tile', (id) => {
		const svg = renderGfxIdentityMarkSvg(id, GFX_IDENTITY_PALETTES.deck);
		expect(svg).toContain(`viewBox="0 0 ${GFX_IDENTITY_TILE_UNITS} ${GFX_IDENTITY_TILE_UNITS}"`);
		expect(svg).toContain('<path d="M');
	});

	it.each(VARIANT_IDS)('emits %s with no typeset text', (id) => {
		const svg = renderGfxIdentityMarkSvg(id, GFX_IDENTITY_PALETTES.deck);
		expect(svg).not.toContain('<text');
		expect(svg).not.toContain('font-family');
	});

	it.each(VARIANT_IDS)('sets %s in two neutrals on the deck and never a third', (id) => {
		const { deck } = GFX_IDENTITY_PALETTES;
		const fills = new Set(extractFills(renderGfxIdentityMarkSvg(id, deck)));
		expect(fills).toContain(deck.ink);
		expect(fills).toContain(deck.inkAlternate);
		expect(fills).toEqual(new Set([deck.ink, deck.inkAlternate, deck.tile]));
	});

	it.each(VARIANT_IDS)('drops the plate and the second neutral from the %s one-ink cut', (id) => {
		const fills = extractFills(renderGfxIdentityMarkSvg(id, GFX_IDENTITY_PALETTES.monoDark));
		expect(new Set(fills)).toEqual(new Set([GFX_IDENTITY_PALETTES.monoDark.ink]));
	});

	it('clips a bleed field to the rounded tile, and a floating checker not at all', () => {
		expect(renderGfxIdentityMarkSvg('alpha-cell-c', GFX_IDENTITY_PALETTES.deck)).toContain(
			'clip-path'
		);
		expect(renderGfxIdentityMarkSvg('alpha-cell-a', GFX_IDENTITY_PALETTES.deck)).not.toContain(
			'clip-path'
		);
	});

	it('leaves the resolved letter alone when the one-ink cut removes its field', () => {
		const svg = renderGfxIdentityMarkSvg('alpha-cell-d', GFX_IDENTITY_PALETTES.monoDark);
		expect([...svg.matchAll(/<path /g)]).toHaveLength(1);
	});

	it('seats the resolved letter on whole cells of its own field', () => {
		const variant = findGfxAlphaCellVariant('alpha-cell-d');
		if (variant.mark.kind !== 'bleed-checker') throw new Error('alpha-cell-d must bleed');
		const cell = variant.mark.cellUnits;
		const letter = renderGfxIdentityMarkSvg('alpha-cell-d', GFX_IDENTITY_PALETTES.monoDark);
		for (const [, x, y] of letter.matchAll(/M([\d.]+) ([\d.]+)H/g)) {
			expect(Number(x) % cell).toBeCloseTo(0, 6);
			expect(Number(y) % cell).toBeCloseTo(0, 6);
		}
	});
});

describe('logotype emission', () => {
	it.each(VARIANT_IDS)('sets G, F and X for %s', (id) => {
		const svg = renderGfxIdentityLogotypeSvg(id, GFX_IDENTITY_PALETTES.monoDark);
		// G(20) + F(14) + X(13) lit cells, each emitted as its own subpath.
		expect([...svg.matchAll(/M[\d.]+ [\d.]+H/g)]).toHaveLength(47);
		// Three glyphs advance across the line, so the tight box is always wider
		// than it is tall.
		const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
		expect(Number(viewBox?.[1])).toBeGreaterThan(Number(viewBox?.[2]));
	});

	it.each(GFX_ALPHA_CELL_VARIANTS)('leans $id with its own mark', (variant) => {
		const svg = renderGfxIdentityLogotypeSvg(variant.id, GFX_IDENTITY_PALETTES.monoDark);
		if (variant.shearDegrees === 0) {
			expect(svg).not.toContain('skewX');
		} else {
			expect(svg).toContain(`skewX(${variant.shearDegrees})`);
		}
	});

	it('turns a smaller gutter into heavier cells', () => {
		const heavy = renderGfxIdentityLogotypeSvg('alpha-cell-b', GFX_IDENTITY_PALETTES.monoDark);
		const light = renderGfxIdentityLogotypeSvg('alpha-cell-c', GFX_IDENTITY_PALETTES.monoDark);
		expect(firstLogotypeCellSide(heavy)).toBeGreaterThan(firstLogotypeCellSide(light));
	});

	it('turns wider tracking into a wider line at the same cap height', () => {
		const open = renderGfxIdentityLogotypeSvg('alpha-cell-c', GFX_IDENTITY_PALETTES.monoDark);
		const tight = renderGfxIdentityLogotypeSvg('alpha-cell-d', GFX_IDENTITY_PALETTES.monoDark);
		expect(logotypeWidthUnits(open)).toBeGreaterThan(logotypeWidthUnits(tight));
	});
});
