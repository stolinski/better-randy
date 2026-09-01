/**
 * The same-origin font cache User Packs render from (ADR-0055).
 *
 * At save time the origin materializes every claimed cut once: it asks Google's
 * CSS API for the current file URLs, downloads the woff2 bytes, pins them under
 * their sha-256 content hash in app data, and records the claim → files mapping
 * in an index. From then on renders load `/api/user-pack-fonts/<hash>.woff2`
 * and never touch a third party. A pinned claim is never re-fetched or
 * replaced, so a render cannot change because Google updated a family in
 * place; a claim that cannot be materialized fails the save closed.
 *
 * `validateUserPackFontClaims` runs before this module, so every claim that
 * reaches it is a cut Google ships; a refusal here is a network or parse
 * failure and is reported as one, naming the claim.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { parseGoogleFontStyle, type GoogleFontStyle } from './google-fonts-catalog';
import type { PackFont } from './packs/types';
import { writeUserCompositionFileAtomically } from './user-composition-file-write.server';
import { USER_PACK_FONT_ROUTE_BASE, type UserPackFontFace } from './user-pack-font-faces';
import type { UserPackStoreLocation } from './user-pack-store-location.server';

export const GOOGLE_FONTS_STYLESHEET_URL = 'https://fonts.googleapis.com/css2';
/** Google serves woff2 with unicode-range slices only to a browser it recognises. */
const STYLESHEET_USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
export const USER_PACK_FONT_KEY_PATTERN = /^[a-f0-9]{64}\.woff2$/;
const FONT_CACHE_INDEX_FILE = 'index.json';

export interface UserPackFontCacheServices {
	/** The stylesheet text, or a throw on any non-2xx answer. */
	fetchStylesheet(url: string): Promise<string>;
	fetchFontBytes(url: string): Promise<Uint8Array>;
	now(): string;
}

const DEFAULT_SERVICES: UserPackFontCacheServices = {
	async fetchStylesheet(url) {
		const response = await fetch(url, {
			headers: { 'user-agent': STYLESHEET_USER_AGENT, accept: 'text/css,*/*;q=0.1' }
		});
		if (!response.ok) {
			throw new Error(
				`Google Fonts stylesheet request failed: ${url} answered ${response.status} ${response.statusText}`
			);
		}
		return response.text();
	},
	async fetchFontBytes(url) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(
				`Google Fonts file download failed: ${url} answered ${response.status} ${response.statusText}`
			);
		}
		return new Uint8Array(await response.arrayBuffer());
	},
	now: () => new Date().toISOString()
};

export interface UserPackFontClaim {
	family: string;
	weight: number;
	style: GoogleFontStyle;
}

/** One `@font-face` block as Google serves it: one subset slice of one cut. */
export interface GoogleFontFaceRule {
	family: string;
	style: GoogleFontStyle;
	weight: string;
	unicodeRange: string;
	url: string;
}

export class UserPackFontMaterializationError extends Error {
	readonly claim: UserPackFontClaim;

	constructor(claim: UserPackFontClaim, detail: string) {
		super(
			`Could not materialize "${claim.family}" ${claim.weight} (${claim.style}) into the font cache: ${detail}`
		);
		this.name = 'UserPackFontMaterializationError';
		this.claim = claim;
	}
}

const CachedFontFileSchema = z.strictObject({
	hash: z.string().regex(/^[a-f0-9]{64}$/),
	sourceUrl: z.string().min(1),
	weight: z.string().regex(/^[0-9]+(?: [0-9]+)?$/),
	style: z.enum(['normal', 'italic']),
	unicodeRange: z.string().min(1)
});
const FontCacheIndexSchema = z.strictObject({
	faces: z.record(
		z.string(),
		z.strictObject({ files: z.array(CachedFontFileSchema).min(1), fetchedAt: z.string().min(1) })
	)
});
type FontCacheIndex = z.infer<typeof FontCacheIndexSchema>;
type CachedFontFile = z.infer<typeof CachedFontFileSchema>;

function fontClaimKey(claim: UserPackFontClaim): string {
	return `${claim.family}|${claim.weight}|${claim.style}`;
}

