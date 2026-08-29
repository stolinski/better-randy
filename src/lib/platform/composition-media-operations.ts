/**
 * The `media` family: the composition Media library, and the primary Video
 * track cut from it
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2, §7).
 *
 * Two boundaries shape every operation here, and both are about telling the
 * truth rather than about convenience.
 *
 * **Consent.** Bytes enter the page only through the visitor's own gesture, so
 * an entry is added by naming a grant the person already made
 * (`composition-media-grants.svelte.ts`), never a path, a URL, or a picker. A
 * page holding no grant refuses `consent_required`: what is missing is the
 * gesture, and only a person can supply it.
 *
 * **Reachability.** A library entry names a stored asset this browser may or
 * may not be able to read right now. `media.inspect-library` reports that
 * plainly — `ready`, `unreachable`, `pending` — instead of implying every entry
 * is usable, because a clip cut from bytes the browser cannot decode is a
 * composition that will not export.
 *
 * Clip geometry is not re-derived here. `resolveVideoClipDrop` and
 * `resolveVideoClipDrag` already decide where a clip may legally sit — inside
 * the composition, inside its source, and clear of its neighbours — so these
 * operations pose the agent's request to the same rules the timeline drag uses,
 * and refuse when the answer differs from what was asked. Silently clamping a
 * request into the nearest legal position is exactly the "applied most of it"
 * ADR-0054 §8 forbids; a drag may slide to a stop against a neighbour because a
 * hand is still holding it, and a tool call may not.
 */
