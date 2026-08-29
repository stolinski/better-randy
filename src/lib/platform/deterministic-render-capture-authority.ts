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
	dependencies.timeline.pause();
	dependencies.timeline.seek(framesToSeconds(request.address.frameIndex, resolvedFrameRate));
	// Flush the DOM the seek produced, THEN ask for the settling paint. Requesting
	// it first — as this did — is only safe in the WICG lane, where the paint runs
	// on the browser's own tick and therefore still reads the post-seek DOM. The
	// rasterization lane starts reading the DOM the moment the request lands, so a
	// paint requested ahead of the seek rasterizes the PREVIOUS frame and the
	// settle returns with that frame resident. Ordering it after the seek is
	// correct in both lanes. The trailing flush keeps the caller's post-condition:
	// a settled frame whose DOM is applied.
	await dependencies.flushDom();
	await dependencies.settleNextPaint();
	await dependencies.flushDom();
	return {
		address: deterministicFrameAddressFor(
			secondsToFrames(dependencies.timeline.time, resolvedFrameRate),
			activeFrameRate
		),
		activeFrameRate
	};
}
