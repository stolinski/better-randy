/**
 * The `transport` family: how the piece is framed and how it is classified on
 * output
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * Orientation, time, rate, and format decide what leaves the engine; the
 * background fill decides what the piece *is*. Declaring a fill makes it a
 * full-frame segment, removing one returns it to the transparent overlay lane,
 * and nothing else in the engine may paint a background a composition did not
 * ask for.
 *
 * A Pack is deliberately not here — a Pack is appearance only (ADR-0023), so it
 * belongs to `appearance`, even though switching one changes what a full-frame
 * piece looks like.
 *
 * Retiming is a boundary worth naming. Changing the duration through the
 * Inspector also rescales every authored motion window so a 400ms entrance
 * stays 400ms. That rescale writes `/state/surface/enter`, `/state/overlays/*`,
 * and `/state/marks/timings/*`, which the `motion` family owns, so this
 * operation cannot perform it: `transport.set-timing` writes `/state/transport`
 * and nothing else. Retiming authored motion is `motion`-family work.
 */
import {
	refuseCompositionOperation,
	refuseUnlessCompositionEditable,
	requireCompositionOperationRow,
	type CompositionOperationFailure
} from './composition-operation-preflight';
import { compositionEditHistory } from './composition-edit-history';
import { engineState, packState } from './engine-state.svelte';
import { ensureCompositionRenderersLoaded } from './composition-renderer-readiness';
import { presetBase } from './preset-base.svelte';
import { serializeCompositionState } from './preset-pure';
import { STANDARD_TRANSPORT_RATES } from '../utils/composition-timing';
import {
	runCompositionEditTransaction,
	type CompositionOperationOutcome
} from './composition-edit-transaction';

import type { Preset, Transport } from './engine-schema';
import type { WebmcpOperationRow } from './webmcp-operation-inventory';

/** The delivery orientations a composition reflows between. */
export const COMPOSITION_ORIENTATIONS: readonly Transport['orientation'][] = [
	'horizontal',
	'vertical'
];

/** The delivery formats the engine encodes. */
export const COMPOSITION_EXPORT_FORMATS: readonly Transport['format'][] = ['webm', 'prores'];

/** The sentinel that binds the background fill to the active Pack's field. */
export const PACK_BACKGROUND_FILL = 'pack';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface SetCompositionOrientationRequest {
	expectedRevision: number;
	orientation: Transport['orientation'];
}

export interface SetCompositionTimingRequest {
	expectedRevision: number;
	durationSeconds?: number;
	fps?: number;
}

export interface SetCompositionFormatRequest {
	expectedRevision: number;
	format: Transport['format'];
}

export interface SetCompositionBackgroundRequest {
	expectedRevision: number;
	/**
	 * An explicit `#RRGGBB`, the `pack` sentinel to take the Pack's field, or
	 * null to remove the fill and return the piece to the transparent lane.
	 */
	fill: string | null;
}

/** The open composition as the document a prospective transport edit starts from. */
function readOpenCompositionDocument(): Preset {
	return serializeCompositionState(presetBase, engineState, packState.slug);
}

async function refuseUnloadableBackgroundRenderers(
	row: WebmcpOperationRow,
	fill: string | null
): Promise<CompositionOperationFailure | null> {
	const current = readOpenCompositionDocument();
	const prospective: Preset = {
		...current,
		state: { ...current.state, backgroundFill: fill ?? undefined }
	};
	try {
		await ensureCompositionRenderersLoaded(prospective);
		return null;
	} catch (cause) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'render_failed',
			`This browser could not load the Effect renderers this background needs: ${
				cause instanceof Error ? cause.message : 'a renderer module failed to load'
			}.`
		);
	}
}

/**
 * Set the delivery orientation. Authored geometry reflows against the new
 * frame; it is never clamped, and no per-orientation variant of the
 * composition is created.
 */
export async function runSetCompositionOrientationOperation(
	request: SetCompositionOrientationRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('transport.set-orientation');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	if (!COMPOSITION_ORIENTATIONS.includes(request.orientation)) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${request.orientation}" is not a delivery orientation this engine renders.`,
			{ rejected: request.orientation, alternatives: COMPOSITION_ORIENTATIONS }
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Set orientation',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.state.transport.orientation = request.orientation;
		}
	});
}

/**
 * Set the composition duration and frame rate. The rate comes from the standard
 * broadcast and web set, because every frame computation resolves it to an
 * exact rational and a free-typed rate has no exact math to run (ADR-0042). A
 * composition already carrying a non-standard rate keeps it until this
 * operation replaces it.
 */
export async function runSetCompositionTimingOperation(
	request: SetCompositionTimingRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('transport.set-timing');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const revision = compositionEditHistory.revision;

	if (request.durationSeconds === undefined && request.fps === undefined) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			'Set at least one of the composition duration or frame rate.',
			{ alternatives: ['durationSeconds', 'fps'] }
		);
	}

	if (request.durationSeconds !== undefined && !Number.isFinite(request.durationSeconds)) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			'The composition duration must be a finite number of seconds.',
			{ rejected: String(request.durationSeconds) }
		);
	}

	if (request.fps !== undefined && !STANDARD_TRANSPORT_RATES.includes(request.fps)) {
		return refuseCompositionOperation(
			row,
			revision,
			'unsupported_variant',
			`${request.fps} is not a standard delivery rate; every frame computation resolves the rate to an exact rational.`,
			{
				rejected: String(request.fps),
				alternatives: STANDARD_TRANSPORT_RATES.map((rate) => String(rate))
			}
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Set transport timing',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			if (request.durationSeconds !== undefined) {
				draft.state.transport.durationSeconds = request.durationSeconds;
			}
			if (request.fps !== undefined) draft.state.transport.fps = request.fps;
		}
	});
}

/** Set the delivery format the composition encodes to. */
export async function runSetCompositionFormatOperation(
	request: SetCompositionFormatRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('transport.set-format');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	if (!COMPOSITION_EXPORT_FORMATS.includes(request.format)) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'unsupported_variant',
			`"${request.format}" is not a delivery format this engine encodes.`,
			{ rejected: request.format, alternatives: COMPOSITION_EXPORT_FORMATS }
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Set delivery format',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.state.transport.format = request.format;
		}
	});
}

/**
 * Declare or remove the background fill — the decision that classifies the
 * output. Declaring one makes the piece a full-frame segment and brings in
 * whatever Effects the active Pack's chrome contributes; removing it returns a
 * transparent overlay.
 */
export async function runSetCompositionBackgroundOperation(
	request: SetCompositionBackgroundRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('transport.set-background');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	if (
		request.fill !== null &&
		request.fill !== PACK_BACKGROUND_FILL &&
		!HEX_COLOR_PATTERN.test(request.fill)
	) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'invalid_argument',
			`"${request.fill}" is not a background fill; use a #RRGGBB hex, the pack sentinel, or null to remove it.`,
			{ rejected: request.fill, alternatives: [PACK_BACKGROUND_FILL, '#RRGGBB', 'null'] }
		);
	}

	if (request.fill !== null) {
		const rendererRefusal = await refuseUnloadableBackgroundRenderers(row, request.fill);
		if (rendererRefusal) return rendererRefusal;
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: request.fill === null ? 'Remove background fill' : 'Set background fill',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.state.backgroundFill = request.fill ?? undefined;
		}
	});
}
