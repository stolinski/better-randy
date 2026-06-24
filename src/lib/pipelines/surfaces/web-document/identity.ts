/**
 * Identity Spec for the `web-document` Surface — per ADR-0015.
 *
 * The first **emissive** Surface: it claims to be a web page on a backlit
 * display, not a photographed reflective material like `paper` / `newspaper`.
 * One Surface, per-site layout = content (a Svelte mock captured via
 * HTML-in-Canvas, selected by `surface.site`). See
 * docs/briefs/web-document-demo.md.
 *
 * The window-chrome frame is carried by the CanvasSource CSS; the emissive
 * optical dimensions (subpixel emission, backlight bloom + edge halo, backlight
 * floor, viewport-edge defocus) are a real TypeGPU `shaderPass`
 * (`shader-passes/web-document-screen.ts`, dex `f0j654gu`). Every declared
 * dimension is implemented and probed against the registration validator
 * (`identity-registry.ts`) — nothing here is a stub.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const webDocumentIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a web page on a backlit display, in a browser window',
	dimensions: [
		{
			name: 'window-chrome-frame',
			definition:
				'The page sits inside a browser window — a chrome bar with window controls and an address bar that shows the page URL — so it reads as a live site, not a bare text card. The address bar content is the page being shown (`content.sourceUrl`), not decoration.',
			implementation:
				'src/lib/pipelines/surfaces/web-document/CanvasSource.svelte — `.web-document__chrome` renders the window-control dots + an address bar bound to `content.sourceUrl`; the site mock renders inside the chrome frame. Captured into the surface texture via HTML-in-Canvas.',
			probe: {
				kind: 'named-observation',
				region: 'top edge of the card',
				expectation:
					'a browser chrome bar is present with window-control affordances and an address bar; the address bar text matches the preset `surface.content.sourceUrl` host/path.'
			}
		},
		{
			name: 'subpixel-emission',
			definition:
				'The panel is an array of light-emitting subpixels: a faint per-column R/G/B stripe modulates the lit surface, the structural tell of an LCD/OLED display rather than a flat printed fill. Amplitude is low enough that the UI is not tinted and the highlight ink is undisturbed.',
			implementation:
				'src/lib/pipelines/shader-passes/web-document-screen.ts — the `subMul` per-column stripe (column n%3 boosts one channel, dips the others by `subpixelAmount`) applied to every opaque panel pixel.',
			probe: {
				kind: 'named-observation',
				region: 'a flat mid-tone region of the panel (e.g. the X "Dim" background between text lines), inspected at native 4K',
				expectation:
					'a regular per-column R/G/B channel modulation is present across the panel — a fine vertical subpixel stripe, not random colour noise and not on the transparent frame.'
			}
		},
		{
			name: 'backlight-bloom',
			definition:
				'Bright UI radiates light: white text and the verified badge carry a soft surrounding glow gathered from the lit pixels, so the surface reads as light coming OUT of a screen. The hand-pulled amber highlight sits below the bloom threshold by design and stays crisp marked ink, not glowing UI.',
			implementation:
				'src/lib/pipelines/shader-passes/web-document-screen.ts — the bright-pass gather (`brightRgb`, pixels above `bloomThreshold`) over two sample rings, added back to panel pixels scaled by `bloomStrength`.',
			probe: {
				kind: 'named-observation',
				region: 'the immediate surround of bright white body text vs the same dark background far from any text',
				expectation:
					'the dark background within ~14 px of bright text is measurably lifted (a soft glow halo around lit UI); the amber highlight band shows no such glow, staying a crisp band.'
			}
		},
		{
			name: 'screen-backlight-floor',
			definition:
				'The card emits an even backlight: its darkest pixels sit above true black (an elevated luminance floor characteristic of an LCD/OLED panel, never paper-white reflectance) and the panel’s edge emission bleeds a faint glow halo past the panel boundary into the transparent frame — the backlight escaping at the bezel. Light comes OUT, not in.',
			implementation:
				'src/lib/pipelines/shader-passes/web-document-screen.ts — `backlightFloor` clamps the panel’s darkest pixels above black; the panel-emission gather (`glowAvg`/`glowCov`) emits a `haloStrength`-scaled glow with partial alpha on the transparent pixels just outside the panel edge. (CanvasSource CSS seeds the substrate floor + outer glow; this pass enforces the per-pixel floor and halo.)',
			probe: {
				kind: 'named-observation',
				region: 'a body-text-free patch of the card vs the transparent frame just past its edge',
				expectation:
					'the panel reads as self-lit — a faint glow halo bleeds past the panel edge into the transparent frame (alpha > 0 just outside the card), and the panel’s dark pixels measure above true black (luma floor > 0), unlike a reflective paper substrate.'
			}
		},
		{
			name: 'viewport-edge-defocus',
			definition:
				'The panel’s outer edge falls slightly out of focus — the screen sits behind glass / just off the camera’s focal plane — softening the hard rasterized card boundary so it does not read as a flat vector cut-out.',
			implementation:
				'src/lib/pipelines/shader-passes/web-document-screen.ts — a 4-tap box blur (`blurredRgb`, radius `edgeDefocusPx`) mixed into panel pixels by edge proximity (`edgeProx`, derived from the neighbourhood panel coverage `glowCov`).',
			probe: {
				kind: 'named-observation',
				region: 'the outer edge of the card vs the centre of the panel',
				expectation:
					'the card boundary is softened relative to a hard rasterized edge — the few pixels at the panel edge are blurred — while the panel interior (text, icons) stays sharp.'
			}
		}
	]
};
