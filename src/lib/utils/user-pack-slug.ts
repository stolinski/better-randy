/**
 * The slug a forked User Pack gets when nobody names it (ADR-0055): the
 * built-in's slug plus `-copy`, then `-copy-2`, `-copy-3`… past whatever the
 * registry and the store already hold. Deterministic, so a test and the GUI
 * agree on the name a fork lands under.
 */
export function nextUserPackSlug(builtinSlug: string, takenSlugs: Iterable<string>): string {
	const taken = new Set(takenSlugs);
	const base = `${builtinSlug}-copy`;
	if (!taken.has(base)) return base;
	for (let ordinal = 2; ; ordinal += 1) {
		const candidate = `${base}-${ordinal}`;
		if (!taken.has(candidate)) return candidate;
	}
}
