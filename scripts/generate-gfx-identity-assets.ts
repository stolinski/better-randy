// Writes every candidate gfx.computer identity asset from the drawn geometry in
// src/lib/identity/gfx-identity-geometry.ts. Assets are generated, never
// hand-edited: the ratified alpha-cell variant has to re-emit byte-identically
// when the install task (dex 7f3otg8g) promotes it into src/lib/assets and
// static/.
//
// Usage: node --experimental-strip-types scripts/generate-gfx-identity-assets.ts

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	GFX_ALPHA_CELL_VARIANTS,
	GFX_IDENTITY_PALETTES,
	renderGfxIdentityLogotypeSvg,
	renderGfxIdentityMarkSvg,
	type GfxAlphaCellVariantId,
	type GfxIdentityPalette
} from '../src/lib/identity/gfx-identity-geometry.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every generated candidate asset lives here until one variant is ratified. */
export const GFX_IDENTITY_CANDIDATE_DIRECTORY = 'docs/identity/candidates';

interface IdentityAssetPlan {
	readonly fileName: string;
	readonly palette: GfxIdentityPalette;
	readonly emit: (id: GfxAlphaCellVariantId, palette: GfxIdentityPalette) => string;
}

const ASSET_PLANS: readonly IdentityAssetPlan[] = [
	{ fileName: 'mark.svg', palette: GFX_IDENTITY_PALETTES.deck, emit: renderGfxIdentityMarkSvg },
	{
		fileName: 'mark-mono-dark.svg',
		palette: GFX_IDENTITY_PALETTES.monoDark,
		emit: renderGfxIdentityMarkSvg
	},
	{
		fileName: 'mark-mono-light.svg',
		palette: GFX_IDENTITY_PALETTES.monoLight,
		emit: renderGfxIdentityMarkSvg
	},
	{
		fileName: 'logotype.svg',
		palette: GFX_IDENTITY_PALETTES.deck,
		emit: renderGfxIdentityLogotypeSvg
	},
	{
		fileName: 'logotype-mono-dark.svg',
		palette: GFX_IDENTITY_PALETTES.monoDark,
		emit: renderGfxIdentityLogotypeSvg
	},
	{
		fileName: 'logotype-mono-light.svg',
		palette: GFX_IDENTITY_PALETTES.monoLight,
		emit: renderGfxIdentityLogotypeSvg
	}
];

const candidateRoot = join(repositoryRoot, GFX_IDENTITY_CANDIDATE_DIRECTORY);
mkdirSync(candidateRoot, { recursive: true });

// Drop folders for variants that no longer exist, so a retired candidate cannot
// linger in the review bundle and be mistaken for a live option.
const liveIds = new Set<string>(GFX_ALPHA_CELL_VARIANTS.map((variant) => variant.id));
for (const entry of readdirSync(candidateRoot, { withFileTypes: true })) {
	if (entry.isDirectory() && !liveIds.has(entry.name)) {
		rmSync(join(candidateRoot, entry.name), { recursive: true, force: true });
	}
}

const written: string[] = [];
for (const variant of GFX_ALPHA_CELL_VARIANTS) {
	const directory = join(repositoryRoot, GFX_IDENTITY_CANDIDATE_DIRECTORY, variant.id);
	mkdirSync(directory, { recursive: true });
	for (const plan of ASSET_PLANS) {
		const target = join(directory, plan.fileName);
		writeFileSync(target, plan.emit(variant.id, plan.palette), 'utf8');
		written.push(relative(repositoryRoot, target));
	}
}

process.stdout.write(`${written.join('\n')}\n`);
