/**
 * What still points at a composition entity, named before that entity is
 * removed ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2).
 *
 * A Cascade anchor, an edge endpoint, and a text-animation target each name
 * another entity by identity, and the schema refuses a document where one of
 * those names resolves to nothing. Repairing them means writing
 * `/state/overlays/<id>/animation` and `/state/surface/diagram/<id>/from`, which the
 * `motion` and `placement` families own — so the `layer` family, which owns
 * membership only, reports the references and refuses instead of quietly
 * rewriting another family's subtree. That is the whole reason these functions
 * return the referring pointers rather than fixing them.
 *
 * Mark timings are the one identity-less case: a Cascade anchors a mark by
 * index, so removing a timing does not only dangle the anchor pointing at it —
 * it silently re-points every anchor after it. Both are reported.
 */
import type { Cascade, EngineState } from './engine-schema';

/** One reference an entity still has, in the words a refusal reports it in. */
export interface CompositionEntityReference {
	/** The composition pointer holding the reference. */
	pointer: string;
	/** What refers to the entity, and how. */
	description: string;
}

/** One element that may weld its entrance to another, and the identity it welds as. */
interface CompositionCascadeHolder {
	/** The `kind:id` key this element is anchored by, matching the schema's cycle walk. */
	ownerKey: string;
	pointer: string;
	subject: string;
	cascade: Cascade | undefined;
}

function listCompositionCascadeHolders(state: EngineState): readonly CompositionCascadeHolder[] {
	const holders: CompositionCascadeHolder[] = [];

	state.overlays.forEach((overlay, index) => {
		holders.push({
			ownerKey: `overlay:${overlay.id}`,
			pointer: `/state/overlays/${index}/animation/cascade`,
			subject: `Overlay "${overlay.id}"`,
			cascade: overlay.animation?.cascade
		});
	});
	state.marks.timings.forEach((timing, index) => {
		holders.push({
			ownerKey: `mark:${index}`,
			pointer: `/state/marks/timings/${index}/cascade`,
			subject: `Mark ${index}`,
			cascade: timing.cascade
		});
	});
	state.textAnimations.forEach((entry, index) => {
		holders.push({
			ownerKey: `textAnimation:${entry.id}`,
			pointer: `/state/textAnimations/${index}/cascade`,
			subject: `Text animation "${entry.id}"`,
			cascade: entry.cascade
		});
	});
	(state.surface.diagram ?? []).forEach((primitive, index) => {
		holders.push({
			ownerKey: `block:${primitive.id}`,
			pointer: `/state/surface/diagram/${index}/animation/cascade`,
			subject: `Block "${primitive.id}"`,
			cascade: primitive.animation?.cascade
		});
	});

	return holders;
}

function collectCascadeReferences(
	state: EngineState,
	selfKey: string,
	matches: (anchor: Cascade['anchor']) => boolean
): CompositionEntityReference[] {
	const references: CompositionEntityReference[] = [];
	for (const holder of listCompositionCascadeHolders(state)) {
		if (holder.ownerKey === selfKey) continue;
		if (!holder.cascade || !matches(holder.cascade.anchor)) continue;
		references.push({
			pointer: holder.pointer,
			description: `${holder.subject} cascades from it`
		});
	}
	return references;
}

/** Cascade welds and text animations that would dangle if this Overlay went away. */
export function listCompositionOverlayReferences(
	state: EngineState,
	overlayId: string
): readonly CompositionEntityReference[] {
	const references = collectCascadeReferences(
		state,
		`overlay:${overlayId}`,
		(anchor) => anchor !== 'surface' && 'overlay' in anchor && anchor.overlay === overlayId
	);

	state.textAnimations.forEach((entry, index) => {
		if (entry.target.kind !== 'overlay' || entry.target.overlayId !== overlayId) return;
		references.push({
			pointer: `/state/textAnimations/${index}/target/overlayId`,
			description: `Text animation "${entry.id}" animates its ${entry.target.slot}`
		});
	});

	return references;
}

/** Cascade welds and edge endpoints that would dangle if this Block went away. */
export function listCompositionBlockReferences(
	state: EngineState,
	blockId: string
): readonly CompositionEntityReference[] {
	const references = collectCascadeReferences(
		state,
		`block:${blockId}`,
		(anchor) => anchor !== 'surface' && 'block' in anchor && anchor.block === blockId
	);

	(state.surface.diagram ?? []).forEach((primitive, index) => {
		if (primitive.type !== 'edge-arrow' || primitive.id === blockId) return;
		for (const orientation of [null, 'horizontal', 'vertical'] as const) {
			const geometry = orientation ? primitive.orientationOverrides?.[orientation] : primitive;
			if (!geometry) continue;
			for (const end of ['from', 'to'] as const) {
				const endpoint = geometry[end];
				if (!('node' in endpoint) || endpoint.node !== blockId) continue;
				references.push({
					pointer: orientation
						? `/state/surface/diagram/${index}/orientationOverrides/${orientation}/${end}/node`
						: `/state/surface/diagram/${index}/${end}/node`,
					description: `Edge "${primitive.id}" anchors its ${end} endpoint to it${
						orientation ? ` at ${orientation}` : ''
					}`
				});
			}
		}
	});

	return references;
}

/** Cascade welds that would dangle if this text animation went away. */
export function listCompositionTextAnimationReferences(
	state: EngineState,
	textAnimationId: string
): readonly CompositionEntityReference[] {
	return collectCascadeReferences(
		state,
		`textAnimation:${textAnimationId}`,
		(anchor) =>
			anchor !== 'surface' && 'textAnimation' in anchor && anchor.textAnimation === textAnimationId
	);
}

/**
 * Cascade welds a mark-timing removal would break. An anchor names a mark by
 * index, so every anchor at or after the removed index either dangles or
 * silently moves to the mark that took its place.
 */
export function listCompositionMarkTimingReferences(
	state: EngineState,
	removedIndex: number
): readonly CompositionEntityReference[] {
	return collectCascadeReferences(
		state,
		`mark:${removedIndex}`,
		(anchor) => anchor !== 'surface' && 'mark' in anchor && anchor.mark >= removedIndex
	);
}

/** The refusal text for a set of references: what refers to the entity, in order. */
export function formatCompositionEntityReferences(
	references: readonly CompositionEntityReference[]
): string {
	return references.map((reference) => reference.description).join('; ');
}
