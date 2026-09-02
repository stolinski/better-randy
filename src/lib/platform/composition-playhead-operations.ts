/**
 * The `playhead` family: where the visible playhead sits, in exact frames
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * This family owns no composition pointer and writes none. Seeking moves the
 * Workspace transport, which changes which frame is on screen and nothing about
 * the document — no revision, no undo entry, no autosave. That is the whole
 * reason it is its own family rather than a corner of `transport`: `transport`
 * decides how the piece is framed and classified on output; this decides what a
 * person and an agent are currently looking at.
 *
 * Frames are counted on the exact rational the rate resolves to
 * ([ADR-0042](../../../docs/adr/0042-resolve-marker-sync.md)), never the display
 * literal, so frame 300 at 29.97 is 300 × 1001/30000 seconds rather than a
 * drifting 300 / 29.97. Frame indices are zero-based: frame 0 is the first
 * frame, and `frameCount - 1` is the last.
 */
import {
	formatFrameRateRational,
	framesToSeconds,
	framesToTimecode,
	resolveFrameRate,
	secondsToFrames
} from '../utils/composition-timing';
import { compositionEditHistory } from './composition-edit-history';
import { resolveCompositionFrameTime } from './composition-time-input';
import {
	refuseCompositionOperation,
	refuseUnlessCompositionOpen,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { timelineHandle } from './timeline-handle.svelte';

import type { CompositionTimePosition } from './composition-time-input';
import type { WebmcpOperationFocusTarget, WebmcpOperationRow } from './webmcp-operation-inventory';

/** Where the playhead sits and the grid it moves on. */
export interface CompositionPlayheadPosition {
	/** The zero-based frame currently on screen. */
	frame: number;
	/** Whole frames in the composition at its exact rate. */
	frameCount: number;
	/** The `transport.fps` literal — the display value an author reads. */
	fps: number;
	/** The exact rational that literal resolves to, as ffmpeg receives it. */
	frameRate: string;
	seconds: number;
	durationSeconds: number;
	/** Non-drop-frame timecode of the current frame. */
	timecode: string;
	/** Whether the transport is running rather than parked. */
	isPlaying: boolean;
}

export interface CompositionPlayheadInspectionReceipt extends CompositionPlayheadPosition {
	status: 'inspected';
	operationId: string;
	/** The Composition revision, so a caller can seek and then edit without re-reading. */
	revision: number;
}

export interface CompositionPlayheadSeekReceipt extends CompositionPlayheadPosition {
	status: 'moved';
	operationId: string;
	revision: number;
	/** The playhead itself, which is what this operation reveals. */
	focus: WebmcpOperationFocusTarget;
}

export interface SeekCompositionPlayheadRequest {
	/** An exact frame, or direct seconds, milliseconds, frames, or timecode. */
	frame: CompositionTimePosition;
}

export type CompositionPlayheadInspectionOutcome =
	CompositionPlayheadInspectionReceipt | CompositionOperationFailure;

export type CompositionPlayheadSeekOutcome =
	CompositionPlayheadSeekReceipt | CompositionOperationFailure;

/**
 * The refusal for a composition that is open but not on screen. The Workspace
 * registers its transport when it mounts, so an unregistered one means there is
 * no visible playhead to report on or move.
 */
function refuseUnlessTransportRunning(row: WebmcpOperationRow): CompositionOperationFailure | null {
	if (timelineHandle.current) return null;
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'precondition_unmet',
		'The Workspace transport is not running, so this composition has no visible playhead.'
	);
}

function readPlayheadPosition(): CompositionPlayheadPosition {
	const timeline = timelineHandle.current;
	if (!timeline) {
		throw new TypeError('Reading the playhead requires a registered Workspace transport.');
	}
	const rate = resolveFrameRate(timeline.fps);
	const frameCount = Math.max(1, secondsToFrames(timeline.durationSeconds, rate));
	const frame = Math.min(frameCount - 1, Math.max(0, secondsToFrames(timeline.time, rate)));
	return {
		frame,
		frameCount,
		fps: rate.fps,
		frameRate: formatFrameRateRational(rate),
		seconds: timeline.time,
		durationSeconds: timeline.durationSeconds,
		timecode: framesToTimecode(frame, rate),
		isPlaying: timeline.isPlaying
	};
}

/** Report where the playhead sits, and the frame grid it moves on. */
export function runInspectCompositionPlayheadOperation(): CompositionPlayheadInspectionOutcome {
	const row = requireCompositionOperationRow('playhead.inspect');
	const refusal = refuseUnlessCompositionOpen(row) ?? refuseUnlessTransportRunning(row);
	if (refusal) return refusal;

	return {
		status: 'inspected',
		operationId: row.id,
		revision: compositionEditHistory.revision,
		...readPlayheadPosition()
	};
}

/**
 * Park the visible playhead on an exact frame. The Workspace shows that frame —
 * the same pixels a render at that frame produces — and the composition itself
 * does not move, which is why this takes no observed revision and records no
 * undo entry.
 */
export function runSeekCompositionPlayheadOperation(
	request: SeekCompositionPlayheadRequest
): CompositionPlayheadSeekOutcome {
	const row = requireCompositionOperationRow('playhead.seek-frame');
	const refusal = refuseUnlessCompositionOpen(row) ?? refuseUnlessTransportRunning(row);
	if (refusal) return refusal;

	const timeline = timelineHandle.current;
	if (!timeline) {
		throw new TypeError('Seeking the playhead requires a registered Workspace transport.');
	}
	const rate = resolveFrameRate(timeline.fps);
	const frameCount = Math.max(1, secondsToFrames(timeline.durationSeconds, rate));
	let frame: number;
	try {
		frame = resolveCompositionFrameTime(request.frame, {
			durationSeconds: timeline.durationSeconds,
			fps: timeline.fps
		});
	} catch (cause) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'invalid_argument',
			cause instanceof Error ? cause.message : 'The playhead time could not be resolved.',
			{ rejected: JSON.stringify(request.frame) }
		);
	}
	if (!Number.isSafeInteger(frame) || frame < 0 || frame >= frameCount) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'invalid_argument',
			`This composition runs ${frameCount} frames, so the playhead parks on frame 0 through ${frameCount - 1}.`,
			{ rejected: JSON.stringify(request.frame), alternatives: ['0', String(frameCount - 1)] }
		);
	}

	// Pause first: a running transport would tick past the requested frame before
	// anyone could look at it, and a seek is how an agent asks to look.
	timeline.pause();
	timeline.seek(framesToSeconds(frame, rate));

	return {
		status: 'moved',
		operationId: row.id,
		revision: compositionEditHistory.revision,
		focus: 'timeline-playhead',
		...readPlayheadPosition()
	};
}
