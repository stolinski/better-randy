/**
 * Identity Spec for the `checklist` Surface — per ADR-0015. A graphic Surface
 * whose claim is a half-frame numbered progress tracker: title + ordered
 * tasks, completed items struck through by the red hand-marker rule. The
 * appearance dimensions concede to the active Pack (ADR-0019); motion-form
 * (settled-place enter, per-item strike beats) and frame-relationship (the
 * half-frame column) are intrinsic. See docs/adr/0040-checklist-surface.md.
 *
 * The completion strike deliberately carries hand-marker physics (wobble,
 * pressure, overshoot — the `strike` Annotation's tool identity) ON chrome:
 * the check-off is the block's emotional payload, and a mechanical rule reads
 * as a spreadsheet. This is the declared, bounded exception to the Syntax
 * hand-energy-on-documents-only rule; everything else on the card stays flat.
 */

import type { IdentitySpec } from '$lib/platform/pipelines/identity';

export const checklistIdentity: IdentitySpec = {
	kind: 'graphic',
	claim: 'a half-frame numbered checklist whose completed items are struck by a red marker',
	dimensions: [
		{
			name: 'fill-treatment',
			viaPack: 'checklist.plate',
			definition: 'The card plate behind the list (card chrome mode only).',
			probe: {
				kind: 'named-observation',
				region: 'the card body behind the items',
				expectation:
					'in card mode the plate resolves through the checklist.plate Role (core fill fallback); in bare mode no plate paints anywhere.'
			}
		},
		{
			name: 'edge-treatment',
			viaPack: 'checklist.edge',
			definition: 'How the card boundary meets the frame (border + corner treatment).',
			probe: {
				kind: 'named-observation',
				region: 'the card boundary',
				expectation:
					'a visible border with the Pack’s corner treatment in card mode; no boundary at all in bare mode.'
			}
		},
		{
			name: 'depth-treatment',
			viaPack: 'checklist.depth',
			definition: 'Implied depth under the card (the stepped hard-offset stack under Syntax).',
			probe: {
				kind: 'named-observation',
				region: 'beneath the card’s bottom-right boundary',
				expectation:
					'depth resolves through the checklist.depth Role — hard-offset steps, never a gaussian shadow.'
			}
		},
		{
			name: 'light-treatment',
			viaPack: 'checklist.light',
			definition: 'Any directional light contribution on the card body.',
			probe: {
				kind: 'named-observation',
				region: 'the card surface',
				expectation: 'light treatment resolves through the checklist.light Role.'
			}
		},
		{
			name: 'numbered-item-list',
			definition:
				'An ordered task list: mono-voice numbers 1..N in the accent ink beside display-voice item text. Every row reserves its space from frame 0 (stable layout — nothing reflows, whether an item is present, struck, or building in), so positions never shift.',
			implementation:
				'src/lib/pipelines/surfaces/checklist/CanvasSource.svelte — `content.items[]` renders as a CSS-grid <ol> with a mono `--fontLabel` number column; rows never reflow — only per-row opacity/slide (build-in reveal, done-dim) and the strike animate in place.',
			probe: {
				kind: 'named-observation',
				region: 'the item column across the clip',
				expectation:
					'every visible numbered row keeps the same position for the whole clip (rows appear/quiet in place, never re-layout); numbers are mono and accent-colored, item text is the display voice.'
			}
		},
		{
			name: 'build-in-reveal',
			definition:
				'An item with an authored `enter` window reveals on its own staggered schedule — fading and sliding in from the right — so a list can build up one item at a time (a rundown laid out live). An item with no `enter` is present from the block’s own entrance. Reserved space means later-building items do not shove earlier ones.',
			implementation:
				"src/lib/pipelines/surfaces/checklist/CanvasSource.svelte — `itemReveal` composes `itemRevealAt` (schedule.ts window fraction, or 1 when `enter` is absent) into an easeOutQuad opacity × easeOutBack slide, off `animState.globalProgress` (frame-deterministic). Per-item `enter` is a draggable checklist-item clip identified by `createTimelineTrackId({ kind: 'checklist-item', index })`.",
			probe: {
				kind: 'named-observation',
				region: 'a build-in preset across progress 0.1, 0.4, 0.7',
				expectation:
					'early items are visible while later ones are still absent; each later item fades + slides in from the right at its own time; already-revealed items hold their position (no reflow) and are never struck when the list is a pure build-in.'
			}
		},
		{
			name: 'completion-strike',
			definition:
				'A checked item carries the red marker rule through its text: a checked item with no window is fully struck from frame 0 (static); a checked item with a strike window draws on over that window with hand-marker physics (pressure variation, slight overshoot, seeded wobble) and the item’s ink dims toward quiet as the rule lands. Unchecked items carry no rule.',
			implementation:
				'src/lib/pipelines/surfaces/checklist/CanvasSource.svelte wraps checked item text in a data-annotation-mark="strike" span; the reused `strike` Annotation draws the rule off `animState.markProgresses` (static items pinned to 1, animated items tweened over their authored window in Workspace buildAnimationManifest); the done-dim rides strikeProgressAt (schedule.ts).',
			probe: {
				kind: 'named-observation',
				region: 'a static-checked item at progress 0.02, and the animated item across its strike window',
				expectation:
					'the static item is already struck (and dimmed) in the first frames; the animated item’s rule advances left-to-right across its window — a pen drag, not a fading stamp — then holds; open items never gain a rule.'
			}
		},
		{
			name: 'chrome-mode',
			definition:
				'With `chrome: "none"` the list is bare type floating over footage — no plate, border, or shadow box anywhere — and every text row carries a hard (no-blur) offset shadow for legibility over any grade; the frame around the type stays transparent.',
			implementation:
				'src/lib/pipelines/surfaces/checklist/CanvasSource.svelte — `chrome ?? "window"` gates `.checklist--bare` (plate/border/box-shadow dropped, padding zeroed); rows take `text-shadow: var(--textShadow, <hard offset>)`. No CSS filter anywhere in the captured DOM.',
			probe: {
				kind: 'named-observation',
				region: 'the frame around and between the rows in a `chrome: "none"` render',
				expectation:
					'no plate, border, or shadow box anywhere; the area around the type is transparent (footage or checkerboard shows through); each row’s glyphs carry a hard offset shadow with no blur.'
			}
		},
		{
			name: 'motion-form',
			definition:
				'One settled-place entrance for the whole block — it flies in FROM THE RIGHT (slides left to rest with a small overshoot), then holds; the recurring beats are the per-item strike draw-ons, with no per-row entrances competing with them.',
			implementation:
				'src/lib/pipelines/surfaces/checklist/CanvasSource.svelte — a horizontal travel offset (fraction of frame width) rides the UNCLAMPED paperVisibility (the `settled` ease overshoots 1, so the card slides in from the right, dips past rest, and settles); item strike tweens run power1.inOut in Workspace buildAnimationManifest (the pen-drag craft rule).',
			probe: {
				kind: 'named-observation',
				region: 'the card across the enter window, then a strike beat mid-clip',
				expectation:
					'the block slides in horizontally from the right, overshoots its rest position slightly, and settles once; afterwards the only motion is a strike rule drawing through an item (plus its dim).'
			}
		},
		{
			name: 'frame-relationship',
			definition:
				'The list claims HALF the frame and leaves the other half to the footage: a right-half column on horizontal, a bottom-half panel on vertical — repositioned by orientation, never reshaped.',
			implementation:
				'src/lib/pipelines/surfaces/checklist/CanvasSource.svelte — horizontal: width 38% of frame at left 56%, vertically centered; vertical: width 86%, top 52% of frame height.',
			probe: {
				kind: 'named-observation',
				region: 'the full frame at both orientations',
				expectation:
					'horizontal: the left half of the frame is empty (transparent) and the list sits in the right half; vertical: the top half is empty and the list occupies the lower half, clear of the bottom caption band.'
			}
		}
	]
};
