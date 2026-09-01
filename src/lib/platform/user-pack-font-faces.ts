/**
 * The faces a User Pack's fonts resolve to once the origin has materialized
 * them (ADR-0055): one entry per cached woff2 file, carrying the exact
 * `@font-face` descriptors Google served it under, with `url` pointing at the
 * same-origin cache. The origin writes them into the pack document at save
 * time; the client registers them through the `FontFace` API so `fontsReady()`
 * gates capture on them exactly as it gates on a built-in pack's `@fontsource`
 * faces. Nothing here ever reaches a third party.
 */
import { z } from 'zod';

export const USER_PACK_FONT_ROUTE_BASE = '/api/user-pack-fonts';

export const UserPackFontFaceSchema = z.strictObject({
	family: z.string().min(1),
	style: z.enum(['normal', 'italic']),
	/** The CSS `font-weight` descriptor as served: `"400"`, or `"300 700"` for a variable file. */
	weight: z.string().regex(/^[0-9]+(?: [0-9]+)?$/),
	unicodeRange: z.string().min(1),
	/** Same-origin cache URL: `/api/user-pack-fonts/<sha256>.woff2`. */
	url: z.string().regex(/^\/api\/user-pack-fonts\/[a-f0-9]{64}\.woff2$/)
});
export type UserPackFontFace = z.infer<typeof UserPackFontFaceSchema>;

const registeredUserPackFaces = new Map<string, FontFace>();

function userPackFaceRegistrationKey(face: UserPackFontFace): string {
	return [face.family, face.style, face.weight, face.unicodeRange, face.url].join(' ');
}

/**
 * Register each distinct face once. A repeat registration is a no-op, so
 * re-activating a pack — or two packs sharing a cut — never duplicates faces;
 * hash-pinning guarantees a claim's URL never changes underneath a registration.
 */
export function registerUserPackFontFaces(
	faces: readonly UserPackFontFace[],
	fontSet: FontFaceSet = document.fonts
): void {
	for (const face of faces) {
		const key = userPackFaceRegistrationKey(face);
		if (registeredUserPackFaces.has(key)) continue;
		const fontFace = new FontFace(face.family, `url(${face.url}) format('woff2')`, {
			style: face.style,
			weight: face.weight,
			unicodeRange: face.unicodeRange,
			display: 'block'
		});
		fontSet.add(fontFace);
		registeredUserPackFaces.set(key, fontFace);
	}
}
