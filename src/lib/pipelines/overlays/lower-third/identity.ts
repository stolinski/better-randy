/**
 * Identity Spec for the `lower-third` Overlay family — per ADR-0015 +
 * ADR-0020. After the Phase 2.1 migration, this Identity Spec covers both
 * `standard` and `cinematic` variants under one family Pipeline. The two
 * variants share fill / edge / depth / light / frame-relationship and
 * differ only in motion-form (and what the cinematic variant adds via its
 * own shaderPass-derived flare, which is captured under light-treatment via
 * a Pack-defined light rig).
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const lowerThirdIdentity: IdentitySpec = {
	kind: 'graphic',
	claim:
		'a frame-anchored chip carrying kicker / name / role text with a paced enter sequence and a controlled exit',
	dimensions: [
		{
			name: 'fill-treatment',
			implementation:
				'src/lib/pipelines/overlays/lower-third/variants/<id>CanvasSource.svelte — plate fill is painted in the CanvasSource (standard: flat rgba(10,10,10,0.92) background; cinematic: a horizontal rgba scrim gradient). Ink and accent colors are Pack-routed via lower-third.ink → --ink and lower-third.accent → --accent; the dark plate fill itself is structural.',
			definition: 'Chip plate fill behind the text.',
			probe: {
				kind: 'named-observation',
				region: 'chip plate behind the text',
				expectation:
					'plate fill is painted in the CanvasSource (standard: flat rgba(10,10,10,0.92); cinematic: horizontal scrim gradient). Text ink resolves through lower-third.ink; kicker/accent resolves through lower-third.accent.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'lower-third.edge',
			definition: 'Chip boundary treatment (accent rule, scrim, none).',
			probe: {
				kind: 'named-observation',
				region: 'chip boundary',
				expectation: 'edge treatment resolves through the lower-third.edge Role.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'lower-third.depth',
			definition: 'Any implied depth under the chip (shadow, scrim, none).',
			probe: {
				kind: 'named-observation',
				region: 'beneath the chip',
				expectation: 'depth treatment resolves through the lower-third.depth Role.'
			}
		},
		{
			name: 'light-treatment',
			viaPack: 'lower-third.light',
			definition:
				"Any directional light contribution on the chip body. 'none' is the only shipped resolution — the anamorphic-flare shaderPass was removed 2026-07-13 (Scott: it reads cheap, not cinematic; it was already dead code, gated on a light claim no Pack makes). The Role stays declared so a future light treatment can resolve here, but it must clear that bar.",
			probe: {
				kind: 'named-observation',
				region: 'chip body under any implied light source',
				expectation:
					'light treatment matches the active Pack manifest lower-third.light resolution for the bound variant.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'The enter sequence carries a paced reveal of kicker → name → role with a head-loaded ease curve, and the exit is shorter than the enter per G6/G7.',
			implementation:
				'src/lib/pipelines/overlays/lower-third (post-Phase-2.1 family) — per-variant motionShape function in variants/<id>.ts; family-level enter/exit timing in defaults().',
			probe: {
				kind: 'named-observation',
				region: 'first ~20% of the timeline and the exit window',
				expectation:
					'kicker / name / role enter in deterministic order; exit duration is ≤ 80% of the enter duration; ease is head-loaded.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Chip anchors to a frame corner (bottom-left by default) with an offset that does not crowd the frame edge.',
			implementation:
				"src/lib/pipelines/overlays/lower-third — OverlayPosition resolved via the engine's anchor + offset model.",
			probe: {
				kind: 'named-observation',
				region: 'chip position within the frame',
				expectation:
					'chip sits in a frame corner with a measurable offset from both adjacent edges; never touches the frame boundary.'
			}
		}
	]
};
