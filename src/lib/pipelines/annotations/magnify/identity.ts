/**
 * Identity Spec for the `magnify` Annotation — per ADR-0015. A graphic
 * focal annotation: lifts a passage into a magnified focal slot while the
 * surrounding body dims. Magnification physics, lens geometry, scanner form,
 * and the focal-dim relationship are intrinsic; visible scanner ink follows
 * the resolved mark color rather than claiming its own hardcoded palette.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const magnifyIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a focal magnification of a passage with the surrounding body dimmed',
	dimensions: [
		{
			name: 'optical-magnification',
			definition:
				'The focal passage is optically enlarged from the native 4K capture with bounded reconstruction, keeping glyph counters and stroke contrast readable through the lens.',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § MAGNIFY — the native-size DOM/highlight/stroke textures are sampled through a stable 1.62–1.92x lens map with low bounded rim distortion and sub-pixel SDF coverage; no claim of independent DOM re-rasterization.',
			probe: {
				kind: 'named-observation',
				region: 'the magnified passage at 400% zoom',
				expectation: 'the marked words remain immediately readable, with open counters and no strong halo, chromatic smear, or edge fold crossing the glyph cores.'
			}
		},
		{
			name: 'focal-dim-relationship',
			definition:
				'Surrounding (non-focal) body is darkened deterministically while the focal passage holds full ink intensity and coverage.',
			implementation:
				'src/lib/pipelines/annotations/magnify/index.ts emits dim 0.42–0.62 by intensity; src/lib/pipelines/surfaces/paper/pipeline.ts applies that dim outside the optical SDF while respecting surface.backgroundVisibility as the floor.',
			probe: {
				kind: 'named-observation',
				region: 'body text outside the focal passage during the focal window',
				expectation: 'non-focal text is visibly dimmer than focal text; ratio is stable across re-renders.'
			}
		},
		{
			name: 'edge-treatment',
			implementation:
				'src/lib/pipelines/annotations/magnify/index.ts selects a circle for short phrases and a line-height-bounded rounded rectangle for longer phrases; the paper focal shader renders a sub-pixel SDF rim, registration ticks, and one deterministic inspection ripple in the resolved mark color.',
			definition: 'How the optical slot meets the surrounding dimmed body through a bounded lens silhouette and scanner registration marks.',
			probe: {
				kind: 'named-observation',
				region: 'boundary between the magnified focal slot and the dimmed surrounding text',
				expectation: 'short marks receive a circle and longer marks a restrained rounded rectangle; the rim is anti-aliased, registration ticks stay localized, and the ripple clears before the read hold.'
			}
		},
		{
			name: 'depth-treatment',
			implementation:
				'src/lib/pipelines/surfaces/paper/pipeline.ts § MAGNIFY — restrained light-facing specular, opposite inner attenuation, boundary line, and two-zone cast shadow establish optical thickness without full-frame glow.',
			definition: 'Localized optical thickness expressed through rim lighting, inner attenuation, and contact/cast shadow.',
			probe: {
				kind: 'named-observation',
				region: 'area immediately around the focal slot',
				expectation: 'the lens separates from the page through one coherent upper-left light direction; no ambient glow or unrelated highlight direction appears.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/pipelines/annotations/magnify — exponential lens-body reveal plus a frame-addressed inspection-ripple phase derived from focal progress.',
			definition: 'Shape of the focal entry motion (scale-in, fade, drop, none).',
			probe: {
				kind: 'named-observation',
				region: 'first ~6% of the focal window',
				expectation: 'the lens resolves over the first ~10% of the bar, one radial inspection ripple lands and clears during the settle, the readable optical state holds, then exits over the final ~10%; no pointer or wall-clock input.'
			}
		}
	]
};
