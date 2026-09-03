import geist700Url from '$lib/assets/typefaces/geist-700.stageglyphs?url';
import jetbrainsMono800Url from '$lib/assets/typefaces/jetbrains-mono-800.stageglyphs?url';
import playfairDisplay700Url from '$lib/assets/typefaces/playfair-display-700.stageglyphs?url';
import rubik700Url from '$lib/assets/typefaces/rubik-700.stageglyphs?url';
import spaceGrotesk700Url from '$lib/assets/typefaces/space-grotesk-700.stageglyphs?url';

import { decodeStageTypeface, type StageTypefaceData } from './stage-glyph-format';
import { getStageTypeface } from './stage-typefaces';

// The bundled bytes of every registered stage typeface (ADR-0062), the same
// discipline as `stage-model-assets.ts`: Vite-imported so the outlines ship in
// the build and decode identically in preview and export, with no network or
// cache variance. The registry in `stage-typefaces.ts` names the face; this
// file is the only place that knows where its bytes live.

const STAGE_TYPEFACE_URLS: Record<string, string> = {
	'space-grotesk-700': spaceGrotesk700Url,
	'playfair-display-700': playfairDisplay700Url,
	'jetbrains-mono-800': jetbrainsMono800Url,
	'geist-700': geist700Url,
	'rubik-700': rubik700Url
};

// Decode is async and memoised per slug so each face is fetched once.
const typefaceCache = new Map<string, Promise<StageTypefaceData>>();

/** Fetch and decode a registered typeface's bundled outlines; null for an unknown slug. */
export function loadStageTypeface(slug: string): Promise<StageTypefaceData> | null {
	if (typeof window === 'undefined') return null;
	const url = STAGE_TYPEFACE_URLS[slug];
	const typeface = getStageTypeface(slug);
	if (!url || !typeface) return null;
	let pending = typefaceCache.get(slug);
	if (!pending) {
		pending = fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`Stage typeface "${slug}" failed to load (${response.status}).`);
				}
				return response.arrayBuffer();
			})
			.then((buffer) => {
				const data = decodeStageTypeface(buffer);
				if (data.glyphs.size !== typeface.glyphs || data.kerning.size !== typeface.kerningPairs) {
					throw new Error(
						`Stage typeface "${slug}" bytes do not match the registry: ${data.glyphs.size} glyphs, ${data.kerning.size} kerning pairs.`
					);
				}
				if (data.unitsPerEm !== typeface.unitsPerEm || data.capHeight !== typeface.capHeight) {
					throw new Error(`Stage typeface "${slug}" metrics do not match the registry.`);
				}
				return data;
			})
			.catch((error: unknown) => {
				typefaceCache.delete(slug);
				throw error;
			});
		typefaceCache.set(slug, pending);
	}
	return pending;
}
