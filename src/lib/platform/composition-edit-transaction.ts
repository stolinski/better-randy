/**
 * The revisioned, atomic composition edit transaction every authoring operation
 * runs inside ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §3).
 *
 * One transaction is: take the revision the caller observed, capture the open
 * composition as a detached document, let the operation mutate a draft of it,
 * validate that draft, prove the operation wrote only pointers its own family
 * owns — and only then replace live state, record one shared undo entry, wake
 * autosave, and move the visible focus. A transaction that fails at any step
 * before the commit leaves the composition byte-identical, which is what makes
 * "all or nothing" true rather than aspirational.
 *
 * The core is transport-neutral on purpose. A WebMCP tool handler and a GUI
 * control call the same operation, which calls this; nothing here knows which
 * transport asked, and a tool handler never assigns to engine state itself.
 */
import type { Preset } from './engine-schema';
import {
	boundCompositionPointers,
	diffCompositionDocuments,
	type BoundedCompositionPointers
} from './composition-change-delta';
import { compositionEditHistory } from './composition-edit-history';
import { invalidateCompositionAutosave } from './composition-autosave-invalidation.svelte';
import {
	boundCompositionFindings,
	collectCompositionLintFindings,
	collectCompositionSemanticFindings,
	collectCompositionValidationFindings,
	describeCompositionSchemaFindings,
	diffCompositionValidationFindings,
	formatCompositionValidationFindings,
	type BoundedCompositionFindings,
	type CompositionValidationFinding,
	type CompositionValidationFindingDelta
} from './composition-validation-findings';
import {
	formatCompositionWriteRejection,
	rejectUnauthorizedCompositionWrites
} from './composition-pointer-ownership';
import {
	moveCompositionWorkspaceFocus,
	type CompositionWorkspaceFocus
} from './composition-workspace-focus';
import { applyCompositionState, resolveTransition } from './preset';
import { applyPresetBase, presetBase } from './preset-base.svelte';
import { engineState, packState, transitionState } from './engine-state.svelte';
import { PresetIngressSchema } from './preset-ingress';
import { presetToWireFormat, serializeCompositionState } from './preset-pure';
import { cloneJsonValue } from '../utils/json-clone';
import {
	WEBMCP_OPERATION_INVENTORY,
	type WebmcpOperationErrorCode,
	type WebmcpOperationRow
} from './webmcp-operation-inventory';

/** How many changed pointers a receipt names before it reports only the total. */
export const COMPOSITION_RECEIPT_POINTER_LIMIT = 12;

/** How many appeared or cleared findings a receipt names. */
export const COMPOSITION_RECEIPT_FINDING_LIMIT = 4;

/** How many prior edits a stale-revision failure names. */
export const COMPOSITION_STALE_REVISION_EDIT_LIMIT = 8;

/** What a successful mutating operation returns; the caller continues from this, not a re-read. */
export interface CompositionOperationReceipt {
	status: 'applied';
	operationId: string;
	/** The Composition revision after the edit. Unchanged when the edit was a no-op. */
	revision: number;
	changed: BoundedCompositionPointers;
	findingsAppeared: BoundedCompositionFindings;
	findingsCleared: BoundedCompositionFindings;
	/** The entry recorded in the shared history, or `null` when nothing changed. */
	undoLabel: string | null;
	focus: CompositionWorkspaceFocus;
}

/** A refusal that names one corrective code, the exact target, and the way forward. */
export interface CompositionOperationFailure {
	status: 'failed';
	operationId: string;
	code: WebmcpOperationErrorCode;
	message: string;
	/** The exact value the operation rejected — a pointer, an id, or an argument. */
	rejected: string | null;
	/** The valid alternatives, so the caller corrects instead of guessing. */
	alternatives: readonly string[];
	/** The findings that blocked the edit, for `schema_invalid` and `semantic_invalid`. */
	findings: BoundedCompositionFindings;
	/** The labelled edits recorded since the caller's revision, for `stale_revision`. */
	movedSince: readonly string[];
	/** The Composition revision at the moment of the refusal. */
	revision: number;
}

export type CompositionOperationOutcome = CompositionOperationReceipt | CompositionOperationFailure;

/** Details an operation attaches so its refusal is correctable without a guess. */
export interface CompositionOperationErrorDetails {
	rejected?: string;
	alternatives?: readonly string[];
}

