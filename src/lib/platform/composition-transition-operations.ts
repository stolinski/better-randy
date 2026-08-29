/**
 * The `motion` family's transition recipe: the two-state piece
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2,
 * [ADR-0022](../../../docs/adr/0022-two-state-transition-compositions.md)).
 *
 * A transition is not a longer composition. Declaring one turns the piece into
 * two rendered states plus the Effect that wipes between them, which is why the
 * recipe lives at the document root beside the composition rather than inside
 * `state`, and why it is written whole: a recipe half-pointing at one endpoint
 * renders nothing anyone asked for.
 *
 * `durationMs` is the wipe's own length and is deliberately in milliseconds
 * rather than a clip fraction — it belongs to the wipe, not to either state's
 * transport, and each endpoint keeps its own duration.
 */
import { compositionEditHistory } from './composition-edit-history';
import { describeCompositionSchemaFindings } from './composition-validation-findings';
import { getPresetBySlug, listFixtures, listPresets } from './preset-catalog';
import {
	getTransitionEffectDefinition,
	transitionEffectTypes
} from './pipelines/transition-definition-registry';
import { refuseUnloadableCompositionRenderers } from './composition-renderer-readiness';
import {
	readOpenCompositionDocument,
	refuseCompositionOperation,
	refuseUnlessCompositionEditable,
	requireCompositionOperationRow
} from './composition-operation-preflight';
import {
	runCompositionEditTransaction,
	type CompositionOperationOutcome
} from './composition-edit-transaction';

import type { CompositionTransition, Preset } from './engine-schema';

export interface SetCompositionTransitionRequest {
	expectedRevision: number;
	/** The composition the wipe starts from, by catalog slug. */
	from: string;
	/** The composition the wipe lands on, by catalog slug. */
	to: string;
	/** A registered transition Effect. */
	effect: string;
	/** The wipe's own length, distinct from either state's transport duration. */
	durationMs: number;
	/** Parameters for the Effect; absent takes the Effect's own defaults. */
	params?: unknown;
}

export interface ClearCompositionTransitionRequest {
	expectedRevision: number;
}

/**
 * The compositions a transition can wipe between: the deliverable corpus and
 * the fixtures alike, since a fixture is a valid endpoint.
 */
export function listCompositionTransitionEndpointSlugs(): readonly string[] {
	return [...listPresets(), ...listFixtures()].map((entry) => entry.slug);
}

/**
 * Declare the transition recipe. Every field is required together because the
 * recipe is one decision: which two states, which wipe, how long, and how it is
 * parameterised.
 */
export async function runSetCompositionTransitionOperation(
	request: SetCompositionTransitionRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('motion.set-composition-transition');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	const revision = compositionEditHistory.revision;
	const current = readOpenCompositionDocument();

	if (current.state.media.videoTrack.clips.length > 0) {
		return refuseCompositionOperation(
			row,
			revision,
			'precondition_unmet',
			'A transition renders two composition snapshots, which the Video track does not survive; remove the Video clips first.',
			{
				rejected: String(current.state.media.videoTrack.clips.length),
				alternatives: ['media.remove-video-clip']
			}
		);
	}

	const endpoints = listCompositionTransitionEndpointSlugs();
	for (const [field, slug] of [
		['from', request.from],
		['to', request.to]
	] as const) {
		if (!getPresetBySlug(slug)) {
			return refuseCompositionOperation(
				row,
				revision,
				'unknown_target',
				`The transition ${field} names "${slug}", which is not a composition this engine catalogues.`,
				{ rejected: slug, alternatives: endpoints }
			);
		}
	}

	const definition = getTransitionEffectDefinition(request.effect);
	if (!definition) {
		return refuseCompositionOperation(
			row,
			revision,
			'unsupported_variant',
			`"${request.effect}" is not a transition Effect this engine registers.`,
			{ rejected: request.effect, alternatives: transitionEffectTypes() }
		);
	}

	if (!Number.isFinite(request.durationMs) || request.durationMs <= 0) {
		return refuseCompositionOperation(
			row,
			revision,
			'invalid_argument',
			'A transition duration is a positive number of milliseconds.',
			{ rejected: String(request.durationMs) }
		);
	}

	const parsedParams = definition.paramsSchema.safeParse(
		request.params ?? definition.defaults().params
	);
	if (!parsedParams.success) {
		return refuseCompositionOperation(
			row,
			revision,
			'schema_invalid',
			`The ${definition.label} transition rejects these parameters.`,
			{
				rejected: request.effect,
				findings: describeCompositionSchemaFindings(parsedParams.error)
			}
		);
	}

	const transition: CompositionTransition = {
		from: request.from,
		to: request.to,
		effect: definition.type,
		durationMs: request.durationMs,
		params: parsedParams.data
	};

	// Both endpoint compositions and the wipe Effect itself have to draw before
	// the recipe applies; a transition whose endpoint renderers never loaded
	// shows an empty state rather than a visible failure.
	const prospective: Preset = { ...current, transition };
	const rendererRefusal = await refuseUnloadableCompositionRenderers(
		row,
		prospective,
		`the ${definition.label} transition`
	);
	if (rendererRefusal) return rendererRefusal;

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Set transition recipe',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.transition = { ...transition };
		}
	});
}

/** Remove the recipe and return the piece to an ordinary single-state composition. */
export async function runClearCompositionTransitionOperation(
	request: ClearCompositionTransitionRequest
): Promise<CompositionOperationOutcome> {
	const row = requireCompositionOperationRow('motion.clear-composition-transition');
	const refusal = refuseUnlessCompositionEditable(row);
	if (refusal) return refusal;

	if (!readOpenCompositionDocument().transition) {
		return refuseCompositionOperation(
			row,
			compositionEditHistory.revision,
			'precondition_unmet',
			'This composition carries no transition recipe.'
		);
	}

	return runCompositionEditTransaction({
		operationId: row.id,
		expectedRevision: request.expectedRevision,
		undoLabel: 'Clear transition recipe',
		focus: { target: 'composition-root' },
		mutate: (draft) => {
			draft.transition = undefined;
		}
	});
}
