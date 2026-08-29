import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import blankPresetJson from '$lib/presets/blank.json';

import { compositionMeta } from './composition-meta.svelte';
import {
	runInspectCompositionPlayheadOperation,
	runSeekCompositionPlayheadOperation,
	type CompositionPlayheadInspectionOutcome,
	type CompositionPlayheadInspectionReceipt,
	type CompositionPlayheadSeekOutcome,
	type CompositionPlayheadSeekReceipt
} from './composition-playhead-operations';
import { engineState, transitionState } from './engine-state.svelte';
import { Timeline } from './timeline.svelte';
import { timelineHandle } from './timeline-handle.svelte';
import { applyPreset } from './preset';
import { parsePresetIngress } from './preset-ingress';

import type { CompositionOperationFailure } from './composition-operation-preflight';

let ticks: number[] = [];

function registerTimeline(fps = 30, durationSeconds = 6): void {
	ticks = [];
	timelineHandle.current = new Timeline({
		durationSeconds,
		fps,
		tick: (timestamp) => ticks.push(timestamp)
	});
}

function expectInspected(
	outcome: CompositionPlayheadInspectionOutcome
): CompositionPlayheadInspectionReceipt {
	if (outcome.status !== 'inspected') {
		throw new Error(`Expected a playhead reading but got ${outcome.code}: ${outcome.message}`);
	}
	return outcome;
}

function expectMoved(outcome: CompositionPlayheadSeekOutcome): CompositionPlayheadSeekReceipt {
	if (outcome.status !== 'moved') {
		throw new Error(`Expected the playhead to move but got ${outcome.code}: ${outcome.message}`);
	}
	return outcome;
}

function expectFailed(
	outcome: CompositionPlayheadInspectionOutcome | CompositionPlayheadSeekOutcome
): CompositionOperationFailure {
	if (outcome.status !== 'failed') {
		throw new Error('Expected a failed outcome but the playhead operation succeeded.');
	}
	return outcome;
}

beforeEach(() => {
	transitionState.capturing = false;
	applyPreset(parsePresetIngress(blankPresetJson));
	compositionMeta.isUserComposition = true;
	compositionMeta.userCompositionSlug = 'untitled';
	compositionMeta.forkedFrom = null;
	registerTimeline();
});

afterEach(() => {
	timelineHandle.current?.dispose();
	timelineHandle.current = null;
});

describe('playhead inspection', () => {
	it('reports the frame grid the playhead moves within', () => {
		const receipt = expectInspected(runInspectCompositionPlayheadOperation());

		expect(receipt).toMatchObject({
			frame: 0,
			frameCount: 180,
			fps: 30,
			frameRate: '30',
			durationSeconds: 6,
			timecode: '00:00:00:00',
			isPlaying: false
		});
	});

	it('counts frames on the exact rational at a fractional NTSC rate', () => {
		registerTimeline(29.97, 10);

		const receipt = expectInspected(runInspectCompositionPlayheadOperation());

		expect(receipt.frameRate).toBe('30000/1001');
		expect(receipt.frameCount).toBe(300);
	});

	it('refuses to report a playhead no Workspace is showing', () => {
		timelineHandle.current = null;

		expect(expectFailed(runInspectCompositionPlayheadOperation()).code).toBe('precondition_unmet');
	});

	it('refuses to report a playhead with no composition open', () => {
		compositionMeta.userCompositionSlug = null;

		expect(expectFailed(runInspectCompositionPlayheadOperation()).code).toBe('no_composition_open');
	});
});

describe('playhead seeking', () => {
	it('parks on an exact frame and drives the render at that timestamp', () => {
		const receipt = expectMoved(runSeekCompositionPlayheadOperation({ frame: 90 }));

		expect(receipt.frame).toBe(90);
		expect(receipt.seconds).toBeCloseTo(3, 10);
		expect(receipt.timecode).toBe('00:00:03:00');
		expect(receipt.focus).toBe('timeline-playhead');
		expect(ticks).toEqual([3]);
	});

	it('lands on the same frame it was asked for at a fractional NTSC rate', () => {
		registerTimeline(29.97, 10);

		const receipt = expectMoved(runSeekCompositionPlayheadOperation({ frame: 299 }));

		expect(receipt.frame).toBe(299);
		expect(receipt.seconds).toBeCloseTo((299 * 1001) / 30000, 12);
	});

	it('parks a running transport so the requested frame is the one on screen', () => {
		const timeline = timelineHandle.current;
		if (!timeline) throw new Error('The test transport is not registered.');
		timeline.isPlaying = true;

		const receipt = expectMoved(runSeekCompositionPlayheadOperation({ frame: 12 }));

		expect(receipt.isPlaying).toBe(false);
		expect(timeline.isPlaying).toBe(false);
	});

	it('refuses a frame past the end and names the range', () => {
		const failure = expectFailed(runSeekCompositionPlayheadOperation({ frame: 180 }));

		expect(failure.code).toBe('invalid_argument');
		expect(failure.alternatives).toEqual(['0', '179']);
		expect(ticks).toEqual([]);
	});

	it('refuses a frame that is not a whole frame', () => {
		expect(expectFailed(runSeekCompositionPlayheadOperation({ frame: 12.5 })).code).toBe(
			'invalid_argument'
		);
	});

	it('changes nothing about the composition', () => {
		const before = structuredClone(engineState.transport);

		expectMoved(runSeekCompositionPlayheadOperation({ frame: 30 }));

		expect(engineState.transport).toEqual(before);
	});
});
