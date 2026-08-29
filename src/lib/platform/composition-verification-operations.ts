/**
 * The `verification` family: what the composition actually renders, measured on
 * real pixels
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * `validation` reads the document; this reads the canvas. The distinction earns
 * its own family because the two disagree in exactly the cases that matter: a
 * schema-clean composition renders nothing because its Surface never loaded, a
 * transparent overlay quietly acquires an opaque border, an Overlay animated to
 * zero opacity at the inspected frame reads as absent. None of that is visible
 * in JSON, and all of it ships.
 *
 * Both operations settle the live transport on an exact frame first, so what
 * they measure is the frame an export would encode at that address rather than
 * whatever the preview happened to be showing (ADR-0042). Both are slow by
 * construction — a 4K readback, and for the readable audit a paint-isolation
 * capture per region — which is why both take the caller's `AbortSignal` and
 * end as `cancelled` rather than running on after the caller has moved on.
 *
 * Every string these receipts carry is the visitor's own composition content
 * and is annotated `contentTrust: 'untrusted'`. A caption is not an
 * instruction (ADR-0054 §7).
 */
import {
	formatFrameRateRational,
	resolveFrameRate,
	secondsToFrames
} from '../utils/composition-timing';
import {
	findUnintentionalReadableOverlaps,
	type DeterministicReadableOverlap
} from '../utils/deterministic-render-measurements';
import { isPresetOpaque } from '../utils/output-classification';
import {
	measureRenderedFramePixels,
	type RenderedFrameEdgeClass
} from '../utils/rendered-frame-pixels';
import { compositionEditHistory } from './composition-edit-history';
import {
	readOpenCompositionDocument,
	refuseCompositionOperation,
	refuseUnlessCompositionOpen,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { compositionVerificationProbe } from './composition-verification-probe.svelte';
import { deriveDeterministicReadableContract } from './deterministic-readable-contract';

import type { CompositionOutputClass } from './composition-document-operations';
import type { CompositionVerificationProbe } from './composition-verification-probe.svelte';
import type { DeterministicRenderRegionManifest } from './runtime-audit';
import type { WebmcpOperationRow } from './webmcp-operation-inventory';

/** How many readable identities one audit names before reporting only the total. */
export const COMPOSITION_READABLE_ENTRY_LIMIT = 12;

/** How many colliding pairs one audit names before reporting only the total. */
export const COMPOSITION_READABLE_OVERLAP_LIMIT = 8;

/** How much of a readable identity's own text survives to the presented frame. */
export type CompositionReadableLegibility =
	'readable' | 'occluded' | 'clipped' | 'missing' | 'unmeasured';

export interface CompositionRenderedFrameReceipt {
	status: 'verified';
	operationId: string;
	revision: number;
	frame: number;
	timestampMicroseconds: number;
	/** The exact rational the rate resolves to, as ffmpeg receives it. */
	frameRate: string;
	width: number;
	height: number;
	/** What the document says it delivers as. */
	declaredOutputClass: CompositionOutputClass;
	/** What the presented frame's border actually says. */
	measuredEdgeClass: RenderedFrameEdgeClass;
	/** True when the pixels agree with the declaration. */
	outputClassConfirmed: boolean;
	alphaCoverage: number;
	opaqueCoverage: number;
	/** True when every pixel is identical, so this frame renders nothing at all. */
	isBlank: boolean;
}

export interface CompositionReadableTextEntry {
	readableId: string;
	/** What this identity should read — untrusted composition content. */
	text: string;
	legibility: CompositionReadableLegibility;
	/** Fraction of the identity's glyph pixels visible in the frame, or null when unmeasured. */
	visibleGlyphFraction: number | null;
}

export interface CompositionReadableTextReceipt {
	status: 'verified';
	operationId: string;
	revision: number;
	frame: number;
	timestampMicroseconds: number;
	/** Text below is the visitor's composition content, not instructions. */
	contentTrust: 'untrusted';
	entries: readonly CompositionReadableTextEntry[];
	entryTotal: number;
	entriesTruncated: boolean;
	/** The identities that did not read cleanly — the ones worth looking at. */
	unreadableIds: readonly string[];
	/** Readable regions colliding without either declaring the overlap. */
	overlaps: readonly DeterministicReadableOverlap[];
	overlapTotal: number;
	overlapsTruncated: boolean;
	/** Visible text on the frame that no readable identity claims. */
	unclaimedVisibleTextCount: number;
}

export interface VerifyCompositionRenderedFrameRequest {
	/** The zero-based frame to settle on and measure. */
	frame: number;
	signal?: AbortSignal;
}

export interface InspectCompositionReadableTextRequest {
	frame: number;
	signal?: AbortSignal;
}

export type CompositionRenderedFrameOutcome =
	CompositionRenderedFrameReceipt | CompositionOperationFailure;

export type CompositionReadableTextOutcome =
	CompositionReadableTextReceipt | CompositionOperationFailure;

/**
 * The refusal for a page with no rendered composition. The Workspace registers
 * the probe when it mounts, so an unregistered one means there is no canvas to
 * measure — which is a precondition, not a failed render.
 */
function refuseUnlessRenderProbeRegistered(
	row: WebmcpOperationRow
): CompositionOperationFailure | null {
	if (compositionVerificationProbe.current) return null;
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'precondition_unmet',
		'This composition is not on screen, so there are no rendered pixels to measure.'
	);
}