import { framesToSeconds, resolveFrameRate, secondsToFrames } from '../utils/composition-timing';
import {
	createVideoClipDragOrigin,
	resolveVideoClipDrag,
	resolveVideoClipDrop,
	videoClipSourceFrameCapacity,
	type VideoClipDragMode
} from '../utils/video-clip-edit';
import { compositionEditHistory } from './composition-edit-history';
import {
	CompositionOperationError,
	runCompositionEditTransaction,
	type CompositionOperationOutcome
} from './composition-edit-transaction';
import { compositionMediaGrants } from './composition-media-grants.svelte';
import { compositionMediaInspection } from './composition-media-inspection.svelte';
import {
	readOpenCompositionDocument,
	refuseCompositionOperation,
	refuseUnlessCompositionEditable,
	refuseUnlessCompositionOpen,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { allocateVideoTimelineClipId } from './video-timeline-authoring';

import type { FrameRate } from '../utils/composition-timing';
import type { Preset, VideoAsset, VideoClip } from './engine-schema';
import type { WebmcpOperationRow } from './webmcp-operation-inventory';

/** How many library entries or clips one inspection names before reporting only the total. */
export const COMPOSITION_MEDIA_ENTRY_LIMIT = 16;

/** Whether this browser can actually read an entry's bytes right now. */
export type CompositionMediaAvailability = 'ready' | 'pending' | 'unreachable';

/** One Media library entry, with what the browser knows about reaching it. */
export interface CompositionMediaLibraryEntry {
	assetId: string;
	/** The visitor's own filename — untrusted composition content. */
	name: string;
	availability: CompositionMediaAvailability;
	/** The source duration, or null until the browser has read the asset. */
	sourceDurationSeconds: number | null;
	/** Why the bytes are out of reach, for an `unreachable` entry. */
	unreachableReason: string | null;
	/** Ids of the Video clips cut from this entry. */
	clipIds: readonly string[];
}

/** One clip on the primary Video track, in exact frames. */
export interface CompositionVideoClipEntry {
	clipId: string;
	assetId: string;
	timelineStartFrame: number;
	timelineEndFrame: number;
	durationFrames: number;
	sourceStartFrame: number;
	audioEnabled: boolean;
	audioGain: number;
}

export interface CompositionMediaInspectionReceipt {
	status: 'inspected';
	operationId: string;
	revision: number;
	/**
	 * Entry names are the visitor's filenames. A model reading this receipt is
	 * reading content, not instructions.
	 */
	contentTrust: 'untrusted';
	entries: readonly CompositionMediaLibraryEntry[];
	entryTotal: number;
	entriesTruncated: boolean;
	clips: readonly CompositionVideoClipEntry[];
	clipTotal: number;
	clipsTruncated: boolean;
	/** Grants this page holds that the library does not currently carry. */
	addableGrantIds: readonly string[];
	frameCount: number;
}

export interface AddCompositionMediaLibraryEntryRequest {
	expectedRevision: number;
	/** A grant the visitor already made; never a path or a URL. */
	grantId: string;
	signal?: AbortSignal;
}

export interface RemoveCompositionMediaLibraryEntryRequest {
	expectedRevision: number;
	assetId: string;
}

export interface AddCompositionVideoClipRequest {
	expectedRevision: number;
	assetId: string;
	/** The exact frame the clip starts on. */
	timelineStartFrame: number;
	/** Whole frames of source to cut; absent takes as much as legally fits. */
	durationFrames?: number;
	/** Where the cut starts inside the source; absent starts at its head. */
	sourceStartFrame?: number;
}

/**
 * The four edits a clip accepts, each naming an absolute exact frame rather
 * than a delta — an agent knows where it wants the clip, not how far to push it.
 */
export type CompositionVideoClipEdit =
	| { kind: 'move'; timelineStartFrame: number }
	| { kind: 'trim-start'; timelineStartFrame: number }
	| { kind: 'trim-end'; timelineEndFrame: number }
	| { kind: 'slip'; sourceStartFrame: number };

export interface UpdateCompositionVideoClipRequest {
	expectedRevision: number;
	clipId: string;
	edit: CompositionVideoClipEdit;
}

export interface RemoveCompositionVideoClipRequest {
	expectedRevision: number;
	clipId: string;
}

export type CompositionMediaInspectionOutcome =
	CompositionMediaInspectionReceipt | CompositionOperationFailure;

const CLIP_EDIT_MODES: Record<CompositionVideoClipEdit['kind'], VideoClipDragMode> = {
	move: 'move',
	'trim-start': 'trim-left',
	'trim-end': 'trim-right',
	slip: 'slip'
};

function readCompositionFrameGrid(document: Preset): { frameRate: FrameRate; frameCount: number } {
	const frameRate = resolveFrameRate(document.state.transport.fps);
	return {
		frameRate,
		frameCount: Math.max(1, secondsToFrames(document.state.transport.durationSeconds, frameRate))
	};
}

function readMediaAvailability(assetUrl: string): {
	availability: CompositionMediaAvailability;
	sourceDurationSeconds: number | null;
	unreachableReason: string | null;
} {
	const inspection = compositionMediaInspection.read(assetUrl);
	if (inspection.status === 'ready') {
		return {
			availability: 'ready',
			sourceDurationSeconds: inspection.metadata.durationSeconds,
			unreachableReason: null
		};
	}
	if (inspection.status === 'error') {
		return {
			availability: 'unreachable',
			sourceDurationSeconds: null,
			unreachableReason: inspection.message
		};
	}
	return { availability: 'pending', sourceDurationSeconds: null, unreachableReason: null };
}

function findMediaAsset(document: Preset, assetId: string): VideoAsset | undefined {
	return document.state.media.assets.find((asset) => asset.id === assetId);
}

function refuseUnknownMediaAsset(
	row: WebmcpOperationRow,
	document: Preset,
	assetId: string
): CompositionOperationFailure {
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'unknown_target',
		`No Media library entry in this composition is named "${assetId}".`,
		{ rejected: assetId, alternatives: document.state.media.assets.map((asset) => asset.id) }
	);
}

function refuseUnknownVideoClip(
	row: WebmcpOperationRow,
	document: Preset,
	clipId: string
): CompositionOperationFailure {
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'unknown_target',
		`No Video clip in this composition is named "${clipId}".`,
		{
			rejected: clipId,
			alternatives: document.state.media.videoTrack.clips.map((clip) => clip.id)
		}
	);
}

