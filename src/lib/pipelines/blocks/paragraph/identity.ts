/**
 * Identity Spec for the `paragraph` Block — per ADR-0015. The body-text
 * Block: paragraphs of inline-marked annotation segments laid into the
 * Surface's content slot. The Block claims a typographic reading texture
 * (line-height rhythm, paragraph break behaviour, marked-segment integration)
 * intrinsically, and concedes the glyph material to the Pack per ADR-0019
 * (`paragraph.material` → the optional `material-treatment` core).
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const paragraphIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a typographic reading block with marked inline segments and consistent line rhythm',
	dimensions: [
		{
			name: 'reading-rhythm',
			definition:
				'Line-height, paragraph break, and paragraph spacing are tuned for reading at body cap-height, not for compactness. Mark integration does not break the rhythm.',
			implementation:
				'src/lib/annotations/annotation-marks.ts + paragraph block layout — leading set to ~1.45 of cap-height; inter-paragraph gap is one leading unit; marks do not displace surrounding text on enter.',
			probe: {
				kind: 'named-observation',
				region: 'a body paragraph with at least one inline mark',
				expectation:
					'consistent inter-line spacing across marked and unmarked lines; the mark draws inside the existing line box without pushing adjacent lines.'
			}
		},
		{
			name: 'mark-integration',
			definition:
				"Inline marks composite under the glyph foreground (highlights paint behind ink; strikes paint over ink; underlines paint at baseline) and respect each unit's per-frame alpha when text animations are active.",
			implementation:
				'src/lib/annotations/annotation-marks.ts — z-order per mark style; marks renderer reads per-unit alpha from TextAnimationManager.unitAlphaAt and multiplies into mark alpha (per ADR-0011).',
			probe: {
				kind: 'named-observation',
				region: 'a body line carrying both a highlight and an in-flight text animation',
				expectation:
					'highlight band is visible under the ink, not over it; during the text-animation fade, the highlight alpha tracks the ink alpha rather than holding at full strength while the ink is partial.'
			}
		},
		{
			name: 'fill-treatment',
			implementation:
				'src/lib/platform/packs/resolve.ts (resolveTypographyColors, ADR-0038) — body ink resolves the optional engineState.typography.inkColor override → the active Pack’s core ink-treatment.',
			definition: 'Body ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'body text colour',
				expectation:
					'ink colour resolves override → Pack core (ADR-0038): an authored typography.inkColor wins; absent, the active Pack’s core ink-treatment paints the body.'
			}
		},
		{
			name: 'material-treatment',
			viaPack: 'paragraph.material',
			definition:
				'Glyph material claim — how the ink sits on the substrate (clean vector, ink bleed, dilation).',
			probe: {
				kind: 'named-observation',
				region: 'body glyph edge at 400% zoom',
				expectation: 'glyph material behaviour resolves through the paragraph.material Role.'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/text-animations/manager.svelte.ts calls compileTextAnimation() from src/lib/text-animations/compile.ts to drive body enter motion with the selected text-animation strategy.',
			definition: 'Shape of the body enter motion when one is declared.',
			probe: {
				kind: 'named-observation',
				region: 'first ~10% of the timeline on the body block',
				expectation:
					'body enter motion resolves through the body TextAnimation strategy (compiled by compileTextAnimation() in src/lib/text-animations/compile.ts and driven by TextAnimationManager), not a Pack Role.'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/annotations/annotation-marks.ts + paragraph block layout — paragraph measure (line length) is intrinsic to the Block layout, set by the active Surface content slot; not Pack-driven (ADR-0023: frame-relationship is intrinsic to the Pipeline).',
			definition: 'Paragraph measure (line length in em / characters) for the active Surface.',
			probe: {
				kind: 'named-observation',
				region: 'paragraph line length',
				expectation:
					'paragraph measure (line length) is set intrinsically by the Block layout for the active Surface content slot, not by a Pack Role.'
			}
		}
	]
};