/** Expand `PackFont` declarations into one claim per family/weight/style. */
export function userPackFontClaims(fonts: readonly PackFont[]): UserPackFontClaim[] {
	const claims: UserPackFontClaim[] = [];
	for (const font of fonts) {
		const style = parseGoogleFontStyle(font.style);
		if (style === null) {
			throw new UserPackFontMaterializationError(
				{ family: font.family, weight: (font.weights ?? [400])[0], style: 'normal' },
				`style "${font.style}" is not a Google Fonts style`
			);
		}
		for (const weight of font.weights ?? [400]) claims.push({ family: font.family, weight, style });
	}
	return claims;
}

/**
 * The CSS API request for every claim of one family. Google requires the
 * `ital,wght` tuples sorted, italic last.
 */
export function googleFontsStylesheetUrl(
	family: string,
	claims: readonly Pick<UserPackFontClaim, 'weight' | 'style'>[]
): string {
	const tuples = [...claims]
		.map((claim) => [claim.style === 'italic' ? 1 : 0, claim.weight] as const)
		.sort((left, right) => left[0] - right[0] || left[1] - right[1])
		.map(([italic, weight]) => `${italic},${weight}`);
	const uniqueTuples = [...new Set(tuples)].join(';');
	return `${GOOGLE_FONTS_STYLESHEET_URL}?family=${family.replace(/ /g, '+')}:ital,wght@${uniqueTuples}&display=block`;
}

export function parseGoogleFontsStylesheet(css: string): GoogleFontFaceRule[] {
	const rules: GoogleFontFaceRule[] = [];
	for (const block of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
		const body = block[1];
		const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
		const style = /font-style:\s*(normal|italic)\b/.exec(body)?.[1];
		const weight = /font-weight:\s*([0-9]+(?: [0-9]+)?)\s*;/.exec(body)?.[1];
		const url = /src:\s*url\(([^)]+)\)\s*format\('woff2'\)/.exec(body)?.[1];
		const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
		if (!family || !style || !weight || !url || !unicodeRange) continue;
		rules.push({
			family,
			style: style === 'italic' ? 'italic' : 'normal',
			weight,
			unicodeRange: unicodeRange.trim(),
			url
		});
	}
	return rules;
}

function weightDescriptorCovers(descriptor: string, weight: number): boolean {
	const [low, high = low] = descriptor.split(' ').map(Number);
	return weight >= low && weight <= high;
}

export function userPackFontCacheFilePath(location: UserPackStoreLocation, key: string): string {
	if (!USER_PACK_FONT_KEY_PATTERN.test(key)) {
		throw new TypeError(`User pack font key "${key}" is not a sha-256 woff2 key`);
	}
	return join(location.fontCacheDirectory, key);
}

async function readFontCacheIndex(location: UserPackStoreLocation): Promise<FontCacheIndex> {
	let raw: string;
	try {
		raw = await readFile(join(location.fontCacheDirectory, FONT_CACHE_INDEX_FILE), 'utf-8');
	} catch (cause) {
		if (cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT') {
			return { faces: {} };
		}
		throw cause;
	}
	// A corrupt index would mean re-fetching pinned claims blind; refuse instead.
	const parsed = FontCacheIndexSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) {
		throw new Error(
			`The font cache index at ${location.fontCacheDirectory} is corrupt: ${parsed.error.message}`
		);
	}
	return parsed.data;
}

function isAlreadyPinned(errorValue: unknown): boolean {
	return (
		typeof errorValue === 'object' &&
		errorValue !== null &&
		'code' in errorValue &&
		errorValue.code === 'EEXIST'
	);
}

/** Write bytes under their hash; an existing file is the same bytes and stays untouched. */
async function pinFontBytes(location: UserPackStoreLocation, bytes: Uint8Array): Promise<string> {
	const hash = createHash('sha256').update(bytes).digest('hex');
	try {
		await writeFile(join(location.fontCacheDirectory, `${hash}.woff2`), bytes, { flag: 'wx' });
	} catch (errorValue) {
		if (!isAlreadyPinned(errorValue)) throw errorValue;
	}
	return hash;
}

function faceFromCachedFile(family: string, file: CachedFontFile): UserPackFontFace {
	return {
		family,
		style: file.style,
		weight: file.weight,
		unicodeRange: file.unicodeRange,
		url: `${USER_PACK_FONT_ROUTE_BASE}/${file.hash}.woff2`
	};
}

