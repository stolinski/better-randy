import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

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

describe('engine schema', () => {
	it('validates keyframes, rotation, and cascade references', () => {
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

		{
			const state = baseState();
			const overlay = baseOverlay('responsive');
			(overlay.position as Record<string, unknown>).orientationOverrides = {
				vertical: {
					anchor: 'bottom-center',
					offset: { x: 0, y: 0.2 },
					scale: 0.9,
					rotation: 2
				}
			};
			state.overlays = [overlay];
			const result = EngineStateSchema.safeParse(state);
			assert.ok(result.success, result.success ? '' : result.error.message);
			assert.deepEqual(result.data.overlays[0].position.orientationOverrides?.vertical, {
				anchor: 'bottom-center',
				offset: { x: 0, y: 0.2 },
				scale: 0.9,
				rotation: 2
			});

			const incomplete = baseState();
			const incompleteOverlay = baseOverlay('responsive');
			(incompleteOverlay.position as Record<string, unknown>).orientationOverrides = {
				vertical: { offset: { x: 0, y: 0.2 } }
			};
			incomplete.overlays = [incompleteOverlay];
			expectIssue(incomplete, 'expected', 'orientation override requires a complete placement');
		}

		{
			const state = baseState();
			state.surface.diagram = [
				{
					type: 'node',
					id: 'source',
					position: { x: 0.2, y: 0.5 },
					form: 'box',
					orientationOverrides: {
						vertical: { position: { x: 0.5, y: 0.25 }, scale: 1.2 }
					}
				},
				{
					type: 'edge-arrow',
					id: 'path',
					from: { node: 'source' },
					to: { x: 0.8, y: 0.5 },
					route: 'straight',
					orientationOverrides: {
						vertical: {
							from: { node: 'source' },
							to: { x: 0.5, y: 0.75 },
							route: 'arc',
							control: { x: 0.7, y: 0.5 }
						}
					}
				}
			];
			expectValid(state, 'diagram orientation geometry snapshots');

			const incomplete = structuredClone(state);
			const node = (incomplete.surface.diagram as Record<string, unknown>[])[0];
			node.orientationOverrides = { vertical: { scale: 1.2 } };
			expectIssue(incomplete, 'expected', 'diagram override requires complete position geometry');

			const badReference = structuredClone(state);
			const edge = (badReference.surface.diagram as Record<string, unknown>[])[1];
			edge.orientationOverrides = {
				vertical: {
					from: { node: 'missing' },
					to: { x: 0.5, y: 0.75 },
					route: 'straight'
				}
			};
			expectIssue(
				badReference,
				'which is not a node primitive',
				'diagram override validates node references'
			);
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
				cycleIssues[0].message.includes('overlay:b') &&
					cycleIssues[0].message.includes('overlay:c'),
				`cycle message names the loop: ${cycleIssues[0].message}`
			);
		}
	});

	it('keeps Diagram label role optional without materializing a schema default', () => {
		const state = baseState();
		state.surface.diagram = [
			{
				type: 'label',
				id: 'headline',
				position: { x: 0.5, y: 0.2 },
				text: 'Headline',
				role: 'headline'
			},
			{
				type: 'label',
				id: 'legacy-caption',
				position: { x: 0.5, y: 0.4 },
				text: 'Caption'
			}
		];

		const result = EngineStateSchema.safeParse(state);
		assert.ok(result.success, result.success ? '' : result.error.message);
		const diagram = result.data.surface.diagram ?? [];
		assert.equal(diagram[0].type === 'label' ? diagram[0].role : undefined, 'headline');
		assert.equal(diagram[1].type === 'label' ? diagram[1].role : undefined, undefined);

		const invalid = structuredClone(state);
		(invalid.surface.diagram as Record<string, unknown>[])[0].role = 'display';
		expectIssue(invalid, 'Invalid option', 'invalid Diagram label role');
	});

	it('validates the v1 Source video contract and full-frame bed eligibility', () => {
		const state = baseState();
		state.sourceVideo = {
			assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`
		};
		state.audioCues = [
			{
				id: 'music',
				kind: 'bed',
				assetSlug: 'bed-warm-keys',
				start: 0,
				duration: 1
			}
		];

		const result = EngineStateSchema.safeParse(state);
		assert.ok(result.success, result.success ? '' : result.error.message);
		assert.deepEqual(result.data.sourceVideo, {
			assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`,
			sourceOffsetSeconds: 0,
			includeAudio: true,
			volume: 1
		});

		for (const extension of ['mov', 'webm']) {
			const alternate = baseState();
			alternate.sourceVideo = {
				assetUrl: `/api/user-assets/${'b'.repeat(64)}.${extension}`,
				sourceOffsetSeconds: 12.5,
				includeAudio: false,
				volume: 0
			};
			expectValid(alternate, `${extension} Source video`);
		}

		const invalidUrl = baseState();
		invalidUrl.sourceVideo = { assetUrl: '/tmp/source.mp4' };
		expectIssue(invalidUrl, 'content-addressed', 'Source video asset URL');

		const invalidOffset = baseState();
		invalidOffset.sourceVideo = {
			assetUrl: `/api/user-assets/${'c'.repeat(64)}.mp4`,
			sourceOffsetSeconds: -1
		};
		expectIssue(invalidOffset, '>=0', 'Source video offset');

		const invalidVolume = baseState();
		invalidVolume.sourceVideo = {
			assetUrl: `/api/user-assets/${'d'.repeat(64)}.mp4`,
			volume: 4.1
		};
		expectIssue(invalidVolume, '<=4', 'Source video volume');

		const withFill = structuredClone(state);
		withFill.backgroundFill = '#000000';
		expectIssue(withFill, 'cannot be combined with backgroundFill', 'Source video plus fill');

		const withStage = structuredClone(state);
		withStage.stage = {
			type: 'depth',
			camera: { fov: 35, push: 0, driftX: 0, driftY: 0 },
			focus: { focalZ: 0.5, aperture: 0.2, maxBlur: 20 }
		};
		expectIssue(
			withStage,
			'cannot be combined with a dimensional stage',
			'Source video plus stage'
		);
	});
});
