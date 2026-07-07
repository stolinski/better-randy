/**
 * Shared unit-span style writers for text-animation strategies.
 *
 * The DOM capture (`copyElementImageToTexture`) does not honour the
 * compositing `opacity` property on the transformed unit spans: measured
 * 2026-07 (docs/critic-captures + the chapter-card-descent Critic run), a
 * partial property-opacity renders quantized — near-full above ~0.5 and the
 * span DROPS ENTIRELY below ~0.5 — so an opacity tween pops instead of fading.
 * `filter: opacity()` is no better (inert on the spans; promotes-and-drops
 * unpromoted elements). The channel that rasterizes an honest partial fade is
 * PAINT-level text colour alpha, so `applyUnitFade` writes the fade as
 * `rgba(base, α)` and never leaves a partial value in `style.opacity`.
 */

/** Compose a unit span's `filter` string (blur only — see applyUnitFade). */
export function materializeUnitFilter(blurPx: number): string {
	return blurPx > 0 ? `blur(${blurPx}px)` : 'none';
}

/**
 * Apply a unit fade the capture can rasterize: text colour alpha scaled by
 * `opacity`, with `style.opacity` used only at the true-zero cutoff (where the
 * capture's drop behaviour is exactly what we want). The unit's base colour is
 * read once and cached on the element (SplitText re-splits produce fresh
 * spans, so the cache lifetime matches the colour's).
 */
export function applyUnitFade(element: HTMLElement, opacity: number): void {
	const clamped = Math.max(0, Math.min(1, opacity));

	if (clamped <= 0.001) {
		element.style.opacity = '0';
		return;
	}
	// Never leave a PARTIAL value in the compositing opacity — the capture
	// quantizes it (and drops the span entirely below ~0.5).
	element.style.opacity = '';

	if (clamped >= 0.999) {
		element.style.color = '';
		return;
	}

	let base = element.dataset.supersBaseColor;
	if (!base) {
		element.style.color = '';
		base = getComputedStyle(element).color;
		element.dataset.supersBaseColor = base;
	}
	const channels = base.match(/-?\d+(?:\.\d+)?/g);
	if (!channels || channels.length < 3) {
		return;
	}
	const baseAlpha = channels.length >= 4 ? Number(channels[3]) : 1;
	element.style.color = `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${baseAlpha * clamped})`;
}
