/** GUI-layer state for the active composition's provenance (not engine state). */
export const compositionMeta = $state({
	isUserComp: false,
	userSlug: null as string | null,
	forkedFrom: null as string | null,
	/** Set by the active preset page; called by the revert affordance. */
	revert: null as (() => Promise<void>) | null
});
