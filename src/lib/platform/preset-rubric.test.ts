/**
 * Unit tests for the ADR-0035 §6 rubric guardrails: window rules (A1 / L4)
 * derived from cascade-resolved starts and authored keyframe envelopes, with
 * deliberately-broken fixtures proving each rule still fires. Self-running
 * node script:
 *
 *   node --experimental-strip-types src/lib/platform/preset-rubric.test.ts
 */

import assert from 'node:assert/strict';

import { lintPreset, type RubricIssue } from './preset-rubric.ts';
import type { Preset } from './engine-schema.ts';

const MARKED_BODY = [
	{
		type: 'paragraph',
		segments: [{ text: 'the marked phrase', markStyles: ['highlight'] }]
	}
];

function makePreset(partial: {
	surface?: Record<string, unknown>;
	overlays?: unknown[];
	timings?: unknown[];
}): Preset {
	return {
		schema: 'hiviz@1',
		name: 'rubric fixture',
		pack: 'syntax',
		kind: 'fixture',
		state: {
			transport: { orientation: 'horizontal', durationSeconds: 6, fps: 30, format: 'webm' },
			typography: { fontFamily: 'sans', paperColor: '#ffffff', inkColor: '#111111' },
			marks: { defaults: {}, timings: partial.timings ?? [] },
			surface: {
				type: 'plain',
				content: { body: MARKED_BODY },
				...partial.surface
			},
			textAnimations: [],
			overlays: partial.overlays ?? [],
			effects: [],
			audioCues: []
		}
	} as unknown as Preset;
}

function rules(issues: RubricIssue[]): string[] {
	return issues.map((issue) => issue.rule);
}

// ── L4 against the authored opacity envelope ──────────────────────────────

{
	// BROKEN: plateau 300 → 1300 ms = 1.0 s hold — under the 2.5 s read floor.
	const broken = makePreset({
		overlays: [
			{
				type: 'lower-third',
				id: 'main',
				content: { kicker: 'K', title: 'T' },
				position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.115 } },
				animation: {
					channels: {
						opacity: [
							{ atMs: 0, value: 0 },
							{ atMs: 300, value: 1, ease: 'smooth' },
							{ atMs: 1300, value: 1, ease: 'smooth' },
							{ atMs: 1600, value: 0, ease: 'smooth' }
						]
					}
				}
			}
		]
	});
	const issues = lintPreset(broken).filter((issue) => issue.rule === 'L4');
	assert.equal(issues.length, 1, `broken envelope fires L4: ${rules(lintPreset(broken))}`);
	assert.ok(issues[0].message.includes('opacity envelope'));

	// FIXED: plateau 300 → 5100 ms = 4.8 s.
	const good = makePreset({
		overlays: [
			{
				type: 'lower-third',
				id: 'main',
				content: { kicker: 'K', title: 'T' },
				position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.115 } },
				animation: {
					channels: {
						opacity: [
							{ atMs: 0, value: 0 },
							{ atMs: 300, value: 1, ease: 'smooth' },
							{ atMs: 5100, value: 1, ease: 'smooth' },
							{ atMs: 5460, value: 0, ease: 'smooth' }
						]
					}
				}
			}
		]
	});
	assert.equal(lintPreset(good).filter((issue) => issue.rule === 'L4').length, 0);
}

// ── A1 against cascade-resolved mark starts ────────────────────────────────

{
	// Surface settles at 0.05 + 0.1 = 0.15. The mark's STORED start (0.5) is
	// fine, but its weld resolves to the surface's enter START (0.05) — early.
	const broken = makePreset({
		surface: {
			enter: { start: 0.05, duration: 0.1, ease: 'smooth' }
		},
		timings: [
			{
				start: 0.5,
				duration: 0.2,
				ease: 'smooth',
				cascade: { anchor: 'surface', event: 'start', offsetMs: 0 }
			}
		]
	});
	assert.equal(
		lintPreset(broken).filter((issue) => issue.rule === 'A1').length,
		1,
		'welded-early mark fires A1 at its RESOLVED start'
	);

	// Welded to the surface END +200 ms → clear of the buffer, no A1.
	const good = makePreset({
		surface: { enter: { start: 0.05, duration: 0.1, ease: 'smooth' } },
		timings: [
			{
				start: 0.5,
				duration: 0.2,
				ease: 'smooth',
				cascade: { anchor: 'surface', event: 'end', offsetMs: 200 }
			}
		]
	});
	assert.equal(lintPreset(good).filter((issue) => issue.rule === 'A1').length, 0);
}

// ── A1 against a channel-owned surface's envelope settle ──────────────────

{
	// Surface opacity lands at 400 ms (= 0.0667); a mark at 0.05 is early.
	const broken = makePreset({
		surface: {
			animation: {
				channels: {
					opacity: [
						{ atMs: 0, value: 0 },
						{ atMs: 400, value: 1, ease: 'smooth' }
					]
				}
			}
		},
		timings: [{ start: 0.05, duration: 0.2, ease: 'smooth' }]
	});
	assert.equal(
		lintPreset(broken).filter((issue) => issue.rule === 'A1').length,
		1,
		'mark before the envelope settle fires A1'
	);
}

// ── Cascade cycles degrade to an issue, never a crash ──────────────────────

{
	const cyclic = makePreset({
		overlays: [
			{
				type: 'lower-third',
				id: 'a',
				content: { kicker: 'K', title: 'T' },
				position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.115 } },
				enter: { start: 0.1, duration: 0.05, ease: 'smooth' },
				exit: { start: 0.9, duration: 0.04, ease: 'smooth' },
				animation: { cascade: { anchor: { overlay: 'a' }, event: 'start', offsetMs: 0 } }
			}
		]
	});
	const issues = lintPreset(cyclic);
	assert.equal(issues.filter((issue) => issue.rule === 'A4').length, 1, 'cycle surfaces as A4');
}

console.log('preset-rubric.test.ts: all assertions passed');
