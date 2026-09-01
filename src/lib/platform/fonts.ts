/**
 * Font readiness gate (general engine capability).
 *
 * Each Pack declares its typefaces (`PackManifest.fonts`). Built-in packs
 * register their `@font-face` rules from their own folder (`@fontsource`
 * imports); a User Pack's faces arrive at runtime through
 * `registerUserPackFontFaces` against the same-origin font cache (ADR-0055).
 * This module triggers the declared faces to load and resolves once they are
 * ready, so the HTML-in-Canvas capture — in both preview and export — never
 * rasterizes OS-fallback glyphs. The engine knows nothing about which
 * typefaces a channel uses; that is Pack data.
 */
import { PACK_REGISTRY } from './packs/registry';
import type { PackFont } from './packs/types';

let builtinFacesReady: Promise<void> | null = null;
let activePackFonts: readonly PackFont[] = [];

function loadDeclaredFaces(fonts: readonly PackFont[]): Promise<unknown> {
	const loads: Promise<unknown>[] = [];
	for (const font of fonts) {
		const style = font.style ?? 'normal';
		for (const weight of font.weights ?? [400]) {
			// Trigger the lazy @font-face load; swallow per-face failures so one
			// missing face never blocks the whole render path.
			loads.push(
				document.fonts.load(`${style} ${weight} 1em "${font.family}"`).catch(() => undefined)
			);
		}
	}
	return Promise.all(loads);
}

/** Every built-in Pack's faces, swept once: whichever built-in a Preset names, its fonts are ready. */
function loadBuiltinPackFaces(): Promise<void> {
	return loadDeclaredFaces(Object.values(PACK_REGISTRY).flatMap((pack) => pack.fonts ?? [])).then(
		() => undefined
	);
}

/**
 * Declare the active Pack's typefaces so `fontsReady()` gates on them too.
 * Built-in packs are already covered by the registry sweep; this is how a User
 * Pack — whose faces exist only after `registerUserPackFontFaces` — joins the
 * gate. Pass an empty list when a built-in pack is active again.
 */
export function setActivePackFontDeclarations(fonts: readonly PackFont[]): void {
	activePackFonts = fonts;
}

/**
 * Resolves once every built-in Pack's declared typefaces and the active Pack's
 * declared typefaces are loaded. The built-in sweep is memoized; the active
 * pack's faces are re-checked on every call, because the active pack can
 * change between one capture and the next. Safe to await from both the preview
 * paint path and export.
 */
export function fontsReady(): Promise<void> {
	if (typeof document === 'undefined' || !('fonts' in document)) {
		return Promise.resolve();
	}
	builtinFacesReady ??= loadBuiltinPackFaces();
	return Promise.all([builtinFacesReady, loadDeclaredFaces(activePackFonts)])
		.then(() => document.fonts.ready)
		.then(() => undefined);
}
