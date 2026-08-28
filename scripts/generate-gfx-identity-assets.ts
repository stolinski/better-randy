// Writes every shipped gfx.computer identity asset from the drawn geometry in
// src/lib/identity/gfx-identity-geometry.ts. Assets are generated, never
// hand-edited — a hand edit is lost on the next run.
//
// Anything else in the asset directory is pruned, so a renamed or retired cut
// cannot linger and be imported by a surface that should no longer have it.
//
// Usage: node --experimental-strip-types scripts/generate-gfx-identity-assets.ts

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	GFX_IDENTITY_PALETTES,
	renderGfxIdentityLogotypeSvg,
	renderGfxIdentityMarkSvg,
	type GfxIdentityPalette
} from '../src/lib/identity/gfx-identity-geometry.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the shipped identity assets live; every app surface imports from here. */
export const GFX_IDENTITY_ASSET_DIRECTORY = 'src/lib/assets/identity';

interface IdentityAssetPlan {
	readonly fileName: string;
	readonly palette: GfxIdentityPalette;
	readonly emit: (palette: GfxIdentityPalette) => string;
}

const ASSET_PLANS: readonly IdentityAssetPlan[] = [
	{
		fileName: 'gfx-mark.svg',
		palette: GFX_IDENTITY_PALETTES.deck,
		emit: renderGfxIdentityMarkSvg
	},
	{
		fileName: 'gfx-mark-mono-dark.svg',
		palette: GFX_IDENTITY_PALETTES.monoDark,
		emit: renderGfxIdentityMarkSvg
	},
	{
		fileName: 'gfx-mark-mono-light.svg',
		palette: GFX_IDENTITY_PALETTES.monoLight,
		emit: renderGfxIdentityMarkSvg
	},
	{
		fileName: 'gfx-logotype.svg',
		palette: GFX_IDENTITY_PALETTES.deck,
		emit: renderGfxIdentityLogotypeSvg
	},
	{
		fileName: 'gfx-logotype-mono-dark.svg',
		palette: GFX_IDENTITY_PALETTES.monoDark,
		emit: renderGfxIdentityLogotypeSvg
	},
	{
		fileName: 'gfx-logotype-mono-light.svg',
		palette: GFX_IDENTITY_PALETTES.monoLight,
		emit: renderGfxIdentityLogotypeSvg
	}
];

const assetRoot = join(repositoryRoot, GFX_IDENTITY_ASSET_DIRECTORY);
mkdirSync(assetRoot, { recursive: true });

const written: string[] = [];
for (const plan of ASSET_PLANS) {
	const target = join(assetRoot, plan.fileName);
	writeFileSync(target, plan.emit(plan.palette), 'utf8');
	written.push(relative(repositoryRoot, target));
}

const emitted = new Set(ASSET_PLANS.map((plan) => plan.fileName));
for (const entry of readdirSync(assetRoot)) {
	if (!emitted.has(entry)) rmSync(join(assetRoot, entry), { force: true, recursive: true });
}

process.stdout.write(`${written.join('\n')}\n`);
