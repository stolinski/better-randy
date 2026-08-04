import type { InstanceMotionState, InstanceStackParams } from './types';

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function smoothstep(a: number, b: number, t: number): number {
	const c = Math.max(0, Math.min(1, (t - a) / (b - a)));
	return c * c * (3 - 2 * c);
}

export function horizontalTrainMotionShape(
	instanceIndex: number,
	instanceCount: number,
	progress: number,
	params: InstanceStackParams
): InstanceMotionState {
	const lag = (instanceIndex / Math.max(1, instanceCount - 1)) * params.lagWindow;
	// Rise duration is a fraction of the lag window so the last instance
	// settles early enough for a visible hold before the composition exits.
	const riseDuration = Math.max(0.04, params.lagWindow * 0.25);
	const localProgress = smoothstep(lag, lag + riseDuration, progress);
	const opacity = lerp(params.opacityFloor, 1, localProgress);
	// Trailing instances arrive from the right, settling at their slot
	// position as the lag-window progress completes.
	const xOffset = (1 - localProgress) * (instanceCount - instanceIndex) * 0.25;
	return {
		xOffset,
		yOffset: 0,
		opacity,
		scale: lerp(0.94, 1, localProgress)
	};
}

export function verticalStackMotionShape(
	instanceIndex: number,
	instanceCount: number,
	progress: number,
	params: InstanceStackParams
): InstanceMotionState {
	const lag = (instanceIndex / Math.max(1, instanceCount - 1)) * params.lagWindow;
	// Each instance rises over a fraction of the lag window so the last
	// instance settles well before the composition's exit — the prior
	// formula (rise = 1 - lagWindow) made the last instance settle at exactly
	// globalProgress=1.0, leaving zero hold frames at full opacity.
	const riseDuration = Math.max(0.04, params.lagWindow * 0.25);
	const localProgress = smoothstep(lag, lag + riseDuration, progress);
	// Persistent depth recession so the SETTLED stack reads as echoes
	// receding into the frame, not flat coplanar copies: each lower instance
	// is progressively smaller and a touch fainter even after it has risen.
	// (Without this every instance reaches opacity 1 / scale 1 at rest and
	// the stack is six identical stamps — the audit's "flat coplanar" note.)
	const normalized = instanceIndex / Math.max(1, instanceCount - 1);
	const depthScale = 1 - normalized * 0.14;
	const depthDim = 1 - normalized * 0.16;
	const opacity = lerp(params.opacityFloor, 1, localProgress) * depthDim;
	// G8c arc: instances enter from 0.3em below their parked position.
	// CSS margin-top (set in VerticalStackCanvasSource) handles base positioning;
	// yOffset is a pure animation delta here.
	const yOffset = (1 - localProgress) * 0.3;
	return {
		xOffset: 0,
		yOffset,
		opacity,
		scale: depthScale
	};
}
