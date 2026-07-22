/** GUI-layer state for the active composition's provenance (not engine state). */
export const compositionMeta = $state({
	isUserComposition: false,
	userCompositionSlug: null as string | null,
	forkedFrom: null as string | null,
	/** Set by the active preset page; called by the revert affordance. */
	revertUserComposition: null as (() => Promise<void>) | null
});