/**
 * The corrective refusal an operation raises from inside its draft mutation.
 * Anything else thrown there is a defect, and the core lets it propagate with
 * live state untouched rather than dressing a bug as a caller error.
 */
export class CompositionOperationError extends Error {
	readonly code: WebmcpOperationErrorCode;
	readonly rejected: string | null;
	readonly alternatives: readonly string[];

	constructor(
		code: WebmcpOperationErrorCode,
		message: string,
		details: CompositionOperationErrorDetails = {}
	) {
		super(message);
		this.name = 'CompositionOperationError';
		this.code = code;
		this.rejected = details.rejected ?? null;
		this.alternatives = details.alternatives ?? [];
	}
}

export interface CompositionDraftContext {
	/** Present only for an operation the inventory marks cancellable. */
	signal: AbortSignal | null;
}

/**
 * Mutates the detached draft in place, or raises `CompositionOperationError`.
 * It never reads or writes live engine state: the draft it receives is the only
 * document it may touch.
 */
export type CompositionDraftMutation = (
	draft: Preset,
	context: CompositionDraftContext
) => void | Promise<void>;

export interface CompositionEditTransactionRequest {
	/** The operation inventory row this transaction runs as. */
	operationId: string;
	/** The Composition revision the caller last observed. */
	expectedRevision: number;
	/** The entry this edit records in the shared undo history. */
	undoLabel: string;
	/** The Workspace entity this edit reveals; must match the inventory row's focus. */
	focus: CompositionWorkspaceFocus;
	mutate: CompositionDraftMutation;
	/** Honoured only by an operation the inventory marks cancellable. */
	signal?: AbortSignal;
}

export type CompositionHistoryDirection = 'undo' | 'redo';

const OPERATION_ROWS_BY_ID = new Map<string, WebmcpOperationRow>(
	WEBMCP_OPERATION_INVENTORY.map((row) => [row.id, row])
);

const HISTORY_OPERATION_IDS: Record<CompositionHistoryDirection, string> = {
	undo: 'composition.undo',
	redo: 'composition.redo'
};

function requireOperationRow(operationId: string): WebmcpOperationRow {
	const row = OPERATION_ROWS_BY_ID.get(operationId);
	if (!row) {
		throw new TypeError(
			`Composition edit transaction names an operation the inventory does not declare: ${operationId}`
		);
	}
	return row;
}

function isAborted(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

function refuse(
	row: WebmcpOperationRow,
	revision: number,
	code: WebmcpOperationErrorCode,
	message: string,
	details: {
		rejected?: string | null;
		alternatives?: readonly string[];
		findings?: readonly CompositionValidationFinding[];
		movedSince?: readonly string[];
	} = {}
): CompositionOperationFailure {
	return {
		status: 'failed',
		operationId: row.id,
		code,
		message,
		rejected: details.rejected ?? null,
		alternatives: details.alternatives ?? [],
		findings: boundCompositionFindings(details.findings ?? [], COMPOSITION_RECEIPT_FINDING_LIMIT),
		movedSince: details.movedSince ?? [],
		revision
	};
}

/**
 * The open composition as a detached, schema-parsed document. Detached matters:
 * a draft built from live proxies would let a rejected edit leak into engine
 * state, and an undo entry holding live references would replay whatever the
 * document had become rather than what it was.
 */
function captureOpenCompositionDocument(): Preset {
	const wire = cloneJsonValue(
		presetToWireFormat(serializeCompositionState(presetBase, engineState, packState.slug))
	);
	const parsed = PresetIngressSchema.safeParse(wire);
	if (!parsed.success) {
		const findings = describeCompositionSchemaFindings(parsed.error);
		throw new CompositionOperationError(
			'schema_invalid',
			`Composition edit transaction cannot read the open composition: ${formatCompositionValidationFindings(findings.slice(0, COMPOSITION_RECEIPT_FINDING_LIMIT))}`,
			{ rejected: findings[0]?.path }
		);
	}
	return parsed.data;
}

/**
 * Replace the open composition with `document` — its Pack and `state`, its
 * Preset-level metadata, and the transition recipe the Workspace acts on.
 * Unlike `applyPreset` it keeps the shared history: an edit, its undo, and its
 * redo are all points in one open document's life.
 */
function applyCompositionDocument(document: Preset): void {
	applyCompositionState(document);
	applyPresetBase(document);
	transitionState.active = resolveTransition(document.transition);
}

/**
 * The revision guard shared by every mutating and history operation: reject a
 * malformed revision as caller input, and a mismatched one as the conflict it
 * is, naming what moved in between.
 */
function refuseStaleRevision(
	row: WebmcpOperationRow,
	expectedRevision: number
): CompositionOperationFailure | null {
	const revision = compositionEditHistory.revision;

	if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
		return refuse(
			row,
			revision,
			'invalid_argument',
			'The observed Composition revision must be a non-negative integer.',
			{ rejected: String(expectedRevision), alternatives: [String(revision)] }
		);
	}

	if (expectedRevision !== revision) {
		const movedSince = compositionEditHistory
			.editsSince(expectedRevision)
			.slice(-COMPOSITION_STALE_REVISION_EDIT_LIMIT)
			.map((entry) => entry.label);
		return refuse(
			row,
			revision,
			'stale_revision',
			`The composition has moved to revision ${revision} since revision ${expectedRevision}; re-read it before editing.`,
			{ rejected: String(expectedRevision), alternatives: [String(revision)], movedSince }
		);
	}

	return null;
}

