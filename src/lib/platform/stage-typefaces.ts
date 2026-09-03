// The registered typefaces of the Dimensional Stage (ADR-0062, the
// compiled-typeface lane). A typeface is one cut of a face a Pack already
// ships — compiled once by `scripts/compile-stage-typeface.ts` from the
// `@fontsource` WOFF2 the Pack registers for CSS — into a bundled
// `.stageglyphs` under `src/lib/assets/typefaces/`, and registered here with
// the facts dimensional type needs before its bytes decode. Nothing at runtime
// parses a font, and no font library ships to the browser: the browser reads
// outlines the build wrote. This module stays free of app imports so the
// compile script and the Pack validation can load it under Node.

export interface StageTypefaceDefinition {
	slug: string;
	label: string;
	/** The CSS family the Pack registers for this face, for the flat fallback. */
	family: string;
	weight: number;
	/** Provenance of the compiled bytes. */
	source: {
		file: string;
		sha256: string;
	};
	/** Expected contents of the compiled file, asserted by tests and at load. */
	glyphs: number;
	kerningPairs: number;
	unitsPerEm: number;
	capHeight: number;
}

const STAGE_TYPEFACES: Record<string, StageTypefaceDefinition> = {
	// The house Pack's display voice, the Brief's first face.
	'space-grotesk-700': {
		slug: 'space-grotesk-700',
		label: 'Space Grotesk Bold',
		family: 'Space Grotesk',
		weight: 700,
		source: {
			file: 'node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2',
			sha256: '35f8aec56cfd5cbfdb03cc68733a54a0b05bb3617ffcd5fd332badc0b045ca55'
		},
		glyphs: 200,
		kerningPairs: 3468,
		unitsPerEm: 1000,
		capHeight: 700
	},
	'playfair-display-700': {
		slug: 'playfair-display-700',
		label: 'Playfair Display Bold',
		family: 'Playfair Display',
		weight: 700,
		source: {
			file: 'node_modules/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2',
			sha256: '28453852ea165c47b5a941be00e418402e1407002ed87507f062a1e316328fe6'
		},
		glyphs: 199,
		kerningPairs: 7703,
		unitsPerEm: 1000,
		capHeight: 708
	},
	'jetbrains-mono-800': {
		slug: 'jetbrains-mono-800',
		label: 'JetBrains Mono ExtraBold',
		family: 'JetBrains Mono',
		weight: 800,
		source: {
			file: 'node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff2',
			sha256: '237d0cbcf1aacd607e07f610d79cbc880edbffcc99ebcf417c502f8fa873ee53'
		},
		glyphs: 200,
		kerningPairs: 198,
		unitsPerEm: 1000,
		capHeight: 730
	},
	'geist-700': {
		slug: 'geist-700',
		label: 'Geist Bold',
		family: 'Geist',
		weight: 700,
		source: {
			file: 'node_modules/@fontsource/geist/files/geist-latin-700-normal.woff2',
			sha256: '728e76ff0b76212419e83011f5202c2fd1144da9d7915a4fa787561f5a3f334d'
		},
		glyphs: 199,
		kerningPairs: 12058,
		unitsPerEm: 1000,
		capHeight: 710
	},
	'rubik-700': {
		slug: 'rubik-700',
		label: 'Rubik Bold',
		family: 'Rubik',
		weight: 700,
		source: {
			file: 'node_modules/@fontsource/rubik/files/rubik-latin-700-normal.woff2',
			sha256: 'e423f8ae1668156addf5e32f1056d5b22b5b113a9a23afd364df84a6fa88602d'
		},
		glyphs: 200,
		kerningPairs: 6484,
		unitsPerEm: 1000,
		capHeight: 700
	}
};

/** The face dimensional type falls back to when a Pack names none. */
export const REFERENCE_STAGE_TYPEFACE_SLUG = 'space-grotesk-700';

export function isStageTypeface(slug: string): boolean {
	return slug in STAGE_TYPEFACES;
}

export function listStageTypefaces(): readonly string[] {
	return Object.keys(STAGE_TYPEFACES);
}

export function getStageTypeface(slug: string): StageTypefaceDefinition | null {
	return STAGE_TYPEFACES[slug] ?? null;
}
