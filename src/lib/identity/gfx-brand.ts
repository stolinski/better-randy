// The strings the gfx.computer identity sets alongside the drawn mark and
// logotype. They are shared by the app chrome, the page metadata, and the
// identity capture sheets, so a change here moves every surface at once.
//
// Voices are not interchangeable (docs/identity/README.md): the spec plate is a
// uppercase hardware readout, the address keeps its own lowercase because it is
// a machine address. Never merge the two into one line.

/** Product name, as it reads in a title bar or a share card. */
export const GFX_PRODUCT_NAME = 'GFX';

/** The machine address, set lowercase in Paper Mono at 0.18em tracking. */
export const GFX_ADDRESS = 'gfx.computer';

/** Public origin the demo is served from (ADR-0052), used to absolutize share URLs. */
export const GFX_PUBLIC_ORIGIN = 'https://gfx.computer';

/** The hardware spec plate, set uppercase in Paper Mono at 0.22em tracking. */
export const GFX_SPEC_PLATE = '4K / WebGPU / alpha';

/** One sentence of what the tool is, for `<meta name="description">` and share cards. */
export const GFX_DESCRIPTION =
	'Broadcast-quality motion graphics in the browser: transparent overlays and full-frame segments, composed from presets and rendered at 4K on WebGPU.';

/**
 * Served path of the 1200x630 share card. Written to `static/` by
 * `pnpm verify:identity`, which renders it from the same drawn geometry.
 */
export const GFX_SOCIAL_CARD_PATH = '/gfx-social-card.png';
