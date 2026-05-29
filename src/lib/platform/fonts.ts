/**
 * Font readiness gate (general engine capability).
 *
 * Each Pack declares its typefaces (`PackManifest.fonts`) and its own folder
 * registers the `@font-face` rules. This module triggers those lazy faces to
 * load and resolves once they are ready, so the HTML-in-Canvas capture — in
 * both preview and export — never rasterizes OS-fallback glyphs. The engine
 * knows nothing about which typefaces a channel uses; that is Pack data.
 */
import { PACK_REGISTRY } from './packs/registry';

let readyPromise: Promise<void> | null = null;

function loadDeclaredFonts(): Promise<void> {
	if (typeof document === 'undefined' || !('fonts' in document)) {
		return Promise.resolve();
	}

	const loads: Promise<unknown>[] = [];

	// Until per-Preset active-Pack selection lands, await every registered
	// Pack's faces — whichever Pack a Preset names, its fonts are ready.
	for (const pack of Object.values(PACK_REGISTRY)) {
		for (const font of pack.fonts ?? []) {
			const style = font.style ?? 'normal';
			for (const weight of font.weights ?? [400]) {
				// Trigger the lazy @font-face load; swallow per-face failures so one
				// missing face never blocks the whole render path.
				loads.push(
					document.fonts.load(`${style} ${weight} 1em "${font.family}"`).catch(() => undefined)
				);
			}
		}
	}

	return Promise.all(loads)
		.then(() => document.fonts.ready)
		.then(() => undefined);
}

/**
 * Resolves once every registered Pack's declared typefaces are loaded.
 * Memoized — safe to await from both the preview paint path and export.
 */
export function fontsReady(): Promise<void> {
	if (readyPromise === null) {
		readyPromise = loadDeclaredFonts();
	}

	return readyPromise;
}
