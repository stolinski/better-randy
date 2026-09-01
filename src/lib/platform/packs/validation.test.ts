import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { parseGoogleFontsCatalog } from '../google-fonts-catalog.ts';
import { PACK_REGISTRY } from './registry.ts';
import type { PackManifest } from './types.ts';
import {
	validatePackManifest,
	validateUserPackFontClaims,
	validateUserPackManifest
} from './validation.ts';

const CATALOG = parseGoogleFontsCatalog({
	source: 'fixture',
	metadataLastModified: '2026-01-01',
	families: {
		'Old Standard TT': { category: 'Serif', popularityRank: 1, cuts: ['400', '700'], axes: [] },
		'Space Grotesk': {
			category: 'Sans Serif',
			popularityRank: 2,
			cuts: ['300', '400', '500', '600', '700'],
			axes: [{ tag: 'wght', min: 300, max: 700 }]
		}
	}
});

/** A user pack forked from syntax: structurally valid, fonts replaced by the claims under test. */
function userPackWithFonts(fonts: PackManifest['fonts']): PackManifest {
	const forked = structuredClone(PACK_REGISTRY.syntax);
	const roles = { ...forked.roles };
	delete roles['font-treatment'];
	delete roles['font-label-treatment'];
	return { ...forked, slug: 'my-brand', label: 'My brand', roles, fonts };
}

describe('validateUserPackFontClaims', () => {
	it('accepts claims that resolve to shipped cuts, static or inside a wght axis', () => {
		const manifest = userPackWithFonts([
			{ family: 'Old Standard TT', weights: [400, 700] },
			{ family: 'Space Grotesk', weights: [350, 700] }
		]);
		assert.deepEqual(validateUserPackFontClaims(manifest, CATALOG), []);
		assert.deepEqual(validateUserPackManifest(manifest, { catalog: CATALOG }), []);
	});

	it('refuses a synthesized cut and names the weight, style, and what the family ships', () => {
		const manifest = userPackWithFonts([{ family: 'Old Standard TT', weights: [400, 500] }]);
		const issues = validateUserPackFontClaims(manifest, CATALOG);
		assert.equal(issues.length, 1);
		assert.equal(issues[0].kind, 'unavailable-google-fonts-cut');
		assert.deepEqual(issues[0].path, ['fonts', 0, 'weights', 1]);
		assert.match(issues[0].message, /weight 500 \(normal\)/);
		assert.match(issues[0].message, /400, 700/);
	});

	it('refuses a weight outside a variable family’s axis range, naming the range', () => {
		const issues = validateUserPackFontClaims(
			userPackWithFonts([{ family: 'Space Grotesk', weights: [800] }]),
			CATALOG
		);
		assert.equal(issues.length, 1);
		assert.match(issues[0].message, /300–700 \(variable\)/);
	});

	it('refuses a family the catalog does not know, once per declaration', () => {
		const issues = validateUserPackFontClaims(
			userPackWithFonts([{ family: 'Operator Mono', weights: [400, 700] }]),
			CATALOG
		);
		assert.equal(issues.length, 1);
		assert.equal(issues[0].kind, 'unknown-google-fonts-family');
		assert.deepEqual(issues[0].path, ['fonts', 0, 'family']);
	});

	it('refuses a style Google Fonts does not ship', () => {
		const issues = validateUserPackFontClaims(
			userPackWithFonts([{ family: 'Old Standard TT', style: 'oblique' }]),
			CATALOG
		);
		assert.equal(issues.length, 1);
		assert.deepEqual(issues[0].path, ['fonts', 0, 'style']);
	});

	it('points at the declaration itself when the default weight is the missing cut', () => {
		const issues = validateUserPackFontClaims(
			userPackWithFonts([{ family: 'Space Grotesk', style: 'italic' }]),
			CATALOG
		);
		assert.deepEqual(issues[0].path, ['fonts', 0]);
	});
});

describe('validateUserPackManifest', () => {
	it('composes the structural contract with the catalog check', () => {
		const manifest = userPackWithFonts([{ family: 'Old Standard TT', weights: [500] }]);
		manifest.roles['font-treatment'] = { kind: 'style', value: '"Undeclared Face", serif' };
		const kinds = validateUserPackManifest(manifest, { catalog: CATALOG }).map(
			(issue) => issue.kind
		);
		assert.ok(kinds.includes('undeclared-font-family'));
		assert.ok(kinds.includes('unavailable-google-fonts-cut'));
	});

	it('leaves built-in registry validation catalog-free', () => {
		const builtin: PackManifest = {
			...structuredClone(PACK_REGISTRY.syntax),
			fonts: [{ family: 'Operator Mono', weights: [400] }]
		};
		const kinds = validatePackManifest('syntax', builtin).map((issue) => issue.kind);
		assert.ok(!kinds.includes('unknown-google-fonts-family'));
		assert.ok(!kinds.includes('unavailable-google-fonts-cut'));
	});
});