async function materialize(
	fonts: readonly PackFont[],
	location: UserPackStoreLocation,
	services: UserPackFontCacheServices
): Promise<readonly UserPackFontFace[]> {
	await mkdir(location.fontCacheDirectory, { recursive: true });
	const index = await readFontCacheIndex(location);
	const claims = userPackFontClaims(fonts);

	const missingByFamily = new Map<string, UserPackFontClaim[]>();
	for (const claim of claims) {
		if (index.faces[fontClaimKey(claim)] !== undefined) continue;
		missingByFamily.set(claim.family, [...(missingByFamily.get(claim.family) ?? []), claim]);
	}

	const pinnedByUrl = new Map<string, string>();
	const fetchedAt = services.now();
	const additions: FontCacheIndex['faces'] = {};
	for (const [family, familyClaims] of missingByFamily) {
		const stylesheetUrl = googleFontsStylesheetUrl(family, familyClaims);
		let rules: GoogleFontFaceRule[];
		try {
			rules = parseGoogleFontsStylesheet(await services.fetchStylesheet(stylesheetUrl));
		} catch (cause) {
			throw new UserPackFontMaterializationError(
				familyClaims[0],
				cause instanceof Error ? cause.message : String(cause)
			);
		}
		for (const claim of familyClaims) {
			const matching = rules.filter(
				(rule) =>
					rule.family === family &&
					rule.style === claim.style &&
					weightDescriptorCovers(rule.weight, claim.weight)
			);
			if (matching.length === 0) {
				throw new UserPackFontMaterializationError(
					claim,
					`Google's stylesheet at ${stylesheetUrl} served no woff2 face for it`
				);
			}
			const files: CachedFontFile[] = [];
			for (const rule of matching) {
				let hash = pinnedByUrl.get(rule.url);
				if (hash === undefined) {
					try {
						hash = await pinFontBytes(location, await services.fetchFontBytes(rule.url));
					} catch (cause) {
						throw new UserPackFontMaterializationError(
							claim,
							cause instanceof Error ? cause.message : String(cause)
						);
					}
					pinnedByUrl.set(rule.url, hash);
				}
				files.push({
					hash,
					sourceUrl: rule.url,
					weight: rule.weight,
					style: rule.style,
					unicodeRange: rule.unicodeRange
				});
			}
			additions[fontClaimKey(claim)] = { files, fetchedAt };
		}
	}

	if (Object.keys(additions).length > 0) {
		const next: FontCacheIndex = { faces: { ...index.faces, ...additions } };
		await writeUserCompositionFileAtomically(
			join(location.fontCacheDirectory, FONT_CACHE_INDEX_FILE),
			JSON.stringify(next, null, '\t')
		);
		index.faces = next.faces;
	}

	const faces = new Map<string, UserPackFontFace>();
	for (const claim of claims) {
		for (const file of index.faces[fontClaimKey(claim)].files) {
			const face = faceFromCachedFile(claim.family, file);
			faces.set(
				[face.family, face.style, face.weight, face.unicodeRange, face.url].join('|'),
				face
			);
		}
	}
	return [...faces.values()].sort(
		(left, right) =>
			left.family.localeCompare(right.family) ||
			left.style.localeCompare(right.style) ||
			left.weight.localeCompare(right.weight) ||
			left.unicodeRange.localeCompare(right.unicodeRange)
	);
}

// One materialization at a time per cache: the index is read-modify-write, and
// two concurrent saves must not drop each other's claims.
const materializationQueues = new Map<string, Promise<unknown>>();

/**
 * Ensure every claimed cut is pinned in the cache and return the faces the
 * client registers for them. Pinned claims cost no network; a claim that cannot
 * be fetched or matched rejects with `UserPackFontMaterializationError` and
 * leaves the index exactly as it was.
 */
export function materializeUserPackFonts(
	fonts: readonly PackFont[],
	location: UserPackStoreLocation,
	services: UserPackFontCacheServices = DEFAULT_SERVICES
): Promise<readonly UserPackFontFace[]> {
	const previous = materializationQueues.get(location.fontCacheDirectory) ?? Promise.resolve();
	const run = previous.catch(() => undefined).then(() => materialize(fonts, location, services));
	materializationQueues.set(location.fontCacheDirectory, run);
	return run;
}
