// Use the explicit `.svelte.ts` import path everywhere. Vite otherwise creates a second
// module identity for `.svelte`, so mutations cannot invalidate the route's snapshot.
/** Explicitly invalidates route autosave after editor mutations that remove optional topology. */
export const compositionAutosaveInvalidation = $state({ revision: 0 });

export function invalidateCompositionAutosave(): void {
	compositionAutosaveInvalidation.revision += 1;
}
