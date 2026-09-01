#!/usr/bin/env node
/**
 * Refresh the vendored Google Fonts catalog snapshot (ADR-0055).
 *
 * User Pack font claims validate OFFLINE against
 * `src/lib/platform/google-fonts-catalog.json`, never against the network,
 * and the playbook law holds for them exactly as for built-in packs: never
 * synthesize a weight or style the family does not ship
 * (docs/packs/authoring-playbook.md § 2.2). This script is the only writer of
 * that snapshot and is run deliberately by a human — the snapshot is committed
 * data, never fetched at build or render time.
 *
 * Source: the public Google Fonts metadata endpoint (no API key). Per family it
 * yields the named cuts Google ships as real files (`"400"`, `"700i"`) and the
 * variable axes with their ranges; a claimed weight inside a `wght` range is a
 * real cut too. The snapshot carries no file URLs on purpose — Google versions
 * and rotates them, so the origin resolves them at save time when it
 * materializes the font cache. Output is one family per line, sorted, so a
 * refresh diffs per family.
 *
 *   node scripts/refresh-google-fonts-catalog.mjs   (pnpm refresh:google-fonts)
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOOGLE_FONTS_METADATA_URL = 'https://fonts.google.com/metadata/fonts';
const SNAPSHOT_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../src/lib/platform/google-fonts-catalog.json'
);
/** Google sometimes prefixes the JSON with an anti-XSSI guard; strip it when present. */
const XSSI_PREFIX = /^\)\]\}'\s*/;
const CUT_KEY_PATTERN = /^[0-9]+i?$/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Order cuts as the catalog documents them: upright weights ascending, then italics.
 * @param {string} left
 * @param {string} right
 */
function compareCutKeys(left, right) {
	const leftItalic = left.endsWith('i');
	const rightItalic = right.endsWith('i');
	if (leftItalic !== rightItalic) return leftItalic ? 1 : -1;
	return Number.parseInt(left, 10) - Number.parseInt(right, 10);
}

/**
 * @param {unknown} entry
 * @returns {[string, { category: string; popularityRank: number; cuts: string[]; axes: { tag: string; min: number; max: number }[] }]}
 */
function toFamilyRecord(entry) {
	if (!isRecord(entry) || typeof entry.family !== 'string' || !isRecord(entry.fonts)) {
		throw new Error(`Google Fonts metadata entry is not a family record: ${JSON.stringify(entry)}`);
	}
	const cuts = Object.keys(entry.fonts);
	for (const cut of cuts) {
		if (!CUT_KEY_PATTERN.test(cut)) {
			throw new Error(
				`Google Fonts family "${entry.family}" names a cut "${cut}" outside the <weight>[i] vocabulary; update this script before trusting the snapshot.`
			);
		}
	}
	const axes = Array.isArray(entry.axes) ? entry.axes : [];
	return [
		entry.family,
		{
			category: typeof entry.category === 'string' ? entry.category : 'Display',
			popularityRank:
				typeof entry.popularity === 'number' ? entry.popularity : Number.MAX_SAFE_INTEGER,
			cuts: cuts.sort(compareCutKeys),
			axes: axes
				.map((axis) => {
					if (
						!isRecord(axis) ||
						typeof axis.tag !== 'string' ||
						typeof axis.min !== 'number' ||
						typeof axis.max !== 'number'
					) {
						throw new Error(
							`Google Fonts family "${entry.family}" declares a malformed axis: ${JSON.stringify(axis)}`
						);
					}
					return { tag: axis.tag, min: axis.min, max: axis.max };
				})
				.sort((left, right) => left.tag.localeCompare(right.tag))
		}
	];
}

const response = await fetch(GOOGLE_FONTS_METADATA_URL, {
	headers: { accept: 'application/json' }
});
if (!response.ok) {
	throw new Error(
		`${GOOGLE_FONTS_METADATA_URL} answered ${response.status} ${response.statusText}`
	);
}
const metadata = JSON.parse((await response.text()).replace(XSSI_PREFIX, ''));
if (!isRecord(metadata) || !Array.isArray(metadata.familyMetadataList)) {
	throw new Error('Google Fonts metadata did not contain familyMetadataList.');
}

const families = metadata.familyMetadataList.map(toFamilyRecord);
families.sort(([left], [right]) => left.localeCompare(right));
const metadataLastModified = metadata.familyMetadataList
	.map((entry) =>
		isRecord(entry) && typeof entry.lastModified === 'string' ? entry.lastModified : ''
	)
	.reduce((latest, date) => (date > latest ? date : latest), '');

const familyLines = families.map(
	([family, record]) => `\t\t${JSON.stringify(family)}: ${JSON.stringify(record)}`
);
const snapshot = [
	'{',
	`\t"source": ${JSON.stringify(GOOGLE_FONTS_METADATA_URL)},`,
	`\t"metadataLastModified": ${JSON.stringify(metadataLastModified)},`,
	'\t"families": {',
	familyLines.join(',\n'),
	'\t}',
	'}',
	''
].join('\n');
writeFileSync(SNAPSHOT_PATH, snapshot);

const variableCount = families.filter(([, record]) => record.axes.length > 0).length;
console.log(
	`Wrote ${families.length} families (${variableCount} variable) to ${SNAPSHOT_PATH}; metadata last modified ${metadataLastModified}.`
);
