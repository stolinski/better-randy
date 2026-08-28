import { describe, expect, it } from 'vitest';

import {
	GFX_IDENTITY,
	GFX_IDENTITY_PALETTES,
	GFX_IDENTITY_TILE_UNITS,
	measureGfxIdentityFeaturePixels,
	renderGfxIdentityLogotypeSvg,
	renderGfxIdentityMarkSvg
} from './gfx-identity-geometry.ts';

/** Smallest feature that still resolves on a standard-density display. */
const MINIMUM_FEATURE_PIXELS = 1.5;

/** The favicon size a browser tab actually paints most often. */
const FAVICON_PIXELS = 16;

function extractFills(svg: string): string[] {
	return [...svg.matchAll(/fill="([^"]+)"/g)].map((match) => match[1]);
}

describe('the ratified identity', () => {
	it('stays traceable to the candidate Scott approved', () => {
		expect(GFX_IDENTITY.ratifiedCandidateId).toBe('alpha-cell-b');
	});

	it('leans the logotype with its own mark', () => {
		const svg = renderGfxIdentityLogotypeSvg(GFX_IDENTITY_PALETTES.monoDark);
		expect(svg).toContain(`skewX(${GFX_IDENTITY.shearDegrees})`);
	});
});

describe('small-size legibility', () => {
	it('keeps the tightest cell above the resolvable width at 16px', () => {
		expect(measureGfxIdentityFeaturePixels(FAVICON_PIXELS)).toBeGreaterThanOrEqual(
			MINIMUM_FEATURE_PIXELS
		);
	});

	it('scales the cell width linearly with the rendered size', () => {
		expect(measureGfxIdentityFeaturePixels(64)).toBeCloseTo(
			measureGfxIdentityFeaturePixels(32) * 2,
			6
		);
	});

	it('refuses a non-positive rendered size', () => {
		expect(() => measureGfxIdentityFeaturePixels(0)).toThrow(TypeError);
	});
});

describe('mark emission', () => {
	it('draws inside the 64-unit tile', () => {
		const svg = renderGfxIdentityMarkSvg(GFX_IDENTITY_PALETTES.deck);
		expect(svg).toContain(`viewBox="0 0 ${GFX_IDENTITY_TILE_UNITS} ${GFX_IDENTITY_TILE_UNITS}"`);
		expect(svg).toContain('<path d="M');
	});

	it('emits no typeset text, so a favicon rasterizes with no font available', () => {
		for (const svg of [
			renderGfxIdentityMarkSvg(GFX_IDENTITY_PALETTES.deck),
			renderGfxIdentityLogotypeSvg(GFX_IDENTITY_PALETTES.deck)
		]) {
			expect(svg).not.toContain('<text');
			expect(svg).not.toContain('font-family');
		}
	});

	it('sets the mark in two neutrals on the deck and never a third', () => {
		const { deck } = GFX_IDENTITY_PALETTES;
		const fills = new Set(extractFills(renderGfxIdentityMarkSvg(deck)));
		expect(fills).toEqual(new Set([deck.ink, deck.inkAlternate, deck.tile]));
	});

	it('drops the plate and the second neutral from the one-ink cut', () => {
		const { monoDark } = GFX_IDENTITY_PALETTES;
		expect(new Set(extractFills(renderGfxIdentityMarkSvg(monoDark)))).toEqual(
			new Set([monoDark.ink])
		);
	});

	it('carries GFX as its accessible name, so the mark alone still names the product', () => {
		expect(renderGfxIdentityMarkSvg(GFX_IDENTITY_PALETTES.deck)).toContain(
			'aria-label="GFX mark"'
		);
	});
});

describe('logotype emission', () => {
	it('sets G, F and X on one baseline', () => {
		const svg = renderGfxIdentityLogotypeSvg(GFX_IDENTITY_PALETTES.monoDark);
		// G(20) + F(14) + X(13) lit cells, each emitted as its own subpath.
		expect([...svg.matchAll(/M[\d.]+ [\d.]+H/g)]).toHaveLength(47);
		// Three glyphs advance across the line, so the tight box is always wider
		// than it is tall.
		const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
		expect(Number(viewBox?.[1])).toBeGreaterThan(Number(viewBox?.[2]));
	});

	it('leaves room for the lean inside its own viewBox, so nothing clips', () => {
		const svg = renderGfxIdentityLogotypeSvg(GFX_IDENTITY_PALETTES.monoDark);
		const viewBoxWidth = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
		const rightmostEdge = Math.max(
			...[...svg.matchAll(/H([\d.]+)V/g)].map((match) => Number(match[1]))
		);
		const translateX = Number(/translate\(([\d.]+) /.exec(svg)?.[1]);
		const scale = Number(/scale\(([\d.]+)\)/.exec(svg)?.[1]);
		expect(rightmostEdge * scale + translateX).toBeLessThanOrEqual(viewBoxWidth);
	});
});
