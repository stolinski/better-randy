/**
 * Identity Spec for the `counter` Overlay — per ADR-0015 + ADR-0020. Family
 * Pipeline (single v1 variant: `slot-machine-roll`). motion-form is
 * intrinsic (per-digit slot-machine roll between from/to values);
 * frame-relationship is intrinsic (tabular alignment so multi-digit
 * counters don\'t reflow during animation); fill / numeral-style /
 * enter-motion concede to the Pack per ADR-0019.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const counterIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a numeric block animating from one value to another with per-digit transitions',
	dimensions: [
		{
			name: 'motion-form',
			definition:
				'Each digit position carries its own roll animation between source and target digit; carries between positions are deterministic (a 9 → 10 advance rolls the ones-place 9 → 0 and increments the tens-place, in sync).',
			implementation:
				'src/lib/pipelines/overlays/counter/variants/slot-machine-motion.ts slotMachineRollMotionShape — per-digit interpolation; CanvasSource emits one DOM element per digit position with a CSS transform driven by per-digit progress.',
			probe: {
				kind: 'named-observation',
				region: 'multi-digit counter mid-roll',
				expectation:
					'each digit position resolves independently; visible vertical roll on positions that are mid-transition; settled positions are static.'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'Numerals use tabular figures (or are positioned with a fixed-width grid) so multi-digit counters do not reflow during the animation.',
			implementation:
				'src/lib/pipelines/overlays/counter/CanvasSource.svelte — CSS font-variant-numeric: tabular-nums; each digit slot has fixed inline-size.',
			probe: {
				kind: 'named-observation',
				region: 'multi-digit counter at progress 0 vs 1',
				expectation: 'overall counter inline-size is identical at every progress; no jitter as digits transition.'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'counter.ink',
			definition: 'Digit ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'counter digit colour',
				expectation: 'colour resolves through the counter.ink Role.'
			}
		},
		{
			name: 'light-treatment',
			implementation:
				'src/lib/pipelines/overlays/counter/variants/SlotMachineCanvasSource.svelte — scoped CSS hardcodes the numeral style: font-feature-settings: \'tnum\' 1 and font-variant-numeric: tabular-nums on .counter-overlay. Tabular lining figures are intrinsic to the Pipeline (the no-reflow frame-relationship guarantee depends on them), not Pack-driven.',
			definition: 'Numeral style. Tabular lining figures are fixed by the Pipeline so digit advance never reflows the counter; the Pack does not vary it.',
			probe: {
				kind: 'named-observation',
				region: 'digit baseline + cap heights',
				expectation: 'all numerals are tabular lining figures with a common baseline and cap height; every digit cell is the same width.'
			}
		}
	]
};