/**
 * The asset's source duration, read back from the browser rather than assumed.
 * Probing is what makes a refusal truthful: an entry whose bytes this browser
 * cannot decode has no legal cut, and saying so beats writing a clip that will
 * fail at export.
 */
async function resolveMediaSourceDurationSeconds(assetUrl: string): Promise<number | null> {
	await compositionMediaInspection.ensure(assetUrl);
	const inspection = compositionMediaInspection.read(assetUrl);
	return inspection.status === 'ready' ? inspection.metadata.durationSeconds : null;
}

function refuseUnreachableMediaAsset(
	row: WebmcpOperationRow,
	asset: VideoAsset
): CompositionOperationFailure {
	const { unreachableReason } = readMediaAvailability(asset.assetUrl);
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'precondition_unmet',
		`This browser cannot read the bytes behind "${asset.id}"${
			unreachableReason ? `: ${unreachableReason}` : '.'
		}`,
		{ rejected: asset.id }
	);
}

/**
 * List the library and the Video track, including entries whose bytes this
 * browser cannot reach. Probes every entry it has not read yet, so the
 * durations a caller plans a cut against are measured rather than remembered.
 */
export async function runInspectCompositionMediaOperation(): Promise<CompositionMediaInspectionOutcome> {
	const row = requireCompositionOperationRow('media.inspect-library');
	const refusal = refuseUnlessCompositionOpen(row);
	if (refusal) return refusal;

	const document = readOpenCompositionDocument();
	const media = document.state.media;
	const { frameRate, frameCount } = readCompositionFrameGrid(document);

	await Promise.all(media.assets.map((asset) => compositionMediaInspection.ensure(asset.assetUrl)));

	const entries = media.assets.map<CompositionMediaLibraryEntry>((asset) => ({
		assetId: asset.id,
		name: asset.name,
		...readMediaAvailability(asset.assetUrl),
		clipIds: media.videoTrack.clips
			.filter((clip) => clip.assetId === asset.id)
			.map((clip) => clip.id)
	}));

	const clips = media.videoTrack.clips.map<CompositionVideoClipEntry>((clip) => ({
		clipId: clip.id,
		assetId: clip.assetId,
		timelineStartFrame: clip.timelineStartFrame,
		timelineEndFrame: clip.timelineStartFrame + clip.durationFrames,
		durationFrames: clip.durationFrames,
		sourceStartFrame: secondsToFrames(clip.sourceStartSeconds, frameRate),
		audioEnabled: clip.audio.enabled,
		audioGain: clip.audio.gain
	}));

	const libraryUrls = new Set(media.assets.map((asset) => asset.assetUrl));

	return {
		status: 'inspected',
		operationId: row.id,
		revision: compositionEditHistory.revision,
		contentTrust: 'untrusted',
		entries: entries.slice(0, COMPOSITION_MEDIA_ENTRY_LIMIT),
		entryTotal: entries.length,
		entriesTruncated: entries.length > COMPOSITION_MEDIA_ENTRY_LIMIT,
		clips: clips.slice(0, COMPOSITION_MEDIA_ENTRY_LIMIT),
		clipTotal: clips.length,
		clipsTruncated: clips.length > COMPOSITION_MEDIA_ENTRY_LIMIT,
		addableGrantIds: compositionMediaGrants.grants
			.filter((grant) => !libraryUrls.has(grant.descriptor.url))
			.map((grant) => grant.grantId),
		frameCount
	};
}

/**
 * Add a video the visitor already granted this page to the Media library. The
 * grant is the consent record; there is no path, no URL, and no picker.
 */
