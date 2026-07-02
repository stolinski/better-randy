/**
 * Unit tests for the ADR-0035 schema additions: per-channel keyframes[],
 * per-property ease, Cascade anchoring (incl. ref resolution + cycle
 * detection), and the static position rotation field. The Hiviz repo ships no
 * Jest/Vitest harness, so this is a self-running node script (matching
 * `src/lib/utils/timeline-clip.test.ts`):
 *
 *   node --experimental-strip-types src/lib/platform/engine-schema.test.ts
 *
 * It imports the real schema and fails the process with a non-zero exit on
 * the first mismatch.
 */

import assert from 'node:assert/strict';

import { EngineStateSchema } from './engine-schema.ts';

// Minimal valid EngineState input (wire form — `body` is the bracket-tag
// string the schema transforms). Each test mutates a structuredClone of this.
// Typed loosely on purpose: tests author arbitrary (including invalid) wire
// shapes and hand them to safeParse, which owns the narrowing.
interface WireState {
	[key: string]: unknown;
	surface: Record<string, unknown>;
	marks: Record<string, unknown>;
	textAnimations: unknown[];
	overlays: unknown[];
}

const BASE_STATE: WireState = {
	transport: { orientation: 'horizontal', durationSeconds: 6, fps: 30, format: 'webm' },
	typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#000000' },
	marks: { defaults: {}, timings: [] },
	surface: { type: 'paper', content: { body: 'Hello world.' } },
	textAnimations: [],
	overlays: [],
	effects: [],
	audioCues: []
};

function baseState(): WireState {
	return structuredClone(BASE_STATE);
}

function baseOverlay(id: string): Record<string, unknown> {
	return {
		type: 'lower-third',
		id,
		content: { kicker: 'K', title: 'T' },
		position: { anchor: 'bottom-left', offset: { x: 0.0625, y: 0.0625 } }
	};
}

function expectValid(state: unknown, label: string): void {
	const result = EngineStateSchema.safeParse(state);
	assert.ok(
		result.success,
		`${label}: expected valid, got issues:\n${result.success ? '' : result.error.message}`
	);
}

function expectIssue(state: unknown, messageFragment: string, label: string): void {
	const result = EngineStateSchema.safeParse(state);
	assert.ok(!result.success, `${label}: expected a parse failure, but it passed`);
	const messages = result.error.issues.map((issue) => issue.message);
	assert.ok(
		messages.some((message) => message.includes(messageFragment)),
		`${label}: no issue message contains "${messageFragment}". Got:\n${messages.join('\n')}`
	);
}

// ── Keyframe tracks ────────────────────────────────────────────────────────

{
	// A multi-step overlay channel set parses and retains its values.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: {
				channels: {
					opacity: [
						{ atMs: 0, value: 0 },
						{ atMs: 300, value: 1, ease: 'smooth' }
					],
					scale: [
						{ atMs: 0, value: 1 },
						{ atMs: 180, value: 0.96, ease: 'sharp' },
						{ atMs: 420, value: 1, ease: 'settled' }
					],
					y: [
						{ atMs: 0, value: 0.04 },
						{ atMs: 300, value: 0, ease: 'smooth' }
					]
				}
			}
		}
	];
	const result = EngineStateSchema.safeParse(state);
	assert.ok(
		result.success,
		`multi-channel overlay keyframes: ${result.success ? '' : result.error.message}`
	);
	const channels = result.data.overlays[0].animation?.channels;
	assert.equal(channels?.scale?.length, 3);
	assert.equal(channels?.scale?.[1].value, 0.96);
	assert.equal(channels?.scale?.[1].ease, 'sharp');
}

{
	// First keyframe must not carry an ease — ease is the curve INTO a keyframe.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: { channels: { opacity: [{ atMs: 0, value: 0, ease: 'smooth' }] } }
		}
	];
	expectIssue(state, 'first keyframe', 'first-keyframe ease');
}

{
	// atMs must be strictly ascending.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: {
				channels: {
					opacity: [
						{ atMs: 300, value: 0 },
						{ atMs: 300, value: 1, ease: 'smooth' }
					]
				}
			}
		}
	];
	expectIssue(state, 'strictly ascending', 'non-ascending atMs');
}

{
	// A declared channel needs at least one keyframe.
	const state = baseState();
	state.overlays = [{ ...baseOverlay('main'), animation: { channels: { opacity: [] } } }];
	expectIssue(state, 'at least one keyframe', 'empty track');
}

{
	// Opacity keyframe values are 0..1 fractions.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: {
				channels: {
					opacity: [
						{ atMs: 0, value: 0 },
						{ atMs: 300, value: 1.5, ease: 'smooth' }
					]
				}
			}
		}
	];
	const result = EngineStateSchema.safeParse(state);
	assert.ok(!result.success, 'opacity value out of range: expected failure');
}

{
	// Scale keyframe values share the static field's 0.1..8 bounds.
	const state = baseState();
	state.overlays = [
		{ ...baseOverlay('main'), animation: { channels: { scale: [{ atMs: 0, value: 9 }] } } }
	];
	const result = EngineStateSchema.safeParse(state);
	assert.ok(!result.success, 'scale value out of range: expected failure');
}

{
	// x/y are signed deltas — negative values are legal (slide in from offscreen).
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: {
				channels: {
					x: [
						{ atMs: 0, value: -0.2 },
						{ atMs: 300, value: 0, ease: 'smooth' }
					]
				}
			}
		}
	];
	expectValid(state, 'negative x delta');
}

