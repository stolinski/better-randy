import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { buildCompositionTimelineTracks } from './composition-timeline-tracks.ts';
import type { EngineState } from './engine-schema.ts';
import { createTimelineTrackId } from './timeline-entity-identity.ts';

function makeTimelineState(): EngineState {
	return {
		transport: { orientation: 'horizontal', durationSeconds: 10, fps: 30, format: 'webm' },
		typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#000000' },
		marks: {
			defaults: { highlight: { color: '#ffee00', intensity: 0.6 } },
			timings: [{ start: 0.3, duration: 0.1, ease: 'smooth' }]
		},
		surface: {
			type: 'plain',
			content: {
				title: 'Timeline',
				body: [
					{
						type: 'paragraph',
						segments: [{ text: 'Marked phrase', markStyles: ['highlight'] }]
					}
				]
			},
			enter: { start: 0, duration: 0.05, ease: 'settled' },
			exit: { start: 0.9, duration: 0.04, ease: 'smooth' },
			// Diagram primitive Block with its dedicated roll subtrack.
			diagram: [
				{
					type: 'stat-callout',
					id: 'revenue-roll',
					position: { x: 0.5, y: 0.5 },
					from: 0,
					to: 100,
					enter: { start: 0.2, duration: 0.05, ease: 'settled' },
					rollStart: 0.24,
					rollWindow: 0.3
				}
			]
		},
		textAnimations: [
			{
				id: 'title-reveal',
				target: { kind: 'surface', slot: 'title' },
				effect: 'soft-blur-in',
				enter: { start: 0.22, duration: 0.08, ease: 'smooth' }
			}
		],
		overlays: [
			{
				id: 'leader',
				type: 'lower-third',
				content: {},
				position: { anchor: 'center' },
				enter: { start: 0.1, duration: 0.05, ease: 'smooth' }
			},
			{
				id: 'follower:roll',
				type: 'lower-third',
				content: {},
				position: { anchor: 'center' },
				enter: { start: 0.8, duration: 0.05, ease: 'smooth' },
				animation: {
					cascade: { anchor: { overlay: 'leader' }, event: 'end', offsetMs: 200 }
				}
			},
			{
				id: 'counter-roll',
				type: 'counter',
				content: { rollStart: 0.15, rollWindow: 0.4 },
				position: { anchor: 'center' },
				enter: { start: 0.08, duration: 0.05, ease: 'settled' }
			}
		],
		effects: [],
		audioCues: [
			{ id: 'manual:sting', kind: 'cue', assetSlug: 'core-sting', start: 0.75, duration: 0.1 }
		]
	} as unknown as EngineState;
}

const appearance = {
	paperColor: '#ffffff',
	inkColor: '#111111',
	resolveMarkColor: () => '#ffee00'
};

describe('composition timeline tracks', () => {
	it('constructs representative rows in the canonical order with typed ids', () => {
		const tracks = buildCompositionTimelineTracks(makeTimelineState(), appearance);
		assert.deepEqual(
			tracks.map((track) => track.id),
			[
				createTimelineTrackId({ kind: 'surface' }),
				createTimelineTrackId({ kind: 'mark', index: 0 }),
				createTimelineTrackId({ kind: 'block', blockId: 'revenue-roll' }),
				createTimelineTrackId({
					kind: 'block-subtrack',
					blockId: 'revenue-roll',
					subtrack: { kind: 'roll' }
				}),
				createTimelineTrackId({ kind: 'overlay', overlayId: 'leader' }),
				createTimelineTrackId({ kind: 'overlay', overlayId: 'follower:roll' }),
				createTimelineTrackId({ kind: 'overlay', overlayId: 'counter-roll' }),
				createTimelineTrackId({
					kind: 'overlay-subtrack',
					overlayId: 'counter-roll',
					subtrack: { kind: 'roll' }
				}),
				createTimelineTrackId({ kind: 'text-animation', textAnimationId: 'title-reveal' }),
				createTimelineTrackId({ kind: 'sound' })
			]
		);

		assert.equal(tracks[0].label, 'Surface');
		assert.match(tracks[2].label, /^stat ·/);
		assert.match(tracks[8].label, /^T · title/);
		assert.ok(tracks[9].transitions.some((transition) => transition.soundReference?.kind === 'manual'));
	});

	it('writes representative track edits back to the authored composition', () => {
		const state = makeTimelineState();
		const tracks = buildCompositionTimelineTracks(state, appearance);
		const find = (id: ReturnType<typeof createTimelineTrackId>) => {
			const track = tracks.find((entry) => entry.id === id);
			assert.ok(track, id);
			return track;
		};

		find(createTimelineTrackId({ kind: 'surface' })).transitions[0].unified?.setEnter?.(0.03, 0.07);
		assert.deepEqual(state.surface.enter, { start: 0.03, duration: 0.07, ease: 'settled' });

		find(createTimelineTrackId({ kind: 'mark', index: 0 })).transitions[0].unified?.setEnter?.(
			0.36,
			0.12
		);
		assert.equal(state.marks.timings[0].start, 0.36);
		assert.equal(state.marks.timings[0].duration, 0.12);

		find(
			createTimelineTrackId({
				kind: 'block-subtrack',
				blockId: 'revenue-roll',
				subtrack: { kind: 'roll' }
			})
		).transitions[0].onUpdate?.({ start: 0.4, duration: 0.2 });
		const statPrimitive = state.surface.diagram?.[0];
		assert.ok(statPrimitive?.type === 'stat-callout');
		assert.equal(statPrimitive.rollStart, 0.4);
		assert.equal(statPrimitive.rollWindow, 0.2);

		find(
			createTimelineTrackId({
				kind: 'overlay-subtrack',
				overlayId: 'counter-roll',
				subtrack: { kind: 'roll' }
			})
		).transitions[0].onUpdate?.({ start: 0.28, duration: 0.45 });
		assert.deepEqual(state.overlays[2].content, { rollStart: 0.28, rollWindow: 0.45 });

		const sound = find(createTimelineTrackId({ kind: 'sound' }));
		const manual = sound.transitions.find((transition) => transition.soundReference?.kind === 'manual');
		manual?.onUpdate?.({ start: 0.66, duration: 0.2 });
		assert.equal(state.audioCues[0].start, 0.66);
		assert.equal(state.audioCues[0].duration, 0.2);
	});

	it('resolves Cascade links and preserves the weld when a follower moves', () => {
		const state = makeTimelineState();
		const tracks = buildCompositionTimelineTracks(state, appearance);
		const follower = tracks.find(
			(track) => track.id === createTimelineTrackId({ kind: 'overlay', overlayId: 'follower:roll' })
		);
		assert.ok(follower);
		const clip = follower.transitions[0];
		assert.ok(Math.abs(clip.start - 0.17) < 1e-9);
		assert.equal(
			clip.cascade?.anchorTrackId,
			createTimelineTrackId({ kind: 'overlay', overlayId: 'leader' })
		);
		assert.ok(Math.abs((clip.cascade?.anchorFraction ?? 0) - 0.15) < 1e-9);

		clip.unified?.setEnter?.(0.27, 0.06);
		assert.equal(state.overlays[1].enter?.duration, 0.06);
		assert.ok(Math.abs((state.overlays[1].animation?.cascade?.offsetMs ?? 0) - 1200) < 1e-9);
	});
});