export async function runAddCompositionMediaLibraryEntryOperation(
	request: AddCompositionMediaLibraryEntryRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('media.add-library-entry');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const revision = compositionEditHistory.revision;
	if (!compositionMediaGrants.hasGrant) {
		return refuseCompositionOperation(
			row,
			revision,
			'consent_required',
			'This page holds no video the visitor has granted it; ask the person to drop a file on the Media rail first.',
			{ rejected: request.grantId }
		);
	}

	const grant = compositionMediaGrants.find(request.grantId);
	if (!grant) {
		return refuseCompositionOperation(
			row,
			revision,
			'unknown_target',
			`"${request.grantId}" is not a video the visitor granted this page.`,
			{
				rejected: request.grantId,
				alternatives: compositionMediaGrants.grants.map((entry) => entry.grantId)
			}
		);
	}

	const document = readOpenCompositionDocument();
	const existing = document.state.media.assets.find(
		(asset) => asset.assetUrl === grant.descriptor.url
	);
	if (existing) {
		return refuseCompositionOperation(
			row,
			revision,
			'precondition_unmet',
			`This composition already carries those bytes as the Media library entry "${existing.id}".`,
			{ rejected: request.grantId, alternatives: [existing.id] }
		);
	}

	// Seed the probe from the grant so the entry lands with its duration already
	// known, which is what makes the very next `media.add-video-clip` legal.
	compositionMediaInspection.seed(grant.descriptor);

	const usedIds = new Set(document.state.media.assets.map((asset) => asset.id));
	let suffix = 1;
	while (usedIds.has(`video-${suffix}`)) suffix += 1;
	const assetId = `video-${suffix}`;

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Add media',
		focus: { target: 'media-library' },
		signal: request.signal,
		mutate: (draft) => {
			if (draft.state.media.assets.some((asset) => asset.assetUrl === grant.descriptor.url)) {
				throw new CompositionOperationError(
					'precondition_unmet',
					'Those bytes are already in this composition Media library.',
					{ rejected: request.grantId }
				);
			}
			draft.state.media.assets.push({
				id: assetId,
				kind: 'video',
				name: grant.name,
				assetUrl: grant.descriptor.url
			});
		}
	});
}

/** Remove a Media library entry. A referenced entry is named with its clips, not removed. */
export async function runRemoveCompositionMediaLibraryEntryOperation(
	request: RemoveCompositionMediaLibraryEntryRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('media.remove-library-entry');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const document = readOpenCompositionDocument();
	if (!findMediaAsset(document, request.assetId)) {
		return refuseUnknownMediaAsset(row, document, request.assetId);
	}

	const referencingClipIds = document.state.media.videoTrack.clips
		.filter((clip) => clip.assetId === request.assetId)
		.map((clip) => clip.id);
	if (referencingClipIds.length > 0) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'precondition_unmet',
			`"${request.assetId}" is still cut into the Video track; remove its clips first.`,
			{ rejected: request.assetId, alternatives: referencingClipIds }
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Remove media',
		focus: { target: 'media-library' },
		mutate: (draft) => {
			const index = draft.state.media.assets.findIndex((asset) => asset.id === request.assetId);
			if (index < 0) {
				throw new CompositionOperationError(
					'unknown_target',
					`Media library entry "${request.assetId}" is no longer in the composition.`,
					{ rejected: request.assetId }
				);
			}
			draft.state.media.assets.splice(index, 1);
		}
	});
}

