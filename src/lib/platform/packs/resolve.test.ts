import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { PACK_REGISTRY } from './registry.ts';
import { requireCoreColor, resolveBackgroundFill, resolveFieldInkColor } from './resolve.ts';
import type { PackManifest } from './types.ts';

describe('resolveBackgroundFill (ADR-0039 §3)', () => {
	it('passes an absent fill through — presence stays the transparent/opaque signal', () => {
		assert.equal(resolveBackgroundFill(PACK_REGISTRY.syntax, undefined), undefined);
	});

	it('passes an authored hex through untouched — an explicit colour wins over the Pack', () => {
		assert.equal(resolveBackgroundFill(PACK_REGISTRY.syntax, '#123456'), '#123456');
	});

	it("resolves the 'pack' sentinel to every registered Pack's field-treatment core", () => {
		for (const [slug, manifest] of Object.entries(PACK_REGISTRY)) {
			assert.equal(
				resolveBackgroundFill(manifest, 'pack'),
				requireCoreColor(manifest, 'field-treatment'),
				`pack "${slug}"`
			);
		}
	});

	it('locks the calibrated field values the corpus conversion depends on', () => {
		// The 2026-08-03 corpus fold rewrote presets restating these exact hexes
		// to the sentinel — resolution must reproduce them byte-for-byte or the
		// converted presets change pixels under their own pack.
		assert.equal(resolveBackgroundFill(PACK_REGISTRY.syntax, 'pack'), '#0e0e0d');
		assert.equal(resolveBackgroundFill(PACK_REGISTRY['clean-light'], 'pack'), '#f6f7f8');
	});

	it('fails fast when a manifest is missing the mandatory field-treatment core', () => {
		const corrupted: PackManifest = {
			slug: 'corrupted',
			label: 'Corrupted',
			description: 'A manifest the boot validator would refuse.',
			roles: {}
		};
		assert.throws(() => resolveBackgroundFill(corrupted, 'pack'), /field-treatment/);
	});
});

describe('resolveFieldInkColor', () => {
	it('resolves each registered Pack field/ink pair explicitly', () => {
		assert.equal(resolveFieldInkColor(PACK_REGISTRY.syntax), '#f7f6f2');
		assert.equal(resolveFieldInkColor(PACK_REGISTRY['editorial-mono']), '#eef3f8');
		assert.equal(resolveFieldInkColor(PACK_REGISTRY['crt-terminal']), '#45ff6e');
		assert.equal(resolveFieldInkColor(PACK_REGISTRY['clean-light']), '#16181d');
	});

	it('preserves authored composition ink', () => {
		assert.equal(resolveFieldInkColor(PACK_REGISTRY.syntax, '#123456'), '#123456');
	});

	it('falls back to mandatory ink-treatment when the optional pair is absent', () => {
		const pack = structuredClone(PACK_REGISTRY['clean-light']);
		delete pack.roles['field-ink-treatment'];
		assert.equal(resolveFieldInkColor(pack), '#16181d');
	});
});
