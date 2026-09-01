/**
 * Vendored Google Fonts catalog — the offline validation authority for User
 * Pack font claims (ADR-0055).
 *
 * `google-fonts-catalog.json` is a committed snapshot of Google's font
 * metadata written only by `scripts/refresh-google-fonts-catalog.mjs`; nothing
 * here touches the network. Per family it records the named cuts Google ships
 * as real files (`"400"` upright, `"700i"` italic) and the variable axes with
 * their ranges. A claim is a real cut when it names a shipped file OR sits
 * inside the family's `wght` axis range — the runtime equivalent of the
 * playbook's "never synthesize weight or stretch" law
 * (docs/packs/authoring-playbook.md § 2.2), enforced here deterministically.
 *
 * Built-in registry packs never consult this catalog: their fonts are
 * `@fontsource`-bundled and boot-gated. Only User Pack documents do.
 *
 * File URLs are intentionally absent: Google versions and rotates them, so the
 * origin resolves them at save time when it materializes the same-origin font
 * cache, and pins the downloaded bytes by content hash.
 */
import googleFontsCatalogJson from './google-fonts-catalog.json' with { type: 'json' };

export const GOOGLE_FONTS_CATEGORIES = [
	'Sans Serif',
	'Serif',
	'Display',
	'Handwriting',
	'Monospace'
] as const;
export type GoogleFontsCategory = (typeof GOOGLE_FONTS_CATEGORIES)[number];

export interface GoogleFontsVariableAxis {
	/** OpenType axis tag: `wght`, `wdth`, `opsz`, `slnt`, or a family-specific tag. */
	tag: string;
	min: number;
	max: number;
}

export interface GoogleFontsFamilyRecord {
	category: GoogleFontsCategory;
	/** Google's popularity rank at snapshot time; 1 is the most used family. */
	popularityRank: number;
	/** Named cuts shipped as real files: `<weight>` upright, `<weight>i` italic. */
	cuts: readonly string[];
	/** Variable axes; a `wght` entry makes every weight in its range a real cut. */
	axes: readonly GoogleFontsVariableAxis[];
}

export interface GoogleFontsCatalog {
	source: string;
	/** The newest family `lastModified` date in the snapshot — its provenance. */
	metadataLastModified: string;
	families: Readonly<Record<string, GoogleFontsFamilyRecord>>;
}

/** The only two styles Google Fonts ships; any other `PackFont.style` cannot resolve. */
export type GoogleFontStyle = 'normal' | 'italic';

export interface GoogleFontCutClaim {
	family: string;
	weight: number;
	style: GoogleFontStyle;
}

export type GoogleFontCutResolution =
	| { kind: 'static'; claim: GoogleFontCutClaim }
	| { kind: 'variable'; claim: GoogleFontCutClaim; weightAxis: GoogleFontsVariableAxis }
	| { kind: 'unknown-family'; claim: GoogleFontCutClaim }
	| {
			kind: 'unavailable-cut';
			claim: GoogleFontCutClaim;
			/** Shipped weights for the claimed style, ascending. */
			availableWeights: readonly number[];
			/** The `wght` axis when the family is variable, so the message can name the range. */
			weightAxis: GoogleFontsVariableAxis | null;
	  };

const CUT_KEY_PATTERN = /^[0-9]+i?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGoogleFontsCategory(value: unknown): value is GoogleFontsCategory {
	return (
		typeof value === 'string' && (GOOGLE_FONTS_CATEGORIES as readonly string[]).includes(value)
	);
}

function parseVariableAxis(family: string, value: unknown, index: number): GoogleFontsVariableAxis {
	if (
		!isRecord(value) ||
		typeof value.tag !== 'string' ||
		typeof value.min !== 'number' ||
		typeof value.max !== 'number' ||
		!(value.min <= value.max)
	) {
		throw new TypeError(`Google Fonts catalog family "${family}" axes[${index}] is malformed`);
	}
	return { tag: value.tag, min: value.min, max: value.max };
}

