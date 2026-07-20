import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const websiteScreenshotIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'an immutable captured website on a backlit browser display',
	packImmunity: {
		rationale:
			'The stored screenshot is quoted substrate whose original pixels must remain unchanged under every Pack; only the separate source-url Overlay is Pack-claimable chrome.'
	},
	dimensions: [
		{
			name: 'stored-image-fidelity',
			definition:
				'Preview and export sample the persisted capture bytes and never navigate to the live website.',
			implementation:
				'src/lib/pipelines/surfaces/website-screenshot/CanvasSource.svelte renders only surface.content.imageUrl from /api/user-assets; live navigation exists only in website-capture.server.ts.',
			probe: {
				kind: 'named-observation',
				region: 'the complete captured viewport',
				expectation:
					'pixels match the stored 1440x900 PNG and remain unchanged across Pack switches.'
			}
		},
		{
			name: 'complete-viewport-preservation',
			definition:
				'The entire 16:10 capture remains visible without crop, stretch, or alternate orientation image.',
			implementation:
				'src/lib/utils/website-showcase.ts computes a 1.6:1 screenshot box for both transports; CanvasSource uses object-fit: contain.',
			probe: {
				kind: 'named-observation',
				region: 'all four screenshot edges',
				expectation:
					'all four captured viewport edges are visible at 16:10 in horizontal and vertical renders.'
			}
		},
		{
			name: 'controls-only-browser-frame',
			definition:
				'A slim neutral title bar with three controls frames the screenshot without a duplicate address bar.',
			implementation:
				'src/lib/pipelines/surfaces/website-screenshot/CanvasSource.svelte renders one neutral chrome header and three control dots; no URL text exists on the Surface.',
			probe: {
				kind: 'named-observation',
				region: 'browser top edge',
				expectation:
					'three controls appear in a slim neutral bar with no address field or duplicate URL.'
			}
		},
		{
			name: 'emissive-display-treatment',
			definition:
				'The captured display has restrained subpixel, backlight, bloom, halo, and edge-defocus optics.',
			implementation:
				'src/lib/pipelines/surfaces/website-screenshot/index.ts reuses the web-document-screen ShaderPass on the captured browser texture.',
			probe: {
				kind: 'named-observation',
				region: 'bright website UI and browser silhouette edge',
				expectation:
					'subtle screen emission is visible while the stored website pixels remain legible and ungraded.'
			}
		},
		{
			name: 'transparent-frame-boundary',
			definition: 'Pixels outside the browser display remain transparent.',
			implementation:
				'The CanvasSource paints only the browser article; the shared compositor clears to transparent premultiplied alpha.',
			probe: {
				kind: 'named-observation',
				region: 'frame corners outside the browser',
				expectation: 'frame corners retain zero alpha except for the restrained screen-edge halo.'
			}
		},
		{
			name: 'orientation-responsive-action-safe-fit',
			definition:
				'One layout calculation centers the browser-plus-plate stack inside horizontal and vertical platform safe areas.',
			implementation:
				'src/lib/utils/website-showcase.ts derives browser and plate geometry from the target frame and getLayoutSafeArea for both orientations.',
			probe: {
				kind: 'named-observation',
				region: 'full 3840x2160 and 2160x3840 frames',
				expectation:
					'the full browser and URL stack is centered, uncropped, and clear of every platform-safe exclusion.'
			}
		}
	]
};