{
	// Surface channels are opacity-only; a transform channel fails loudly
	// (strict object) instead of being silently stripped.
	const state = baseState();
	state.surface.animation = {
		channels: {
			opacity: [
				{ atMs: 0, value: 0 },
				{ atMs: 300, value: 1, ease: 'smooth' }
			]
		}
	};
	expectValid(state, 'surface opacity channel');

	const bad = baseState();
	bad.surface.animation = {
		channels: { x: [{ atMs: 0, value: 0 }] }
	};
	const result = EngineStateSchema.safeParse(bad);
	assert.ok(!result.success, 'surface transform channel: expected failure');
}

{
	// enter/exit sugar stays valid alongside declared channels — ownership
	// precedence is the manifest builder's call, not a parse error.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			enter: { start: 0.05, duration: 0.05, ease: 'smooth' },
			exit: { start: 0.9, duration: 0.04, ease: 'smooth' },
			animation: {
				channels: {
					opacity: [
						{ atMs: 0, value: 0 },
						{ atMs: 300, value: 1, ease: 'smooth' }
					]
				}
			}
		}
	];
	expectValid(state, 'enter/exit sugar coexists with channels');
}

// ── Static position rotation ───────────────────────────────────────────────

{
	const state = baseState();
	const overlay = baseOverlay('main');
	(overlay.position as Record<string, unknown>).rotation = -4.5;
	state.overlays = [overlay];
	expectValid(state, 'static rotation');

	const bad = baseState();
	const badOverlay = baseOverlay('main');
	(badOverlay.position as Record<string, unknown>).rotation = 400;
	bad.overlays = [badOverlay];
	const result = EngineStateSchema.safeParse(bad);
	assert.ok(!result.success, 'rotation beyond ±360: expected failure');
}

// ── Cascade refs ───────────────────────────────────────────────────────────

{
	// Overlay anchored to the surface's enter end.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: { cascade: { anchor: 'surface', event: 'end', offsetMs: 120 } }
		}
	];
	expectValid(state, 'cascade to surface');
}

{
	// Chain: mark → overlay → surface; text animation → overlay. All resolve.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('title'),
			animation: { cascade: { anchor: 'surface', event: 'end', offsetMs: 120 } }
		}
	];
	state.marks = {
		defaults: {},
		timings: [
			{
				start: 0.34,
				duration: 0.24,
				ease: 'smooth',
				cascade: { anchor: { overlay: 'title' }, event: 'end', offsetMs: 150 }
			}
		]
	};
	state.textAnimations = [
		{
			id: 'title-reveal',
			target: { kind: 'surface', slot: 'title' },
			effect: 'soft-blur-in',
			enter: { start: 0.04, duration: 0.1, ease: 'smooth' },
			cascade: { anchor: { overlay: 'title' }, event: 'start', offsetMs: -60 }
		}
	];
	expectValid(state, 'cascade chain across element kinds');
}

{
	// Unknown overlay ref.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: { cascade: { anchor: { overlay: 'ghost' }, event: 'start', offsetMs: 0 } }
		}
	];
	expectIssue(state, 'does not match any overlays[].id', 'unknown overlay anchor');
}

{
	// Mark index out of range.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: { cascade: { anchor: { mark: 2 }, event: 'start', offsetMs: 0 } }
		}
	];
	expectIssue(state, 'out of range', 'mark anchor out of range');
}

{
	// Unknown text-animation ref.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('main'),
			animation: {
				cascade: { anchor: { textAnimation: 'ghost' }, event: 'start', offsetMs: 0 }
			}
		}
	];
	expectIssue(state, 'does not match any textAnimations[].id', 'unknown textAnimation anchor');
}

// ── Cascade cycles ─────────────────────────────────────────────────────────

{
	// Two overlays anchored to each other.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('a'),
			animation: { cascade: { anchor: { overlay: 'b' }, event: 'end', offsetMs: 100 } }
		},
		{
			...baseOverlay('b'),
			animation: { cascade: { anchor: { overlay: 'a' }, event: 'end', offsetMs: 100 } }
		}
	];
	expectIssue(state, 'Cascade cycle', 'two-node cycle');
}

{
	// Self-anchor is the one-node cycle.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('a'),
			animation: { cascade: { anchor: { overlay: 'a' }, event: 'end', offsetMs: 100 } }
		}
	];
	expectIssue(state, 'Cascade cycle', 'self-anchor cycle');
}

{
	// A tail leading into a cycle reports the cycle, and an acyclic chain off
	// the same graph still parses on its own.
	const state = baseState();
	state.overlays = [
		{
			...baseOverlay('a'),
			animation: { cascade: { anchor: { overlay: 'b' }, event: 'start', offsetMs: 0 } }
		},
		{
			...baseOverlay('b'),
			animation: { cascade: { anchor: { overlay: 'c' }, event: 'start', offsetMs: 0 } }
		},
		{
			...baseOverlay('c'),
			animation: { cascade: { anchor: { overlay: 'b' }, event: 'start', offsetMs: 0 } }
		}
	];
	const result = EngineStateSchema.safeParse(state);
	assert.ok(!result.success, 'tail into cycle: expected failure');
	const cycleIssues = result.success
		? []
		: result.error.issues.filter((issue) => issue.message.includes('Cascade cycle'));
	assert.equal(cycleIssues.length, 1, 'the b↔c cycle reports exactly once');
	assert.ok(
		cycleIssues[0].message.includes('overlay:b') && cycleIssues[0].message.includes('overlay:c'),
		`cycle message names the loop: ${cycleIssues[0].message}`
	);
}

console.log('engine-schema.test.ts: all assertions passed');