/**
 * The one window in which no transaction may run: the transition snapshot path
 * swaps a scratch composition into engine state, so an edit landing there would
 * be applied to a document the author never opened.
 */
function refuseDuringTransitionCapture(
	row: WebmcpOperationRow
): CompositionOperationFailure | null {
	if (!transitionState.capturing) return null;
	return refuse(
		row,
		compositionEditHistory.revision,
		'precondition_unmet',
		'The composition is mid transition capture; retry once the snapshot finishes.'
	);
}

/**
 * Run one mutating operation as a revisioned atomic transaction.
 *
 * Throws `TypeError` when the request contradicts the operation's inventory
 * row — an unknown id, a non-writing effect, a focus the row does not name, a
 * cancellation signal the row does not accept, or a write that crossed into
 * another family's subtree. Those are defects in the operation rather than
 * caller input, and every one of them is raised before anything is applied.
 */
export async function runCompositionEditTransaction(
	request: CompositionEditTransactionRequest
): Promise<CompositionOperationOutcome> {
	const row = requireOperationRow(request.operationId);
	if (row.effect !== 'write') {
		throw new TypeError(
			`Composition edit transaction requires a write operation, but ${row.id} is a ${row.effect} operation.`
		);
	}
	if (request.focus.target !== row.focus) {
		throw new TypeError(
			`Composition edit transaction focus ${request.focus.target} disagrees with the ${row.id} row, which focuses ${String(row.focus)}.`
		);
	}
	if (request.signal && !row.cancellable) {
		throw new TypeError(
			`Composition edit transaction passed a cancellation signal to ${row.id}, which the inventory does not mark cancellable.`
		);
	}
	if (request.undoLabel.trim().length === 0) {
		throw new TypeError(
			`Composition edit transaction requires a non-empty undo label for ${row.id}.`
		);
	}

	if (isAborted(request.signal)) {
		return refuse(
			row,
			compositionEditHistory.revision,
			'cancelled',
			'The operation was cancelled.'
		);
	}

	const captureRefusal = refuseDuringTransitionCapture(row);
	if (captureRefusal) return captureRefusal;

	const staleRefusal = refuseStaleRevision(row, request.expectedRevision);
	if (staleRefusal) return staleRefusal;

	const revision = compositionEditHistory.revision;

	try {
		const previous = captureOpenCompositionDocument();
		const draft = captureOpenCompositionDocument();

		await request.mutate(draft, { signal: request.signal ?? null });

		if (isAborted(request.signal)) {
			return refuse(row, revision, 'cancelled', 'The operation was cancelled before it applied.');
		}

		const parsed = PresetIngressSchema.safeParse(presetToWireFormat(draft));
		if (!parsed.success) {
			return refuse(
				row,
				revision,
				'schema_invalid',
				'The edit would produce a composition the schema rejects, so nothing was applied.',
				{ findings: describeCompositionSchemaFindings(parsed.error) }
			);
		}
		const next: Preset = parsed.data;

		const semanticFindings = collectCompositionSemanticFindings(next);
		if (semanticFindings.length > 0) {
			return refuse(
				row,
				revision,
				'semantic_invalid',
				'The edit would produce a composition the engine cannot load, so nothing was applied.',
				{ findings: semanticFindings }
			);
		}

		const changedPointers = diffCompositionDocuments(previous, next);
		const rejections = rejectUnauthorizedCompositionWrites(changedPointers, row.family, row.writes);
		if (rejections.length > 0) {
			throw new TypeError(
				`Composition edit transaction ${row.id} wrote outside its family: ${rejections
					.map(formatCompositionWriteRejection)
					.join('; ')}`
			);
		}

		const findingDelta = diffCompositionValidationFindings(
			collectCompositionValidationFindings(previous),
			collectCompositionLintFindings(next)
		);

		if (changedPointers.length === 0) {
			moveCompositionWorkspaceFocus(request.focus);
			return buildReceipt(row, revision, changedPointers, findingDelta, null, request.focus);
		}

		if (isAborted(request.signal)) {
			return refuse(row, revision, 'cancelled', 'The operation was cancelled before it applied.');
		}

		applyCompositionDocument(next);
		compositionEditHistory.recordApplied({
			label: request.undoLabel,
			undo: () => applyCompositionDocument(previous),
			redo: () => applyCompositionDocument(next)
		});
		invalidateCompositionAutosave();
		moveCompositionWorkspaceFocus(request.focus);

		return buildReceipt(
			row,
			compositionEditHistory.revision,
			changedPointers,
			findingDelta,
			request.undoLabel,
			request.focus
		);
	} catch (cause) {
		if (cause instanceof CompositionOperationError) {
			return refuse(row, revision, cause.code, cause.message, {
				rejected: cause.rejected,
				alternatives: cause.alternatives
			});
		}
		throw cause;
	}
}

