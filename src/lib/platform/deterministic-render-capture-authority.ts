import { framesToSeconds, resolveFrameRate, secondsToFrames } from '$lib/utils/composition-timing';
import {
	deterministicFrameAddressFor,
	type DeterministicFrameRate,
	type DeterministicFrameRequest,
	type DeterministicSettledFrame
} from '$lib/utils/deterministic-render-measurements';

import type { Timeline } from './timeline.svelte';

export interface DeterministicTimelineCaptureDependencies {
	timeline: Timeline;
	fps: number;
	settleNextPaint(): Promise<void>;
	flushDom(): Promise<void>;
}

function sameFrameRate(left: DeterministicFrameRate, right: DeterministicFrameRate): boolean {
	return left.num === right.num && left.den === right.den;
}

/** Seek the real Timeline only after binding the request to its active rational rate. */
export async function seekDeterministicTimelineFrame(
	request: DeterministicFrameRequest,
	dependencies: DeterministicTimelineCaptureDependencies
): Promise<DeterministicSettledFrame> {
	const resolvedFrameRate = resolveFrameRate(dependencies.fps);
	const activeFrameRate: DeterministicFrameRate = {
		num: resolvedFrameRate.num,
		den: resolvedFrameRate.den
	};
	if (!sameFrameRate(request.frameRate, activeFrameRate)) {
		throw new RangeError('Requested frame rate does not match the active composition frame rate.');
	}
	const expectedAddress = deterministicFrameAddressFor(request.address.frameIndex, activeFrameRate);
	if (request.address.timestampMicroseconds !== expectedAddress.timestampMicroseconds) {
		throw new RangeError('Requested timestamp does not match the active composition frame rate.');
	}
	const settledPaint = dependencies.settleNextPaint();
	dependencies.timeline.pause();
	dependencies.timeline.seek(framesToSeconds(request.address.frameIndex, resolvedFrameRate));
	await settledPaint;
	await dependencies.flushDom();
	return {
		address: deterministicFrameAddressFor(
			secondsToFrames(dependencies.timeline.time, resolvedFrameRate),
			activeFrameRate
		),
		activeFrameRate
	};
}