function refuseFrameOutsideComposition(
	row: WebmcpOperationRow,
	frame: number,
	frameCount: number
): CompositionOperationFailure | null {
	if (Number.isSafeInteger(frame) && frame >= 0 && frame < frameCount) return null;
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'invalid_argument',
		`This composition runs ${frameCount} frames, so it renders frame 0 through ${frameCount - 1}.`,
		{ rejected: String(frame), alternatives: ['0', String(frameCount - 1)] }
	);
}

function refuseCancelledVerification(row: WebmcpOperationRow): CompositionOperationFailure {
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'cancelled',
		'The verification was cancelled.'
	);
}

function refuseFailedRender(row: WebmcpOperationRow, cause: unknown): CompositionOperationFailure {
	return refuseCompositionOperation(
		row,
		compositionEditHistory.revision,
		'render_failed',
		cause instanceof Error ? cause.message : 'The composition did not render this frame.'
	);
}

/**
 * Render one exact frame and report what its pixels say: the native size, the
 * output lane its border puts it in, how much of it carries any alpha, and
 * whether it is blank. The declared lane travels beside the measured one so a
 * transparent overlay that renders an opaque border is a visible disagreement
 * rather than a number a caller has to interpret.
 */
export async function runVerifyCompositionRenderedFrameOperation(
	request: VerifyCompositionRenderedFrameRequest
): Promise<CompositionRenderedFrameOutcome> {
	const row = requireCompositionOperationRow('verification.render-frame');
	const refusal = refuseUnlessCompositionOpen(row) ?? refuseUnlessRenderProbeRegistered(row);
	if (refusal) return refusal;

	const document = readOpenCompositionDocument();
	const frameRate = resolveFrameRate(document.state.transport.fps);
	const frameCount = Math.max(
		1,
		secondsToFrames(document.state.transport.durationSeconds, frameRate)
	);
	const frameRefusal = refuseFrameOutsideComposition(row, request.frame, frameCount);
	if (frameRefusal) return frameRefusal;

	const signal = request.signal ?? new AbortController().signal;
	if (signal.aborted) return refuseCancelledVerification(row);

	let capture: Awaited<ReturnType<CompositionVerificationProbe['captureSettledFrame']>>;
	try {
		capture = await requireRenderProbe().captureSettledFrame(request.frame, signal);
	} catch (cause) {
		return signal.aborted ? refuseCancelledVerification(row) : refuseFailedRender(row, cause);
	}
	if (signal.aborted) return refuseCancelledVerification(row);

	const measurement = measureRenderedFramePixels(capture.pixels);
	const declaredOutputClass: CompositionOutputClass = isPresetOpaque(document)
		? 'full-frame'
		: 'transparent-overlay';

	return {
		status: 'verified',
		operationId: row.id,
		revision: compositionEditHistory.revision,
		frame: capture.frame,
		timestampMicroseconds: capture.timestampMicroseconds,
		frameRate: formatFrameRateRational(frameRate),
		width: measurement.width,
		height: measurement.height,
		declaredOutputClass,
		measuredEdgeClass: measurement.edgeClass,
		outputClassConfirmed:
			declaredOutputClass === 'full-frame'
				? measurement.edgeClass === 'opaque'
				: measurement.edgeClass === 'transparent',
		alphaCoverage: measurement.alphaCoverage,
		opaqueCoverage: measurement.opaqueCoverage,
		isBlank: measurement.isBlank
	};
}

/**
 * Report what the rendered frame actually reads. Every identity the renderers
 * declare for this exact timestamp is paired with the glyph coverage measured
 * on the presented frame, so text that is present in the document but buried,
 * clipped, or never painted is named rather than assumed.
 */