function parseFamilyRecord(family: string, value: unknown): GoogleFontsFamilyRecord {
	if (!isRecord(value)) {
		throw new TypeError(`Google Fonts catalog family "${family}" must be an object`);
	}
	if (!isGoogleFontsCategory(value.category)) {
		throw new TypeError(`Google Fonts catalog family "${family}" has an unknown category`);
	}
	if (typeof value.popularityRank !== 'number' || !Number.isInteger(value.popularityRank)) {
		throw new TypeError(`Google Fonts catalog family "${family}" needs an integer popularityRank`);
	}
	if (
		!Array.isArray(value.cuts) ||
		value.cuts.length === 0 ||
		!value.cuts.every((cut) => typeof cut === 'string' && CUT_KEY_PATTERN.test(cut))
	) {
		throw new TypeError(
			`Google Fonts catalog family "${family}" must list at least one cut in the <weight>[i] form`
		);
	}
	if (!Array.isArray(value.axes)) {
		throw new TypeError(`Google Fonts catalog family "${family}" must list its axes`);
	}
	return {
		category: value.category,
		popularityRank: value.popularityRank,
		cuts: value.cuts.map(String),
		axes: value.axes.map((axis, index) => parseVariableAxis(family, axis, index))
	};
}

/** Narrow a snapshot (the vendored one or a test fixture) to the typed catalog, failing fast. */
export function parseGoogleFontsCatalog(value: unknown): GoogleFontsCatalog {
	if (!isRecord(value)) throw new TypeError('Google Fonts catalog must be an object');
	if (typeof value.source !== 'string' || typeof value.metadataLastModified !== 'string') {
		throw new TypeError('Google Fonts catalog must record its source and metadataLastModified');
	}
	if (!isRecord(value.families)) {
		throw new TypeError('Google Fonts catalog must map family names to records');
	}
	const families: Record<string, GoogleFontsFamilyRecord> = {};
	for (const [family, record] of Object.entries(value.families)) {
		families[family] = parseFamilyRecord(family, record);
	}
	return { source: value.source, metadataLastModified: value.metadataLastModified, families };
}

export const GOOGLE_FONTS_CATALOG: GoogleFontsCatalog =
	parseGoogleFontsCatalog(googleFontsCatalogJson);

export function hasGoogleFontsFamily(
	family: string,
	catalog: GoogleFontsCatalog = GOOGLE_FONTS_CATALOG
): boolean {
	return Object.hasOwn(catalog.families, family);
}

/** A `PackFont.style` value is a Google Fonts style only when it is exactly normal or italic. */
export function parseGoogleFontStyle(style: string | undefined): GoogleFontStyle | null {
	const normalized = (style ?? 'normal').trim();
	return normalized === 'normal' || normalized === 'italic' ? normalized : null;
}

function cutKey(weight: number, style: GoogleFontStyle): string {
	return style === 'italic' ? `${weight}i` : `${weight}`;
}

function shippedWeights(record: GoogleFontsFamilyRecord, style: GoogleFontStyle): number[] {
	return record.cuts
		.filter((cut) => cut.endsWith('i') === (style === 'italic'))
		.map((cut) => Number.parseInt(cut, 10))
		.sort((left, right) => left - right);
}

/**
 * Decide whether one family/weight/style claim is a cut Google actually ships.
 * A variable family covers every weight inside its `wght` range, but italic
 * only when it ships italic instances — a `wght` axis never manufactures a
 * slant.
 */
export function resolveGoogleFontCut(
	claim: GoogleFontCutClaim,
	catalog: GoogleFontsCatalog = GOOGLE_FONTS_CATALOG
): GoogleFontCutResolution {
	const record = catalog.families[claim.family];
	if (record === undefined) return { kind: 'unknown-family', claim };
	if (record.cuts.includes(cutKey(claim.weight, claim.style))) return { kind: 'static', claim };

	const weightAxis = record.axes.find((axis) => axis.tag === 'wght') ?? null;
	const availableWeights = shippedWeights(record, claim.style);
	const styleShipped = claim.style === 'normal' || availableWeights.length > 0;
	if (
		weightAxis !== null &&
		styleShipped &&
		claim.weight >= weightAxis.min &&
		claim.weight <= weightAxis.max
	) {
		return { kind: 'variable', claim, weightAxis };
	}
	return { kind: 'unavailable-cut', claim, availableWeights, weightAxis };
}
