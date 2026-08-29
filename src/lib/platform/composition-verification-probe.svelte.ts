/**
 * The seam the `verification` family measures through
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Verification is the one family that cannot answer from the document: it has
 * to settle the live composition on an exact frame and read what the canvas
 * actually presented. That work belongs to whoever owns the canvas, the GPU
 * host, and the transport — the mounted Workspace — so the Workspace registers
 * a probe here and the operations call it, exactly as `playhead` reads the
 * transport through `timelineHandle`.
 *
 * A `null` probe is the honest state of a page with no Workspace on screen:
 * there is no rendered frame to measure, and both operations refuse rather than
 * inventing one.
 */
import type { RenderedFramePixels } from '$lib/utils/rendered-frame-pixels';

import type { DeterministicRenderRegionManifest } from './runtime-audit';

/** One settled frame: which frame it is, and the pixels the canvas presented. */
export interface CompositionSettledFrameCapture {
	frame: number;
	timestampMicroseconds: number;
	frameRate: { num: number; den: number };
	pixels: RenderedFramePixels;
}

export interface CompositionVerificationProbe {
	/** Park the transport on an exact frame, let it settle, and read back its pixels. */
	captureSettledFrame(frame: number, signal: AbortSignal): Promise<CompositionSettledFrameCapture>;
	/**
	 * Measure the readable geometry and glyph coverage of an exact frame. Runs
	 * the paint-isolation capture, so it is slow by construction and honours the
	 * caller's signal between regions.
	 */
	auditSettledFrameReadableText(
		frame: number,
		signal: AbortSignal
	): Promise<DeterministicRenderRegionManifest>;
}

export const compositionVerificationProbe = $state<{
	current: CompositionVerificationProbe | null;
}>({ current: null });