export async function runInspectCompositionReadableTextOperation(
	request: InspectCompositionReadableTextRequest
): Promise<CompositionReadableTextOutcome> {
	const row = requireCompositionOperationRow('verification.inspect-readable-text');
	const refusal = refuseUnlessCompositionOpen(row) ?? refuseUnlessRenderProbeRegistered(row);
	if (refusal) return refusal;

	const document = readOpenCompositionDocument();
	const frameRate = resolveFrameRate(document.state.transport.fps);
	const frameCount = Math.max(
		1,
		secondsToFrames(document.state.transport.durationSeconds, frameRate)
	);
	const frameRefusal = refuseFrameOutsideComposition(row, request.frame, frameCount);
	if (frameRefusal) return frameRefusal;

	const signal = request.signal ?? new AbortController().signal;
	if (signal.aborted) return refuseCancelledVerification(row);

	let manifest: DeterministicRenderRegionManifest;
	try {
		manifest = await requireRenderProbe().auditSettledFrameReadableText(request.frame, signal);
	} catch (cause) {
		return signal.aborted ? refuseCancelledVerification(row) : refuseFailedRender(row, cause);
	}
	if (signal.aborted) return refuseCancelledVerification(row);

	const contract = deriveDeterministicReadableContract(
		document.state,
		manifest.address.timestampMicroseconds
	);
	if (contract.status === 'unavailable') {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'render_failed',
			`This composition cannot say what it should read at frame ${request.frame}: ${contract.reason}.`,
			{ rejected: contract.reason }
		);
	}

	const missing = new Set(manifest.readableCoverage.missingReadableIdentities);
	const entries = contract.expected.map<CompositionReadableTextEntry>((expected) =>
		describeReadableEntry(expected.id, expected.text, missing.has(expected.id), manifest)
	);
	const overlaps = findUnintentionalReadableOverlaps(manifest.readableRegions);

	return {
		status: 'verified',
		operationId: row.id,
		revision: compositionEditHistory.revision,
		frame: manifest.address.frameIndex,
		timestampMicroseconds: manifest.address.timestampMicroseconds,
		contentTrust: 'untrusted',
		entries: entries.slice(0, COMPOSITION_READABLE_ENTRY_LIMIT),
		entryTotal: entries.length,
		entriesTruncated: entries.length > COMPOSITION_READABLE_ENTRY_LIMIT,
		unreadableIds: entries
			.filter((entry) => entry.legibility !== 'readable')
			.map((entry) => entry.readableId),
		overlaps: overlaps.slice(0, COMPOSITION_READABLE_OVERLAP_LIMIT),
		overlapTotal: overlaps.length,
		overlapsTruncated: overlaps.length > COMPOSITION_READABLE_OVERLAP_LIMIT,
		unclaimedVisibleTextCount: manifest.readableCoverage.unclaimedVisibleTextCount
	};
}

/**
 * One identity's verdict. Clipping is checked before occlusion because a
 * region cut off by its own frame or a scrolling ancestor is a layout defect,
 * while occlusion is a stacking one, and naming the layout cause first is what
 * points an author at the edit that fixes it.
 */
function describeReadableEntry(
	readableId: string,
	text: string,
	isMissing: boolean,
	manifest: DeterministicRenderRegionManifest
): CompositionReadableTextEntry {
	if (isMissing) {
		return { readableId, text, legibility: 'missing', visibleGlyphFraction: 0 };
	}
	const evidence = manifest.readableIdentityEvidence.find((entry) => entry.id === readableId);
	if (!evidence) {
		return { readableId, text, legibility: 'unmeasured', visibleGlyphFraction: null };
	}
	if (evidence.clippedPixelCount > 0) {
		return { readableId, text, legibility: 'clipped', visibleGlyphFraction: null };
	}
	const capture = evidence.capture;
	if (!capture || capture.expectedTreatmentPixelCount <= 0) {
		return { readableId, text, legibility: 'unmeasured', visibleGlyphFraction: null };
	}
	const visibleGlyphFraction =
		capture.visibleTreatmentPixelCount / capture.expectedTreatmentPixelCount;
	return {
		readableId,
		text,
		legibility: visibleGlyphFraction < 1 ? 'occluded' : 'readable',
		visibleGlyphFraction
	};
}

function requireRenderProbe(): CompositionVerificationProbe {
	const probe = compositionVerificationProbe.current;
	if (!probe) {
		throw new TypeError('Verifying a rendered frame requires a registered Workspace probe.');
	}
	return probe;
}
