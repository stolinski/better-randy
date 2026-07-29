import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { buildCompositionTimelineTracks } from './composition-timeline-tracks.ts';
import { createDefaultEngineState, type EngineState } from './engine-schema.ts';
import { createTimelineTrackId, createVideoClipSelectionId } from './timeline-entity-identity.ts';
import { isVideoTimelineTrack } from './timeline-track.ts';

function makeTimelineState(): EngineState {
	const state = createDefaultEngineState();
	state.transport = { orientation: 'horizontal', durationSeconds: 10, fps: 30, format: 'webm' };
	state.typography = { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#000000' };
	state.marks = {
		defaults: { highlight: { color: '#ffee00', intensity: 0.6 } },
		timings: [{ start: 0.3, duration: 0.1, ease: 'smooth' }]
	};
	state.surface = {
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
	};
	state.textAnimations = [
		{
			id: 'title-reveal',
			target: { kind: 'surface', slot: 'title' },
			effect: 'soft-blur-in',
			enter: { start: 0.22, duration: 0.08, ease: 'smooth' }
		}
	];
	state.overlays = [
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
	];
	state.effects = [];
	state.audioCues = [
		{ id: 'manual:sting', kind: 'cue', assetSlug: 'core-sting', start: 0.75, duration: 0.1 }
	];
	state.media = { assets: [], videoTrack: { clips: [] } };
	return state;
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
				createTimelineTrackId({ kind: 'video' }),
				createTimelineTrackId({ kind: 'sound' })
			]
		);

		assert.equal(tracks[0].label, 'Surface');
		assert.match(tracks[2].label, /^stat ·/);
		assert.match(tracks[8].label, /^T · title/);
		assert.equal(tracks[9].label, 'Video');
		assert.ok(
			tracks[10].transitions.some((transition) => transition.soundReference?.kind === 'manual')
		);
	});

	it('always builds one fixed Video row and maps ordered canonical clips', () => {
		const emptyTracks = buildCompositionTimelineTracks(makeTimelineState(), appearance);
		const emptyVideo = emptyTracks.find(isVideoTimelineTrack);
		assert.ok(emptyVideo);
		assert.equal(emptyVideo.isRemovable, false);
		assert.deepEqual(emptyVideo.clips, []);

		const state = makeTimelineState();
		state.media = {
			assets: [
				{
					id: 'camera-a',
					kind: 'video',
					name: 'Opening interview camera',
					assetUrl: `/api/user-assets/${'a'.repeat(64)}.mp4`
				},
				{
					id: 'screen-b',
					kind: 'video',
					name: 'Screen capture',
					assetUrl: `/api/user-assets/${'b'.repeat(64)}.webm`
				}
			],
			videoTrack: {
				clips: [
					{
						id: 'opening:clip',
						assetId: 'camera-a',
						timelineStartFrame: 0,
						durationFrames: 60,
						sourceStartSeconds: 4.25,
						audio: { enabled: true, gain: 0.8 }
					},
					{
						id: 'demo',
						assetId: 'screen-b',
						timelineStartFrame: 90,
						durationFrames: 30,
						sourceStartSeconds: 1,
						audio: { enabled: false, gain: 1 }
					}
				]
			}
		};

		const tracks = buildCompositionTimelineTracks(state, appearance);
		const video = tracks.find(isVideoTimelineTrack);
		assert.ok(video);
		assert.deepEqual(video.clips, [
			{
				id: createVideoClipSelectionId('opening:clip'),
				clipId: 'opening:clip',
				assetId: 'camera-a',
				label: 'Opening interview camera',
				timelineStartFrame: 0,
				durationFrames: 60,
				sourceStartSeconds: 4.25,
				audio: { enabled: true, gain: 0.8 }
			},
			{
				id: createVideoClipSelectionId('demo'),
				clipId: 'demo',
				assetId: 'screen-b',
				label: 'Screen capture',
				timelineStartFrame: 90,
				durationFrames: 30,
				sourceStartSeconds: 1,
				audio: { enabled: false, gain: 1 }
			}
		]);
		const videoIndex = tracks.indexOf(video);
		const soundIndex = tracks.findIndex(
			(track) => track.id === createTimelineTrackId({ kind: 'sound' })
		);
		assert.equal(videoIndex, soundIndex - 1);
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
		const manual = sound.transitions.find(
			(transition) => transition.soundReference?.kind === 'manual'
		);
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