/**
 * Replay the most recent edit from the shared history, in either direction.
 * Undo and redo are operations like any other: they check the caller's observed
 * revision, advance it, wake autosave, and return the same receipt shape — the
 * one thing they never do is record a new history entry.
 */
export function runCompositionHistoryTransaction(
	direction: CompositionHistoryDirection,
	expectedRevision: number
): CompositionOperationOutcome {
	const row = requireOperationRow(HISTORY_OPERATION_IDS[direction]);
	const focus: CompositionWorkspaceFocus = { target: 'composition-root' };

	const captureRefusal = refuseDuringTransitionCapture(row);
	if (captureRefusal) return captureRefusal;

	const staleRefusal = refuseStaleRevision(row, expectedRevision);
	if (staleRefusal) return staleRefusal;

	const revision = compositionEditHistory.revision;
	const available =
		direction === 'undo' ? compositionEditHistory.canUndo : compositionEditHistory.canRedo;
	if (!available) {
		return refuse(
			row,
			revision,
			'precondition_unmet',
			`The shared history holds no edit to ${direction}.`
		);
	}

	try {
		const previous = captureOpenCompositionDocument();
		if (direction === 'undo') compositionEditHistory.undo();
		else compositionEditHistory.redo();

		invalidateCompositionAutosave();
		moveCompositionWorkspaceFocus(focus);

		const next = captureOpenCompositionDocument();
		const findingDelta = diffCompositionValidationFindings(
			collectCompositionValidationFindings(previous),
			collectCompositionValidationFindings(next)
		);

		return buildReceipt(
			row,
			compositionEditHistory.revision,
			diffCompositionDocuments(previous, next),
			findingDelta,
			null,
			focus
		);
	} catch (cause) {
		if (cause instanceof CompositionOperationError) {
			return refuse(row, compositionEditHistory.revision, cause.code, cause.message, {
				rejected: cause.rejected,
				alternatives: cause.alternatives
			});
		}
		throw cause;
	}
}

function buildReceipt(
	row: WebmcpOperationRow,
	revision: number,
	changedPointers: readonly string[],
	findingDelta: CompositionValidationFindingDelta,
	undoLabel: string | null,
	focus: CompositionWorkspaceFocus
): CompositionOperationReceipt {
	return {
		status: 'applied',
		operationId: row.id,
		revision,
		changed: boundCompositionPointers(changedPointers, COMPOSITION_RECEIPT_POINTER_LIMIT),
		findingsAppeared: boundCompositionFindings(
			findingDelta.appeared,
			COMPOSITION_RECEIPT_FINDING_LIMIT
		),
		findingsCleared: boundCompositionFindings(
			findingDelta.cleared,
			COMPOSITION_RECEIPT_FINDING_LIMIT
		),
		undoLabel,
		focus
	};
}
