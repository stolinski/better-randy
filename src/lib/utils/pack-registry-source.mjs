import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Read the literal keys from the canonical PACK_REGISTRY declaration without
 * importing browser-facing Pack manifests into Node authoring scripts.
 *
 * @param {string} repositoryRoot
 * @returns {readonly string[]}
 */
export function readPackRegistrySlugsFromSource(repositoryRoot) {
	const registryPath = resolve(repositoryRoot, 'src/lib/platform/packs/registry.ts');
	const source = readFileSync(registryPath, 'utf8');
	const declaration = source.match(/export const PACK_REGISTRY[^=]*=\s*\{([\s\S]*?)\};/);
	if (!declaration) {
		throw new Error(`Could not read PACK_REGISTRY from ${registryPath}.`);
	}

	const slugs = declaration[1]
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_-]+))\s*:/))
		.filter((match) => match !== null)
		.map((match) => match[1] ?? match[2] ?? match[3]);
	if (slugs.length === 0 || new Set(slugs).size !== slugs.length) {
		throw new Error(`PACK_REGISTRY in ${registryPath} must contain unique literal slug keys.`);
	}
	return slugs;
}
