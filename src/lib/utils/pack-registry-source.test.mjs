import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { readPackRegistrySlugsFromSource } from './pack-registry-source.mjs';

const temporaryRoots = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writePackRegistry(source) {
	const root = mkdtempSync(join(tmpdir(), 'pack-registry-source-'));
	temporaryRoots.push(root);
	const registryDirectory = join(root, 'src/lib/platform/packs');
	mkdirSync(registryDirectory, { recursive: true });
	writeFileSync(join(registryDirectory, 'registry.ts'), source);
	return root;
}

describe('readPackRegistrySlugsFromSource', () => {
	it('reads quoted and identifier keys from PACK_REGISTRY', () => {
		const root = writePackRegistry(`export const PACK_REGISTRY = {
	syntax: syntaxPack,
	'editorial-mono': editorialMonoPack
};`);

		assert.deepEqual(readPackRegistrySlugsFromSource(root), ['syntax', 'editorial-mono']);
	});

	it('rejects a registry without literal slug keys', () => {
		const root = writePackRegistry('export const PACK_REGISTRY = {};');

		assert.throws(() => readPackRegistrySlugsFromSource(root), /unique literal slug keys/);
	});
});
