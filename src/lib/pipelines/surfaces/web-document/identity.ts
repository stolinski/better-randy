/**
 * Identity Spec for the `web-document` Surface — per ADR-0015.
 *
 * The first **emissive** Surface: it claims to be a web page on a backlit
 * display, not a photographed reflective material like `paper` / `newspaper`.
 * One Surface, per-site layout = content (a Svelte mock captured via
 * HTML-in-Canvas, selected by `content.site`). See
 * docs/briefs/web-document-demo.md.
 *
 * Honest-scaffold note: this skeleton declares only the dimensions whose
 * implementation EXISTS now — both are carried by the CanvasSource's CSS
 * (`window-chrome-frame`, `screen-backlight-floor`). The deeper optical
 * dimensions of an emissive panel (subpixel emission, backlight bloom
 * prefilter, viewport edge defocus) require a real TypeGPU `shaderPass` and
 * are added to this Spec when that pass lands — tracked as dex `f0j654gu`
 * (Emissive-screen Identity Spec dimensions). Nothing here is a stub: every
 * declared dimension is implemented and probed against the registration
 * validator (`identity-registry.ts`).
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
			name: 'screen-backlight-floor',
			definition:
				'The card emits an even backlight: its darkest pixels sit above true black (an elevated luminance floor characteristic of an LCD/OLED panel, never paper-white reflectance) and bright UI carries a faint surrounding glow, so the surface reads as light coming OUT of a screen rather than reflecting off a sheet.',
			implementation:
				'src/lib/pipelines/surfaces/web-document/CanvasSource.svelte — `.web-document` paints a near-but-not-pure substrate and a soft outer glow (box-shadow bloom) around the lit panel; an even backlight wash keeps the darkest text above true black. (T3 `f0j654gu` deepens this into a per-pixel emissive shaderPass.)',
			probe: {
				kind: 'named-observation',
				region: 'a body-text-free patch of the card vs the transparent frame around it',
				expectation:
					'the panel reads as self-lit — a faint glow halo bleeds past the panel edge into the transparent frame, and the panel’s dark pixels measure above true black (luma floor > 0), unlike a reflective paper substrate.'
			}
		}
	]
};