/** Cut a library entry into the primary Video track at an exact frame. */
export async function runAddCompositionVideoClipOperation(
	request: AddCompositionVideoClipRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('media.add-video-clip');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const revision = compositionEditHistory.revision;
	const document = readOpenCompositionDocument();
	const asset = findMediaAsset(document, request.assetId);
	if (!asset) return refuseUnknownMediaAsset(row, document, request.assetId);

	const sourceDurationSeconds = await resolveMediaSourceDurationSeconds(asset.assetUrl);
	if (sourceDurationSeconds === null) return refuseUnreachableMediaAsset(row, asset);

	const { frameRate, frameCount } = readCompositionFrameGrid(document);
	const clips = document.state.media.videoTrack.clips;

	if (
		!Number.isSafeInteger(request.timelineStartFrame) ||
		request.timelineStartFrame < 0 ||
		request.timelineStartFrame >= frameCount
	) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			`This composition runs ${frameCount} frames, so a clip starts on frame 0 through ${frameCount - 1}.`,
			{
				rejected: String(request.timelineStartFrame),
				alternatives: ['0', String(frameCount - 1)]
			}
		);
	}

	const sourceStartFrame = request.sourceStartFrame ?? 0;
	if (!Number.isSafeInteger(sourceStartFrame) || sourceStartFrame < 0) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			'A clip starts inside its source on a non-negative whole frame.',
			{ rejected: String(sourceStartFrame), alternatives: ['0'] }
		);
	}
	const sourceStartSeconds = framesToSeconds(sourceStartFrame, frameRate);
	if (sourceStartSeconds >= sourceDurationSeconds) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			`"${asset.id}" runs ${sourceDurationSeconds.toFixed(2)}s, so frame ${sourceStartFrame} is past its end.`,
			{
				rejected: String(sourceStartFrame),
				alternatives: ['0', String(secondsToFrames(sourceDurationSeconds, frameRate) - 1)]
			}
		);
	}

	const availableFrames = Math.max(
		0,
		Math.min(
			videoClipSourceFrameCapacity(sourceDurationSeconds - sourceStartSeconds, frameRate),
			frameCount - request.timelineStartFrame
		)
	);
	const durationFrames = request.durationFrames ?? availableFrames;
	if (!Number.isSafeInteger(durationFrames) || durationFrames < 1) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			'A Video clip runs at least one whole frame.',
			{ rejected: String(durationFrames), alternatives: ['1', String(availableFrames)] }
		);
	}
	if (durationFrames > availableFrames) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			`Only ${availableFrames} frames fit between frame ${request.timelineStartFrame} and the end of the composition or the source.`,
			{ rejected: String(durationFrames), alternatives: [String(availableFrames)] }
		);
	}

	const clipId = allocateVideoTimelineClipId(asset.id, clips);
	const placed = resolveVideoClipDrop({
		clips,
		clip: {
			id: clipId,
			assetId: asset.id,
			timelineStartFrame: request.timelineStartFrame,
			durationFrames,
			sourceStartSeconds,
			audio: { enabled: true, gain: 1 }
		},
		compositionFrameCount: frameCount,
		sourceDurationSeconds,
		frameRate
	});
	const clip = placed?.find((entry) => entry.id === clipId);
	if (
		!placed ||
		!clip ||
		clip.timelineStartFrame !== request.timelineStartFrame ||
		clip.durationFrames !== durationFrames
	) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			`Frames ${request.timelineStartFrame}–${request.timelineStartFrame + durationFrames} are not a free, non-overlapping gap on the Video track.`,
			{
				rejected: `${request.timelineStartFrame}+${durationFrames}`,
				alternatives: clips.map(
					(entry) =>
						`${entry.id} occupies ${entry.timelineStartFrame}–${entry.timelineStartFrame + entry.durationFrames}`
				)
			}
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Add video clip',
		focus: { target: 'video-clip', clipId },
		mutate: (draft) => {
			if (draft.state.media.videoTrack.clips.some((entry) => entry.id === clipId)) {
				throw new CompositionOperationError(
					'precondition_unmet',
					`Video clip "${clipId}" is already on the track.`,
					{ rejected: clipId }
				);
			}
			draft.state.media.videoTrack.clips = placed.map((entry) => ({
				...entry,
				audio: { ...entry.audio }
			}));
		}
	});
}

