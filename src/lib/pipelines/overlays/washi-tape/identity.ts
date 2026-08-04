/**
 * Identity Spec for the `washi-tape` Overlay — per ADR-0015. A material-kind
 * Overlay: a strip of decorative adhesive tape with a translucent body and a
 * real-tape cast shadow under directional light, placed at a free rotation.
 * All dimensions are intrinsic to the material claim per ADR-0009.
 *
 * Render-is-truth: the dimensions below describe what the Pipeline actually
 * ships. A `fibrous-edge` dimension (high-frequency value noise modulating the
 * long-edge alpha, implying torn tape) is intended but NOT yet shipped — it
 * needs a tear-edge shader pass and was removed from this spec rather than left
 * as a declared-but-unimplemented dimension (ADR-0015 rejects those). Tracked
 * for re-addition when the shader pass lands.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const washiTapeIdentity: IdentitySpec = {
	kind: 'material',
	claim: 'a strip of translucent washi tape adhered to the substrate at a free rotation',
	dimensions: [
		{
			name: 'translucent-body',
			definition:
				'Tape body shows the substrate beneath it through its fill, with a coloured tint that does not fully occlude.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape — tape body alpha ~0.55–0.75 with a tint multiplied over the substrate sample.',
			probe: {
				kind: 'named-observation',
				region: 'tape body over a region of substrate with visible content',
				expectation:
					'substrate detail (texture, text, photo) is visible through the tape body; tape is not opaque.'
			}
		},
		{
			name: 'directional-shadow',
			definition:
				'Tape casts a directional shadow on the substrate beneath it, implying real tape thickness.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape/CanvasSource.svelte — CSS `filter: drop-shadow` along the implied upper-left light vector; the shadow follows the rotated strip’s alpha shape and darkens the substrate under multiply blend.',
			probe: {
				kind: 'named-observation',
				region: 'shadow side of the tape',
				expectation: 'visible directional shadow extending beyond the tape boundary; lit side has minimal shadow.'
			}
		},
		{
			name: 'free-rotation',
			definition:
				'Tape sits at a rotation off frame axes, implying a hand-placed strip rather than a snapped rectangle.',
			implementation:
				'src/lib/pipelines/overlays/washi-tape/CanvasSource.svelte — `content.rotation` (author/preset-supplied) applied via CSS `transform: rotate`; the GUI and agents set it directly per the parity model.',
			probe: {
				kind: 'named-observation',
				region: 'tape axis relative to canvas axes',
				expectation: 'tape axis is rotated off canvas horizontal; angle is the deterministic preset value.'
			}
		},
		{
			name: 'tape-tint',
			definition:
				'The strip’s tint when the composition does not author one. Unlike the material dimensions above this is brand appearance, not tape physics — an unauthored tape wears the active Pack (ADR-0024: `washi-tape.color` → core accent), never a baked channel literal.',
			viaPack: 'washi-tape.color',
			probe: {
				kind: 'named-observation',
				region: 'tape body of an unauthored-colour tape under two catalog Packs',
				expectation:
					'the tint follows the active Pack (syntax: the physical-highlighter yellow #fabf47; a Pack silent on the slot: its core accent); an authored `content.color` wins over both.'
			}
		}
	]
};
