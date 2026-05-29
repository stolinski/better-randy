/**
 * Identity Spec for the `highlight` Annotation — per ADR-0015. A tool-kind
 * annotation: the claim is a hand-drawn highlighter pass over body text.
 * Tool physics (stroke-pressure variation, registration jitter from the
 * underlying ink, end-cap behaviour, sub-baseline body) are intrinsic; ink
 * colour concedes to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const highlightIdentity: IdentitySpec = {
	kind: 'tool',
	claim: 'a hand-pulled highlighter pass laid over a passage of body text',
	dimensions: [
		{
			name: 'stroke-pressure-variation',
			definition:
				'Highlight intensity varies along the stroke length, implying real ink-tip pressure rather than a flat coloured rectangle.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § highlight draw — per-segment alpha modulated by a deterministic 1D noise seeded from the mark id and offset.',
			probe: {
				kind: 'named-observation',
				region: 'a single highlight band at 400% zoom',
				expectation:
					'alpha varies measurably along the band length; no single uniform coloured rectangle.'
			}
		},
		{
			name: 'registration-jitter',
			definition:
				'Highlight band offsets sub-pixel from the precise text bounds, implying the tool did not perfectly align with the text it was applied to.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § highlight draw — per-line vertical offset of 0–2 px and per-line horizontal start/end offset of 0–3 px, deterministic per mark id.',
			probe: {
				kind: 'named-observation',
				region: 'highlight band boundary relative to the underlying glyph baseline',
				expectation:
					'top edge of the highlight is not pixel-aligned to glyph cap-height; left edge starts before or after the first glyph by ≤ 3 px; offsets are stable across re-renders of the same preset.'
			}
		},
		{
			name: 'end-cap-behaviour',
			definition:
				'The first and last few pixels of a highlight band fade in / out asymmetrically — implying a stroke onset and lift rather than a hard rectangle.',
			implementation:
				'src/lib/annotations/annotation-marks.ts § highlight draw — soft alpha ramp on the leading 4 px and a slightly longer ramp on the trailing 6 px.',
			probe: {
				kind: 'named-observation',
				region: 'highlight band start and end at 400% zoom',
				expectation:
					'leading edge ramps over ~4 px; trailing edge ramps over a longer distance; neither is a hard vertical line.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'highlight.fill',
			definition: 'Highlighter ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'highlight band fill colour',
				expectation: 'colour resolves through the highlight.fill Role.'
			}
		}
	]
};