/** Move, trim, or slip one clip on exact frame boundaries. */
export async function runUpdateCompositionVideoClipOperation(
	request: UpdateCompositionVideoClipRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('media.update-video-clip');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const revision = compositionEditHistory.revision;
	const document = readOpenCompositionDocument();
	const clips = document.state.media.videoTrack.clips;
	const clip = clips.find((entry) => entry.id === request.clipId);
	if (!clip) return refuseUnknownVideoClip(row, document, request.clipId);

	const asset = findMediaAsset(document, clip.assetId);
	if (!asset) return refuseUnknownMediaAsset(row, document, clip.assetId);
	const sourceDurationSeconds = await resolveMediaSourceDurationSeconds(asset.assetUrl);
	if (sourceDurationSeconds === null) return refuseUnreachableMediaAsset(row, asset);

	const { frameRate, frameCount } = readCompositionFrameGrid(document);
	const requestedFrame = readRequestedClipFrame(request.edit);
	if (!Number.isSafeInteger(requestedFrame) || requestedFrame < 0) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			`A ${request.edit.kind} edit names a non-negative whole frame.`,
			{ rejected: String(requestedFrame), alternatives: ['0'] }
		);
	}

	const origin = createVideoClipDragOrigin({
		clips,
		clipId: clip.id,
		compositionFrameCount: frameCount,
		sourceDurationSeconds,
		frameRate
	});
	const edited = resolveVideoClipDrag(
		origin,
		CLIP_EDIT_MODES[request.edit.kind],
		requestedFrame - readCurrentClipFrame(clip, request.edit.kind, frameRate)
	);
	const reachedFrame = readCurrentClipFrame(edited, request.edit.kind, frameRate);
	if (reachedFrame !== requestedFrame) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			`A ${request.edit.kind} to frame ${requestedFrame} leaves the legal range for "${clip.id}"; the nearest legal frame is ${reachedFrame}.`,
			{ rejected: String(requestedFrame), alternatives: [String(reachedFrame)] }
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: `${request.edit.kind === 'move' ? 'Move' : request.edit.kind === 'slip' ? 'Slip' : 'Trim'} video clip`,
		focus: { target: 'video-clip', clipId: clip.id },
		mutate: (draft) => {
			const index = draft.state.media.videoTrack.clips.findIndex(
				(entry) => entry.id === request.clipId
			);
			if (index < 0) {
				throw new CompositionOperationError(
					'unknown_target',
					`Video clip "${request.clipId}" is no longer on the track.`,
					{ rejected: request.clipId }
				);
			}
			draft.state.media.videoTrack.clips[index] = { ...edited, audio: { ...edited.audio } };
		}
	});
}

/** Remove one clip, leaving a transparent gap where it played. */
export async function runRemoveCompositionVideoClipOperation(
	request: RemoveCompositionVideoClipRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('media.remove-video-clip');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const document = readOpenCompositionDocument();
	if (!document.state.media.videoTrack.clips.some((clip) => clip.id === request.clipId)) {
		return refuseUnknownVideoClip(row, document, request.clipId);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Remove video clip',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			const index = draft.state.media.videoTrack.clips.findIndex(
				(clip) => clip.id === request.clipId
			);
			if (index < 0) {
				throw new CompositionOperationError(
					'unknown_target',
					`Video clip "${request.clipId}" is no longer on the track.`,
					{ rejected: request.clipId }
				);
			}
			draft.state.media.videoTrack.clips.splice(index, 1);
		}
	});
}

/** The exact frame an edit asks for, in the coordinate that edit moves. */
function readRequestedClipFrame(edit: CompositionVideoClipEdit): number {
	switch (edit.kind) {
		case 'move':
		case 'trim-start':
			return edit.timelineStartFrame;
		case 'trim-end':
			return edit.timelineEndFrame;
		case 'slip':
			return edit.sourceStartFrame;
	}
}

/** The same coordinate as it stands on a clip, so the delta between them is the edit. */
function readCurrentClipFrame(
	clip: VideoClip,
	kind: CompositionVideoClipEdit['kind'],
	frameRate: FrameRate
): number {
	switch (kind) {
		case 'move':
		case 'trim-start':
			return clip.timelineStartFrame;
		case 'trim-end':
			return clip.timelineStartFrame + clip.durationFrames;
		case 'slip':
			return secondsToFrames(clip.sourceStartSeconds, frameRate);
	}
}
