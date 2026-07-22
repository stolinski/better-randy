/**
 * Identity Spec for the `stat-callout` diagram Block (ADR-0036) — a number
 * that builds, reusing the counter overlay's proven roll behaviour on the
 * primitive's own window.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const statCalloutIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a placed statistic that counts up and holds, with a caption',
	dimensions: [
		{
			name: 'accent-treatment',
			viaPack: 'stat-callout.accent',
			definition: 'The building number’s colour.',
			probe: {
				kind: 'named-observation',
				region: 'the stat value',
				expectation:
					'value colour resolves through the stat-callout.accent Role (core accent fallback).'
			}
		},
		{
			name: 'fill-treatment',
			viaPack: 'stat-callout.ink',
			definition: 'Caption ink colour.',
			probe: {
				kind: 'named-observation',
				region: 'the stat caption',
				expectation:
					'caption ink resolves stat-callout.ink → core ink → composition typography ink (currentColor).'
			}
		},
		{
			name: 'motion-form',
			implementation:
				'src/lib/pipelines/blocks/stat-callout/CanvasSource.svelte — per-digit place-value roll over [rollStart, rollStart + rollWindow] (the counter overlay’s slot-machine motionShape), holding the landed value; entrance is a plain fade on blockProgresses (the roll is the show).',
			definition: 'The count-up roll and its hold.',
			probe: {
				kind: 'named-observation',
				region: 'the stat at ~60% of its roll window and at window end',
				expectation:
					'low-place digits roll visibly mid-window with smooth deceleration into the landed value, which then HOLDS; digits derive purely from progress (export == preview).'
			}
		},
		{
			name: 'frame-relationship',
			implementation:
				'src/lib/platform/DiagramMount.svelte positionStyle — explicit composition-fraction placement, value + caption centred as one unit.',
			definition: 'Where the stat sits in the frame.',
			probe: {
				kind: 'named-observation',
				region: 'stat placement vs its authored position',
				expectation: 'the value/caption stack centres on `position` × frame size.'
			}
		}
	]
};
